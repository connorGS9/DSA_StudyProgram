from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import services
from .. import settings as settings_mod
from ..categories import CATEGORIES
from ..db import get_session
from ..models import Attempt, CategorySkill, Problem, SrsState, utcnow
from ..scheduler import selector
from .serialize import attempt_out, problem_out

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _local_day(dt: datetime) -> date:
    return dt.replace(tzinfo=timezone.utc).astimezone().date()


def _streaks(days: set[date]) -> tuple[int, int]:
    if not days:
        return 0, 0
    longest = run = 0
    prev = None
    for d in sorted(days):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        longest = max(longest, run)
        prev = d
    today = date.today()
    cur = 0
    d = today if today in days else today - timedelta(days=1)
    while d in days:
        cur += 1
        d -= timedelta(days=1)
    return cur, longest


@router.get("")
def stats(session: Session = Depends(get_session)):
    cfg = settings_mod.get_all(session)
    initial = float(cfg["initial_skill"])
    skills = {s.category: s for s in session.query(CategorySkill)}
    ctx = selector.make_context(session, selector.today_str())
    weights = selector.category_weights(ctx)
    wsum = sum(weights.values()) or 1

    attempts = list(session.scalars(select(Attempt).order_by(Attempt.finished_at)))
    per_cat_attempts = Counter(
        session.scalars(select(Problem.primary_category).join(Attempt, Attempt.problem_id == Problem.id))
    )
    categories = []
    for c in CATEGORIES:
        s = skills.get(c.key)
        categories.append({
            "key": c.key,
            "name": c.name,
            "skill": round(s.rating) if s else round(initial),
            "attempts": s.n_attempts if s else 0,
            "primary_attempts": per_cat_attempts.get(c.key, 0),
            "unlocked": c.unlock_at <= ctx.mean_skill,
            "unlock_at": c.unlock_at,
            "recent_share": round(ctx.recent_share.get(c.key, 0.0), 3),
            "next_pick_chance": round(weights.get(c.key, 0) / wsum, 3),
        })

    activity = Counter(_local_day(a.finished_at).isoformat() for a in attempts)
    current, longest = _streaks({date.fromisoformat(d) for d in activity})

    now = utcnow()
    forecast = Counter()
    for (due,) in session.execute(
        select(SrsState.due).where(SrsState.retired.is_(False), SrsState.due <= now + timedelta(days=30))
    ):
        forecast[max(_local_day(due), date.today()).isoformat()] += 1

    by_source = dict(session.execute(
        select(Problem.source, func.count()).join(SrsState, SrsState.problem_id == Problem.id).group_by(Problem.source)
    ).all())
    recent = list(reversed(attempts[-15:]))
    return {
        "mean_skill": round(ctx.mean_skill),
        "categories": categories,
        "activity": activity,
        "streak": {"current": current, "longest": longest},
        "totals": {
            "attempts": len(attempts),
            "problems_seen": session.scalar(select(func.count()).select_from(SrsState)),
            "outcomes": Counter(a.outcome for a in attempts),
            "seen_by_source": by_source,
            "practice_minutes": round(sum(a.duration_sec or 0 for a in attempts) / 60),
        },
        "review_forecast": dict(sorted(forecast.items())),
        "recognition": services.recognition_stats(session),
        "recent": [
            {**attempt_out(a), "problem": problem_out(session.get(Problem, a.problem_id))} for a in recent
        ],
    }
