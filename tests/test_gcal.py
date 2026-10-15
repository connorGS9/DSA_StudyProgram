import itertools
import json
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from dsa import gcal
from dsa.main import create_app


class FakeGoogle:
    """In-memory stand-in for Google's OAuth and Calendar endpoints."""

    def __init__(self):
        self.calendars: dict[str, dict] = {}
        self.events: dict[str, dict[str, dict]] = {}
        self.ids = itertools.count(1)
        self.fail_refresh = False
        self.refreshes = 0
        self.revoked: list[str] = []

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self.handle))

    def handle(self, req: httpx.Request) -> httpx.Response:
        if req.url.host == "oauth2.googleapis.com":
            form = {k: v[0] for k, v in parse_qs(req.content.decode()).items()}
            if req.url.path == "/revoke":
                self.revoked.append(form["token"])
                return httpx.Response(200)
            assert form["client_id"] == "cid" and form["client_secret"] == "csecret"
            if form["grant_type"] == "authorization_code":
                if form["code"] != "good":
                    return httpx.Response(400, json={"error": "invalid_grant"})
                return httpx.Response(200, json={"access_token": "a1", "refresh_token": "r1", "expires_in": 3600})
            if self.fail_refresh:
                return httpx.Response(400, json={"error": "invalid_grant"})
            self.refreshes += 1
            return httpx.Response(200, json={"access_token": f"a{self.refreshes + 1}", "expires_in": 3600})

        assert req.headers["authorization"].startswith("Bearer a")
        parts = req.url.path.removeprefix("/calendar/v3/").split("/")
        body = json.loads(req.content) if req.content else None
        if parts == ["calendars"] and req.method == "POST":
            cid = f"cal{next(self.ids)}@group.calendar.google.com"
            self.calendars[cid] = body
            self.events[cid] = {}
            return httpx.Response(200, json={"id": cid, **body})
        cal = parts[1]
        if cal not in self.calendars:
            return httpx.Response(404)
        if len(parts) == 2:
            if req.method == "DELETE":
                del self.calendars[cal], self.events[cal]
                return httpx.Response(204)
            return httpx.Response(200, json={"id": cal})
        events = self.events[cal]
        if len(parts) == 3 and req.method == "POST":
            eid = f"ev{next(self.ids)}"
            events[eid] = body
            return httpx.Response(200, json={"id": eid})
        eid = parts[3]
        if eid not in events:
            return httpx.Response(410 if req.method == "DELETE" else 404)
        if req.method == "PUT":
            events[eid] = body
            return httpx.Response(200, json={"id": eid})
        if req.method == "DELETE":
            del events[eid]
            return httpx.Response(204)
        raise AssertionError(f"unexpected {req.method} {req.url}")

    def all_events(self) -> list[dict]:
        return [e for evs in self.events.values() for e in evs.values()]


