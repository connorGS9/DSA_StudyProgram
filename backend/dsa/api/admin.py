"""Settings, problem imports, history import, categories and the cheat sheet."""

from __future__ import annotations

import re
import threading
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config, services
from .. import settings as settings_mod
from ..categories import CATEGORIES
from ..db import get_session, session_scope
from ..importers import codeforces, cses, leetcode
from ..importers.base import run_import
from ..models import ImportRun, Problem

router = APIRouter(prefix="/api", tags=["admin"])

FETCHERS = {"codeforces": codeforces.fetch, "cses": cses.fetch, "leetcode": leetcode.fetch}
_running: set[str] = set()
_lock = threading.Lock()


# --- settings ---------------------------------------------------------------------------------

@router.get("/settings")
def get_settings(session: Session = Depends(get_session)):
    return settings_mod.public(settings_mod.get_all(session))


@router.put("/settings")
def put_settings(changes: dict[str, Any], session: Session = Depends(get_session)):
    try:
        return settings_mod.public(settings_mod.update(session, changes))
    except KeyError as e:
        raise HTTPException(400, f"unknown setting {e}")


@router.get("/categories")
def categories():
    return [{"key": c.key, "name": c.name, "unlock_at": c.unlock_at, "weight": c.weight} for c in CATEGORIES]


# --- problem imports --------------------------------------------------------------------------

def start_import(source: str) -> bool:
    with _lock:
        if source in _running:
            return False
        _running.add(source)

    def work():
        try:
            with session_scope() as s:
                run_import(s, source, FETCHERS[source])
        finally:
            with _lock:
                _running.discard(source)

    threading.Thread(target=work, name=f"import-{source}", daemon=True).start()
    return True


@router.post("/import/{source}")
def trigger_import(source: str):
    if source not in FETCHERS:
        raise HTTPException(404, "unknown source")
    return {"started": start_import(source)}


@router.get("/import/status")
def import_status(session: Session = Depends(get_session)):
    counts = dict(session.execute(select(Problem.source, func.count()).group_by(Problem.source)).all())
    out = {}
    for source in FETCHERS:
        last = session.scalar(
            select(ImportRun).where(ImportRun.source == source).order_by(ImportRun.started_at.desc()).limit(1)
        )
        out[source] = {
            "problems": counts.get(source, 0),
            "running": source in _running,
            "last_run": None if last is None else {
                "status": last.status,
                "started_at": last.started_at.isoformat(),
                "finished_at": last.finished_at.isoformat() if last.finished_at else None,
                "added": last.added,
                "updated": last.updated,
                "message": last.message,
            },
        }
    return out


# --- history ----------------------------------------------------------------------------------

class LeetcodeHistoryIn(BaseModel):
    mode: str  # "recent" (public, last ~20) | "full" (needs session cookie)


@router.post("/history/leetcode")
def leetcode_history(body: LeetcodeHistoryIn, session: Session = Depends(get_session)):
    cfg = settings_mod.get_all(session)
    try:
        if body.mode == "full":
            if not cfg["leetcode_session"]:
                raise HTTPException(400, "set your LEETCODE_SESSION cookie in Settings first")
            solved = leetcode.all_solved(cfg["leetcode_session"])
        else:
            if not cfg["leetcode_username"]:
                raise HTTPException(400, "set your LeetCode username in Settings first")
            solved = [(slug, None) for slug in leetcode.recent_accepted(cfg["leetcode_username"])]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"LeetCode request failed: {e}")
    return {"fetched": len(solved), **services.import_history(session, "leetcode", solved)}


class ManualHistoryIn(BaseModel):
    refs: str


@router.post("/history/manual")
def manual_history(body: ManualHistoryIn, session: Session = Depends(get_session)):
    """Mark pasted problems (links / ids, any judge) as solved in the past."""
    refs = services.parse_problem_refs(body.refs)
    result = {"parsed": len(refs), "seeded": 0, "already_known": 0, "not_found": 0}
    for source in {s for s, _ in refs}:
        r = services.import_history(session, source, [(e, None) for s, e in refs if s == source])
        for k in ("seeded", "already_known", "not_found"):
            result[k] += r[k]
    return result


@router.post("/verify/codeforces")
def verify_codeforces(session: Session = Depends(get_session)):
    handle = settings_mod.get(session, "codeforces_handle")
    if not handle:
        raise HTTPException(400, "set your Codeforces handle in Settings first")
    try:
        return {"accepted": sorted(codeforces.accepted_submissions(handle))}
    except Exception as e:
        raise HTTPException(502, f"Codeforces request failed: {e}")


# --- cheat sheet ------------------------------------------------------------------------------

_FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)


def _sheet_meta(path) -> dict:
    text = path.read_text()
    meta = {"key": path.stem, "title": path.stem.replace("_", " ").title(), "order": 999, "category": None}
    if m := _FRONT.match(text):
        for line in m[1].splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        meta["order"] = int(meta["order"])
        text = text[m.end():]
    headings = re.findall(r"^## (.+)$", text, re.M)
    return {**meta, "sections": headings, "body": text}


@router.get("/cheatsheet")
def cheatsheet_index():
    sheets = [_sheet_meta(p) for p in sorted(config.CHEATSHEET_DIR.glob("*.md"))]
    return sorted(({k: v for k, v in s.items() if k != "body"} for s in sheets), key=lambda s: (s["order"], s["title"]))


@router.get("/cheatsheet/{key}")
def cheatsheet_page(key: str):
    path = config.CHEATSHEET_DIR / f"{key}.md"
    if not re.fullmatch(r"[a-z0-9_]+", key) or not path.exists():
        raise HTTPException(404, "no such cheat sheet")
    return _sheet_meta(path)
