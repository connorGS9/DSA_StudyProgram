"""Backup to / restore from a single zip: the database, solution files and (optionally) videos.

Zip layout:
    manifest.json      {"app": "study-lab", "format": 1, "created_at": ..., "includes": {...}, "counts": {...}}
    dsa.db             consistent SQLite snapshot (sqlite3 backup API, safe while the app runs)
    solutions/...      solution files, paths as stored in the DB
    videos/...         recorded explanations (optional; they're big)
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import threading
import zipfile
from datetime import datetime
from pathlib import Path

from . import config, db

APP = "study-lab"
FORMAT = 1
# Credentials dropped from backups unless explicitly included (the zip may be emailed or uploaded).
SECRET_SETTING_KEYS = ("gcal.token", "gcal.client_secret", "gcal.state", "leetcode_session")
SAFETY_DIR_NAME = "backups"
KEEP_SAFETY = 5
MAX_UNCOMPRESSED = 20 * 1024**3  # refuse absurd archives (zip bombs)

_lock = threading.Lock()


class BackupError(Exception):
    pass


def _files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file()) if root.exists() else []


def summary() -> dict:
    sol, vid = _files(config.SOLUTIONS_DIR), _files(config.VIDEOS_DIR)
    return {
        "db_bytes": db.db_path().stat().st_size if db.db_path().exists() else 0,
        "solutions": {"files": len(sol), "bytes": sum(p.stat().st_size for p in sol)},
        "videos": {"files": len(vid), "bytes": sum(p.stat().st_size for p in vid)},
    }


def _snapshot_db(dest: Path, include_secrets: bool) -> dict:
    src = sqlite3.connect(db.db_path())
    dst = sqlite3.connect(dest)
    try:
        src.backup(dst)
        if not include_secrets:
            dst.execute(f"DELETE FROM settings WHERE key IN ({','.join('?' * len(SECRET_SETTING_KEYS))})", SECRET_SETTING_KEYS)
        counts = {}
        for table in ("books", "projects", "schedule_blocks", "attempts", "problems"):
            try:
                counts[table] = dst.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.OperationalError:
                counts[table] = 0
        dst.commit()
        dst.execute("VACUUM")  # really drop the deleted secrets from the file
        return counts
    finally:
        src.close()
        dst.close()


def create(dest: Path, include_videos: bool = True, include_secrets: bool = False) -> dict:
    """Write a backup zip to `dest`. Returns the manifest."""
    with tempfile.TemporaryDirectory(dir=config.DATA_DIR) as tmp:
        snap = Path(tmp) / "dsa.db"
        counts = _snapshot_db(snap, include_secrets)
        manifest = {
            "app": APP,
            "format": FORMAT,
            "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "includes": {"videos": include_videos, "secrets": include_secrets},
            "counts": counts,
        }
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("manifest.json", json.dumps(manifest, indent=2))
            z.write(snap, "dsa.db")
            for p in _files(config.SOLUTIONS_DIR):
                z.write(p, f"solutions/{p.relative_to(config.SOLUTIONS_DIR).as_posix()}")
            if include_videos:
                for p in _files(config.VIDEOS_DIR):  # already compressed; store as-is
                    z.write(p, f"videos/{p.relative_to(config.VIDEOS_DIR).as_posix()}", compress_type=zipfile.ZIP_STORED)
    return manifest


def _safe_member(name: str) -> bool:
    p = Path(name)
    if p.is_absolute() or ".." in p.parts or "\\" in name:
        return False
    return name in ("manifest.json", "dsa.db") or p.parts[0] in ("solutions", "videos")


def _validate(z: zipfile.ZipFile) -> dict:
    names = z.namelist()
    if "manifest.json" not in names or "dsa.db" not in names:
        raise BackupError("This isn't a Study Lab backup (manifest.json or dsa.db missing).")
    bad = [n for n in names if not _safe_member(n)]
    if bad:
        raise BackupError(f"Backup contains unexpected paths, refusing to restore: {bad[:3]}")
    if sum(i.file_size for i in z.infolist()) > MAX_UNCOMPRESSED:
        raise BackupError("Backup is too large to restore.")
    try:
        manifest = json.loads(z.read("manifest.json"))
    except ValueError:
        raise BackupError("Backup manifest is unreadable.")
    if manifest.get("app") != APP:
        raise BackupError("This zip wasn't made by Study Lab.")
    if int(manifest.get("format", 0)) > FORMAT:
        raise BackupError("This backup is from a newer version of Study Lab. Update the code (git pull) first.")
    return manifest


def _check_db(path: Path) -> None:
    try:
        con = sqlite3.connect(path)
        try:
            if con.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise BackupError("The database in this backup is damaged.")
            tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            con.close()
    except sqlite3.DatabaseError:
        raise BackupError("The database in this backup is damaged or not a SQLite file.")
    if not {"problems", "settings"} <= tables:
        raise BackupError("The database in this backup is missing Study Lab tables.")


def _prune_safety(folder: Path) -> None:
    old = sorted(folder.glob("pre-restore-*.zip"))[:-KEEP_SAFETY]
    for p in old:
        p.unlink(missing_ok=True)


def restore(upload: Path) -> dict:
    """Replace this device's data with the backup at `upload`, after saving a safety copy."""
    if not _lock.acquire(blocking=False):
        raise BackupError("A restore is already running.")
    try:
        try:
            z = zipfile.ZipFile(upload)
        except zipfile.BadZipFile:
            raise BackupError("That file isn't a valid zip.")
        with z, tempfile.TemporaryDirectory(dir=config.DATA_DIR) as tmp:
            manifest = _validate(z)
            staged = Path(tmp)
            z.extractall(staged)
            _check_db(staged / "dsa.db")

            # Safety copy of everything currently here, including sign-ins, so a restore can be undone.
            safety_dir = config.DATA_DIR / SAFETY_DIR_NAME
            safety_dir.mkdir(exist_ok=True)
            safety = safety_dir / f"pre-restore-{datetime.now():%Y%m%d-%H%M%S}.zip"
            create(safety, include_videos=True, include_secrets=True)
            _prune_safety(safety_dir)

            path = db.db_path()
            url = db.close()
            for suffix in ("-wal", "-shm"):
                Path(f"{path}{suffix}").unlink(missing_ok=True)
            os.replace(staged / "dsa.db", path)

            _replace_dir(staged / "solutions", config.SOLUTIONS_DIR)
            if manifest.get("includes", {}).get("videos", True):
                _replace_dir(staged / "videos", config.VIDEOS_DIR)
            db.init_db(url)  # also upgrades older backups (new tables / columns)
        return {"restored": manifest, "safety_copy": str(safety)}
    finally:
        _lock.release()


def _replace_dir(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    if src.exists():
        shutil.move(str(src), dest)
    else:
        dest.mkdir(parents=True, exist_ok=True)
