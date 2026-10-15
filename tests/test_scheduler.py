import random
from collections import Counter
from datetime import timedelta

from sqlalchemy import select

from dsa import services
from dsa.models import CategorySkill, DailySet, Problem, SrsState, utcnow
from dsa.scheduler import selector, srs


def _active(ds):
    return selector.active_slots(ds)


def test_day_has_requested_count_and_distinct_categories(seeded):
    ds = selector.get_or_create_day(seeded, "2026-01-01", random.Random(1))
    slots = _active(ds)
    assert len(slots) == 4
    cats = [s.problem.primary_category for s in slots]
    assert len(set(cats)) == len(cats)
    assert all(s.kind == "new" for s in slots)  # nothing due yet


def test_day_is_stable_across_calls(seeded):
    a = [s.problem_id for s in _active(selector.get_or_create_day(seeded, "2026-01-01"))]
    b = [s.problem_id for s in _active(selector.get_or_create_day(seeded, "2026-01-01"))]
    assert a == b


def test_set_count_grows_and_shrinks_without_touching_completed(seeded):
    ds = selector.get_or_create_day(seeded, "2026-01-01", random.Random(2))
    selector.set_count(seeded, ds, 10, random.Random(3))
    assert len(_active(ds)) == 10
    assert len({s.problem.primary_category for s in _active(ds)}) == 10
    first = _active(ds)[0]
    services.complete_attempt(
        seeded, first.problem, slot=first, outcome="solved", key_insight="x",
        code_files=[services.CodeFile("a.java", None, b"class A {}")],
    )
    selector.set_count(seeded, ds, 0)
    remaining = _active(ds)
    assert [s.id for s in remaining] == [first.id]


def test_reroll_slot_replaces_problem(seeded):
    ds = selector.get_or_create_day(seeded, "2026-01-01", random.Random(4))
    slot = _active(ds)[0]
    old = slot.problem_id
    new = selector.reroll(seeded, slot, random.Random(5))
    assert new is not None and new.problem_id != old and new.position == slot.position
    assert slot.status == "rerolled"
    assert len(_active(ds)) == 4


def test_reroll_all_keeps_completed(seeded):
    ds = selector.get_or_create_day(seeded, "2026-01-01", random.Random(6))
    done = _active(ds)[0]
    services.complete_attempt(
        seeded, done.problem, slot=done, outcome="solved_clean", key_insight="x",
        code_files=[services.CodeFile(None, "python", b"print(1)")],
    )
    before = {s.problem_id for s in _active(ds)}
    selector.reroll_all(seeded, ds, random.Random(7))
    after = _active(ds)
    assert len(after) == 4
    assert done in after
    assert not (before - {done.problem_id}) & {s.problem_id for s in after}


def test_completion_requires_code_and_insight(seeded):
    ds = selector.get_or_create_day(seeded, "2026-01-01")
    slot = _active(ds)[0]
    for code, insight in (([], "x"), ([services.CodeFile("a.py", None, b"  ")], "x"),
                          ([services.CodeFile("a.py", None, b"x=1")], " ")):
        try:
            services.complete_attempt(seeded, slot.problem, slot=slot, outcome="solved",
                                      key_insight=insight, code_files=code)
        except services.ValidationError:
            continue
        raise AssertionError("expected validation error")
    assert slot.status == "pending"


def test_attempt_reveals_categories_and_schedules_review(seeded):
    ds = selector.get_or_create_day(seeded, "2026-01-01")
    slot = _active(ds)[0]
    cat = slot.problem.primary_category
    _, reveal = services.complete_attempt(
        seeded, slot.problem, slot=slot, outcome="failed", key_insight="needed a heap",
        guessed_category=cat, code_files=[services.CodeFile("Main.java", None, b"class Main {}")],
    )
    assert reveal["guess_correct"] is True
    assert reveal["primary_category"] == cat
    state = seeded.get(SrsState, slot.problem_id)
    assert state.due >= utcnow() + timedelta(hours=23)
    assert state.lapses == 1
    assert seeded.get(CategorySkill, cat).rating < 1200 or slot.problem.rating < 900


def test_due_reviews_get_scheduled_and_capped(seeded):
    probs = list(seeded.scalars(select(Problem).limit(10)))
    now = utcnow()
    for p in probs:
        st = srs.review(None, p.id, "solved", now - timedelta(days=30))
        st.due = now - timedelta(days=1)
        seeded.add(st)
    seeded.commit()
    ds = selector.get_or_create_day(seeded, selector.today_str(), random.Random(8))
    kinds = Counter(s.kind for s in _active(ds))
    assert kinds["review"] == round(4 * 0.4)
    assert kinds["new"] == 2


def test_history_reviews_limited(seeded):
    probs = list(seeded.scalars(select(Problem).limit(20)))
    now = utcnow()
    for p in probs:
        st = srs.seed_history(p.id, None, now)
        st.due = now - timedelta(days=1)
        seeded.add(st)
    seeded.commit()
    ds = DailySet(day=selector.today_str())
    seeded.add(ds)
    seeded.flush()
    selector.add_problems(seeded, ds, 10, random.Random(9))
    reviews = [s for s in _active(ds) if s.kind == "review"]
    assert len(reviews) == 2  # 4 review slots, half of which may be history


def test_new_problems_target_skill(seeded):
    seeded.add(CategorySkill(category="dp", rating=2000, n_attempts=10))
    seeded.commit()
    ctx = selector.make_context(seeded, "2026-02-01", random.Random(10))
    picks = [selector._pick_from(ctx, "dp", "codeforces") for _ in range(30)]
    mean = sum(p.rating for p in picks) / len(picks)
    assert mean > 1700


def test_weak_and_neglected_categories_weighted_up(seeded):
    seeded.add(CategorySkill(category="graphs", rating=900, n_attempts=10))
    seeded.add(CategorySkill(category="arrays", rating=1500, n_attempts=10))
    seeded.commit()
    w = selector.category_weights(selector.make_context(seeded, "2026-02-01"))
    from dsa.categories import BY_KEY

    assert w["graphs"] / BY_KEY["graphs"].weight > w["arrays"] / BY_KEY["arrays"].weight


def test_locked_categories_not_offered(seeded):
    w = selector.category_weights(selector.make_context(seeded, "2026-02-01"))
    assert "advanced" not in w and "advanced_graphs" not in w
    assert "dp" in w


def test_import_history_and_refs(seeded):
    refs = services.parse_problem_refs(
        "https://leetcode.com/problems/dp-3/description/ codeforces.com/contest/1520/problem/F "
        "https://cses.fi/problemset/task/1068 1700b two-sum"
    )
    assert refs == [("leetcode", "dp-3"), ("codeforces", "1520F"), ("cses", "1068"),
                    ("codeforces", "1700B"), ("leetcode", "two-sum")]
    r = services.import_history(seeded, "leetcode", [("dp-3", None), ("nope", None)])
    assert r == {"seeded": 1, "already_known": 0, "not_found": 1}
    p = seeded.scalar(select(Problem).where(Problem.source == "leetcode", Problem.external_id == "dp-3"))
    assert p.srs.origin == "history" and p.srs.due > utcnow()
