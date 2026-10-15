"""Filesystem locations. Everything user-editable lives in the `settings` table instead."""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("DSA_DATA_DIR", PROJECT_ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "dsa.db"
SOLUTIONS_DIR = DATA_DIR / "solutions"
VIDEOS_DIR = DATA_DIR / "videos"
CACHE_DIR = DATA_DIR / "cache"
CHEATSHEET_DIR = PROJECT_ROOT / "content" / "cheatsheet"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def ensure_dirs() -> None:
    for d in (DATA_DIR, SOLUTIONS_DIR, VIDEOS_DIR, CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
