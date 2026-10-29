# 02 — Data Flow

Every frontend → backend interaction, traced through the code.

## 1. App boot

```
index.js render <App/> (StrictMode)
  └─ useEffect([]) → fetchWheels()
       GET /api/wheels ──▶ SELECT * FROM wheels ORDER BY created_at DESC; JSON.parse(items)
       ◀── wheel[]
       setWheels; if first load: setCurrentWheel(w[0]), setWheelName(w[0].name),
                                  fetchScoreboard(w[0].id)
  └─ useEffect([currentWheel]) → fetchScoreboard(currentWheel.id)
       Promise.all(GET /history, GET /leaderboard) → setHistory, setLeaderboard
```
[VERIFY: frontend/src/App.js:29-31] [VERIFY: frontend/src/App.js:53-67] [VERIFY: frontend/src/App.js:47-51] [VERIFY: frontend/src/App.js:33-45]

On first load the scoreboard is fetched twice: once directly in `fetchWheels` (line 62) and once by the `currentWheel` effect after `setCurrentWheel`. [VERIFY: frontend/src/App.js:62] [VERIFY: frontend/src/App.js:47-51] In development, StrictMode runs the mount effects a second time on top of that.

## 2. Wheel lifecycle

| User action | Frontend | HTTP | Backend SQL |
|-------------|----------|------|-------------|
| Create | `handleCreateWheel` sends `items: []`, prepends the result, selects it [VERIFY: frontend/src/App.js:69-84] | `POST /api/wheels` | `INSERT INTO wheels` [VERIFY: backend/server.js:116-117] |
| Select | `selectWheel` (local only, no fetch of the wheel itself) [VERIFY: frontend/src/App.js:152-157] | history + leaderboard via effect | SELECTs |
| Add/edit/remove item | builds a new array, then `handleUpdateWheel` [VERIFY: frontend/src/App.js:117-135] | `POST /api/wheels/:id/update` with the **full** array | `UPDATE wheels SET name, items` [VERIFY: backend/server.js:147-148] |
| Delete | `confirm()`, POST, filter local list, select next [VERIFY: frontend/src/App.js:98-115] | `POST /api/wheels/:id/delete` | `DELETE FROM wheels` (+ cascade spins) [VERIFY: backend/server.js:173-174] |

Item edits always overwrite the whole array. Two browsers editing the same wheel are last-writer-wins.

`handleUpdateWheel` replaces `currentWheel` with `res.data`. That object is a **new reference** (it has no `created_at`), so the `[currentWheel]` effect fires and **re-fetches history and leaderboard after every item edit**. [VERIFY: frontend/src/App.js:89-92] [VERIFY: frontend/src/App.js:47-51]

## 3. Spin

```
canvas click/touchend ─▶ spin()
   winnerIndex = floor(random·n)                 (chosen BEFORE animating)
   rAF loop: setRotation(eased angle) ×~540 frames (9 s @60 Hz)
   at progress = 1: onSpinEnd(items[winnerIndex])
        ▼
App.handleSpinResult(result)
   setSelectedResult(result)  → "Winner!" modal
   POST /api/spins {wheel_id, item: result} ─▶ INSERT INTO spins
   fetchScoreboard(id) → refresh history/leaderboard
```
[VERIFY: frontend/src/components/SpinWheel.js:117-161] [VERIFY: frontend/src/App.js:137-150] [VERIFY: backend/server.js:185-197]

Only the item **text** is sent. The server checks that `wheel_id` and `item` are present but not that `item` belongs to the wheel. [VERIFY: backend/server.js:188-190]

## 4. Beerpong flows

### 4.1 Load
`fetchData` → `Promise.all(GET players, GET teams, GET matches)` on mount, and again after every mutation. [VERIFY: frontend/src/components/BeerpongScoreboard.js:26-43]

### 4.2 Player actions
| Action | Request | Notes |
|--------|---------|-------|
| Add | `POST /api/players {name}` then `fetchData` | name sent untrimmed; only `.trim()` emptiness is checked [VERIFY: frontend/src/components/BeerpongScoreboard.js:45-54] |
| Toggle presence | optimistic local update, then `POST …/toggle-presence {is_present}`; on error `fetchData` | [VERIFY: frontend/src/components/BeerpongScoreboard.js:56-65] [VERIFY: backend/server.js:260-269] |
| Delete | `POST /api/players/:id/delete` | cascades `team_players` [VERIFY: frontend/src/components/BeerpongScoreboard.js:67-76] |

### 4.3 Manual match entry (History sub-tab)
```
matchData {team_a_id:'3', team_b_id:'5', score_a, score_b}
  └─ handleRecordMatch()
       guard: both set and different
       winner_id = score_a > score_b ? team_a_id : team_b_id
       POST /api/matches {...data, winner_id}
         └─ transaction:
              INSERT INTO matches
              UPDATE teams   SET wins=wins+1 WHERE id=winner_id
              UPDATE players SET wins=wins+1 WHERE id IN (team_players of winner)
       reset form, fetchData(), switch to 'matches' sub-tab
```
[VERIFY: frontend/src/components/BeerpongScoreboard.js:133-155] [VERIFY: backend/server.js:370-394]

### 4.4 Matchmaker
```
choose 4 present players (manual <select>s or shuffleSelected)
  └─ handleMatchmakerSubmit()
       validate 2+2 and 4 distinct ids
       fresh GET players + GET teams
       teamAId = findOrCreateTeam(pIdsA)  ── name lookup in list, else POST /api/teams
       teamBId = findOrCreateTeam(pIdsB)
       GET teams again; mmResult = {teamAId, teamBId, 0, 0}
  └─ (score entry UI)  handleMmSave() → handleRecordMatch({...}) → §4.3
```
[VERIFY: frontend/src/components/BeerpongScoreboard.js:157-204] [VERIFY: frontend/src/components/BeerpongScoreboard.js:206-213] [VERIFY: frontend/src/components/BeerpongScoreboard.js:100-131]

### 4.5 Match delete
`POST /api/matches/:id/delete`. In a transaction: read the match, then `MAX(0, wins-1)` on the winner team and on its **current** `team_players`, then delete the match row. [VERIFY: backend/server.js:449-477]

### 4.6 Team delete
`POST /api/teams/:id/delete` → `DELETE FROM teams`. This fails with an FK error for any team that has played a match (see 01 §1.6). The frontend then shows `alert('Fout bij verwijderen team: ' + error.message)`, i.e. "Request failed with status code 500". [VERIFY: backend/server.js:407-416] [VERIFY: frontend/src/components/BeerpongScoreboard.js:78-87]

## Verification checklist
- [x] Each arrow corresponds to an axios call site and a route handler
- [x] Effect-trigger claims traced to dependency arrays
