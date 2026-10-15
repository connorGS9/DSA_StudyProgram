import json

from fastapi.testclient import TestClient

from dsa.importers.base import upsert_problems
from dsa.main import create_app

from .conftest import make_problems


def test_today_hides_categories_until_completed(tmp_path):
    app = create_app(db_url=f"sqlite:///{tmp_path / 'api.db'}", auto_import=False)
    with TestClient(app) as c:
        from dsa import db

        with db.session_scope() as s:
            for source, items in make_problems(4).items():
                upsert_problems(s, source, items)

        today = c.get("/api/today").json()
        assert today["total"] == 4
        slot = today["slots"][0]
        assert "categories" not in slot["problem"]

        bad = c.post("/api/attempts", data={"data": json.dumps({
            "problem_id": slot["problem"]["id"], "slot_id": slot["id"], "outcome": "solved", "key_insight": "x",
        })})
        assert bad.status_code == 400  # no code

        ok = c.post(
            "/api/attempts",
            data={"data": json.dumps({
                "problem_id": slot["problem"]["id"], "slot_id": slot["id"], "outcome": "solved",
                "key_insight": "use a heap", "code": [{"language": "java", "content": "class A {}"}],
            })},
            files=[("files", ("extra.py", b"print(1)", "text/x-python"))],
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["reveal"]["categories"]

        detail = c.get(f"/api/problems/{slot['problem']['id']}").json()
        assert len(detail["solutions"]) == 2
        assert {s["language"] for s in detail["solutions"]} == {"java", "python"}
        assert "categories" in detail["problem"]

        today = c.post("/api/today/count", json={"count": 6}).json()
        assert today["total"] == 6 and today["completed"] == 1
        done = next(s for s in today["slots"] if s["status"] == "completed")
        assert "categories" in done["problem"]

        sheets = c.get("/api/cheatsheet").json()
        assert sheets and c.get(f"/api/cheatsheet/{sheets[0]['key']}").status_code == 200
        assert c.get("/api/cheatsheet/..%2Fsecrets").status_code == 404
