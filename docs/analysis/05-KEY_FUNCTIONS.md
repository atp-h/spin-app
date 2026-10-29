# 05 — Key Functions

The functions where the app's behavior is decided, walked through line by line.

## 1. `spin()` — `frontend/src/components/SpinWheel.js:117-161`

| Line | Code | Meaning |
|------|------|---------|
| 118 | `if (isSpinning \|\| !items \|\| items.length === 0) return;` | re-entry and empty-wheel guard [VERIFY: frontend/src/components/SpinWheel.js:118] |
| 120-121 | `setIsSpinning(true); startRotation = rotationRef.current` | read the start from the ref, not from state [VERIFY: frontend/src/components/SpinWheel.js:120-121] |
| 124 | `winnerIndex = floor(random·n)` | the outcome is decided here [VERIFY: frontend/src/components/SpinWheel.js:124] |
| 131 | `endAngle = (360 − (w·s + s/2)) % 360` | rotation that centers slice w under the pointer (03 §3) [VERIFY: frontend/src/components/SpinWheel.js:131] |
| 134-135 | `spins ∈ {2,3}`; `target = …` | 720°–1440° total sweep [VERIFY: frontend/src/components/SpinWheel.js:134-135] |
| 137 | `duration = 9000` | 9 s [VERIFY: frontend/src/components/SpinWheel.js:137] |
| 146-147 | cubic ease-out tween | [VERIFY: frontend/src/components/SpinWheel.js:146-147] |
| 151-157 | continue or finish; on finish `rotationRef = current; onSpinEnd(items[w])` | [VERIFY: frontend/src/components/SpinWheel.js:151-157] |
| 161 | deps `[isSpinning, items, onSpinEnd]` | the callback is recreated whenever those change [VERIFY: frontend/src/components/SpinWheel.js:161] |

`rotation` state and `rotationRef` hold the same value at rest. State drives rendering. The ref gives the next `spin()` a stable start without making the callback depend on `rotation`, which would recreate it on every frame.

**Side effects:** one React render per frame. On completion it calls the parent's `handleSpinResult`, which does network I/O.

## 2. Canvas draw effect — `SpinWheel.js:35-115`

```
35  useEffect(() => {
39    ctx, dpr
42-48 size the backing store to size·dpr, CSS size to size, scale(dpr), clear
50-53 cx, cy, radius = size/2 − 15, fontSize
55-57 save; translate(cx,cy); rotate(rotation°)
59-75 empty wheel → grey disk + "Add items!" and return
77-104 for each item: wedge fill/stroke; rotate to mid-angle; right-aligned label at radius−10
106-112 white hub circle
114 restore
115 }, [items, rotation, size, isMobile]);
```
[VERIFY: frontend/src/components/SpinWheel.js:35-115]

Setting `canvas.width` (line 42) resets the context transform on every run. That is why calling `ctx.scale(dpr)` each time doesn't compound. [VERIFY: frontend/src/components/SpinWheel.js:42-47]

## 3. `handleSpinResult` — `frontend/src/App.js:137-150`

```
138  setSelectedResult(result)                 → modal
139  if (currentWheel)
141    await POST /api/spins {wheel_id: currentWheel.id, item: result}
145    fetchScoreboard(currentWheel.id)
146  catch → console.error only (no user feedback)
```
[VERIFY: frontend/src/App.js:137-150]

The modal opens before the save succeeds. If the POST fails, the user sees a winner that was never recorded.

## 4. `handleUpdateWheel` — `frontend/src/App.js:86-96`

```
88  res = POST /api/wheels/:id/update {name, items}
89  setWheels(wheels.map(w => w.id === id ? res.data : w))   // `wheels` from closure
90-92 if current, setCurrentWheel(res.data)
```
[VERIFY: frontend/src/App.js:86-96]

`res.data` echoes `{id, name, items}` without `created_at` [VERIFY: backend/server.js:152], so the wheel in state loses that field after its first edit. Nothing in the UI reads it. All three item handlers (add, remove, edit) build a whole new array and call this function. [VERIFY: frontend/src/App.js:117-135]

## 5. `fetchWheels` — `frontend/src/App.js:53-67`

```
55  GET /api/wheels
56  setWheels
57  if (res.data.length > 0 && !currentWheel)   // currentWheel from the first render's closure = null
58-62 select first wheel, prefill wheelName, fetchScoreboard
```
[VERIFY: frontend/src/App.js:53-67]

It is only called from the mount effect [VERIFY: frontend/src/App.js:29-31], so the `!currentWheel` check is always true when it runs.

## 6. `handleRecordMatch` — `BeerpongScoreboard.js:133-155`

| Line | Step |
|------|------|
| 134 | `data = customData \|\| matchData`: one function serves both the matchmaker and the manual form [VERIFY: frontend/src/components/BeerpongScoreboard.js:134] |
| 137-140 | require two different, non-empty team IDs [VERIFY: frontend/src/components/BeerpongScoreboard.js:137-140] |
| 142 | winner rule (04 §3.1) [VERIFY: frontend/src/components/BeerpongScoreboard.js:142] |
| 145 | `POST /api/matches {...data, winner_id}` [VERIFY: frontend/src/components/BeerpongScoreboard.js:145] |
| 146-149 | reset the form and `mmResult`, re-fetch, jump to the History sub-tab [VERIFY: frontend/src/components/BeerpongScoreboard.js:146-149] |
| 152-153 | `finally setIsSubmitting(false)` [VERIFY: frontend/src/components/BeerpongScoreboard.js:152-154] |

## 7. `POST /api/teams` — `backend/server.js:309-347`

```
310-313 validate: name and non-empty player_ids (size not checked)
316     db.transaction(() => {
318       existing = SELECT id FROM teams WHERE name = ?
320-327   existing: DELETE team_players; re-INSERT each id
328-336   new: INSERT team; INSERT each link
338       return teamId
341     })()
342-343 SELECT the team row, respond
```
[VERIFY: backend/server.js:309-347]

A non-existent player ID makes a link INSERT fail its FK check, which rolls back the whole transaction (including a freshly inserted team) and returns 500.

## 8. Match delete — `backend/server.js:449-477`

Covered in 04 §3.3. The transaction returns `false` when the match is missing, and the handler maps that to 404. [VERIFY: backend/server.js:452-453] [VERIFY: backend/server.js:469-473] The code is duplicated verbatim in the `DELETE` route. [VERIFY: backend/server.js:418-446]

## 9. `GET /api/teams` — `backend/server.js:293-307`

```sql
SELECT t.*, GROUP_CONCAT(p.name, ' & ') AS members
FROM teams t
LEFT JOIN team_players tp ON t.id = tp.team_id
LEFT JOIN players p ON tp.player_id = p.id
GROUP BY t.id
ORDER BY t.wins DESC, t.name ASC
```
[VERIFY: backend/server.js:295-302]

The `LEFT JOIN`s keep teams that have no remaining members (`members` = NULL). That state is reachable after both players of a team are deleted.

## Verification checklist
- [x] Line numbers in the tables taken from `grep -n` output
- [x] Side effects listed only where the code shows them
