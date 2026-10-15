"""Study lab: reading list (books) and projects with task checklists and dated notes."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Book, BookNote, Project, ProjectNote, ProjectTask, utcnow
from ..scheduler.selector import today_str

router = APIRouter(prefix="/api", tags=["lab"])

BookStatus = Literal["queued", "reading", "finished", "dropped"]
ProjectStatus = Literal["idea", "active", "paused", "done"]
BOOK_ORDER = {"reading": 0, "queued": 1, "finished": 2, "dropped": 3}
PROJECT_ORDER = {"active": 0, "paused": 1, "idea": 2, "done": 3}


def _norm_url(v: str | None) -> str | None:
    """Only http(s) links are rendered as anchors; bare domains get https:// prepended."""
    if v is None:
        return None
    v = v.strip()
    if v and not v.lower().startswith(("http://", "https://")):
        v = "https://" + v
    return v


def _get(session: Session, model, id_: int):
    obj = session.get(model, id_)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {id_} not found")
    return obj


def _next_position(session: Session, model, *where) -> int:
    return (session.scalar(select(func.max(model.position)).where(*where)) or 0) + 1


def _reorder(session: Session, model, ids: list[int], *where) -> None:
    rows = {r.id: r for r in session.scalars(select(model).where(model.id.in_(ids), *where))}
    for pos, id_ in enumerate(ids, start=1):
        if id_ in rows:
            rows[id_].position = pos


def _note_out(n: BookNote | ProjectNote) -> dict:
    out = {"id": n.id, "body": n.body, "created_at": n.created_at.isoformat()}
    if isinstance(n, BookNote):
        out["page"] = n.page
    return out


# --- books ------------------------------------------------------------------------------------

def book_out(b: Book) -> dict:
    pct = round(100 * b.current_page / b.total_pages) if b.total_pages else None
    return {
        "id": b.id,
        "title": b.title,
        "author": b.author,
        "status": b.status,
        "total_pages": b.total_pages,
        "current_page": b.current_page,
        "page_updated_at": b.page_updated_at.isoformat() if b.page_updated_at else None,
        "percent": 100 if b.status == "finished" else pct,
        "started_on": b.started_on,
        "finished_on": b.finished_on,
        "rating": b.rating,
        "url": b.url,
        "position": b.position,
        "updated_at": b.updated_at.isoformat(),
        "notes": [_note_out(n) for n in b.notes],
    }


def _set_book_status(session: Session, b: Book, new: str) -> None:
    if new == b.status:
        return
    today = today_str()
    if new == "reading":
        b.started_on = b.started_on or today
        b.finished_on = None
    elif new == "finished":
        b.started_on = b.started_on or today
        b.finished_on = today
        if b.total_pages and b.current_page != b.total_pages:
            b.current_page = b.total_pages
            b.page_updated_at = utcnow()
    elif new == "queued":
        # Re-queuing wipes the dates, so keep a record of the earlier read as a note.
        if b.status in ("finished", "dropped") and b.started_on:
            if b.status == "finished":
                line = f"Finished on {b.finished_on or today} (started {b.started_on})"
                if b.rating:
                    line += f", rated {b.rating}/5"
            else:
                line = f"Dropped at page {b.current_page} (started {b.started_on})"
            b.notes.append(BookNote(body=line + ". Moved back to the queue.", page=b.current_page or None))
        b.started_on = b.finished_on = None
        b.current_page = 0
        b.page_updated_at = None
        b.position = _next_position(session, Book, Book.status == "queued")
    elif new == "dropped":
        b.finished_on = None
    b.status = new


