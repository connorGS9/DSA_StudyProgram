"""CSES problem set, scraped from the single public list page.

CSES has no difficulty ratings, so each section gets a hand-set rating band and problems are
placed inside it by how many people solved them (log scale): most-solved -> bottom of the band.
"""

from __future__ import annotations

import html
import math
import re

from ..categories import CSES_SECTIONS, CSES_TITLE_OVERRIDES
from .base import ProblemData, http_client

URL = "https://cses.fi/problemset/"

SECTION_BANDS: dict[str, tuple[int, int]] = {
    "Introductory Problems": (800, 1500),
    "Sorting and Searching": (1000, 2000),
    "Dynamic Programming": (1100, 2100),
    "Graph Algorithms": (1200, 2300),
    "Range Queries": (1400, 2300),
    "Tree Algorithms": (1400, 2300),
    "Mathematics": (1300, 2400),
    "String Algorithms": (1500, 2500),
    "Geometry": (1500, 2400),
    "Advanced Techniques": (1900, 2700),
    "Sliding Window Problems": (1300, 2200),
    "Interactive Problems": (1400, 2300),
    "Bitwise Operations": (1400, 2300),
    "Construction Problems": (1400, 2300),
    "Advanced Graph Problems": (1900, 2700),
    "Counting Problems": (1700, 2600),
    "Additional Problems I": (1700, 2600),
    "Additional Problems II": (1800, 2800),
}

_TOKEN = re.compile(
    r'<h2>(?P<section>[^<]+)</h2>'
    r'|<li class="task"><a href="/problemset/task/(?P<id>\d+)/?">(?P<title>[^<]+)</a>'
    r'<span class="detail">(?P<solved>\d+)\s*/\s*(?P<tried>\d+)</span>'
)


def parse(page: str) -> list[ProblemData]:
    sections: dict[str, list[tuple[str, str, int]]] = {}
    current: str | None = None
    for m in _TOKEN.finditer(page):
        if m["section"]:
            current = html.unescape(m["section"]).strip()
            continue
        if current is None or current not in CSES_SECTIONS:
            continue
        sections.setdefault(current, []).append((m["id"], html.unescape(m["title"]), int(m["solved"])))

    out: list[ProblemData] = []
    for section, tasks in sections.items():
        lo, hi = SECTION_BANDS.get(section, (1500, 2500))
        logs = [math.log10(max(s, 1)) for _, _, s in tasks]
        top, bottom = max(logs), min(logs)
        span = (top - bottom) or 1.0
        for (tid, title, solved), lg in zip(tasks, logs):
            rating = int(round((lo + (hi - lo) * (top - lg) / span) / 50) * 50)
            cat = CSES_TITLE_OVERRIDES.get(title, CSES_SECTIONS[section])
            out.append(
                ProblemData(
                    external_id=tid,
                    title=title,
                    url=f"https://cses.fi/problemset/task/{tid}",
                    rating=rating,
                    raw_difficulty=section,
                    tags=[section],
                    categories=[cat],
                    solved_count=solved,
                )
            )
    return out


def fetch() -> list[ProblemData]:
    with http_client() as c:
        r = c.get(URL)
        r.raise_for_status()
        items = parse(r.text)
    if not items:
        raise RuntimeError("No CSES problems parsed; the page layout may have changed")
    return items
