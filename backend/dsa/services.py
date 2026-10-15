"""Operations that touch several tables: finishing an attempt, storing files, importing history."""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from . import settings as settings_mod
from .models import Attempt, DailySlot, Problem, Solution, Video, utcnow
from .scheduler import skill, srs

LANG_EXT = {"java": "java", "python": "py", "cpp": "cpp", "other": "txt"}
EXT_LANG = {"java": "java", "py": "python", "cpp": "cpp", "cc": "cpp", "cxx": "cpp", "h": "cpp", "hpp": "cpp"}


class ValidationError(ValueError):
    pass


@dataclass
class CodeFile:
    filename: str | None
    language: str | None
    content: bytes


def language_for(filename: str | None, declared: str | None) -> str:
    if declared in LANG_EXT:
        return declared
    ext = (filename or "").rsplit(".", 1)[-1].lower()
    return EXT_LANG.get(ext, "other")


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "file"


def problem_dir(root: Path, problem: Problem) -> Path:
    d = root / problem.source / _safe(problem.external_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def store_solution(session: Session, problem: Problem, f: CodeFile, attempt_id: int | None) -> Solution:
    lang = language_for(f.filename, f.language)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base = _safe(Path(f.filename).stem) if f.filename else "solution"
    ext = (Path(f.filename).suffix.lstrip(".") if f.filename else "") or LANG_EXT[lang]
    d = problem_dir(config.SOLUTIONS_DIR, problem)
    path = d / f"{stamp}_{base}.{ext}"
    n = 1
    while path.exists():
        path = d / f"{stamp}_{base}_{n}.{ext}"
        n += 1
    path.write_bytes(f.content)
    sol = Solution(
        problem_id=problem.id,
        attempt_id=attempt_id,
        language=lang,
        filename=path.name,
        path=str(path.relative_to(config.SOLUTIONS_DIR)),
    )
    session.add(sol)
    return sol


VIDEO_EXT = {"video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov", "video/x-matroska": "mkv"}


def store_video(session: Session, problem: Problem, stream, mime: str, title: str,
                attempt_id: int | None, duration: float | None) -> Video:
    base_mime = mime.split(";")[0].strip().lower()
    ext = VIDEO_EXT.get(base_mime, "webm")
    d = problem_dir(config.VIDEOS_DIR, problem)
    path = d / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}.{ext}"
    size = 0
    with path.open("wb") as out:
        while chunk := stream.read(1 << 20):
            out.write(chunk)
            size += len(chunk)
    if ext == "webm":
        size = _remux(path) or size
    v = Video(
        problem_id=problem.id,
        attempt_id=attempt_id,
        title=title,
        path=str(path.relative_to(config.VIDEOS_DIR)),
        mime=base_mime or "video/webm",
        size_bytes=size,
        duration_sec=duration,
    )
    session.add(v)
    return v


def _remux(path: Path) -> int | None:
    """Browser-recorded WebM has no duration/seek index; an ffmpeg stream copy adds one."""
    if not shutil.which("ffmpeg"):
        return None
    tmp = path.with_suffix(".remux.webm")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-c", "copy", str(tmp)],
            check=True, timeout=300,
        )
        tmp.replace(path)
        return path.stat().st_size
    except (subprocess.SubprocessError, OSError):
        tmp.unlink(missing_ok=True)
        return None


