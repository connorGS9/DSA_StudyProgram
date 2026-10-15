from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from . import config
from .api import admin, backup, gcal, lab, problems, schedule, stats, today
from .db import init_db, session_scope
from .models import Problem


def _auto_import() -> None:
    """On a fresh database, pull every problem list in the background."""
    with session_scope() as s:
        have = dict(s.execute(select(Problem.source, func.count()).group_by(Problem.source)).all())
    for source in admin.FETCHERS:
        if not have.get(source):
            admin.start_import(source)


def create_app(db_url: str | None = None, auto_import: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        init_db(db_url)
        if auto_import:
            _auto_import()
        yield

    app = FastAPI(title="Study Lab", lifespan=lifespan)
    for r in (today.router, problems.router, stats.router, admin.router, lab.router, schedule.router, gcal.router, backup.router):
        app.include_router(r)

    dist = config.FRONTEND_DIST
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            f = (dist / path).resolve()
            if path and f.is_file() and f.is_relative_to(dist):
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