class BookIn(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    author: str = ""
    total_pages: int | None = Field(default=None, ge=1)
    status: BookStatus = "queued"
    url: str = ""

    _url = field_validator("url")(_norm_url)


class BookPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    author: str | None = None
    total_pages: int | None = Field(default=None, ge=1)
    current_page: int | None = Field(default=None, ge=0)
    status: BookStatus | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    url: str | None = None
    started_on: str | None = None
    finished_on: str | None = None

    _url = field_validator("url")(_norm_url)


@router.get("/books")
def list_books(session: Session = Depends(get_session)):
    # Most recently finished / touched first, then a stable sort into status groups; the queue
    # keeps its manual order.
    books = sorted(session.scalars(select(Book)), key=lambda b: b.finished_on or b.updated_at.isoformat(), reverse=True)
    books.sort(key=lambda b: (BOOK_ORDER[b.status], b.position if b.status == "queued" else 0))
    return [book_out(b) for b in books]


@router.post("/books")
def create_book(body: BookIn, session: Session = Depends(get_session)):
    b = Book(title=body.title.strip(), author=body.author.strip(), total_pages=body.total_pages, url=body.url,
             position=_next_position(session, Book, Book.status == "queued"))
    session.add(b)
    session.flush()
    _set_book_status(session, b, body.status)
    session.commit()
    return book_out(b)


@router.patch("/books/{book_id}")
def update_book(book_id: int, body: BookPatch, session: Session = Depends(get_session)):
    b = _get(session, Book, book_id)
    changes = body.model_dump(exclude_unset=True)
    # Status first so explicitly sent dates/pages win over the transition defaults.
    if "status" in changes:
        _set_book_status(session, b, changes.pop("status"))
    page_before = b.current_page
    for k, v in changes.items():
        setattr(b, k, v)
    if b.total_pages and b.current_page > b.total_pages:
        b.current_page = b.total_pages
    if b.current_page != page_before:
        b.page_updated_at = utcnow()
    b.updated_at = utcnow()
    session.commit()
    return book_out(b)


@router.delete("/books/{book_id}")
def delete_book(book_id: int, session: Session = Depends(get_session)):
    session.delete(_get(session, Book, book_id))
    session.commit()
    return {"ok": True}


class ReorderIn(BaseModel):
    ids: list[int]


@router.post("/books/reorder")
def reorder_books(body: ReorderIn, session: Session = Depends(get_session)):
    _reorder(session, Book, body.ids, Book.status == "queued")
    session.commit()
    return list_books(session)


class BookNoteIn(BaseModel):
    body: str = Field(min_length=1)
    page: int | None = Field(default=None, ge=0)


@router.post("/books/{book_id}/notes")
def add_book_note(book_id: int, body: BookNoteIn, session: Session = Depends(get_session)):
    b = _get(session, Book, book_id)
    b.notes.append(BookNote(body=body.body.strip(), page=body.page))
    b.updated_at = utcnow()
    session.commit()
    session.refresh(b)
    return book_out(b)


@router.delete("/book-notes/{note_id}")
def delete_book_note(note_id: int, session: Session = Depends(get_session)):
    session.delete(_get(session, BookNote, note_id))
    session.commit()
    return {"ok": True}


# --- projects ---------------------------------------------------------------------------------

def project_out(p: Project) -> dict:
    done = sum(1 for t in p.tasks if t.done)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "link": p.link,
        "started_on": p.started_on,
        "finished_on": p.finished_on,
        "position": p.position,
        "updated_at": p.updated_at.isoformat(),
        "tasks_done": done,
        "tasks_total": len(p.tasks),
        "percent": round(100 * done / len(p.tasks)) if p.tasks else (100 if p.status == "done" else None),
        "next_task": next((t.title for t in p.tasks if not t.done), None),
        "tasks": [
            {"id": t.id, "title": t.title, "done": t.done, "done_at": t.done_at.isoformat() if t.done_at else None}
            for t in p.tasks
        ],
        "notes": [_note_out(n) for n in p.notes],
    }


