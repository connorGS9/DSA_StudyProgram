from __future__ import annotations

from dataclasses import dataclass, field

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..categories import primary
from ..models import ImportRun, Problem, ProblemCategory, utcnow

USER_AGENT = "dsa-trainer/0.1 (personal spaced-repetition tool)"


def http_client() -> httpx.Client:
    return httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}, follow_redirects=True)


@dataclass
class ProblemData:
    external_id: str
    title: str
    url: str
    rating: int
    raw_difficulty: str
    tags: list[str]
    categories: list[str]
    excluded: bool = False
    paid_only: bool = False
    solved_count: int | None = None
    extra: dict = field(default_factory=dict)


def upsert_problems(session: Session, source: str, items: list[ProblemData]) -> tuple[int, int]:
    """Insert new problems and refresh metadata on existing ones. Returns (added, updated)."""
    existing = {p.external_id: p for p in session.scalars(select(Problem).where(Problem.source == source))}
    added = updated = 0
    for d in items:
        cats = d.categories or ["mixed"]
        p = existing.get(d.external_id)
        if p is None:
            p = Problem(source=source, external_id=d.external_id)
            session.add(p)
            existing[d.external_id] = p
            added += 1
        else:
            updated += 1
        p.title = d.title
        p.url = d.url
        p.rating = d.rating
        p.raw_difficulty = d.raw_difficulty
        p.tags = d.tags
        p.paid_only = d.paid_only
        p.solved_count = d.solved_count
        p.primary_category = primary(cats)
        if d.excluded:
            p.excluded = True  # never un-exclude: the user may have hidden it by hand
        if sorted(c.category for c in p.categories) != sorted(cats):
            p.categories.clear()
            session.flush()
            p.categories.extend(ProblemCategory(category=c) for c in cats)
    session.flush()
    return added, updated


def run_import(session: Session, source: str, fetch) -> ImportRun:
    """Record an ImportRun around `fetch() -> list[ProblemData]` and upsert the result."""
    run = ImportRun(source=source)
    session.add(run)
    session.commit()
    try:
        items = fetch()
        run.added, run.updated = upsert_problems(session, source, items)
        run.status = "ok"
        run.message = f"{len(items)} problems fetched"
    except Exception as e:  # surfaced in the UI rather than crashing the server
        session.rollback()
        run = session.merge(run)
        run.status = "error"
        run.message = f"{type(e).__name__}: {e}"
    run.finished_at = utcnow()
    session.commit()
    return run
