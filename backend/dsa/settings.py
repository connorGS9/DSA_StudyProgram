"""User settings persisted in the `settings` table, with defaults for anything unset."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .models import Setting

DEFAULTS: dict[str, Any] = {
    # Problems in a freshly generated day. Changeable per day from the home page.
    "daily_count": 4,
    # Max fraction of a day's slots given to due reviews; the rest are new problems.
    "review_share": 0.4,
    # Of the review slots, the max fraction that may be imported history (e.g. old LeetCode solves).
    "history_review_share": 0.5,
    # Which judge new problems are drawn from.
    "source_weights": {"codeforces": 0.45, "cses": 0.35, "leetcode": 0.20},
    # Multipliers on the built-in category weights, e.g. {"dp": 1.5, "geometry": 0}.
    "category_weights": {},
    # New problems are centered this many points above your skill in the chosen category.
    "stretch": 100,
    # Spread (std-dev) of the difficulty around that target.
    "difficulty_spread": 150,
    "initial_skill": 1200,
    "leetcode_premium": False,
    "codeforces_handle": "",
    "leetcode_username": "",
    "leetcode_session": "",  # secret; only ever sent to leetcode.com
    # FSRS target probability of still being able to solve a problem when it comes due.
    "desired_retention": 0.85,
    # Study lab: current priorities shown on the dashboard, e.g. for "the next four weeks".
    "lab_focus": {"items": [], "until": None},
}

SECRET_KEYS = {"leetcode_session"}


def get(session: Session, key: str) -> Any:
    row = session.get(Setting, key)
    return DEFAULTS.get(key) if row is None else row.value


def get_all(session: Session) -> dict[str, Any]:
    values = dict(DEFAULTS)
    for row in session.query(Setting):
        # Other modules keep private state in this table (e.g. "gcal.token"); never expose it here.
        if row.key in DEFAULTS:
            values[row.key] = row.value
    return values


def update(session: Session, changes: dict[str, Any]) -> dict[str, Any]:
    for key, value in changes.items():
        if key not in DEFAULTS:
            raise KeyError(key)
        row = session.get(Setting, key)
        if row is None:
            session.add(Setting(key=key, value=value))
        else:
            row.value = value
    session.commit()
    return get_all(session)


def public(values: dict[str, Any]) -> dict[str, Any]:
    """Settings as sent to the UI: secrets are reduced to whether they are set."""
    out = dict(values)
    for k in SECRET_KEYS:
        out[k] = bool(out.get(k))
    return out
