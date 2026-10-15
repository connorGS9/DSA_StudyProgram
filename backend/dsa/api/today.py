from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import settings as settings_mod
from ..db import get_session
from ..models import DailySlot, Problem, utcnow
from ..scheduler import selector
from ..scheduler.skill import get_skills
from .serialize import slot_out

router = APIRouter(prefix="/api/today", tags=["today"])


def _today_payload(session: Session, ds) -> dict:
    session.refresh(ds)
    skills = {k: v.rating for k, v in get_skills(session).items()}
    initial = float(settings_mod.get(session, "initial_skill"))
    active = selector.active_slots(ds)
    ctx = selector.make_context(session, ds.day)
    return {
        "day": ds.day,
        "slots": [slot_out(s, skills, initial) for s in sorted(active, key=lambda s: s.position)],
        "completed": sum(1 for s in active if s.status == "completed"),
        "total": len(active),
        "reviews_due": len(selector.due_reviews(ctx)),
    }


@router.get("")
def get_today(session: Session = Depends(get_session)):
    ds = selector.get_or_create_day(session)
    return _today_payload(session, ds)


class CountIn(BaseModel):
    count: int = Field(ge=0, le=30)


@router.post("/count")
def set_count(body: CountIn, session: Session = Depends(get_session)):
    ds = selector.get_or_create_day(session)
    selector.set_count(session, ds, body.count)
    return _today_payload(session, ds)


@router.post("/reroll")
def reroll_all(session: Session = Depends(get_session)):
    ds = selector.get_or_create_day(session)
    selector.reroll_all(session, ds)
    return _today_payload(session, ds)


def _slot(session: Session, slot_id: int) -> DailySlot:
    slot = session.get(DailySlot, slot_id)
    if slot is None:
        raise HTTPException(404, "slot not found")
    return slot


@router.get("/slots/{slot_id}")
def get_slot(slot_id: int, session: Session = Depends(get_session)):
    slot = _slot(session, slot_id)
    skills = {k: v.rating for k, v in get_skills(session).items()}
    return {**slot_out(slot, skills, float(settings_mod.get(session, "initial_skill"))), "day": slot.day}


@router.post("/slots/{slot_id}/reroll")
def reroll_slot(slot_id: int, session: Session = Depends(get_session)):
    slot = _slot(session, slot_id)
    if slot.status != "pending":
        raise HTTPException(400, "only unfinished problems can be rerolled")
    if selector.reroll(session, slot) is None:
        raise HTTPException(409, "no other problem available to swap in")
    return _today_payload(session, slot.daily_set)


@router.post("/slots/{slot_id}/drop")
def drop_slot(slot_id: int, session: Session = Depends(get_session)):
    slot = _slot(session, slot_id)
    if slot.status != "pending":
        raise HTTPException(400, "only unfinished problems can be removed")
    slot.status = "dropped"
    session.commit()
    return _today_payload(session, slot.daily_set)


@router.post("/slots/{slot_id}/start")
def start_slot(slot_id: int, session: Session = Depends(get_session)):
    slot = _slot(session, slot_id)
    if slot.started_at is None:
        slot.started_at = utcnow()
        session.commit()
    return {"started_at": slot.started_at.isoformat()}


class AddIn(BaseModel):
    problem_id: int


@router.post("/add")
def add_problem(body: AddIn, session: Session = Depends(get_session)):
    p = session.get(Problem, body.problem_id)
    if p is None:
        raise HTTPException(404, "problem not found")
    ds = selector.get_or_create_day(session)
    if any(s.problem_id == p.id and s.status in selector.ACTIVE for s in ds.slots):
        raise HTTPException(409, "already in today's set")
    selector.add_specific(session, ds, p)
    return _today_payload(session, ds)