def _set_project_status(p: Project, new: str) -> None:
    if new == p.status:
        return
    today = today_str()
    if new in ("active", "paused"):
        p.started_on = p.started_on or today
        p.finished_on = None
    elif new == "done":
        p.started_on = p.started_on or today
        p.finished_on = today
    elif new == "idea":
        p.started_on = p.finished_on = None
    p.status = new


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    description: str = ""
    status: ProjectStatus = "active"
    link: str = ""

    _link = field_validator("link")(_norm_url)


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    status: ProjectStatus | None = None
    link: str | None = None
    started_on: str | None = None
    finished_on: str | None = None

    _link = field_validator("link")(_norm_url)


@router.get("/projects")
def list_projects(session: Session = Depends(get_session)):
    projects = session.scalars(select(Project)).all()
    return [project_out(p) for p in sorted(projects, key=lambda p: (PROJECT_ORDER[p.status], p.position))]


@router.post("/projects")
def create_project(body: ProjectIn, session: Session = Depends(get_session)):
    p = Project(name=body.name.strip(), description=body.description.strip(), link=body.link, status="idea",
                position=_next_position(session, Project))
    session.add(p)
    session.flush()
    _set_project_status(p, body.status)
    session.commit()
    return project_out(p)


@router.patch("/projects/{project_id}")
def update_project(project_id: int, body: ProjectPatch, session: Session = Depends(get_session)):
    p = _get(session, Project, project_id)
    changes = body.model_dump(exclude_unset=True)
    if "status" in changes:
        _set_project_status(p, changes.pop("status"))
    for k, v in changes.items():
        setattr(p, k, v)
    p.updated_at = utcnow()
    session.commit()
    return project_out(p)


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session)):
    session.delete(_get(session, Project, project_id))
    session.commit()
    return {"ok": True}


@router.post("/projects/reorder")
def reorder_projects(body: ReorderIn, session: Session = Depends(get_session)):
    _reorder(session, Project, body.ids)
    session.commit()
    return list_projects(session)


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=512)


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    done: bool | None = None


def _touch(session: Session, project_id: int) -> dict:
    p = _get(session, Project, project_id)
    p.updated_at = utcnow()
    session.commit()
    session.refresh(p)
    return project_out(p)


@router.post("/projects/{project_id}/tasks")
def add_task(project_id: int, body: TaskIn, session: Session = Depends(get_session)):
    _get(session, Project, project_id)
    session.add(ProjectTask(project_id=project_id, title=body.title.strip(),
                            position=_next_position(session, ProjectTask, ProjectTask.project_id == project_id)))
    return _touch(session, project_id)


@router.patch("/project-tasks/{task_id}")
def update_task(task_id: int, body: TaskPatch, session: Session = Depends(get_session)):
    t = _get(session, ProjectTask, task_id)
    if body.title is not None:
        t.title = body.title.strip()
    if body.done is not None and body.done != t.done:
        t.done = body.done
        t.done_at = utcnow() if body.done else None
    return _touch(session, t.project_id)


@router.delete("/project-tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    t = _get(session, ProjectTask, task_id)
    project_id = t.project_id
    session.delete(t)
    return _touch(session, project_id)


@router.post("/projects/{project_id}/tasks/reorder")
def reorder_tasks(project_id: int, body: ReorderIn, session: Session = Depends(get_session)):
    _reorder(session, ProjectTask, body.ids, ProjectTask.project_id == project_id)
    return _touch(session, project_id)


class NoteIn(BaseModel):
    body: str = Field(min_length=1)


@router.post("/projects/{project_id}/notes")
def add_project_note(project_id: int, body: NoteIn, session: Session = Depends(get_session)):
    _get(session, Project, project_id)
    session.add(ProjectNote(project_id=project_id, body=body.body.strip()))
    return _touch(session, project_id)


@router.delete("/project-notes/{note_id}")
def delete_project_note(note_id: int, session: Session = Depends(get_session)):
    n = _get(session, ProjectNote, note_id)
    project_id = n.project_id
    session.delete(n)
    return _touch(session, project_id)
