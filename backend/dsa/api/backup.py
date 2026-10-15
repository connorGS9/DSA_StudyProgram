"""Download a backup zip of this device's data, or restore one."""

from __future__ import annotations

import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from .. import backup, config
from ..db import session_scope
from ..models import Setting
from . import admin

router = APIRouter(prefix="/api", tags=["backup"])
LAST_KEY = "backup.last"  # private settings row, not exposed by /api/settings


@router.get("/backup/info")
def info():
    with session_scope() as s:
        row = s.get(Setting, LAST_KEY)
        last = row.value if row else None
    safety_dir = config.DATA_DIR / backup.SAFETY_DIR_NAME
    return {
        **backup.summary(),
        "last_backup": last,
        "safety_copies": sorted((p.name for p in safety_dir.glob("pre-restore-*.zip")), reverse=True) if safety_dir.exists() else [],
        "safety_dir": str(safety_dir),
    }


@router.get("/backup")
def download(videos: bool = True, secrets: bool = False):
    fd, tmp = tempfile.mkstemp(suffix=".zip", dir=config.DATA_DIR)
    os.close(fd)
    try:
        manifest = backup.create(Path(tmp), include_videos=videos, include_secrets=secrets)
    except Exception:
        os.unlink(tmp)
        raise
    with session_scope() as s:
        row = s.get(Setting, LAST_KEY)
        value = {"at": manifest["created_at"], **manifest["includes"]}
        if row:
            row.value = value
        else:
            s.add(Setting(key=LAST_KEY, value=value))
    name = f"study-lab-backup-{datetime.now():%Y-%m-%d-%H%M}{'' if videos else '-no-videos'}.zip"
    return FileResponse(tmp, media_type="application/zip", filename=name, background=BackgroundTask(os.unlink, tmp))


@router.post("/restore")
def restore(file: UploadFile):
    if admin._running:
        raise HTTPException(409, "A problem import is running; try again in a minute.")
    fd, tmp = tempfile.mkstemp(suffix=".zip", dir=config.DATA_DIR)
    try:
        with os.fdopen(fd, "wb") as out:
            shutil.copyfileobj(file.file, out)
        return backup.restore(Path(tmp))
    except backup.BackupError as e:
        raise HTTPException(400, str(e))
    finally:
        Path(tmp).unlink(missing_ok=True)
