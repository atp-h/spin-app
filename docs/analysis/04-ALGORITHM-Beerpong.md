# 04 — Algorithm: Beerpong Bookkeeping

Sources: `backend/server.js` (teams, matches), `frontend/src/components/BeerpongScoreboard.js`

## 1. Concept

Three things make up the beerpong logic:

1. **Team identity by name.** A duo is identified by the string `sort(names).join(' & ')`, not by its set of player IDs.
2. **Incremental win counters.** Every match insert or delete adjusts `teams.wins` and `players.wins` in place. Wins are never recomputed from `matches`.
3. **The matchmaker.** It turns 4 player IDs into 2 team IDs (find-or-create), then hands off to the regular match-recording path.

## 2. Team identity: `findOrCreateTeam`

```js
const sortedIds = [...playerIds].map(id => parseInt(id)).sort((a, b) => a - b);
const pNames = currentPlayers.filter(p => sortedIds.includes(parseInt(p.id)))
                             .map(p => p.name).sort();
if (pNames.length !== playerIds.length) return null;
const teamName = pNames.join(' & ');
const existingTeam = currentTeams.find(t => t.name === teamName);
if (existingTeam) return existingTeam.id;
POST /api/teams { name: teamName, player_ids: sortedIds }  → res.data.id
on error: GET /api/teams, look up by name again
```
[VERIFY: frontend/src/components/BeerpongScoreboard.js:100-131]

Properties:
- **Order-independent.** {Bob, Ann} and {Ann, Bob} both map to `"Ann & Bob"`, because the names are sorted. [VERIFY: frontend/src/components/BeerpongScoreboard.js:105]
- **Uses default string sort.** `.sort()` with no comparator compares UTF-16 code units, so `"bob"` sorts after `"Zed"`. The order is consistent, which is all identity needs.
- **Ambiguous names.** A player whose name contains `" & "` could make two different pairs produce the same string. Nothing guards against that.
- **Missing players.** If either player was deleted between selection and submit, `pNames.length !== playerIds.length` and the function returns `null`. The caller then shows an alert. [VERIFY: frontend/src/components/BeerpongScoreboard.js:107-110] [VERIFY: frontend/src/components/BeerpongScoreboard.js:195-197]

### 2.1 Backend find-or-create (`POST /api/teams`)

In a transaction: if a team with that name exists, **delete all its `team_players` and re-insert** the given IDs. Otherwise insert the team and its links. [VERIFY: backend/server.js:316-339] The Dutch comment says this branch exists to re-link players who were re-created with new IDs. [VERIFY: backend/server.js:322]

**Reachability gap.** The frontend returns early when the name is already in its fresh team list. [VERIFY: frontend/src/components/BeerpongScoreboard.js:115-116] So the re-link branch only runs when that list is out of date, which in practice means never. The scenario it was written for plays out like this:

```
1. Team "Ann & Bob" (id 7) exists; team_players = {(7,Ann#1), (7,Bob#2)}
2. Delete Bob#2      → FK cascade removes (7,Bob#2)
3. Re-add "Bob"      → Bob#9
4. Matchmaker Ann+Bob → name "Ann & Bob" found in list → return 7 (no POST)
5. Win recorded      → UPDATE players … WHERE id IN (team_players of 7) = {Ann#1}
   Bob#9 never gets team wins; GET /api/teams shows members "Ann"
```

## 3. Recording a match

### 3.1 Winner rule (frontend)
```js
const winner_id = score_a > score_b ? team_a_id : team_b_id;
```
[VERIFY: frontend/src/components/BeerpongScoreboard.js:142]

| score_a vs score_b | winner |
|--------------------|--------|
| a > b | A |
| a < b | B |
| a = b | **B** (ties go to B) |
| either NaN | `NaN > x` is false → **B** |

Score inputs use `parseInt(e.target.value)`, so clearing a field gives NaN. [VERIFY: frontend/src/components/BeerpongScoreboard.js:305] [VERIFY: frontend/src/components/BeerpongScoreboard.js:307] `JSON.stringify` turns NaN into `null`, so the score is stored as NULL.

### 3.2 Transaction (backend)
```sql
INSERT INTO matches (team_a_id, team_b_id, score_a, score_b, winner_id) VALUES (…);
UPDATE teams   SET wins = wins + 1 WHERE id = :winner;
UPDATE players SET wins = wins + 1
 WHERE id IN (SELECT player_id FROM team_players WHERE team_id = :winner);
```
[VERIFY: backend/server.js:373-386]

`db.transaction` makes the three statements atomic. With FKs enforced, a non-existent team ID makes the INSERT throw, which rolls back the transaction and returns HTTP 500. [VERIFY: backend/server.js:388-393]

