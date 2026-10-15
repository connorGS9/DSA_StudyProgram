from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from dsa.main import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(db_url=f"sqlite:///{tmp_path / 'sched.db'}", auto_import=False)
    with TestClient(app) as c:
        yield c


def monday() -> date:
    d = date.today()
    return d - timedelta(days=d.weekday())


def test_recurring_blocks_expand_by_weekday(client):
    timer = client.post("/api/timers", json={"name": "DSA", "phases": [
        {"label": "Understand", "minutes": 5}, {"label": "Attempt", "minutes": 20}, {"label": "Record", "minutes": 5}]}).json()
    assert timer["total_minutes"] == 30

    client.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35",
                                              "days": [4, 0, 1, 2, 3, 3], "category": "meeting"})
    dsa = client.post("/api/schedule/blocks", json={"title": "DSA", "start_time": "16:30", "end_time": "17:00",
                                                    "days": [0, 1, 2, 3, 4], "timer_id": timer["id"], "link": "/dsa"}).json()
    assert dsa["timer"]["name"] == "DSA"
    client.post("/api/schedule/blocks", json={"title": "Bedtime", "start_time": "22:45", "days": list(range(7))})

    week = client.get(f"/api/schedule?start={monday()}&days=7").json()
    assert [d["weekday"] for d in week] == list(range(7))
    assert [x["title"] for x in week[0]["items"]] == ["Scrum", "DSA", "Bedtime"]
    assert [x["title"] for x in week[6]["items"]] == ["Bedtime"]


def test_validation(client):
    bad = [
        {"title": "x", "start_time": "9:00", "days": [0]},
        {"title": "x", "start_time": "09:00", "end_time": "08:00", "days": [0]},
        {"title": "x", "start_time": "09:00", "days": []},
        {"title": "x", "start_time": "09:00", "days": [7]},
    ]
    for body in bad:
        assert client.post("/api/schedule/blocks", json=body).status_code == 422, body
    b = client.post("/api/schedule/blocks", json={"title": "x", "start_time": "09:00", "end_time": "10:00", "days": [0]}).json()
    assert client.patch(f"/api/schedule/blocks/{b['id']}", json={"start_time": "10:30"}).status_code == 422
    assert client.patch(f"/api/schedule/blocks/{b['id']}", json={"days": []}).status_code == 422


def test_skip_move_and_one_off(client):
    mon = monday()
    tue = mon + timedelta(days=1)
    b = client.post("/api/schedule/blocks", json={"title": "Learning", "start_time": "19:15", "end_time": "20:15",
                                                  "days": [0, 1], "category": "study"}).json()

    client.post(f"/api/schedule/blocks/{b['id']}/skip", json={"date": str(mon)})
    week = client.get(f"/api/schedule?start={mon}&days=2").json()
    assert week[0]["items"][0]["skipped"] is True and week[1]["items"][0]["skipped"] is False
    client.delete(f"/api/schedule/blocks/{b['id']}/skip/{mon}")
    assert client.get(f"/api/schedule?start={mon}").json()[0]["items"][0]["skipped"] is False

    moved = client.post(f"/api/schedule/blocks/{b['id']}/move",
                        json={"date": str(tue), "start_time": "10:00", "end_time": "11:00"}).json()
    assert moved["date"] == str(tue) and moved["moved_from_id"] == b["id"]
    items = client.get(f"/api/schedule?start={tue}").json()[0]["items"]
    assert [(x["start_time"], x["skipped"]) for x in items] == [("10:00", False), ("19:15", True)]

    # Deleting the moved copy restores the original.
    client.delete(f"/api/schedule/blocks/{moved['id']}")
    items = client.get(f"/api/schedule?start={tue}").json()[0]["items"]
    assert [(x["start_time"], x["skipped"]) for x in items] == [("19:15", False)]

    one = client.post("/api/schedule/blocks", json={"title": "Dentist", "start_time": "15:00", "end_time": "16:00",
                                                    "date": str(tue), "days": [3]}).json()
    assert one["days"] == []
    assert [x["title"] for x in client.get(f"/api/schedule?start={tue}").json()[0]["items"]] == ["Dentist", "Learning"]
    assert client.post(f"/api/schedule/blocks/{one['id']}/skip", json={"date": str(tue)}).status_code == 400


def test_deleting_timer_unlinks_blocks(client):
    t = client.post("/api/timers", json={"name": "Work", "phases": [{"label": "Focus", "minutes": 50}, {"label": "Break", "minutes": 10}], "loop": True}).json()
    b = client.post("/api/schedule/blocks", json={"title": "Job", "start_time": "13:15", "end_time": "16:30", "days": [0], "timer_id": t["id"]}).json()
    client.delete(f"/api/timers/{t['id']}")
    assert client.get("/api/schedule/blocks").json()[0]["timer"] is None
    assert client.patch(f"/api/schedule/blocks/{b['id']}", json={"timer_id": 999}).status_code == 404


def test_focus_setting(client):
    r = client.put("/api/settings", json={"lab_focus": {"items": ["Job competence"], "until": "2026-11-11"}}).json()
    assert r["lab_focus"]["items"] == ["Job competence"]


def test_move_to_another_day_and_delete_series(client):
    mon = monday()
    wed = mon + timedelta(days=2)
    b = client.post("/api/schedule/blocks", json={"title": "C project", "start_time": "19:15", "end_time": "20:15", "days": [1]}).json()
    tue = mon + timedelta(days=1)
    moved = client.post(f"/api/schedule/blocks/{b['id']}/move",
                        json={"date": str(tue), "to_date": str(wed), "start_time": "19:15", "end_time": "20:15"}).json()
    week = client.get(f"/api/schedule?start={mon}&days=3").json()
    assert week[1]["items"][0]["skipped"] is True and week[2]["items"][0]["moved_from_id"] == b["id"]

    # Undo restores Tuesday, not Wednesday.
    client.delete(f"/api/schedule/blocks/{moved['id']}")
    week = client.get(f"/api/schedule?start={mon}&days=3").json()
    assert week[1]["items"][0]["skipped"] is False and week[2]["items"] == []

    # Restoring the original also removes a copy that was moved to another day.
    client.post(f"/api/schedule/blocks/{b['id']}/move", json={"date": str(tue), "to_date": str(wed), "start_time": "18:00"})
    client.delete(f"/api/schedule/blocks/{b['id']}/skip/{tue}")
    assert client.get(f"/api/schedule?start={wed}").json()[0]["items"] == []

    # Deleting the series deletes its moved occurrences too.
    client.post(f"/api/schedule/blocks/{b['id']}/move", json={"date": str(tue), "to_date": str(wed), "start_time": "18:00"})
    client.delete(f"/api/schedule/blocks/{b['id']}")
    assert client.get("/api/schedule/blocks").json() == []