@pytest.fixture
def google(monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setattr(gcal, "new_http", fake.client)
    # Sync right away instead of on a background timer, so tests are deterministic.
    monkeypatch.setattr(gcal, "request_sync", lambda session, delay=0: gcal.sync(session) if gcal.is_connected(session) else None)
    return fake


@pytest.fixture
def client(tmp_path, google):
    app = create_app(db_url=f"sqlite:///{tmp_path / 'gcal.db'}", auto_import=False)
    with TestClient(app) as c:
        yield c


def connect(c: TestClient) -> None:
    c.put("/api/gcal/config", json={"client_id": "cid", "client_secret": "csecret"})
    url = c.get("/api/gcal/connect", params={"tz": "America/New_York"}).json()["url"]
    q = parse_qs(urlparse(url).query)
    assert q["scope"] == [gcal.SCOPE] and q["access_type"] == ["offline"]
    r = c.get("/api/gcal/callback", params={"code": "good", "state": q["state"][0]}, follow_redirects=False)
    assert r.status_code == 303 and "gcal=connected" in r.headers["location"], r.headers["location"]


def test_oauth_flow_and_secrets_stay_private(client, google):
    assert client.get("/api/gcal/status").json()["configured"] is False
    assert client.get("/api/gcal/connect", params={"tz": "UTC"}).status_code == 400  # no client yet

    client.put("/api/gcal/config", json={"client_id": "cid", "client_secret": "csecret"})
    assert client.get("/api/gcal/connect", params={"tz": "Not/AZone"}).status_code == 422
    client.get("/api/gcal/connect", params={"tz": "UTC"})
    bad = client.get("/api/gcal/callback", params={"code": "good", "state": "forged"}, follow_redirects=False)
    assert "gcal=error" in bad.headers["location"]
    assert client.get("/api/gcal/status").json()["connected"] is False

    connect(client)
    st = client.get("/api/gcal/status").json()
    assert st["connected"] and st["calendar_id"] and st["timezone"] == "America/New_York"
    assert list(google.calendars.values())[0]["summary"] == "Study Lab"

    # Nothing gcal-related (least of all the token or client secret) leaks through /api/settings or status.
    settings = json.dumps(client.get("/api/settings").json())
    assert "csecret" not in settings and "r1" not in settings and "gcal" not in settings
    assert "csecret" not in json.dumps(st) and '"r1"' not in json.dumps(st)


def test_sync_mirrors_schedule(client, google):
    t = client.post("/api/timers", json={"name": "DSA", "phases": [{"label": "Attempt", "minutes": 20}]}).json()
    scrum = client.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35",
                                                      "days": [0, 1, 2, 3, 4], "category": "meeting"}).json()
    client.post("/api/schedule/blocks", json={"title": "Bedtime", "start_time": "22:45", "days": list(range(7))})
    client.post("/api/schedule/blocks", json={"title": "DSA", "start_time": "16:30", "end_time": "17:00", "days": [0],
                                              "timer_id": t["id"], "category": "study"})
    connect(client)

    evs = {e["summary"]: e for e in google.all_events()}
    assert set(evs) == {"Scrum", "Bedtime", "DSA"}
    assert evs["Scrum"]["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
    assert evs["Scrum"]["start"]["timeZone"] == "America/New_York" and evs["Scrum"]["start"]["dateTime"].endswith("T08:15:00")
    assert evs["Scrum"]["colorId"] == gcal.COLORS["meeting"]
    assert evs["Bedtime"]["end"]["dateTime"].endswith("T23:00:00")  # point events get 15 min
    assert "Attempt 20m" in evs["DSA"]["description"]
    assert evs["Scrum"]["reminders"]["overrides"] == [{"method": "popup", "minutes": 0}]

    # Nothing changed: nothing is re-sent.
    assert client.post("/api/gcal/sync").json()["result"] == {"connected": True, "created": 0, "updated": 0, "deleted": 0, "unchanged": 3}

    # Skip a day → EXDATE on the series; edit → update in place.
    monday = date.today() - timedelta(days=date.today().weekday()) + timedelta(days=7)
    client.post(f"/api/schedule/blocks/{scrum['id']}/skip", json={"date": str(monday)})
    client.patch(f"/api/schedule/blocks/{scrum['id']}", json={"title": "Daily scrum"})
    evs = {e["summary"]: e for e in google.all_events()}
    assert "Scrum" not in evs and len(google.all_events()) == 3
    assert evs["Daily scrum"]["recurrence"][1] == f"EXDATE;TZID=America/New_York:{monday:%Y%m%d}T081500"

    # A moved occurrence becomes its own event.
    client.post(f"/api/schedule/blocks/{scrum['id']}/move", json={"date": str(monday + timedelta(days=1)), "start_time": "10:00", "end_time": "10:20"})
    moved = [e for e in google.all_events() if "recurrence" not in e]
    assert len(moved) == 1 and moved[0]["start"]["dateTime"] == f"{monday + timedelta(days=1)}T10:00:00"

    # Reminders can be changed or turned off.
    client.put("/api/gcal/config", json={"reminder_minutes": -1})
    assert all(e["reminders"]["overrides"] == [] for e in google.all_events())

    # Deleting a block deletes its event.
    client.delete(f"/api/schedule/blocks/{scrum['id']}")
    assert {e["summary"] for e in google.all_events()} == {"Bedtime", "DSA"}


def test_recovers_from_changes_made_in_google(client, google):
    client.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35", "days": [0]})
    connect(client)
    cal = next(iter(google.calendars))

    google.events[cal].clear()  # user deleted the event by hand
    client.post("/api/schedule/blocks", json={"title": "Lunch", "start_time": "12:30", "end_time": "13:15", "days": [0]})
    client.patch("/api/schedule/blocks/1", json={"title": "Scrum!"})
    assert {e["summary"] for e in google.all_events()} == {"Scrum!", "Lunch"}

    del google.calendars[cal], google.events[cal]  # user deleted the whole calendar
    client.post("/api/gcal/sync")
    assert len(google.calendars) == 1 and {e["summary"] for e in google.all_events()} == {"Scrum!", "Lunch"}


def test_token_refresh_and_revocation(client, google):
    from dsa import db

    client.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35", "days": [0]})
    connect(client)

    def expire():
        with db.session_scope() as s:
            tok = dict(gcal.get(s, "token"))
            tok["expires_at"] = 0
            gcal.put(s, "token", tok)

    expire()
    assert client.post("/api/gcal/sync").status_code == 200 and google.refreshes == 1

    expire()
    google.fail_refresh = True
    r = client.post("/api/gcal/sync")
    assert r.status_code == 502 and "Connect Google Calendar again" in r.json()["detail"]
    st = client.get("/api/gcal/status").json()
    assert st["connected"] is False and "again" in st["last_error"]


def test_disconnect_can_delete_calendar(client, google):
    client.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35", "days": [0]})
    connect(client)
    st = client.post("/api/gcal/disconnect", json={"delete_calendar": True}).json()
    assert st["connected"] is False and st["calendar_id"] is None and st["events"] == 0
    assert google.calendars == {} and google.revoked == ["r1"]
    assert st["configured"] is True  # client credentials kept for reconnecting


def test_disabled_api_gives_actionable_error(client, google, monkeypatch):
    disabled = httpx.Response(403, json={"error": {"code": 403, "message": "Google Calendar API has not been used in project 1 before or it is disabled. Enable it by visiting https://console.developers.google.com/...", "errors": [{"reason": "accessNotConfigured"}]}})
    real = google.handle
    monkeypatch.setattr(google, "handle", lambda req: disabled if req.url.host == "www.googleapis.com" else real(req))
    client.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35", "days": [0]})
    client.put("/api/gcal/config", json={"client_id": "cid", "client_secret": "csecret"})
    connect_url = client.get("/api/gcal/connect", params={"tz": "UTC"}).json()["url"]
    state = parse_qs(urlparse(connect_url).query)["state"][0]
    r = client.get("/api/gcal/callback", params={"code": "good", "state": state}, follow_redirects=False)
    st = client.get("/api/gcal/status").json()
    assert st["connected"] is True  # sign-in kept; only the API call failed
    assert st["last_error"] == gcal.API_DISABLED_HELP and "gcal=error" in r.headers["location"]

    monkeypatch.setattr(google, "handle", real)  # user enables the API
    assert client.post("/api/gcal/sync").status_code == 200
    assert client.get("/api/gcal/status").json()["last_error"] is None
