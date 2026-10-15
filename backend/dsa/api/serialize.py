"""JSON shapes sent to the UI. Category information is hidden until a problem has been attempted."""

from __future__ import annotations

from ..categories import BY_KEY
from ..models import Attempt, DailySlot, Problem, Solution, Video


def problem_out(p: Problem, reveal: bool | None = None) -> dict:
    if reveal is None:
        reveal = p.srs is not None
    out = {
        "id": p.id,
        "source": p.source,
        "external_id": p.external_id,
        "title": p.title,
        "url": p.url,
        "rating": p.rating,
        # CSES "difficulty" is the section name, which would give the category away.
        "raw_difficulty": p.raw_difficulty if (reveal or p.source != "cses") else "",
        "paid_only": p.paid_only,
        "excluded": p.excluded,
        "solved_count": p.solved_count,
        "revealed": reveal,
        "srs": None,
    }
    if reveal:
        out["categories"] = [c.category for c in p.categories]
        out["primary_category"] = p.primary_category
        out["tags"] = p.tags
    if p.srs is not None:
        s = p.srs
        out["srs"] = {
            "due": s.due.isoformat(),
            "reps": s.reps,
            "lapses": s.lapses,
            "last_review": s.last_review.isoformat() if s.last_review else None,
            "origin": s.origin,
            "retired": s.retired,
            "stability_days": round(s.card.get("stability") or 0, 1),
        }
    return out


def challenge(problem_rating: int, skill: float) -> str:
    gap = problem_rating - skill
    if gap < -150:
        return "warm-up"
    if gap < 100:
        return "on level"
    if gap < 300:
        return "stretch"
    return "hard"


def slot_out(s: DailySlot, skills: dict[str, float], initial: float) -> dict:
    p = s.problem
    skill = skills.get(p.primary_category or "", initial)
    return {
        "id": s.id,
        "position": s.position,
        "kind": s.kind,
        "status": s.status,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "challenge": challenge(p.rating, skill),
        "problem": problem_out(p, reveal=s.status == "completed"),
    }


def attempt_out(a: Attempt) -> dict:
    return {
        "id": a.id,
        "problem_id": a.problem_id,
        "finished_at": a.finished_at.isoformat(),
        "duration_sec": a.duration_sec,
        "outcome": a.outcome,
        "confidence": a.confidence,
        "guessed_category": a.guessed_category,
        "key_insight": a.key_insight,
        "mistakes": a.mistakes,
        "notes": a.notes,
        "verified": a.verified,
    }


def solution_out(s: Solution) -> dict:
    return {
        "id": s.id,
        "problem_id": s.problem_id,
        "attempt_id": s.attempt_id,
        "language": s.language,
        "filename": s.filename,
        "created_at": s.created_at.isoformat(),
    }


def video_out(v: Video) -> dict:
    return {
        "id": v.id,
        "problem_id": v.problem_id,
        "attempt_id": v.attempt_id,
        "title": v.title,
        "mime": v.mime,
        "size_bytes": v.size_bytes,
        "duration_sec": v.duration_sec,
        "created_at": v.created_at.isoformat(),
        "url": f"/api/videos/{v.id}/file",
    }


def category_name(key: str | None) -> str:
    return BY_KEY[key].name if key in BY_KEY else (key or "")
