from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import config, services
from .. import settings as settings_mod
from ..db import get_session
from ..importers import codeforces
from ..models import Attempt, DailySlot, Problem, ProblemCategory, Solution, SrsState, Video, utcnow
from .serialize import attempt_out, problem_out, solution_out, video_out

router = APIRouter(prefix="/api", tags=["problems"])


def _problem(session: Session, problem_id: int) -> Problem:
    p = session.get(Problem, problem_id)
    if p is None:
        raise HTTPException(404, "problem not found")
    return p


@router.get("/problems")
def list_problems(
    q: str = "",
    source: str | None = None,
    category: str | None = None,
    status: str | None = Query(None, pattern="^(seen|unseen|due|excluded)$"),
    min_rating: int | None = None,
    max_rating: int | None = None,
    sort: str = Query("rating", pattern="^(rating|-rating|title|recent)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
):
    stmt = select(Problem).outerjoin(SrsState, SrsState.problem_id == Problem.id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Problem.title.ilike(like), Problem.external_id.ilike(like)))
    if source:
        stmt = stmt.where(Problem.source == source)
    if category:
        stmt = stmt.where(Problem.id.in_(select(ProblemCategory.problem_id).where(ProblemCategory.category == category)))
    if status == "seen":
        stmt = stmt.where(SrsState.problem_id.is_not(None))
    elif status == "unseen":
        stmt = stmt.where(SrsState.problem_id.is_(None), Problem.excluded.is_(False))
    elif status == "due":
        stmt = stmt.where(SrsState.due <= utcnow(), SrsState.retired.is_(False))
    elif status == "excluded":
        stmt = stmt.where(Problem.excluded.is_(True))
    if min_rating is not None:
        stmt = stmt.where(Problem.rating >= min_rating)
    if max_rating is not None:
        stmt = stmt.where(Problem.rating <= max_rating)
    total = session.scalar(select(func.count()).select_from(stmt.subquery()))
    order = {
        "rating": (Problem.rating, Problem.id),
        "-rating": (Problem.rating.desc(), Problem.id),
        "title": (Problem.title,),
        "recent": (SrsState.last_review.desc().nulls_last(), Problem.id),
    }[sort]
    rows = session.scalars(stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size))
    # Browsing by category is a deliberate choice, so categories show when filtering by one.
    return {
        "total": total,
        "page": page,
        "items": [problem_out(p, reveal=True if category else None) for p in rows],
    }


@router.get("/problems/{problem_id}")
def get_problem(problem_id: int, reveal: bool = False, session: Session = Depends(get_session)):
    p = _problem(session, problem_id)
    attempts = session.scalars(
        select(Attempt).where(Attempt.problem_id == p.id).order_by(Attempt.finished_at.desc())
    )
    solutions = session.scalars(
        select(Solution).where(Solution.problem_id == p.id).order_by(Solution.created_at.desc())
    )
    videos = session.scalars(select(Video).where(Video.problem_id == p.id).order_by(Video.created_at.desc()))
    return {
        "problem": problem_out(p, reveal=True if reveal else None),
        "attempts": [attempt_out(a) for a in attempts],
        "solutions": [solution_out(s) for s in solutions],
        "videos": [video_out(v) for v in videos],
    }


class FlagsIn(BaseModel):
    excluded: bool | None = None
    retired: bool | None = None


@router.patch("/problems/{problem_id}")
def update_flags(problem_id: int, body: FlagsIn, session: Session = Depends(get_session)):
    p = _problem(session, problem_id)
    if body.excluded is not None:
        p.excluded = body.excluded
    if body.retired is not None:
        if p.srs is None:
            raise HTTPException(400, "only attempted problems can be retired")
        p.srs.retired = body.retired
    session.commit()
    return problem_out(p)


class ManualProblemIn(BaseModel):
    refs: str


@router.post("/problems/lookup")
def lookup(body: ManualProblemIn, session: Session = Depends(get_session)):
    """Resolve pasted links/ids to problems in the database."""
    found, missing = [], []
    for source, ext in services.parse_problem_refs(body.refs):
        p = session.scalar(select(Problem).where(Problem.source == source, Problem.external_id == ext))
        (found if p else missing).append(problem_out(p) if p else f"{source}:{ext}")
    return {"found": found, "missing": missing}


# --- attempts ---------------------------------------------------------------------------------

class CodeIn(BaseModel):
    language: str | None = None
    filename: str | None = None
    content: str


class AttemptIn(BaseModel):
    problem_id: int
    slot_id: int | None = None
    outcome: str
    key_insight: str
    confidence: int | None = None
    guessed_category: str | None = None
    mistakes: str = ""
    notes: str = ""
    duration_sec: int | None = None
    code: list[CodeIn] = []


