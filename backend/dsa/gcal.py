"""One-way sync of the schedule to a dedicated "Study Lab" Google Calendar.

Uses the `calendar.app.created` scope: the app can only see and change calendars it created
itself, never the user's other calendars. OAuth client credentials and tokens live in the
local `settings` table (under `gcal.*` keys, never returned by /api/settings).
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import GcalEvent, ScheduleBlock, ScheduleSkip, Setting, utcnow

log = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar.app.created"
CALENDAR_NAME = "Study Lab"

# Google event colour ids: https://developers.google.com/calendar/api/v3/reference/colors
COLORS = {"work": "9", "meeting": "5", "study": "10", "health": "7", "free": "3", "routine": "8"}
CATEGORY_LABEL = {"work": "Work", "meeting": "Meeting", "study": "Study", "health": "Health", "free": "Free", "routine": "Routine"}
DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
POINT_EVENT_MINUTES = 15  # blocks without an end time (e.g. bedtime)


class GcalError(Exception):
    pass


# --- private state ----------------------------------------------------------------------------

def get(session: Session, name: str, default: Any = None) -> Any:
    row = session.get(Setting, f"gcal.{name}")
    return default if row is None else row.value


def put(session: Session, name: str, value: Any) -> None:
    key = f"gcal.{name}"
    row = session.get(Setting, key)
    if value is None:
        if row is not None:
            session.delete(row)
    elif row is None:
        session.add(Setting(key=key, value=value))
    else:
        row.value = value


def is_connected(session: Session) -> bool:
    return bool(get(session, "token"))


API_DISABLED_HELP = (
    "The Google Calendar API is turned off in your Google Cloud project. Enable it at "
    "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com (check the Study Lab "
    "project is selected at the top), wait a minute, then click Sync now."
)


def google_error(r: httpx.Response, what: str) -> str:
    """Readable message from a Google error response."""
    try:
        err = r.json().get("error", {})
        msg = err.get("message", "") if isinstance(err, dict) else str(err)
    except ValueError:
        msg = r.text[:200]
    if r.status_code == 403 and ("SERVICE_DISABLED" in r.text or "accessNotConfigured" in r.text or "has not been used" in msg):
        return API_DISABLED_HELP
    return f"{what} ({r.status_code}): {msg.split('. ')[0] if msg else 'no details'}"


# --- OAuth ------------------------------------------------------------------------------------

def new_http() -> httpx.Client:
    return httpx.Client(timeout=30)


def store_token(session: Session, data: dict) -> None:
    token = dict(get(session, "token") or {})
    token["access_token"] = data["access_token"]
    token["expires_at"] = time.time() + int(data.get("expires_in", 3600))
    if data.get("refresh_token"):  # only sent on first consent
        token["refresh_token"] = data["refresh_token"]
    put(session, "token", token)


def exchange_code(session: Session, http: httpx.Client, code: str, redirect_uri: str) -> None:
    r = http.post(TOKEN_URL, data={
        "code": code, "client_id": get(session, "client_id"), "client_secret": get(session, "client_secret"),
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    })
    if r.status_code != 200:
        raise GcalError(google_error(r, f"Google rejected the sign-in"))
    data = r.json()
    if not data.get("refresh_token"):
        raise GcalError("Google did not return a refresh token; disconnect and connect again.")
    store_token(session, data)


class Google:
    """Minimal Calendar API client with automatic token refresh."""

    def __init__(self, session: Session, http: httpx.Client):
        self.session, self.http = session, http

    def _access_token(self, force: bool = False) -> str:
        token = get(self.session, "token")
        if not token:
            raise GcalError("Not connected to Google Calendar.")
        if force or token.get("expires_at", 0) < time.time() + 60:
            r = self.http.post(TOKEN_URL, data={
                "client_id": get(self.session, "client_id"), "client_secret": get(self.session, "client_secret"),
                "refresh_token": token.get("refresh_token"), "grant_type": "refresh_token",
            })
            if r.status_code != 200:
                # invalid_grant: revoked, expired (unpublished "Testing" apps expire after 7 days) or password change.
                put(self.session, "token", None)
                self.session.commit()
                raise GcalError("Google access expired or was revoked. Connect Google Calendar again.")
            store_token(self.session, r.json())
            self.session.commit()
            token = get(self.session, "token")
        return token["access_token"]

    def request(self, method: str, path: str, **kw) -> httpx.Response:
        for attempt in range(2):
            r = self.http.request(method, API + path, headers={"Authorization": f"Bearer {self._access_token(force=attempt == 1)}"}, **kw)
            if r.status_code != 401:
                return r
        return r


# --- sync -------------------------------------------------------------------------------------

def _anchor_date(b: ScheduleBlock) -> date:
    """First day the recurring block happens on, counted from when it was created."""
    d = b.created_at.date()
    while d.weekday() not in b.days:
        d += timedelta(days=1)
    return d


def _end(day: date, b: ScheduleBlock) -> datetime:
    if b.end_time:
        return datetime.combine(day, datetime.strptime(b.end_time, "%H:%M").time())
    return datetime.combine(day, datetime.strptime(b.start_time, "%H:%M").time()) + timedelta(minutes=POINT_EVENT_MINUTES)


def event_body(b: ScheduleBlock, skips: list[str], tz: str, reminder: int | None) -> dict:
    day = date.fromisoformat(b.date) if b.date else _anchor_date(b)
    start = datetime.combine(day, datetime.strptime(b.start_time, "%H:%M").time())
    lines = [b.notes.strip(), f"{CATEGORY_LABEL.get(b.category, b.category)}{' · optional' if b.optional else ''}"]
    if b.timer:
        lines.append("Timer: " + " → ".join(f"{p['label']} {p['minutes']:g}m" for p in b.timer.phases))
    lines.append("Managed by Study Lab. Edit it there; changes made here get overwritten.")
    body: dict[str, Any] = {
        "summary": b.title,
        "description": "\n\n".join(x for x in lines if x),
        "start": {"dateTime": start.isoformat(timespec="seconds"), "timeZone": tz},
        "end": {"dateTime": _end(day, b).isoformat(timespec="seconds"), "timeZone": tz},
        "colorId": COLORS.get(b.category, "8"),
        "transparency": "transparent" if b.category == "free" or b.optional else "opaque",
        "reminders": {"useDefault": False, "overrides": [] if reminder is None else [{"method": "popup", "minutes": reminder}]},
        "extendedProperties": {"private": {"studylab_block": str(b.id)}},
    }
    if not b.date:
        rules = [f"RRULE:FREQ=WEEKLY;BYDAY={','.join(DAY_CODES[d] for d in b.days)}"]
        if skips:
            hhmmss = b.start_time.replace(":", "") + "00"
            rules.append(f"EXDATE;TZID={tz}:" + ",".join(f"{s.replace('-', '')}T{hhmmss}" for s in sorted(skips)))
        body["recurrence"] = rules
    return body


def _hash(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def _ensure_calendar(g: Google, session: Session, tz: str) -> str:
    cal_id = get(session, "calendar_id")
    if cal_id:
        r = g.request("GET", f"/calendars/{cal_id}")
        if r.status_code == 200:
            return cal_id
        if r.status_code not in (404, 410):
            raise GcalError(google_error(r, f"Couldn't open the Study Lab calendar"))
    # First connect, or the user deleted the calendar in Google: (re)create it.
    r = g.request("POST", "/calendars", json={
        "summary": CALENDAR_NAME, "timeZone": tz,
        "description": "Your Study Lab routine. Managed by the Study Lab app; edit blocks there.",
    })
    if r.status_code != 200:
        raise GcalError(google_error(r, f"Couldn't create the Study Lab calendar"))
    cal_id = r.json()["id"]
    put(session, "calendar_id", cal_id)
    for m in session.scalars(select(GcalEvent)):
        session.delete(m)
    session.commit()
    return cal_id


_lock = threading.Lock()


def sync(session: Session, http: httpx.Client | None = None) -> dict:
    """Push every block to Google: create new, update changed, delete removed. Idempotent."""
    if not is_connected(session):
        return {"connected": False}
    own_http = http is None
    http = http or new_http()
    with _lock:
        try:
            g = Google(session, http)
            tz = get(session, "timezone") or "UTC"
            reminder = get(session, "reminder_minutes", 0)  # minutes before start; -1 = none
            reminder = None if reminder < 0 else reminder
            cal = _ensure_calendar(g, session, tz)
            blocks = session.scalars(select(ScheduleBlock)).all()
            skips: dict[int, list[str]] = {}
            for s in session.scalars(select(ScheduleSkip)):
                skips.setdefault(s.block_id, []).append(s.date)
            mapped = {m.block_id: m for m in session.scalars(select(GcalEvent))}
            counts = {"created": 0, "updated": 0, "deleted": 0, "unchanged": 0}

            for b in blocks:
                body = event_body(b, skips.get(b.id, []), tz, reminder)
                h = _hash(body)
                m = mapped.get(b.id)
                if m and m.body_hash == h:
                    counts["unchanged"] += 1
                    continue
                r = g.request("PUT", f"/calendars/{cal}/events/{m.event_id}", json=body) if m else None
                if r is None or r.status_code in (404, 410):  # new, or deleted by hand in Google
                    r = g.request("POST", f"/calendars/{cal}/events", json=body)
                    counts["created"] += 1
                else:
                    counts["updated"] += 1
                if r.status_code != 200:
                    raise GcalError(google_error(r, f"Couldn't save '{b.title}'"))
                if m is None:
                    m = GcalEvent(block_id=b.id, event_id="", body_hash="")
                    session.add(m)
                m.event_id, m.body_hash, m.synced_at = r.json()["id"], h, utcnow()
                session.commit()

            live = {b.id for b in blocks}
            for block_id, m in mapped.items():
                if block_id in live:
                    continue
                r = g.request("DELETE", f"/calendars/{cal}/events/{m.event_id}")
                if r.status_code not in (200, 204, 404, 410):
                    raise GcalError(google_error(r, f"Couldn't delete an event"))
                session.delete(m)
                counts["deleted"] += 1
                session.commit()

            put(session, "last_sync", utcnow().isoformat())
            put(session, "last_error", None)
            session.commit()
            return {"connected": True, **counts}
        except (GcalError, httpx.HTTPError) as e:
            session.rollback()
            put(session, "last_error", str(e) if isinstance(e, GcalError) else f"Network error talking to Google: {e}")
            session.commit()
            raise GcalError(get(session, "last_error")) from e
        finally:
            if own_http:
                http.close()


# --- background sync after schedule edits -----------------------------------------------------

_timer: threading.Timer | None = None
_timer_lock = threading.Lock()


def request_sync(session: Session, delay: float = 2.0) -> None:
    """Debounced: a burst of edits becomes one sync a couple of seconds after the last one."""
    if not is_connected(session):
        return
    global _timer
    with _timer_lock:
        if _timer:
            _timer.cancel()
        _timer = threading.Timer(delay, _background_sync)
        _timer.daemon = True
        _timer.start()


def _background_sync() -> None:
    from .db import session_scope

    try:
        with session_scope() as s:
            sync(s)
    except Exception:  # error is stored in gcal.last_error for the UI
        log.warning("Google Calendar sync failed", exc_info=True)


def disconnect(session: Session, delete_calendar: bool, http: httpx.Client | None = None) -> None:
    http = http or new_http()
    token = get(session, "token") or {}
    cal = get(session, "calendar_id")
    if delete_calendar and cal and token:
        try:
            Google(session, http).request("DELETE", f"/calendars/{cal}")
        except (GcalError, httpx.HTTPError):
            log.warning("couldn't delete the Study Lab calendar", exc_info=True)
    if token.get("refresh_token"):
        try:
            http.post(REVOKE_URL, data={"token": token["refresh_token"]})
        except httpx.HTTPError:
            pass
    for name in ("token", "calendar_id", "last_sync", "last_error", "state"):
        put(session, name, None)
    for m in session.scalars(select(GcalEvent)):
        session.delete(m)
    session.commit()
