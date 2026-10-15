"""Study lab: daily/weekly routine, one-off events, per-day skips and moves, and timer presets."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import gcal
from ..db import get_session
from ..models import ScheduleBlock, ScheduleSkip, TimerPreset
from ..scheduler.selector import today_str

router = APIRouter(prefix="/api", tags=["schedule"])

Category = Literal["routine", "work", "meeting", "study", "health", "free"]
TIME = r"^([01]\d|2[0-3]):[0-5]\d$"
DATE = r"^\d{4}-\d{2}-\d{2}$"


def _get(session: Session, model, id_: int):
    obj = session.get(model, id_)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {id_} not found")
    return obj


# --- timers -----------------------------------------------------------------------------------

class Phase(BaseModel):
    label: str = Field(min_length=1, max_length=64)
    minutes: float = Field(gt=0, le=600)


class TimerIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    phases: list[Phase] = Field(min_length=1)
    loop: bool = False


class TimerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    phases: list[Phase] | None = Field(default=None, min_length=1)
    loop: bool | None = None


def timer_out(t: TimerPreset) -> dict:
    return {"id": t.id, "name": t.name, "phases": t.phases, "loop": t.loop,
            "total_minutes": sum(p["minutes"] for p in t.phases)}


@router.get("/timers")
def list_timers(session: Session = Depends(get_session)):
    return [timer_out(t) for t in session.scalars(select(TimerPreset).order_by(TimerPreset.id))]


@router.post("/timers")
def create_timer(body: TimerIn, session: Session = Depends(get_session)):
    t = TimerPreset(name=body.name.strip(), phases=[p.model_dump() for p in body.phases], loop=body.loop)
    session.add(t)
    session.commit()
    gcal.request_sync(session)
    return timer_out(t)


@router.patch("/timers/{timer_id}")
def update_timer(timer_id: int, body: TimerPatch, session: Session = Depends(get_session)):
    t = _get(session, TimerPreset, timer_id)
    if body.name is not None:
        t.name = body.name.strip()
    if body.phases is not None:
        t.phases = [p.model_dump() for p in body.phases]
    if body.loop is not None:
        t.loop = body.loop
    session.commit()
    gcal.request_sync(session)
    return timer_out(t)


@router.delete("/timers/{timer_id}")
def delete_timer(timer_id: int, session: Session = Depends(get_session)):
    session.delete(_get(session, TimerPreset, timer_id))
    session.commit()
    gcal.request_sync(session)
    return {"ok": True}


# --- blocks -----------------------------------------------------------------------------------

def block_out(b: ScheduleBlock) -> dict:
    return {
        "id": b.id,
        "title": b.title,
        "start_time": b.start_time,
        "end_time": b.end_time,
        "days": b.days,
        "date": b.date,
        "category": b.category,
        "timer": timer_out(b.timer) if b.timer else None,
        "timer_id": b.timer_id,
        "link": b.link,
        "notes": b.notes,
        "optional": b.optional,
        "moved_from_id": b.moved_from_id,
    }


def _check_days(v: list[int] | None) -> list[int] | None:
    if v is None:
        return v
    if any(d < 0 or d > 6 for d in v):
        raise ValueError("days are 0 (Mon) .. 6 (Sun)")
    return sorted(set(v))


class _Times(BaseModel):
    @model_validator(mode="after")
    def _end_after_start(self):
        start, end = getattr(self, "start_time", None), getattr(self, "end_time", None)
        if start and end and end <= start:
            raise ValueError("end_time must be after start_time")
        return self


class BlockIn(_Times):
    title: str = Field(min_length=1, max_length=256)
    start_time: str = Field(pattern=TIME)
    end_time: str | None = Field(default=None, pattern=TIME)
    days: list[int] = []
    date: str | None = Field(default=None, pattern=DATE)
    category: Category = "routine"
    timer_id: int | None = None
    link: str = ""
    notes: str = ""
    optional: bool = False

    _days = field_validator("days")(_check_days)

    @model_validator(mode="after")
    def _when(self):
        if not self.date and not self.days:
            raise ValueError("a block needs weekdays (recurring) or a date (one-off)")
        return self


class BlockPatch(_Times):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    start_time: str | None = Field(default=None, pattern=TIME)
    end_time: str | None = Field(default=None, pattern=TIME)
    days: list[int] | None = None
    category: Category | None = None
    timer_id: int | None = None
    link: str | None = None
    notes: str | None = None
    optional: bool | None = None

    _days = field_validator("days")(_check_days)


@router.get("/schedule/blocks")
def list_blocks(session: Session = Depends(get_session)):
    """Every recurring block plus one-offs from today on, ordered by time."""
    q = select(ScheduleBlock).where(or_(ScheduleBlock.date.is_(None), ScheduleBlock.date >= today_str()))
    return [block_out(b) for b in sorted(session.scalars(q), key=lambda b: (b.date or "", b.start_time))]


@router.post("/schedule/blocks")
def create_block(body: BlockIn, session: Session = Depends(get_session)):
    if body.timer_id is not None:
        _get(session, TimerPreset, body.timer_id)
    data = body.model_dump()
    if data["date"]:
        data["days"] = []
    b = ScheduleBlock(**data)
    session.add(b)
    session.commit()
    gcal.request_sync(session)
    return block_out(b)


@router.patch("/schedule/blocks/{block_id}")
def update_block(block_id: int, body: BlockPatch, session: Session = Depends(get_session)):
    b = _get(session, ScheduleBlock, block_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("timer_id") is not None:
        _get(session, TimerPreset, changes["timer_id"])
    if "days" in changes and not b.date and not changes["days"]:
        raise HTTPException(422, "a recurring block needs at least one weekday")
    for k, v in changes.items():
        setattr(b, k, v)
    if b.end_time and b.end_time <= b.start_time:
        raise HTTPException(422, "end_time must be after start_time")
    session.commit()
    gcal.request_sync(session)
    return block_out(b)


@router.delete("/schedule/blocks/{block_id}")
def delete_block(block_id: int, session: Session = Depends(get_session)):
    b = _get(session, ScheduleBlock, block_id)
    # Deleting a moved copy puts the original back on the day it was moved from.
    if b.moved_from_id and b.moved_from_date:
        skip = session.get(ScheduleSkip, (b.moved_from_id, b.moved_from_date))
        if skip:
            session.delete(skip)
    # Deleting a recurring block also removes its moved occurrences.
    for moved in session.scalars(select(ScheduleBlock).where(ScheduleBlock.moved_from_id == b.id)):
        session.delete(moved)
    session.delete(b)
    session.commit()
    gcal.request_sync(session)
    return {"ok": True}


class DateIn(BaseModel):
    date: str = Field(pattern=DATE)


@router.post("/schedule/blocks/{block_id}/skip")
def skip_block(block_id: int, body: DateIn, session: Session = Depends(get_session)):
    b = _get(session, ScheduleBlock, block_id)
    if b.date:
        raise HTTPException(400, "one-off events are deleted, not skipped")
    if not session.get(ScheduleSkip, (block_id, body.date)):
        session.add(ScheduleSkip(block_id=block_id, date=body.date))
    session.commit()
    gcal.request_sync(session)
    return {"ok": True}


@router.delete("/schedule/blocks/{block_id}/skip/{day}")
def unskip_block(block_id: int, day: str, session: Session = Depends(get_session)):
    skip = session.get(ScheduleSkip, (block_id, day))
    if skip:
        session.delete(skip)
        # A moved copy for that day no longer makes sense once the original is back.
        for moved in session.scalars(select(ScheduleBlock).where(ScheduleBlock.moved_from_id == block_id, ScheduleBlock.moved_from_date == day)):
            session.delete(moved)
        session.commit()
    gcal.request_sync(session)
    return {"ok": True}


class MoveIn(_Times):
    date: str = Field(pattern=DATE)  # the occurrence being moved
    to_date: str | None = Field(default=None, pattern=DATE)  # defaults to the same day
    start_time: str = Field(pattern=TIME)
    end_time: str | None = Field(default=None, pattern=TIME)


@router.post("/schedule/blocks/{block_id}/move")
def move_block(block_id: int, body: MoveIn, session: Session = Depends(get_session)):
    """Move one occurrence of a recurring block: skip it that day and add a one-off copy."""
    b = _get(session, ScheduleBlock, block_id)
    if b.date:
        b.date = body.to_date or b.date
        b.start_time, b.end_time = body.start_time, body.end_time
        session.commit()
        gcal.request_sync(session)
        return block_out(b)
    if not session.get(ScheduleSkip, (block_id, body.date)):
        session.add(ScheduleSkip(block_id=block_id, date=body.date))
    copy = ScheduleBlock(
        title=b.title, start_time=body.start_time, end_time=body.end_time, days=[], date=body.to_date or body.date,
        category=b.category, timer_id=b.timer_id, link=b.link, notes=b.notes, optional=b.optional, moved_from_id=b.id,
        moved_from_date=body.date,
    )
    session.add(copy)
    session.commit()
    gcal.request_sync(session)
    return block_out(copy)


# --- expanded calendar ------------------------------------------------------------------------

@router.get("/schedule")
def schedule(start: str | None = Query(default=None, pattern=DATE), days: int = Query(default=1, ge=1, le=42),
             session: Session = Depends(get_session)):
    """Occurrences per day from `start` (default today). Skipped recurring blocks are included,
    flagged `skipped`, so they can be restored."""
    first = date.fromisoformat(start) if start else date.today()
    last = first + timedelta(days=days - 1)
    recurring = session.scalars(select(ScheduleBlock).where(ScheduleBlock.date.is_(None))).all()
    oneoffs = session.scalars(
        select(ScheduleBlock).where(ScheduleBlock.date >= first.isoformat(), ScheduleBlock.date <= last.isoformat())
    ).all()
    skips = {
        (s.block_id, s.date)
        for s in session.scalars(select(ScheduleSkip).where(ScheduleSkip.date >= first.isoformat(), ScheduleSkip.date <= last.isoformat()))
    }
    out = []
    for i in range(days):
        d = first + timedelta(days=i)
        ds = d.isoformat()
        items = [{**block_out(b), "skipped": (b.id, ds) in skips} for b in recurring if d.weekday() in b.days]
        items += [{**block_out(b), "skipped": False} for b in oneoffs if b.date == ds]
        items.sort(key=lambda x: (x["start_time"], x["end_time"] or ""))
        out.append({"date": ds, "weekday": d.weekday(), "items": items})
    return out