@router.post("/attempts")
async def create_attempt(
    data: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
):
    try:
        body = AttemptIn.model_validate(json.loads(data))
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(422, f"invalid attempt payload: {e}")
    p = _problem(session, body.problem_id)
    slot = session.get(DailySlot, body.slot_id) if body.slot_id else None
    if slot is not None and slot.problem_id != p.id:
        raise HTTPException(400, "slot does not belong to this problem")
    code = [services.CodeFile(c.filename, c.language, c.content.encode()) for c in body.code]
    for f in files:
        code.append(services.CodeFile(f.filename, None, await f.read()))
    try:
        attempt, reveal = services.complete_attempt(
            session, p,
            slot=slot,
            outcome=body.outcome,
            key_insight=body.key_insight,
            code_files=code,
            confidence=body.confidence,
            guessed_category=body.guessed_category,
            mistakes=body.mistakes,
            notes=body.notes,
            duration_sec=body.duration_sec,
        )
    except services.ValidationError as e:
        raise HTTPException(400, str(e))

    handle = settings_mod.get(session, "codeforces_handle")
    if p.source == "codeforces" and handle:
        try:
            attempt.verified = p.external_id in codeforces.accepted_submissions(handle, count=100)
            session.commit()
        except Exception:
            pass  # verification is best-effort; never block saving an attempt
    return {"attempt": attempt_out(attempt), "reveal": reveal, "problem": problem_out(p)}


# --- solutions --------------------------------------------------------------------------------

@router.get("/solutions/{solution_id}", response_class=PlainTextResponse)
def solution_content(solution_id: int, session: Session = Depends(get_session)):
    s = session.get(Solution, solution_id)
    if s is None:
        raise HTTPException(404, "solution not found")
    return (config.SOLUTIONS_DIR / s.path).read_text(errors="replace")


@router.post("/problems/{problem_id}/solutions")
async def add_solution(
    problem_id: int,
    language: str | None = Form(None),
    content: str | None = Form(None),
    filename: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    session: Session = Depends(get_session),
):
    p = _problem(session, problem_id)
    added = []
    if content and content.strip():
        added.append(services.store_solution(session, p, services.CodeFile(filename, language, content.encode()), None))
    for f in files:
        added.append(services.store_solution(session, p, services.CodeFile(f.filename, None, await f.read()), None))
    if not added:
        raise HTTPException(400, "no code provided")
    session.commit()
    return [solution_out(s) for s in added]


@router.delete("/solutions/{solution_id}")
def delete_solution(solution_id: int, session: Session = Depends(get_session)):
    s = session.get(Solution, solution_id)
    if s is None:
        raise HTTPException(404, "solution not found")
    (config.SOLUTIONS_DIR / s.path).unlink(missing_ok=True)
    session.delete(s)
    session.commit()
    return {"ok": True}


# --- videos -----------------------------------------------------------------------------------

@router.post("/problems/{problem_id}/videos")
def upload_video(
    problem_id: int,
    file: UploadFile = File(...),
    title: str = Form(""),
    attempt_id: int | None = Form(None),
    duration_sec: float | None = Form(None),
    session: Session = Depends(get_session),
):
    p = _problem(session, problem_id)
    v = services.store_video(session, p, file.file, file.content_type or "video/webm", title, attempt_id, duration_sec)
    session.commit()
    return video_out(v)


@router.get("/videos")
def list_videos(session: Session = Depends(get_session)):
    rows = session.execute(
        select(Video, Problem).join(Problem, Problem.id == Video.problem_id).order_by(Video.created_at.desc())
    ).all()
    return [{**video_out(v), "problem": problem_out(p)} for v, p in rows]


@router.get("/videos/{video_id}/file")
def video_file(video_id: int, session: Session = Depends(get_session)):
    v = session.get(Video, video_id)
    if v is None:
        raise HTTPException(404, "video not found")
    return FileResponse(config.VIDEOS_DIR / v.path, media_type=v.mime)


class VideoPatch(BaseModel):
    title: str


@router.patch("/videos/{video_id}")
def rename_video(video_id: int, body: VideoPatch, session: Session = Depends(get_session)):
    v = session.get(Video, video_id)
    if v is None:
        raise HTTPException(404, "video not found")
    v.title = body.title
    session.commit()
    return video_out(v)


@router.delete("/videos/{video_id}")
def delete_video(video_id: int, session: Session = Depends(get_session)):
    v = session.get(Video, video_id)
    if v is None:
        raise HTTPException(404, "video not found")
    (config.VIDEOS_DIR / v.path).unlink(missing_ok=True)
    session.delete(v)
    session.commit()
    return {"ok": True}
