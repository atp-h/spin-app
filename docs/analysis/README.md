# Spin-App Codebase Analysis

Code-grounded technical documentation of `spin-app` at commit `fcf032a`. **Note:** the defects listed in 06 were fixed after this analysis, so the line numbers refer to `fcf032a`, not to the current code. Every claim carries a `VERIFY` tag (`file:line` or `file:start-end`) pointing at the code that backs it. All paths are relative to the repository root.

## Documents

| # | Document | Contents |
|---|----------|----------|
| 00 | [SYSTEM_OVERVIEW.md](00-SYSTEM_OVERVIEW.md) | Modules, deployment topology, API surface |
| 01 | [DATA_STRUCTURES.md](01-DATA_STRUCTURES.md) | SQLite schema, API payloads, React state |
| 02 | [DATA_FLOW.md](02-DATA_FLOW.md) | Request/response flows for every user action |
| 03 | [ALGORITHM-SpinWheel.md](03-ALGORITHM-SpinWheel.md) | Winner selection, target-angle math, easing, rendering |
| 04 | [ALGORITHM-Beerpong.md](04-ALGORITHM-Beerpong.md) | Win bookkeeping, team identity, matchmaker shuffle |
| 05 | [KEY_FUNCTIONS.md](05-KEY_FUNCTIONS.md) | Line-by-line walkthrough of the critical functions |
| 06 | [KEY_QUESTIONS.md](06-KEY_QUESTIONS.md) | Why/how Q&A, plus defects and pitfalls found |

## Analysis plan (Phase 1.5)

Module inventory (excluding `App.css`, which is pure styling, 1132 lines):

| Module | File | Lines | Complexity | Covered in |
|--------|------|-------|-----------|------------|
| Backend API + schema | `backend/server.js` | 481 | Medium | 00, 01, 02, 04, 05 |
| DB inspector script | `backend/check_db.js` | 10 | Trivial | 00 |
| App shell / wheel state | `frontend/src/App.js` | 276 | Medium | 01, 02, 05 |
| Wheel renderer + spin | `frontend/src/components/SpinWheel.js` | 209 | Medium (math) | 03, 05 |
| Beerpong manager | `frontend/src/components/BeerpongScoreboard.js` | 404 | Medium-High | 02, 04, 05 |
| Item editor | `frontend/src/components/ItemList.js` | 74 | Low | 02 |
| Spin scoreboard | `frontend/src/components/Scoreboard.js` | 51 | Low | 01 |
| Manual (static help) | `frontend/src/components/Manual.js` | 49 | Trivial | 00 |
| Deployment | `docker-compose.yml`, `Dockerfile.*`, `nginx.conf` | 82 | Low | 00 |

**Scope note:** the skill template aims for 1,500–3,000 lines per algorithm document and over 10,000 lines in total. The whole application is about 1,800 lines of non-CSS code, so the documents are scaled to fit. Padding them to the template sizes would mean inventing content, which the anti-hallucination rule forbids.

## Verification report (Phase 7)

- Every `[VERIFY:]` tag was checked with a script: each file exists and each line range is in bounds (see the end of this file).
- Runtime facts were checked empirically, not assumed:
  - **FK enforcement:** `better-sqlite3@9.2.2` `deps/defines.gypi:14` contains `SQLITE_DEFAULT_FOREIGN_KEYS=1`. A reproduction with FKs on gives `FOREIGN KEY constraint failed` when deleting a team that a match references.
  - **Spin landing math:** 60,000 randomized trials (n = 1..30 items, random start rotation) gave 0 cases where the pointer slice ≠ `winnerIndex`. Total rotation was always in [720°, 1440°).
  - **Shuffle bias:** 200,000 trials of `sort(() => 0.5 - Math.random())` on 6 elements in Node 24 gave a non-uniform distribution (see 04).
  - **Committed DB:** `backend/wheels.db` has 0 rows in all six tables, and its `players` schema shows `is_present` added by the `ALTER TABLE` migration.
