import io
import json
import shutil
import sqlite3
import zipfile

import pytest
from fastapi.testclient import TestClient

from dsa import config
from dsa.main import create_app


@pytest.fixture
def client(tmp_path):
    for d in (config.SOLUTIONS_DIR, config.VIDEOS_DIR, config.DATA_DIR / "backups"):
        shutil.rmtree(d, ignore_errors=True)
    config.ensure_dirs()
    app = create_app(db_url=f"sqlite:///{tmp_path / 'live.db'}", auto_import=False)
    with TestClient(app) as c:
        yield c


def seed(c: TestClient):
    from dsa import db
    from dsa.models import Setting

    c.post("/api/books", json={"title": "CSAPP", "status": "reading", "total_pages": 1000})
    c.post("/api/schedule/blocks", json={"title": "Scrum", "start_time": "08:15", "end_time": "08:35", "days": [0]})
    c.put("/api/settings", json={"leetcode_session": "LC-SECRET"})
    with db.session_scope() as s:
        s.add(Setting(key="gcal.token", value={"refresh_token": "G-SECRET"}))
        s.add(Setting(key="gcal.client_id", value="cid"))
    (config.SOLUTIONS_DIR / "p1").mkdir(parents=True)
    (config.SOLUTIONS_DIR / "p1" / "Main.java").write_text("class Main {}")
    (config.VIDEOS_DIR / "v1.webm").write_bytes(b"\x1a\x45\xdf\xa3video")


def download(c: TestClient, **params) -> zipfile.ZipFile:
    r = c.get("/api/backup", params=params)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers["content-disposition"] and "study-lab-backup-" in r.headers["content-disposition"]
    return zipfile.ZipFile(io.BytesIO(r.content))


def db_settings(z: zipfile.ZipFile, tmp_path) -> dict:
    p = tmp_path / "check.db"
    p.write_bytes(z.read("dsa.db"))
    con = sqlite3.connect(p)
    try:
        return {k: v for k, v in con.execute("SELECT key, value FROM settings")}
    finally:
        con.close()


def test_backup_contents_and_secret_stripping(client, tmp_path):
    seed(client)
    z = download(client)
    names = set(z.namelist())
    assert {"manifest.json", "dsa.db", "solutions/p1/Main.java", "videos/v1.webm"} <= names
    m = json.loads(z.read("manifest.json"))
    assert m["app"] == "study-lab" and m["includes"] == {"videos": True, "secrets": False}
    assert m["counts"]["books"] == 1 and m["counts"]["schedule_blocks"] == 1
    st = db_settings(z, tmp_path)
    assert "gcal.token" not in st and "leetcode_session" not in st and "gcal.client_id" in st
    assert b"G-SECRET" not in z.read("dsa.db") and b"LC-SECRET" not in z.read("dsa.db")

    z2 = download(client, videos=False, secrets=True)
    assert "videos/v1.webm" not in z2.namelist()
    assert "gcal.token" in db_settings(z2, tmp_path)

    info = client.get("/api/backup/info").json()
    assert info["last_backup"]["videos"] is False and info["solutions"]["files"] == 1 and info["videos"]["files"] == 1


def test_restore_round_trip_with_safety_copy(client):
    seed(client)
    data = client.get("/api/backup").content

    # Change everything after the backup.
    client.delete("/api/books/1")
    client.post("/api/books", json={"title": "Made after backup"})
    (config.SOLUTIONS_DIR / "p1" / "Main.java").write_text("changed")
    (config.VIDEOS_DIR / "v2.webm").write_bytes(b"new")

    r = client.post("/api/restore", files={"file": ("backup.zip", data, "application/zip")})
    assert r.status_code == 200, r.text
    assert [b["title"] for b in client.get("/api/books").json()] == ["CSAPP"]
    assert [b["title"] for b in client.get("/api/schedule/blocks").json()] == ["Scrum"]
    assert (config.SOLUTIONS_DIR / "p1" / "Main.java").read_text() == "class Main {}"
    assert sorted(p.name for p in config.VIDEOS_DIR.iterdir()) == ["v1.webm"]
    assert client.get("/api/settings").json()["leetcode_session"] is False  # sign-ins weren't in the backup

    # The pre-restore state was saved, sign-ins included, and can itself be restored.
    copies = client.get("/api/backup/info").json()["safety_copies"]
    assert len(copies) == 1
    safety = (config.DATA_DIR / "backups" / copies[0]).read_bytes()
    r = client.post("/api/restore", files={"file": ("s.zip", safety, "application/zip")})
    assert r.status_code == 200
    assert [b["title"] for b in client.get("/api/books").json()] == ["Made after backup"]
    assert client.get("/api/settings").json()["leetcode_session"] is True


def test_restore_keeps_videos_when_backup_has_none(client):
    seed(client)
    data = client.get("/api/backup", params={"videos": False}).content
    client.post("/api/restore", files={"file": ("b.zip", data, "application/zip")})
    assert (config.VIDEOS_DIR / "v1.webm").exists()


def make_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for k, v in entries.items():
            z.writestr(k, v)
    return buf.getvalue()


def test_restore_rejects_bad_files(client):
    seed(client)
    good = zipfile.ZipFile(io.BytesIO(client.get("/api/backup").content))
    manifest, dbbytes = good.read("manifest.json"), good.read("dsa.db")
    cases = {
        "not a zip": b"hello",
        "no manifest": make_zip({"dsa.db": dbbytes}),
        "other app": make_zip({"manifest.json": b'{"app": "other"}', "dsa.db": dbbytes}),
        "newer format": make_zip({"manifest.json": json.dumps({"app": "study-lab", "format": 99}).encode(), "dsa.db": dbbytes}),
        "path traversal": make_zip({"manifest.json": manifest, "dsa.db": dbbytes, "solutions/../../evil.sh": b"x"}),
        "stray file": make_zip({"manifest.json": manifest, "dsa.db": dbbytes, "notes.txt": b"x"}),
        "corrupt db": make_zip({"manifest.json": manifest, "dsa.db": b"not sqlite at all" * 100}),
    }
    for label, data in cases.items():
        r = client.post("/api/restore", files={"file": ("x.zip", data, "application/zip")})
        assert r.status_code == 400, (label, r.text)
    # Nothing was touched.
    assert [b["title"] for b in client.get("/api/books").json()] == ["CSAPP"]
    assert client.get("/api/backup/info").json()["safety_copies"] == []
