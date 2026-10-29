# 01 — Data Structures

## 1. SQLite schema

Six tables are created at every server start with `CREATE TABLE IF NOT EXISTS`, in two `db.exec` blocks that a migration step separates. [VERIFY: backend/server.js:11-34] [VERIFY: backend/server.js:36-41] [VERIFY: backend/server.js:43-77]

```
  ┌──────────────┐ 1      * ┌──────────────┐
  │ wheels       │──────────│ spins        │
  │ id PK        │ CASCADE  │ id PK        │
  │ name         │          │ wheel_id FK  │
  │ items (JSON) │          │ item  (text) │
  │ created_at   │          │ created_at   │
  └──────────────┘          └──────────────┘

  ┌──────────────┐ 1   * ┌──────────────┐ *   1 ┌──────────────┐
  │ players      │───────│ team_players │───────│ teams        │
  │ id PK        │CASCADE│ team_id  PK  │CASCADE│ id PK        │
  │ name UNIQUE  │       │ player_id PK │       │ name UNIQUE  │
  │ wins         │       └──────────────┘       │ wins         │
  │ is_present   │                              │ created_at   │
  │ updated_at   │                              └──────┬───────┘
  └──────────────┘                                     │ 1
                                                       │   (no ON DELETE action
                              ┌──────────────┐  *      │    → RESTRICT-like)
                              │ matches      │─────────┘
                              │ id PK        │  team_a_id, team_b_id,
                              │ team_a_id FK │  winner_id all → teams.id
                              │ team_b_id FK │
                              │ score_a/b    │
                              │ winner_id FK │
                              │ created_at   │
                              └──────────────┘
```

### 1.1 `wheels`
| Column | Type | Notes | Evidence |
|--------|------|-------|----------|
| `id` | INTEGER PK AUTOINCREMENT | | [VERIFY: backend/server.js:13] |
| `name` | TEXT NOT NULL | not unique | [VERIFY: backend/server.js:14] |
| `items` | TEXT NOT NULL | JSON-encoded string array; `JSON.stringify` on write, `JSON.parse` on read | [VERIFY: backend/server.js:15] [VERIFY: backend/server.js:117] [VERIFY: backend/server.js:87] |
| `created_at` | DATETIME default now | sort key for the wheel list (DESC) | [VERIFY: backend/server.js:16] [VERIFY: backend/server.js:84] |

The items are a denormalized array with no per-item ID. An item's identity is its array index in the UI and its text in `spins`.

### 1.2 `spins`
| Column | Type | Notes | Evidence |
|--------|------|-------|----------|
| `wheel_id` | INTEGER NOT NULL FK → wheels ON DELETE CASCADE | indexed | [VERIFY: backend/server.js:21] [VERIFY: backend/server.js:24] [VERIFY: backend/server.js:73] |
| `item` | TEXT NOT NULL | copy of the winning item's text, not a reference | [VERIFY: backend/server.js:22] |

The leaderboard groups by this text. [VERIFY: backend/server.js:210-216]

### 1.3 `players`
| Column | Type | Notes | Evidence |
|--------|------|-------|----------|
| `name` | TEXT NOT NULL UNIQUE | duplicate insert → 400 "Player already exists" | [VERIFY: backend/server.js:29] [VERIFY: backend/server.js:241-243] |
| `wins` | INTEGER default 0 | denormalized counter | [VERIFY: backend/server.js:30] |
| `is_present` | INTEGER default 1 | 0/1 flag; also added by `ALTER TABLE` for older DBs | [VERIFY: backend/server.js:31] [VERIFY: backend/server.js:37-41] |
| `updated_at` | DATETIME | only touched by `/players/:id/win` | [VERIFY: backend/server.js:250] |

The migration runs `ALTER TABLE … ADD COLUMN` on every start and swallows *any* error (`catch (e) {}`), not only "duplicate column". [VERIFY: backend/server.js:37-41] The committed `wheels.db` shows the column appended after `updated_at`, which confirms the migration ran on that file.

### 1.4 `teams` and `team_players`
| Column | Notes | Evidence |
|--------|-------|----------|
| `teams.name` UNIQUE | Natural key. The frontend builds it as sorted player names joined with `' & '` | [VERIFY: backend/server.js:46] [VERIFY: frontend/src/components/BeerpongScoreboard.js:102-112] |
| `teams.wins` | denormalized counter | [VERIFY: backend/server.js:47] |
| `team_players` PK `(team_id, player_id)` | both FKs `ON DELETE CASCADE` | [VERIFY: backend/server.js:51-57] |

The schema does not enforce team size. The "duo" constraint exists only in the matchmaker UI. [VERIFY: frontend/src/components/BeerpongScoreboard.js:161-164]

### 1.5 `matches`
| Column | Notes | Evidence |
|--------|-------|----------|
| `team_a_id`, `team_b_id`, `winner_id` | FK → teams with **no ON DELETE clause** | [VERIFY: backend/server.js:61-69] |
| `score_a`, `score_b` | nullable INTEGER, no server-side validation | [VERIFY: backend/server.js:63-64] [VERIFY: backend/server.js:371-375] |

### 1.6 Foreign-key enforcement (important)