def complete_attempt(
    session: Session,
    problem: Problem,
    *,
    slot: DailySlot | None,
    outcome: str,
    key_insight: str,
    code_files: list[CodeFile],
    confidence: int | None = None,
    guessed_category: str | None = None,
    mistakes: str = "",
    notes: str = "",
    duration_sec: int | None = None,
) -> tuple[Attempt, dict]:
    """Record a finished attempt. An attempt only counts once it has code and written feedback."""
    if outcome not in srs.OUTCOMES:
        raise ValidationError(f"unknown outcome {outcome!r}")
    if not code_files or not any(f.content.strip() for f in code_files):
        raise ValidationError("attach or paste your solution code to finish the problem")
    if not key_insight.strip():
        raise ValidationError("write down the key insight (or what you learned) to finish the problem")
    if slot is not None and slot.status != "pending":
        raise ValidationError("this slot is no longer active")

    now = utcnow()
    is_review = problem.srs is not None
    attempt = Attempt(
        problem_id=problem.id,
        slot_id=slot.id if slot else None,
        started_at=slot.started_at if slot else None,
        finished_at=now,
        duration_sec=duration_sec,
        outcome=outcome,
        fsrs_rating=int(srs.OUTCOMES[outcome][1]),
        confidence=confidence,
        guessed_category=guessed_category or None,
        key_insight=key_insight.strip(),
        mistakes=mistakes.strip(),
        notes=notes.strip(),
    )
    session.add(attempt)
    session.flush()
    for f in code_files:
        if f.content.strip():
            store_solution(session, problem, f, attempt.id)

    cfg = settings_mod.get_all(session)
    state = srs.review(problem.srs, problem.id, outcome, now, float(cfg["desired_retention"]))
    if problem.srs is None:
        session.add(state)
        problem.srs = state
    changes = skill.update(session, problem, outcome, is_review, float(cfg["initial_skill"]))
    if slot is not None:
        slot.status = "completed"
    session.commit()
    reveal = {
        "categories": [c.category for c in problem.categories],
        "primary_category": problem.primary_category,
        "tags": problem.tags,
        "guess_correct": (
            guessed_category in {c.category for c in problem.categories} if guessed_category else None
        ),
        "next_due": state.due.isoformat(),
        "skill_changes": {k: {"before": round(a), "after": round(b)} for k, (a, b) in changes.items()},
    }
    return attempt, reveal


def import_history(session: Session, source: str, solved: list[tuple[str, int | None]]) -> dict:
    """Seed SRS state + skill for problems solved before using the app (e.g. LeetCode history)."""
    cfg = settings_mod.get_all(session)
    by_ext = {p.external_id: p for p in session.scalars(select(Problem).where(Problem.source == source))}
    now = utcnow()
    seeded = skipped = unknown = 0
    for ext_id, ts in solved:
        p = by_ext.get(ext_id)
        if p is None:
            unknown += 1
            continue
        if p.srs is not None:
            skipped += 1
            continue
        when = datetime.fromtimestamp(ts, timezone.utc).replace(tzinfo=None) if ts else None
        state = srs.seed_history(p.id, when, now)
        session.add(state)
        p.srs = state
        # Light touch: past solves nudge skill, but practice in the app dominates.
        skill.update(session, p, "solved", is_review=False, initial=float(cfg["initial_skill"]), weight=0.15)
        seeded += 1
    session.commit()
    return {"seeded": seeded, "already_known": skipped, "not_found": unknown}


def parse_problem_refs(text: str) -> list[tuple[str, str]]:
    """Turn pasted URLs / ids into (source, external_id) pairs.

    Accepts LeetCode URLs or slugs, Codeforces URLs or ids like 1520F, and CSES task URLs.
    """
    out: list[tuple[str, str]] = []
    for raw in re.split(r"[\s,]+", text.strip()):
        if not raw:
            continue
        if m := re.search(r"leetcode\.com/problems/([a-z0-9-]+)", raw):
            out.append(("leetcode", m[1]))
        elif m := re.search(r"codeforces\.com/(?:problemset/problem|contest)/(\d+)/(?:problem/)?([A-Za-z]\d?)", raw):
            out.append(("codeforces", f"{m[1]}{m[2].upper()}"))
        elif m := re.search(r"cses\.fi/problemset/task/(\d+)", raw):
            out.append(("cses", m[1]))
        elif re.fullmatch(r"\d+[A-Za-z]\d?", raw):
            out.append(("codeforces", raw.upper()))
        elif re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)+", raw):
            out.append(("leetcode", raw))
    return out


def recognition_stats(session: Session) -> dict:
    rows = session.execute(
        select(Attempt.guessed_category, Problem.id)
        .join(Problem, Problem.id == Attempt.problem_id)
        .where(Attempt.guessed_category.is_not(None))
    ).all()
    if not rows:
        return {"guesses": 0, "correct": 0}
    cats = {}
    for _, pid in rows:
        if pid not in cats:
            p = session.get(Problem, pid)
            cats[pid] = {c.category for c in p.categories}
    correct = sum(1 for g, pid in rows if g in cats[pid])
    return {"guesses": len(rows), "correct": correct}
