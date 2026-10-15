"""Elo-style skill per category, on the same scale as Problem.rating.

After each attempt every category of the problem moves toward the observed result: solving a
problem above your rating raises it a lot, failing one far below lowers it a lot.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import CategorySkill, Problem, utcnow
from .srs import OUTCOMES


def expected(skill: float, problem_rating: float) -> float:
    return 1.0 / (1.0 + 10 ** ((problem_rating - skill) / 400.0))


def k_factor(n_attempts: int) -> float:
    # Move fast while the estimate is uncertain, then settle.
    return 64 if n_attempts < 5 else 40 if n_attempts < 20 else 24


def get_skills(session: Session) -> dict[str, CategorySkill]:
    return {s.category: s for s in session.query(CategorySkill)}


def skill_of(skills: dict[str, CategorySkill], category: str, initial: float) -> float:
    s = skills.get(category)
    return s.rating if s else initial


def update(session: Session, problem: Problem, outcome: str, is_review: bool, initial: float,
           weight: float = 1.0) -> dict[str, tuple[float, float]]:
    """Update skills for all of the problem's categories. Returns {category: (before, after)}."""
    score = OUTCOMES[outcome][2]
    changes: dict[str, tuple[float, float]] = {}
    for pc in problem.categories:
        row = session.get(CategorySkill, pc.category)
        if row is None:
            row = CategorySkill(category=pc.category, rating=initial, n_attempts=0)
            session.add(row)
        k = k_factor(row.n_attempts) * weight
        if pc.category != problem.primary_category:
            k *= 0.5
        if is_review:
            k *= 0.5  # re-solving something already seen says less about skill
        before = row.rating
        row.rating = before + k * (score - expected(before, problem.rating))
        row.n_attempts += 1
        row.updated_at = utcnow()
        changes[pc.category] = (before, row.rating)
    return changes
