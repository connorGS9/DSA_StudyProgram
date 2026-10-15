import os
import random
import tempfile
from pathlib import Path

import pytest

_tmp = tempfile.mkdtemp(prefix="dsa-test-")
os.environ["DSA_DATA_DIR"] = _tmp

from dsa import config  # noqa: E402
from dsa.categories import CATEGORIES  # noqa: E402
from dsa.db import init_db  # noqa: E402
from dsa.importers.base import ProblemData, upsert_problems  # noqa: E402


@pytest.fixture
def session(tmp_path: Path):
    config.ensure_dirs()
    init_db(f"sqlite:///{tmp_path / 'test.db'}")
    from dsa import db

    with db._SessionLocal() as s:
        yield s


def make_problems(n_per: int = 12, sources=("codeforces", "cses", "leetcode")) -> dict[str, list[ProblemData]]:
    rng = random.Random(7)
    out: dict[str, list[ProblemData]] = {s: [] for s in sources}
    for c in CATEGORIES:
        for source in sources:
            for i in range(n_per):
                out[source].append(
                    ProblemData(
                        external_id=f"{c.key}-{i}",
                        title=f"{c.key} problem {i}",
                        url=f"https://example.com/{source}/{c.key}/{i}",
                        rating=rng.randrange(800, 2600, 100),
                        raw_difficulty="x",
                        tags=[c.key],
                        categories=[c.key],
                    )
                )
    return out


@pytest.fixture
def seeded(session):
    for source, items in make_problems().items():
        upsert_problems(session, source, items)
    session.commit()
    return session
