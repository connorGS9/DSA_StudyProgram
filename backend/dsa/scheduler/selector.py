"""Builds each day's problem set.

A day has N slots. Up to `review_share` of them go to due reviews (most at-risk first, practice
before imported history); the rest are new problems chosen in two steps:

1. Category: weighted random draw. Each unlocked category starts from its target share, gets
   boosted when it has been under-practiced over the last 3 weeks and when its skill lags your
   average, and categories already in today's set are skipped so a day never repeats a type.
2. Problem: from the chosen category, a judge is drawn by `source_weights`, then an unseen problem
   is drawn with a Gaussian preference around (category skill + stretch), so new problems sit
   slightly above your current level instead of being trivially easy.
"""

from __future__ import annotations

import math
import random
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import settings as settings_mod
from ..categories import BY_KEY, CATEGORIES
from ..models import Attempt, DailySet, DailySlot, Problem, SrsState, utcnow
from . import srs
from .skill import get_skills

ACTIVE = ("pending", "completed")
RECENT_DAYS = 21


@dataclass
class Context:
    session: Session
    settings: dict
    now: datetime
    day: str
    rng: random.Random
    skills: dict[str, float]
    mean_skill: float
    recent_share: dict[str, float]
    used_problem_ids: set[int] = field(default_factory=set)
    used_categories: set[str] = field(default_factory=set)

    def skill(self, category: str) -> float:
        return self.skills.get(category, self.settings["initial_skill"])


def today_str() -> str:
    return date.today().isoformat()


def end_of_day_utc(day: str) -> datetime:
    local_midnight = datetime.combine(date.fromisoformat(day) + timedelta(days=1), time())
    return local_midnight.astimezone().astimezone(timezone.utc).replace(tzinfo=None)


def make_context(session: Session, day: str, rng: random.Random | None = None) -> Context:
    cfg = settings_mod.get_all(session)
    skills = {k: v.rating for k, v in get_skills(session).items()}
    practiced = [v for v in skills.values()]
    mean = sum(practiced) / len(practiced) if practiced else cfg["initial_skill"]

    since = utcnow() - timedelta(days=RECENT_DAYS)
    counts = Counter(
        session.scalars(
            select(Problem.primary_category).join(Attempt, Attempt.problem_id == Problem.id)
            .where(Attempt.finished_at >= since)
        )
    )
    total = sum(counts.values())
    recent = {k: v / total for k, v in counts.items() if k} if total else {}

    ctx = Context(session, cfg, utcnow(), day, rng or random.Random(), skills, mean, recent)
    ds = session.get(DailySet, day)
    if ds:
        for s in ds.slots:
            ctx.used_problem_ids.add(s.problem_id)
            if s.status in ACTIVE and s.problem.primary_category:
                ctx.used_categories.add(s.problem.primary_category)
    return ctx


# --- category choice --------------------------------------------------------------------------

def category_weights(ctx: Context) -> dict[str, float]:
    overrides = ctx.settings.get("category_weights") or {}
    targets = {
        c.key: c.weight * float(overrides.get(c.key, 1.0))
        for c in CATEGORIES
        if c.unlock_at <= ctx.mean_skill and float(overrides.get(c.key, 1.0)) > 0
    }
    total = sum(targets.values()) or 1.0
    weights = {}
    for key, t in targets.items():
        t /= total
        deficit = t - ctx.recent_share.get(key, 0.0)
        weakness = max(-0.5, min(1.0, (ctx.mean_skill - ctx.skill(key)) / 400))
        weights[key] = max(0.05 * t, t + deficit) * (1 + weakness)
    return weights


def _weighted_order(rng: random.Random, weights: dict[str, float]) -> list[str]:
    """Keys in weighted-random order (sampling without replacement)."""
    # Efraimidis-Spirakis: sort by u^(1/w).
    keyed = [(rng.random() ** (1.0 / w), k) for k, w in weights.items() if w > 0]
    return [k for _, k in sorted(keyed, reverse=True)]


# --- problem choice ---------------------------------------------------------------------------

def _candidates(ctx: Context, category: str, source: str, lo: float, hi: float) -> list[Problem]:
    q = (
        select(Problem)
        .outerjoin(SrsState, SrsState.problem_id == Problem.id)
        .where(
            Problem.primary_category == category,
            Problem.source == source,
            Problem.excluded.is_(False),
            SrsState.problem_id.is_(None),
            Problem.rating.between(lo, hi),
        )
        .order_by(func.random())
        .limit(200)
    )
    if not ctx.settings.get("leetcode_premium"):
        q = q.where(Problem.paid_only.is_(False))
    if ctx.used_problem_ids:
        q = q.where(Problem.id.not_in(ctx.used_problem_ids))
    return list(ctx.session.scalars(q))


def _pick_from(ctx: Context, category: str, source: str) -> Problem | None:
    target = ctx.skill(category) + ctx.settings["stretch"]
    sigma = float(ctx.settings["difficulty_spread"])
    for widen in (1, 2, 4):
        s = sigma * widen
        cands = _candidates(ctx, category, source, target - 2 * s, target + 2 * s)
        if cands:
            w = [math.exp(-0.5 * ((p.rating - target) / s) ** 2) for p in cands]
            return ctx.rng.choices(cands, weights=w, k=1)[0]
    return None


def pick_new(ctx: Context) -> Problem | None:
    weights = category_weights(ctx)
    fresh = {k: w for k, w in weights.items() if k not in ctx.used_categories}
    sources = {k: float(v) for k, v in (ctx.settings.get("source_weights") or {}).items() if float(v) > 0}
    for cats in (fresh, weights):  # only repeat a category once every one has been used
        for category in _weighted_order(ctx.rng, cats):
            for source in _weighted_order(ctx.rng, sources):
                p = _pick_from(ctx, category, source)
                if p:
                    return p
    return None