`server.js` never runs `PRAGMA foreign_keys`. However, `better-sqlite3` is compiled with `SQLITE_DEFAULT_FOREIGN_KEYS=1` (checked in the published `better-sqlite3@9.2.2` tarball, `deps/defines.gypi:14`), so enforcement is **on**. Consequences:

| Action | Result |
|--------|--------|
| Delete wheel | its `spins` are cascaded away |
| Delete player | their `team_players` rows are cascaded away; the team row survives with fewer members |
| Delete team with **no** matches | succeeds; `team_players` cascaded |
| Delete team that appears in **any** match | **fails**: `FOREIGN KEY constraint failed` → HTTP 500 (reproduced) |
| Insert match with non-existent team id | fails with FK error → HTTP 500 |

As a result, the `COALESCE(ta.name, 'Verwijderd Team')` fallbacks in `GET /api/matches` cannot trigger through the API. [VERIFY: backend/server.js:354-356]

### 1.7 Indexes
[VERIFY: backend/server.js:72-76] `spins(wheel_id)`, `matches(winner_id)`, `team_players(team_id)`, `team_players(player_id)`.

## 2. API payload shapes

| Endpoint | Response element | Evidence |
|----------|------------------|----------|
| `GET /api/wheels` | `{id, name, items: string[], created_at}` | [VERIFY: backend/server.js:84-89] |
| `POST /api/wheels`, `/update` | `{id, name, items}` (no `created_at`) | [VERIFY: backend/server.js:118] [VERIFY: backend/server.js:152] |
| `GET /api/wheels/:id/history` | spins rows, newest first, **max 20** | [VERIFY: backend/server.js:201] |
| `GET /api/wheels/:id/leaderboard` | `{item, wins}` sorted by wins DESC | [VERIFY: backend/server.js:210-216] |
| `GET /api/players` | rows sorted `wins DESC, name ASC` | [VERIFY: backend/server.js:226] |
| `GET /api/teams` | team row + `members` = `GROUP_CONCAT(p.name, ' & ')` | [VERIFY: backend/server.js:295-302] |
| `GET /api/matches` | match row + `team_a_name`, `team_b_name`, `winner_name`, newest first, **max 100** | [VERIFY: backend/server.js:352-363] |

`members` is built by `GROUP_CONCAT` without an `ORDER BY`. SQLite does not guarantee concatenation order, so `members` may list names in a different order than `name`.

## 3. Frontend state

### 3.1 `App` [VERIFY: frontend/src/App.js:19-27]
| State | Type | Role |
|-------|------|------|
| `wheels` | wheel[] | sidebar list |
| `currentWheel` | wheel \| null | selected wheel; drives `SpinWheel`, `ItemList`, scoreboard fetch |
| `selectedResult` | string \| null | winner modal content |
| `wheelName` | string | value of the sidebar "New wheel name..." input; also set to the selected wheel's name [VERIFY: frontend/src/App.js:154] |
| `newItem` | string | ItemList add-input (lifted state) |
| `editingWheel` | id \| null | only hides the "Edit" button; there is no wheel rename UI [VERIFY: frontend/src/App.js:221-225] |
| `history`, `leaderboard` | arrays | Scoreboard data |
| `activeTab` | `'wheel' \| 'beerpong' \| 'manual'` | tab router |

### 3.2 `SpinWheel` [VERIFY: frontend/src/components/SpinWheel.js:10-25]
| State/ref | Role |
|-----------|------|
| `rotation` (state, degrees) | updated every animation frame → re-render → canvas redraw |
| `rotationRef` | rotation at the end of the last spin; starting point of the next spin |
| `isSpinning` | spin guard + cursor style |
| `size` | canvas CSS size from `getSize()` breakpoints (≤480: w-40; ≤768: min(w-60, 320); else 380) [VERIFY: frontend/src/components/SpinWheel.js:17-23] |
| `containerRef`, `isMobile` | `containerRef` is attached but never read; `isMobile` is only in the effect deps [VERIFY: frontend/src/components/SpinWheel.js:115] [VERIFY: frontend/src/components/SpinWheel.js:169] |

### 3.3 `BeerpongScoreboard` [VERIFY: frontend/src/components/BeerpongScoreboard.js:5-24]
| State | Shape |
|-------|-------|
| `players`, `teams`, `matches` | server rows |
| `subTab` | `'players' \| 'teams' \| 'matches' \| 'matchmaker'` |
| `matchData` | `{team_a_id, team_b_id, score_a, score_b}`: `<select>` values, so the ids are **strings** |
| `mmSideA`, `mmSideB` | `{p1, p2}` player ids (string from `<select>`, number from shuffle) |
| `mmResult` | `null` or `{teamAId, teamBId, scoreA, scoreB}`; non-null switches the matchmaker into score-entry mode |
| `isSubmitting` | disables buttons during requests |

String ids are written unchanged into INTEGER columns. SQLite's INTEGER affinity converts `'3'` → `3` (checked: `typeof(winner_id)` = `integer`), so the later `m.winner_id === m.team_a_id` comparison on fetched rows works. [VERIFY: frontend/src/components/BeerpongScoreboard.js:326]

## Verification checklist
- [x] Schema matches the `CREATE TABLE` text in `server.js`
- [x] FK default verified against the better-sqlite3 build config and by reproduction
- [x] Type-affinity claim checked empirically
