"""SQLAlchemy ORM models. All datetimes are stored as naive UTC."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(16))  # codeforces | cses | leetcode
    external_id: Mapped[str] = mapped_column(String(128))  # "1520F", "1068", "two-sum"
    title: Mapped[str] = mapped_column(String(256))
    url: Mapped[str] = mapped_column(String(512))
    # Difficulty normalized onto the Codeforces rating scale (800..3500).
    rating: Mapped[int] = mapped_column(Integer)
    raw_difficulty: Mapped[str] = mapped_column(String(64), default="")
    # Most specific category, used for balancing. Null when no tag maps anywhere.
    primary_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)  # raw source tags
    paid_only: Mapped[bool] = mapped_column(Boolean, default=False)
    solved_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Excluded problems are never scheduled (user hid it, or it is unsuitable).
    excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    categories: Mapped[list[ProblemCategory]] = relationship(
        back_populates="problem", cascade="all, delete-orphan"
    )
    srs: Mapped[SrsState | None] = relationship(back_populates="problem", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_problem_source_ext"),
        Index("ix_problem_pick", "primary_category", "source", "rating"),
        Index("ix_problem_title", "title"),
    )


class ProblemCategory(Base):
    __tablename__ = "problem_categories"

    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True)
    category: Mapped[str] = mapped_column(String(32), primary_key=True, index=True)

    problem: Mapped[Problem] = relationship(back_populates="categories")


class SrsState(Base):
    """Spaced-repetition state for a problem that has been seen at least once."""

    __tablename__ = "srs_state"

    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True)
    card: Mapped[dict] = mapped_column(JSON)  # fsrs.Card.to_dict()
    due: Mapped[datetime] = mapped_column(DateTime, index=True)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    last_review: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # "practice" = solved inside this app, "history" = imported past solve (lower review priority).
    origin: Mapped[str] = mapped_column(String(16), default="practice")
    # Retired problems are mastered and never come back as reviews.
    retired: Mapped[bool] = mapped_column(Boolean, default=False)

    problem: Mapped[Problem] = relationship(back_populates="srs")


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), index=True)
    slot_id: Mapped[int | None] = mapped_column(ForeignKey("daily_slots.id", ondelete="SET NULL"), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # solved_clean | solved | solved_hint | saw_solution | failed
    outcome: Mapped[str] = mapped_column(String(16))
    fsrs_rating: Mapped[int] = mapped_column(Integer)  # 1..4 (Again, Hard, Good, Easy)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5
    guessed_category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    key_insight: Mapped[str] = mapped_column(Text, default="")
    mistakes: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)  # confirmed AC via judge API

    problem: Mapped[Problem] = relationship()
    solutions: Mapped[list[Solution]] = relationship(back_populates="attempt")


class Solution(Base):
    __tablename__ = "solutions"

    id: Mapped[int] = mapped_column(primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), index=True)
    attempt_id: Mapped[int | None] = mapped_column(ForeignKey("attempts.id", ondelete="SET NULL"), nullable=True)
    language: Mapped[str] = mapped_column(String(16))  # java | python | cpp | other
    filename: Mapped[str] = mapped_column(String(256))
    path: Mapped[str] = mapped_column(String(512))  # relative to SOLUTIONS_DIR
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    attempt: Mapped[Attempt | None] = relationship(back_populates="solutions")


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), index=True)
    attempt_id: Mapped[int | None] = mapped_column(ForeignKey("attempts.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(256), default="")
    path: Mapped[str] = mapped_column(String(512))  # relative to VIDEOS_DIR
    mime: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CategorySkill(Base):
    """Elo-style skill estimate per category, on the same scale as Problem.rating."""

    __tablename__ = "category_skill"

    category: Mapped[str] = mapped_column(String(32), primary_key=True)
    rating: Mapped[float] = mapped_column(Float)
    n_attempts: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DailySet(Base):
    __tablename__ = "daily_sets"

    day: Mapped[str] = mapped_column(String(10), primary_key=True)  # local date, ISO
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    slots: Mapped[list[DailySlot]] = relationship(
        back_populates="daily_set", order_by="DailySlot.position", cascade="all, delete-orphan"
    )


class DailySlot(Base):
    __tablename__ = "daily_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[str] = mapped_column(ForeignKey("daily_sets.day", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(8))  # review | new
    # pending | completed | rerolled (replaced by another slot) | dropped (removed by user)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    daily_set: Mapped[DailySet] = relationship(back_populates="slots")
    problem: Mapped[Problem] = relationship()


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON)


class ImportRun(Base):
    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(32))
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running | ok | error
    added: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")


# --- Study lab: books and projects ------------------------------------------------------------

class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(256))
    author: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)  # queued | reading | finished | dropped
    total_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_page: Mapped[int] = mapped_column(Integer, default=0)
    started_on: Mapped[str | None] = mapped_column(String(10), nullable=True)  # local date, ISO
    finished_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5
    url: Mapped[str] = mapped_column(String(512), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)  # order within the queue
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    notes: Mapped[list[BookNote]] = relationship(
        back_populates="book", order_by="BookNote.created_at.desc()", cascade="all, delete-orphan"
    )


class BookNote(Base):
    __tablename__ = "book_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), index=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    book: Mapped[Book] = relationship(back_populates="notes")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(8), default="active", index=True)  # idea | active | paused | done
    link: Mapped[str] = mapped_column(String(512), default="")
    started_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    finished_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    tasks: Mapped[list[ProjectTask]] = relationship(
        back_populates="project", order_by="ProjectTask.position", cascade="all, delete-orphan"
    )
    notes: Mapped[list[ProjectNote]] = relationship(
        back_populates="project", order_by="ProjectNote.created_at.desc()", cascade="all, delete-orphan"
    )


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped[Project] = relationship(back_populates="tasks")


class ProjectNote(Base):
    __tablename__ = "project_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped[Project] = relationship(back_populates="notes")
