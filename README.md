# Study Lab

A local, all-in-one study lab: a DSA trainer plus your reading list and projects.

The DSA trainer is a spaced-repetition trainer for data structures & algorithms practice. Each day it hands you a small set of problems from **Codeforces, CSES and LeetCode** without telling you their type. It balances categories, aims slightly above your current level, and brings problems back for review on an FSRS schedule.

## Run it

```bash
./dsa
```

The first run creates a Python venv, builds the UI, and imports ~15k problems in the background (about a minute). Then it opens http://127.0.0.1:8765. Everything is stored in `data/` (SQLite database, your solution files, your videos).

Requirements: Python 3.11+, Node 18+ (only to build the UI), and optionally `ffmpeg` (makes browser-recorded videos seekable).

## How a day works

1. **Today** shows N problems (default 4; use − / + to change today's count). Each shows its source, approximate rating and how much of a stretch it is, but **not** its category.
2. **Reroll** a single problem (↻) or every unfinished one. ✕ removes a problem from today.
3. **Finish & log** a problem: guess its type, pick how it went, paste/attach your solution (Java/Python/C++), and write the key insight. A problem only counts once code and reflection are saved.
4. The categories are revealed, your skill estimate updates, and the next review is scheduled. You can then **record a video** explaining the solution (camera, screen, or screen + camera bubble), or upload one.

## How problems are picked

- **Reviews** (up to `review_share` of the day): problems you've solved, scheduled by [FSRS](https://github.com/open-spaced-repetition/py-fsrs). Easy solves come back in weeks or months; failures come back in a day or two. Imported history is lower priority.
- **New problems**: a category is drawn at random, weighted toward categories you've under-practiced recently and ones where your skill lags. No category repeats within a day. Then a judge is drawn by `source_weights` (default CF 45%, CSES 35%, LC 20%). Then an unseen problem is chosen near **your skill in that category + stretch**.
- **Skill** is an Elo-style rating per category on the Codeforces scale. Advanced categories (segment trees, flows, CHT…) unlock as your average rises.
- Difficulty is normalized: Codeforces ratings as-is; LeetCode from zerotrac contest ratings (or Easy/Medium/Hard plus acceptance rate); CSES from per-section bands and solve counts.

All of this is tunable in **Settings**.

## Pages

| Page | What it's for |
|---|---|
| Lab | home dashboard: what's on now and next, your priorities, today's DSA set, books in progress (update your page inline), active projects with their next task |
| Schedule | your routine as recurring time blocks per weekday (Day timeline with a "now" line, Week grid), one-off events, skip or move a single day without touching the routine, built-in phase timers (e.g. 5 → 20 → 5 min) that keep running across pages and reloads, optional start-of-block reminders, and your current priorities |
| Today | daily DSA set, rerolls, streak, quick stats |
| Progress | skill per category, activity heatmap, review forecast, pattern-recognition accuracy |
| Library | search/filter all problems, add any problem to today, exclude or retire problems |
| Cheat Sheet | 28 topic sheets (DP has 14 sub-sections) with Java templates, signals, pitfalls and classic problems; edit them in `content/cheatsheet/*.md` |
| Videos | all your recorded explanations |
| Books | currently reading (page progress), an "up next" queue you drag to reorder, finished books with ratings, dated notes per book |
| Projects | idea / active / paused / done projects, a task checklist that drives % complete (drag to reorder, double-click to rename), and a running log |
| Settings | imports, Codeforces handle (auto-verifies AC), LeetCode history import, scheduling knobs, category emphasis |

### Importing LeetCode history

Settings → *Accounts & past solves*. LeetCode only exposes your last ~20 solves publicly. For the full history, paste your own `LEETCODE_SESSION` cookie (it stays in the local DB and is only sent to leetcode.com). You can also paste links/ids of solved problems from any judge.

### Google Calendar sync

Settings → *Google Calendar* mirrors your Schedule into a dedicated "Study Lab" calendar in your Google account, so your phone gets the reminders. The sync is one-way: edits, skips, moves and one-off events push automatically a few seconds after you make them, and Study Lab overwrites any changes made in Google.

It needs a one-time setup: your own free Google OAuth client. The Settings card walks you through it and shows the exact redirect URIs to register. The app only requests the `calendar.app.created` scope, so it can only see and change the calendar it creates. The client secret and sign-in token are stored in the local database in `data/`, which is never committed.

## Development

```bash
.venv/bin/python -m dsa --no-browser --reload   # API on :8765
cd frontend && npm run dev                        # UI with hot reload on :5173 (proxies /api)
.venv/bin/python -m pytest                        # tests
```

- `backend/dsa/`: FastAPI app; `importers/` (one per judge), `scheduler/` (FSRS, skill, daily selector), `categories.py` (tag → category mapping)
- `frontend/src/`: React + TypeScript + Tailwind
- `content/cheatsheet/`: Markdown cheat sheets
