"""Codeforces problemset via the official API."""

from __future__ import annotations

from ..categories import CODEFORCES_TAGS, map_tags
from .base import ProblemData, http_client

API = "https://codeforces.com/api"


def _resolve_data_structures(tags: list[str], rating: int, cats: list[str]) -> list[str]:
    # "data structures" spans everything from std::set to persistent segment trees; split by rating.
    if "data structures" in tags:
        cats.append("range_queries" if rating >= 1800 else "heap")
    return cats


def parse(payload: dict) -> list[ProblemData]:
    result = payload["result"]
    solved = {(s["contestId"], s["index"]): s.get("solvedCount") for s in result["problemStatistics"]}
    out: list[ProblemData] = []
    for p in result["problems"]:
        rating = p.get("rating")
        if rating is None or p.get("type") != "PROGRAMMING" or "contestId" not in p:
            continue
        cid, idx, tags = p["contestId"], p["index"], p.get("tags", [])
        cats, excluded = map_tags(tags, CODEFORCES_TAGS)
        cats = _resolve_data_structures(tags, rating, cats)
        out.append(
            ProblemData(
                external_id=f"{cid}{idx}",
                title=p["name"],
                url=f"https://codeforces.com/problemset/problem/{cid}/{idx}",
                rating=rating,
                raw_difficulty=str(rating),
                tags=tags,
                categories=cats,
                excluded=excluded,
                solved_count=solved.get((cid, idx)),
            )
        )
    return out


def fetch() -> list[ProblemData]:
    with http_client() as c:
        r = c.get(f"{API}/problemset.problems")
        r.raise_for_status()
        payload = r.json()
    if payload.get("status") != "OK":
        raise RuntimeError(payload.get("comment", "Codeforces API error"))
    return parse(payload)


def accepted_submissions(handle: str, count: int = 1000) -> set[str]:
    """External ids ("1520F") of problems the handle has an accepted submission for."""
    with http_client() as c:
        r = c.get(f"{API}/user.status", params={"handle": handle, "from": 1, "count": count})
        r.raise_for_status()
        payload = r.json()
    if payload.get("status") != "OK":
        raise RuntimeError(payload.get("comment", "Codeforces API error"))
    return {
        f"{s['problem']['contestId']}{s['problem']['index']}"
        for s in payload["result"]
        if s.get("verdict") == "OK" and "contestId" in s["problem"]
    }