# --- reviews ----------------------------------------------------------------------------------

def due_reviews(ctx: Context) -> list[SrsState]:
    q = (
        select(SrsState)
        .join(Problem, Problem.id == SrsState.problem_id)
        .where(
            SrsState.retired.is_(False),
            Problem.excluded.is_(False),
            SrsState.due <= end_of_day_utc(ctx.day),
        )
    )
    if ctx.used_problem_ids:
        q = q.where(SrsState.problem_id.not_in(ctx.used_problem_ids))
    states = list(ctx.session.scalars(q))
    # Practice reviews before imported history; within each, least likely to still be solvable first.
    states.sort(key=lambda s: (s.origin != "practice", srs.retrievability(s, ctx.now)))
    return states


def pick_reviews(ctx: Context, limit: int) -> list[SrsState]:
    if limit <= 0:
        return []
    history_cap = math.ceil(limit * float(ctx.settings["history_review_share"]))
    chosen: list[SrsState] = []
    due = due_reviews(ctx)
    # First pass keeps categories distinct; second pass fills remaining room if needed.
    for distinct in (True, False):
        for s in due:
            if len(chosen) >= limit:
                return chosen
            if s in chosen:
                continue
            if s.origin == "history" and sum(c.origin == "history" for c in chosen) >= history_cap:
                continue
            cat = s.problem.primary_category
            if distinct and cat in ctx.used_categories:
                continue
            chosen.append(s)
            ctx.used_problem_ids.add(s.problem_id)
            if cat:
                ctx.used_categories.add(cat)
    return chosen


# --- day management ---------------------------------------------------------------------------

def _add_slot(ctx: Context, ds: DailySet, problem: Problem, kind: str, position: int) -> DailySlot:
    slot = DailySlot(day=ds.day, position=position, problem_id=problem.id, kind=kind, problem=problem)
    ds.slots.append(slot)
    ctx.used_problem_ids.add(problem.id)
    if problem.primary_category:
        ctx.used_categories.add(problem.primary_category)
    return slot


def active_slots(ds: DailySet) -> list[DailySlot]:
    return [s for s in ds.slots if s.status in ACTIVE]


def _next_position(ds: DailySet) -> int:
    return max((s.position for s in ds.slots), default=-1) + 1


def add_problems(session: Session, ds: DailySet, n: int, rng: random.Random | None = None) -> int:
    """Append up to n slots, mixing reviews and new problems. Returns how many were added."""
    ctx = make_context(session, ds.day, rng)
    total_after = len(active_slots(ds)) + n
    reviews_have = sum(1 for s in active_slots(ds) if s.kind == "review")
    review_room = max(0, round(total_after * float(ctx.settings["review_share"])) - reviews_have)
    added = 0
    for st in pick_reviews(ctx, min(review_room, n)):
        _add_slot(ctx, ds, st.problem, "review", _next_position(ds))
        added += 1
    while added < n:
        p = pick_new(ctx)
        if p is None:
            # Out of new problems in range: fall back to any remaining due reviews.
            extra = pick_reviews(ctx, n - added)
            for st in extra:
                _add_slot(ctx, ds, st.problem, "review", _next_position(ds))
                added += 1
            break
        _add_slot(ctx, ds, p, "new", _next_position(ds))
        added += 1
    session.flush()
    return added


def get_or_create_day(session: Session, day: str | None = None, rng: random.Random | None = None) -> DailySet:
    day = day or today_str()
    ds = session.get(DailySet, day)
    if ds is None:
        ds = DailySet(day=day)
        session.add(ds)
        session.flush()
    if not ds.slots:
        # New day, or a day created before any problems were imported.
        add_problems(session, ds, int(settings_mod.get(session, "daily_count")), rng)
        session.commit()
    return ds


def set_count(session: Session, ds: DailySet, count: int, rng: random.Random | None = None) -> None:
    """Grow or shrink the day. Shrinking only drops unfinished slots, newest first."""
    active = active_slots(ds)
    if count > len(active):
        add_problems(session, ds, count - len(active), rng)
    else:
        removable = [s for s in sorted(active, key=lambda s: -s.position) if s.status == "pending"]
        for s in removable[: len(active) - count]:
            s.status = "dropped"
    session.commit()


def reroll(session: Session, slot: DailySlot, rng: random.Random | None = None) -> DailySlot | None:
    """Replace a pending slot with a different problem of the same kind (if one exists)."""
    if slot.status != "pending":
        return None
    ds = slot.daily_set
    slot.status = "rerolled"
    session.flush()
    ctx = make_context(session, ds.day, rng)  # the rerolled problem stays in used_problem_ids
    replacement: Problem | None = None
    kind = slot.kind
    if kind == "review":
        picked = pick_reviews(ctx, 1)
        replacement = picked[0].problem if picked else None
    if replacement is None:
        kind = "new"
        replacement = pick_new(ctx)
    if replacement is None:
        slot.status = "pending"  # nothing else available; keep the original
        session.commit()
        return None
    new_slot = _add_slot(ctx, ds, replacement, kind, slot.position)
    session.commit()
    return new_slot


def reroll_all(session: Session, ds: DailySet, rng: random.Random | None = None) -> None:
    pending = [s for s in ds.slots if s.status == "pending"]
    for s in pending:
        s.status = "rerolled"
    session.flush()
    add_problems(session, ds, len(pending), rng)
    session.commit()


def add_specific(session: Session, ds: DailySet, problem: Problem) -> DailySlot:
    ctx = make_context(session, ds.day)
    kind = "review" if problem.srs else "new"
    slot = _add_slot(ctx, ds, problem, kind, _next_position(ds))
    session.commit()
    return slot
