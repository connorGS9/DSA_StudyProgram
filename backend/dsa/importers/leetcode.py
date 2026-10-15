"""LeetCode problem list via the GraphQL endpoint the website itself uses.

Difficulty comes from zerotrac's community contest ratings when available (converted to the
Codeforces scale), otherwise from Easy/Medium/Hard nudged by acceptance rate.
"""

from __future__ import annotations

import time

from ..categories import LEETCODE_TAGS, map_tags
from .base import ProblemData, http_client

GRAPHQL = "https://leetcode.com/graphql"
ZEROTRAC = "https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/data.json"
PAGE = 100  # the endpoint caps page size at 100

LIST_QUERY = """
query q($skip: Int, $limit: Int) {
  questionList(categorySlug: "algorithms", limit: $limit, skip: $skip, filters: {}) {
    totalNum
    data { questionFrontendId title titleSlug difficulty isPaidOnly acRate topicTags { slug } }
  }
}"""

RECENT_AC_QUERY = """
query q($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) { titleSlug timestamp }
}"""

# Needs the user's own LEETCODE_SESSION cookie (entered by the user in Settings).
SOLVED_QUERY = """
query q($skip: Int!, $limit: Int!) {
  userProgressQuestionList(filters: {skip: $skip, limit: $limit, questionStatus: SOLVED}) {
    totalNum
    questions { titleSlug lastSubmittedAt }
  }
}"""

BASE_RATING = {"Easy": 950, "Medium": 1450, "Hard": 1950}


def zerotrac_to_cf(r: float) -> int:
    # LeetCode contest ratings run high relative to Codeforces at the low end.
    return int(round(max(800, 800 + (r - 1100) * 1.1) / 50) * 50)


def fallback_rating(difficulty: str, ac_rate: float) -> int:
    base = BASE_RATING.get(difficulty, 1450)
    # 50% acceptance is neutral; a very high or low acceptance rate shifts up to +/-250.
    shift = max(-250, min(250, (50 - ac_rate) * 8))
    return int(round((base + shift) / 50) * 50)


def parse(questions: list[dict], zerotrac: dict[str, float]) -> list[ProblemData]:
    out: list[ProblemData] = []
    for q in questions:
        slug = q["titleSlug"]
        tags = [t["slug"] for t in q.get("topicTags") or []]
        cats, excluded = map_tags(tags, LEETCODE_TAGS)
        zr = zerotrac.get(slug)
        rating = zerotrac_to_cf(zr) if zr else fallback_rating(q["difficulty"], q.get("acRate") or 50)
        out.append(
            ProblemData(
                external_id=slug,
                title=f"{q['questionFrontendId']}. {q['title']}",
                url=f"https://leetcode.com/problems/{slug}/",
                rating=rating,
                raw_difficulty=q["difficulty"] + (f" ({zr:.0f})" if zr else ""),
                tags=tags,
                categories=cats,
                excluded=excluded,
                paid_only=bool(q.get("isPaidOnly")),
            )
        )
    return out


def _graphql(client, query: str, variables: dict, session_cookie: str | None = None) -> dict:
    headers = {"Referer": "https://leetcode.com/problemset/", "Content-Type": "application/json"}
    cookies = {}
    if session_cookie:
        cookies["LEETCODE_SESSION"] = session_cookie
    r = client.post(GRAPHQL, json={"query": query, "variables": variables}, headers=headers, cookies=cookies)
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        raise RuntimeError(body["errors"][0].get("message", "LeetCode GraphQL error"))
    return body["data"]


def fetch() -> list[ProblemData]:
    with http_client() as c:
        try:
            zerotrac = {d["TitleSlug"]: d["Rating"] for d in c.get(ZEROTRAC).json()}
        except Exception:
            zerotrac = {}
        questions: list[dict] = []
        skip, total = 0, None
        while total is None or skip < total:
            data = _graphql(c, LIST_QUERY, {"skip": skip, "limit": PAGE})["questionList"]
            total = data["totalNum"]
            if not data["data"]:
                break
            questions.extend(data["data"])
            skip += PAGE
            time.sleep(0.4)
    return parse(questions, zerotrac)


def recent_accepted(username: str, limit: int = 20) -> list[str]:
    """Public endpoint; LeetCode only exposes the most recent ~20 accepted problems this way."""
    with http_client() as c:
        data = _graphql(c, RECENT_AC_QUERY, {"username": username, "limit": limit})
    return [s["titleSlug"] for s in data["recentAcSubmissionList"] or []]


def all_solved(session_cookie: str) -> list[tuple[str, int | None]]:
    """Every solved problem as (slug, last-submitted unix time). Requires the user's session cookie."""
    out: list[tuple[str, int | None]] = []
    with http_client() as c:
        skip, total = 0, None
        while total is None or skip < total:
            data = _graphql(c, SOLVED_QUERY, {"skip": skip, "limit": 100}, session_cookie)
            page = data["userProgressQuestionList"]
            if page is None:
                raise RuntimeError("LeetCode rejected the session cookie (expired or wrong value)")
            total = page["totalNum"]
            if not page["questions"]:
                break
            for q in page["questions"]:
                ts = q.get("lastSubmittedAt")
                out.append((q["titleSlug"], _parse_ts(ts)))
            skip += 100
            time.sleep(0.4)
    return out


def _parse_ts(ts) -> int | None:
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return int(ts)
    try:
        from datetime import datetime

        return int(datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None