The server trusts the client completely. It doesn't check that `winner_id ∈ {team_a_id, team_b_id}`, that A ≠ B, or that scores are present. [VERIFY: backend/server.js:371-375]

### 3.3 Deleting a match (inverse operation)
```sql
SELECT * FROM matches WHERE id = :id;            -- 404 if absent
UPDATE teams   SET wins = MAX(0, wins - 1) WHERE id = :winner;
UPDATE players SET wins = MAX(0, wins - 1) WHERE id IN (team_players of :winner);
DELETE FROM matches WHERE id = :id;
```
[VERIFY: backend/server.js:449-477]

`MAX(0, …)` clamps at zero, so the counter can't go negative even after it has drifted.

## 4. Counter invariant

The intended invariant is:

```
teams.wins[t]   = |{ m ∈ matches : m.winner_id = t }|
players.wins[p] = |{ m ∈ matches : p ∈ members(m.winner_id) }|
```

Insert and delete keep this true only while team membership never changes between the two. It breaks when:

| Event | Effect on invariant |
|-------|---------------------|
| Player deleted then re-added (§2.1) | the new player ID doesn't receive later team wins; old matches stay credited to the deleted ID (now gone) |
| Membership changes between a match's insert and its delete | the decrement hits the *current* members, not the original winners |
| `POST /api/players/:id/win` (unused by UI) | bumps a player with no backing match [VERIFY: backend/server.js:248-258] |
| Counter already 0 when a match is deleted | `MAX(0, …)` swallows the decrement, so the counter stays wrong |

**Alternative:** derive both counts on read:
```sql
SELECT t.*, (SELECT COUNT(*) FROM matches m WHERE m.winner_id = t.id) AS wins FROM teams t …
```
`idx_matches_winner_id` already exists, so this is an index lookup per team. [VERIFY: backend/server.js:74] Player wins would still depend on current membership. To make player wins historically correct, store the winning player IDs per match (e.g. a `match_players` table).

## 5. Matchmaker

### 5.1 Validation and flow
[VERIFY: frontend/src/components/BeerpongScoreboard.js:157-204]

1. `parseInt` each of the 4 selections and drop NaNs. Require exactly 2 per side. [VERIFY: frontend/src/components/BeerpongScoreboard.js:158-164]
2. Require 4 distinct IDs via `new Set(allIds).size !== 4`. [VERIFY: frontend/src/components/BeerpongScoreboard.js:166-170]
3. Fetch players and teams again, then call `findOrCreateTeam` sequentially for A and then B. [VERIFY: frontend/src/components/BeerpongScoreboard.js:176-188]
4. Fetch teams a third time so `mmResult` can show the team names. [VERIFY: frontend/src/components/BeerpongScoreboard.js:190-194]
5. Save goes through `handleRecordMatch`, the same path as manual entry. [VERIFY: frontend/src/components/BeerpongScoreboard.js:206-213]

Step 3 passes the same `currentTeams` to both calls. If teams A and B were both new, B's lookup doesn't see A, but that doesn't matter because their names differ.

### 5.2 Shuffle
```js
const presentPlayers = players.filter(p => p.is_present);
if (presentPlayers.length < 4) alert(...);
const shuffled = [...presentPlayers].sort(() => 0.5 - Math.random());
A = {shuffled[0], shuffled[1]};  B = {shuffled[2], shuffled[3]};
```
[VERIFY: frontend/src/components/BeerpongScoreboard.js:215-224]

A random comparator is **not** a uniform shuffle. The comparator is inconsistent, and the result depends on the engine's sort algorithm. Measured in Node 24 (V8), 200,000 trials, N = 6:

| player index k | 0 | 1 | 2 | 3 | 4 | 5 |
|----------------|---|---|---|---|---|---|
| P(shuffled[0] = k) | 0.286 | 0.109 | 0.143 | 0.192 | 0.124 | 0.147 |
| uniform | 0.167 | 0.167 | 0.167 | 0.167 | 0.167 | 0.167 |

`players` arrives sorted by `wins DESC, name ASC` [VERIFY: backend/server.js:226], so the bias depends on standings. The top-ranked player ends up first on Side A far more often than chance. A Fisher–Yates shuffle fixes this:

```js
for (let i = a.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [a[i], a[j]] = [a[j], a[i]];
}
```

The shuffle only fills the selects. The user still has to press "Start Match". [VERIFY: frontend/src/components/BeerpongScoreboard.js:367-370]

## Verification checklist
- [x] Winner rule table derived from line 142, NaN behavior from JS comparison semantics
- [x] Transaction statements copied from `server.js`
- [x] Re-link gap traced through both the frontend early return and the backend branch
- [x] Shuffle bias measured, not assumed
