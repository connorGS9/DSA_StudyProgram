"""Google Calendar connection: client setup, OAuth sign-in, status, manual sync, disconnect."""

from __future__ import annotations

import secrets
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import gcal
from ..db import get_session
from ..models import GcalEvent

router = APIRouter(prefix="/api/gcal", tags=["gcal"])


def _redirect_uri(request: Request) -> str:
    return str(request.url_for("gcal_callback"))


@router.get("/status")
def status(request: Request, session: Session = Depends(get_session)):
    return {
        "configured": bool(gcal.get(session, "client_id") and gcal.get(session, "client_secret")),
        "client_id": gcal.get(session, "client_id") or "",
        "connected": gcal.is_connected(session),
        "calendar_id": gcal.get(session, "calendar_id"),
        "timezone": gcal.get(session, "timezone"),
        "reminder_minutes": gcal.get(session, "reminder_minutes", 0),
        "last_sync": gcal.get(session, "last_sync"),
        "last_error": gcal.get(session, "last_error"),
        "events": session.scalar(select(func.count()).select_from(GcalEvent)),
        "redirect_uri": _redirect_uri(request),
    }


class ConfigIn(BaseModel):
    client_id: str | None = Field(default=None, max_length=512)
    client_secret: str | None = Field(default=None, max_length=512)
    reminder_minutes: int | None = Field(default=None, ge=-1, le=240)  # -1 = no reminders


@router.put("/config")
def config(body: ConfigIn, request: Request, session: Session = Depends(get_session)):
    if body.client_id is not None:
        gcal.put(session, "client_id", body.client_id.strip() or None)
    if body.client_secret is not None:
        gcal.put(session, "client_secret", body.client_secret.strip() or None)
    if body.reminder_minutes is not None:
        gcal.put(session, "reminder_minutes", body.reminder_minutes)
    session.commit()
    gcal.request_sync(session)
    return status(request, session)


@router.get("/connect")
def connect(tz: str, request: Request, session: Session = Depends(get_session)):
    """Returns Google's consent URL; the browser navigates there."""
    if not (gcal.get(session, "client_id") and gcal.get(session, "client_secret")):
        raise HTTPException(400, "Add your Google OAuth client ID and secret first.")
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, f"unknown time zone {tz!r}")
    state = secrets.token_urlsafe(24)
    gcal.put(session, "state", state)
    gcal.put(session, "timezone", tz)
    session.commit()
    params = {
        "client_id": gcal.get(session, "client_id"),
        "redirect_uri": _redirect_uri(request),
        "response_type": "code",
        "scope": gcal.SCOPE,
        "access_type": "offline",
        "prompt": "consent",  # always return a refresh token
        "state": state,
    }
    return {"url": f"{gcal.AUTH_URL}?{urlencode(params)}"}


@router.get("/callback", name="gcal_callback", include_in_schema=False)
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
             session: Session = Depends(get_session)):
    def back(**q) -> RedirectResponse:
        return RedirectResponse(f"/settings?{urlencode(q)}#google-calendar", status_code=303)

    expected = gcal.get(session, "state")
    if not expected or not state or not secrets.compare_digest(state, expected):
        return back(gcal="error", msg="Sign-in link expired or was not started here. Try Connect again.")
    gcal.put(session, "state", None)
    session.commit()
    if error or not code:
        return back(gcal="error", msg=f"Google sign-in was cancelled ({error or 'no code'}).")
    try:
        with gcal.new_http() as http:
            gcal.exchange_code(session, http, code, _redirect_uri(request))
            session.commit()
            gcal.sync(session, http)
    except gcal.GcalError as e:
        session.commit()
        return back(gcal="error", msg=str(e))
    return back(gcal="connected")


@router.post("/sync")
def sync_now(request: Request, session: Session = Depends(get_session)):
    if not gcal.is_connected(session):
        raise HTTPException(400, "Not connected to Google Calendar.")
    try:
        result = gcal.sync(session)
    except gcal.GcalError as e:
        raise HTTPException(502, str(e))
    return {**status(request, session), "result": result}


class DisconnectIn(BaseModel):
    delete_calendar: bool = False


@router.post("/disconnect")
def disconnect(body: DisconnectIn, request: Request, session: Session = Depends(get_session)):
    gcal.disconnect(session, body.delete_calendar)
    return status(request, session)
