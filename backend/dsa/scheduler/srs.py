"""Per-problem spacing with FSRS.

Problems are not flashcards: there are no same-day learning steps, so even a failed attempt comes
back after at least a day. Solving a problem cleanly pushes it out quickly (days -> weeks -> months).
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import fsrs

from ..models import SrsState

OUTCOMES = {
    # outcome: (label, FSRS rating, score used for skill updates)
    "solved_clean": ("Solved quickly, felt easy", fsrs.Rating.Easy, 1.0),
    "solved": ("Solved on my own", fsrs.Rating.Good, 0.85),
    "solved_hint": ("Solved after a hint / big struggle", fsrs.Rating.Hard, 0.5),
    "saw_solution": ("Needed the solution", fsrs.Rating.Again, 0.15),
    "failed": ("Could not solve", fsrs.Rating.Again, 0.0),
}

MIN_INTERVAL = timedelta(days=1)


def scheduler(desired_retention: float = 0.85) -> fsrs.Scheduler:
    return fsrs.Scheduler(
        desired_retention=desired_retention,
        learning_steps=(),
        relearning_steps=(),
        maximum_interval=365,
        enable_fuzzing=True,
    )


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _naive(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def review(state: SrsState | None, problem_id: int, outcome: str, when: datetime,
           desired_retention: float = 0.85) -> SrsState:
    """Apply one attempt to a problem's SRS state (creating it on first attempt)."""
    rating = OUTCOMES[outcome][1]
    card = fsrs.Card() if state is None else fsrs.Card.from_dict(state.card)
    card, _ = scheduler(desired_retention).review_card(card, rating, _aware(when))
    due = max(_aware(card.due), _aware(when) + MIN_INTERVAL)
    if state is None:
        state = SrsState(problem_id=problem_id, reps=0, lapses=0, origin="practice")
    state.card = card.to_dict()
    state.due = _naive(due)
    state.reps = (state.reps or 0) + 1
    if rating == fsrs.Rating.Again:
        state.lapses = (state.lapses or 0) + 1
    state.last_review = _naive(_aware(when))
    state.origin = "practice"
    return state


def seed_history(problem_id: int, solved_at: datetime | None, now: datetime,
                 rng: random.Random | None = None) -> SrsState:
    """State for a problem solved before using this app.

    Treated as one "Good" review at the solve time, but the due date is spread over the coming
    weeks so a large import trickles in as low-priority reviews instead of arriving all at once.
    """
    rng = rng or random.Random()
    when = _aware(solved_at or now - timedelta(days=60))
    card, _ = scheduler().review_card(fsrs.Card(), fsrs.Rating.Good, when)
    due = _aware(now) + timedelta(days=rng.randint(7, 120))
    return SrsState(
        problem_id=problem_id,
        card=card.to_dict(),
        due=_naive(due),
        reps=1,
        lapses=0,
        last_review=_naive(when),
        origin="history",
    )


def retrievability(state: SrsState, now: datetime) -> float:
    card = fsrs.Card.from_dict(state.card)
    return scheduler().get_card_retrievability(card, _aware(now))
