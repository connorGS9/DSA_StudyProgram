import pytest
from fastapi.testclient import TestClient

from dsa.main import create_app
from dsa.scheduler.selector import today_str


@pytest.fixture
def client(tmp_path):
    app = create_app(db_url=f"sqlite:///{tmp_path / 'lab.db'}", auto_import=False)
    with TestClient(app) as c:
        yield c


def test_book_lifecycle(client):
    a = client.post("/api/books", json={"title": "CLRS", "author": "Cormen", "total_pages": 1200}).json()
    b = client.post("/api/books", json={"title": "SICP", "url": "mitpress.mit.edu/sicp"}).json()
    assert a["status"] == "queued" and a["percent"] == 0
    assert b["url"] == "https://mitpress.mit.edu/sicp"

    # Queue order is manual.
    books = client.post("/api/books/reorder", json={"ids": [b["id"], a["id"]]}).json()
    assert [x["title"] for x in books] == ["SICP", "CLRS"]

    r = client.patch(f"/api/books/{a['id']}", json={"status": "reading", "current_page": 300}).json()
    assert r["started_on"] == today_str() and r["percent"] == 25
    assert client.get("/api/books").json()[0]["title"] == "CLRS"  # reading sorts before queued

    # Pages are clamped to the book length.
    assert client.patch(f"/api/books/{a['id']}", json={"current_page": 5000}).json()["current_page"] == 1200

    r = client.post(f"/api/books/{a['id']}/notes", json={"body": "Master theorem", "page": 94}).json()
    assert r["notes"][0]["page"] == 94
    client.delete(f"/api/book-notes/{r['notes'][0]['id']}")

    r = client.patch(f"/api/books/{a['id']}", json={"status": "finished", "rating": 5}).json()
    assert r["finished_on"] == today_str() and r["percent"] == 100 and r["rating"] == 5
    assert client.patch(f"/api/books/{a['id']}", json={"rating": 6}).status_code == 422

    r = client.patch(f"/api/books/{a['id']}", json={"status": "queued"}).json()
    assert r["started_on"] is None and r["current_page"] == 0

    assert client.delete(f"/api/books/{a['id']}").json() == {"ok": True}
    assert client.patch(f"/api/books/{a['id']}", json={"author": "x"}).status_code == 404


def test_project_tasks_drive_progress(client):
    p = client.post("/api/projects", json={"name": "Study Lab", "link": "github.com/me/lab"}).json()
    assert p["status"] == "active" and p["started_on"] == today_str() and p["percent"] is None
    pid = p["id"]

    for t in ("schema", "api", "ui"):
        p = client.post(f"/api/projects/{pid}/tasks", json={"title": t}).json()
    assert p["tasks_total"] == 3 and p["next_task"] == "schema"

    first = p["tasks"][0]["id"]
    p = client.patch(f"/api/project-tasks/{first}", json={"done": True}).json()
    assert p["tasks_done"] == 1 and p["percent"] == 33 and p["next_task"] == "api"
    assert p["tasks"][0]["done_at"]

    ids = [t["id"] for t in p["tasks"]]
    p = client.post(f"/api/projects/{pid}/tasks/reorder", json={"ids": ids[::-1]}).json()
    assert [t["title"] for t in p["tasks"]] == ["ui", "api", "schema"]
    assert p["next_task"] == "ui"

    p = client.post(f"/api/projects/{pid}/notes", json={"body": "decided on SQLite"}).json()
    assert p["notes"][0]["body"] == "decided on SQLite"

    p = client.delete(f"/api/project-tasks/{ids[1]}").json()
    assert p["tasks_total"] == 2

    p = client.patch(f"/api/projects/{pid}", json={"status": "done"}).json()
    assert p["finished_on"] == today_str()

    idea = client.post("/api/projects", json={"name": "Later", "status": "idea"}).json()
    assert idea["started_on"] is None
    assert [x["name"] for x in client.get("/api/projects").json()] == ["Later", "Study Lab"]  # idea before done
