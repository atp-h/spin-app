# 06 — Key Questions, Defects and Pitfalls

## Part A — Why / How

### Q1. Why is the spin winner chosen before the animation?
It guarantees a uniform outcome and an exact landing, independent of frame rate. The target rotation is derived from the winner (03 §3). [VERIFY: frontend/src/components/SpinWheel.js:123-135]

### Q2. Why does the frontend call `POST …/update` and `POST …/delete` instead of `PUT`/`DELETE`?
The code doesn't say. What it does show: the POST twins were added alongside the originals (commit `dc2c42f`, "delete knop fix"), the comment calls them "Post-based delete fallback", and only the POST twins are called from the UI. [VERIFY: backend/server.js:281] [VERIFY: backend/server.js:448] [VERIFY: frontend/src/App.js:88] [VERIFY: frontend/src/App.js:101]

### Q3. How does the frontend find the API?
On a non-localhost host it uses relative URLs, which nginx proxies. On localhost it uses `REACT_APP_API_URL`, falling back to `http://localhost:5000`. [VERIFY: frontend/src/App.js:9-16] See 00 §4.

### Q4. Are foreign keys actually enforced?
Yes. `better-sqlite3` is compiled with `SQLITE_DEFAULT_FOREIGN_KEYS=1`, even though `server.js` never sets the pragma. Cascades work, and deleting a team referenced by a match fails. See 01 §1.6.

### Q5. How are teams identified?
By name: the sorted player names joined with `" & "`. [VERIFY: frontend/src/components/BeerpongScoreboard.js:101-112] See 04 §2.

### Q6. Where do win counts come from?
From counters updated in the match insert and delete transactions, not from a query over `matches`. [VERIFY: backend/server.js:377-385] [VERIFY: backend/server.js:455-463] See 04 §4 for when they drift.

### Q7. Which players can be picked in the matchmaker?
Only players with `is_present` truthy, both in the dropdowns and in the shuffle. [VERIFY: frontend/src/components/BeerpongScoreboard.js:226] [VERIFY: frontend/src/components/BeerpongScoreboard.js:346] [VERIFY: frontend/src/components/BeerpongScoreboard.js:216] The manual History form lists **all** teams, with no presence filter. [VERIFY: frontend/src/components/BeerpongScoreboard.js:303]

### Q8. How much history is kept and shown?
Everything is kept. Display is capped at 20 spins per wheel and the 100 most recent matches. [VERIFY: backend/server.js:201] [VERIFY: backend/server.js:362]

### Q9. Where is the data stored in Docker?
In `backend/wheels.db` in the host checkout, via the `./backend:/app` bind mount. [VERIFY: docker-compose.yml:14-15] The file is tracked by git.

## Part B — Defects found (ranked)

| # | Severity | Defect | Evidence | Suggested fix |
|---|----------|--------|----------|---------------|
| 1 | High | Deleting any team that has a match returns 500 (`FOREIGN KEY constraint failed`) | [VERIFY: backend/server.js:67-69] [VERIFY: backend/server.js:407-416] | Refuse with a clear 409 message, or delete or archive its matches in the same transaction (and adjust counters) |
| 2 | High | A re-added player isn't re-linked to their old team; later wins skip them | [VERIFY: frontend/src/components/BeerpongScoreboard.js:115-116] [VERIFY: backend/server.js:320-327] | Always `POST /api/teams` (server-side find-or-create), or key teams by player IDs |
| 3 | Medium | Ties and NaN scores give the win to Team B | [VERIFY: frontend/src/components/BeerpongScoreboard.js:142] | Reject `score_a === score_b` and non-numbers in both the client and the server |
| 4 | Medium | `POST /api/matches` has no validation (A ≠ B, winner ∈ {A,B}, scores present) | [VERIFY: backend/server.js:370-375] | Validate on the server, and compute `winner_id` there from the scores |
| 5 | Medium | Win counters drift when membership changes; `MAX(0, …)` hides it | [VERIFY: backend/server.js:425-432] | Derive wins with `COUNT(*)` on read; add `match_players` for per-player history |
| 6 | Medium | Biased shuffle (`sort(() => 0.5 − random)`) | [VERIFY: frontend/src/components/BeerpongScoreboard.js:221] | Fisher–Yates |
| 7 | Medium | Switching wheels mid-spin: the uncancelled rAF loop posts the result to the old wheel and overwrites the scoreboard with the old wheel's data | [VERIFY: frontend/src/components/SpinWheel.js:140-160] [VERIFY: frontend/src/App.js:137-150] [VERIFY: frontend/src/App.js:232-236] | Keep the rAF id in a ref and cancel it in an effect cleanup; disable the sidebar while spinning |
| 8 | Medium | Live DB tracked in git and bind-mounted, so a `git pull`/`checkout` can overwrite real data | [VERIFY: docker-compose.yml:14-15] | `.gitignore` it; use a `data/` directory or a named volume; set the DB path from an env var |
| 9 | Low | The "New wheel name" input is prefilled with the selected wheel's name, so Create right away makes a duplicate | [VERIFY: frontend/src/App.js:154] [VERIFY: frontend/src/App.js:69-74] | Keep a separate state for the create input; clear it after create |
| 10 | Low | The wheel "Edit" button only hides itself; there's no rename | [VERIFY: frontend/src/App.js:221-225] | Add a rename field, or remove the button |
| 11 | Low | Every item edit re-fetches the scoreboard (new `currentWheel` reference) | [VERIFY: frontend/src/App.js:47-51] [VERIFY: frontend/src/App.js:90-92] | Depend on `currentWheel?.id` instead of the object |
| 12 | Low | Spins are keyed by item text: renames orphan history; duplicate items merge | [VERIFY: backend/server.js:22] [VERIFY: backend/server.js:210-216] | Store stable item IDs (an `items` table) |
| 13 | Low | Winner modal shows even when saving the spin fails | [VERIFY: frontend/src/App.js:138-148] | Surface the error, or retry |
| 14 | Low | Item list uses index keys, which can misattribute inline-edit state after a removal | [VERIFY: frontend/src/components/ItemList.js:46] | Use stable IDs (follows from #12) |
| 15 | Low | The migration swallows every error, not only "duplicate column" | [VERIFY: backend/server.js:37-41] | Check `PRAGMA table_info(players)` first |
| 16 | Info | No auth; `cors()` allows any origin | [VERIFY: backend/server.js:79] | At minimum a shared secret, and restrict the CORS origin |

## Part C — Code-health observations

| Observation | Evidence |
|-------------|----------|
| Every update and delete route is duplicated (`PUT`/`DELETE` + POST twin) with identical bodies | [VERIFY: backend/server.js:124-156] [VERIFY: backend/server.js:418-477] |
| Unused endpoints: `GET /api/wheels/:id`, `POST /api/players/:id/win` | [VERIFY: backend/server.js:95] [VERIFY: backend/server.js:248] |
| Unused code in `SpinWheel`: `containerRef` is never read, `isMobile` is only a dependency | [VERIFY: frontend/src/components/SpinWheel.js:11] [VERIFY: frontend/src/components/SpinWheel.js:15] |
| `onKeyPress` is deprecated in React; prefer `onKeyDown` | [VERIFY: frontend/src/App.js:188] [VERIFY: frontend/src/components/ItemList.js:53] |
| `mmResult` scores use `parseInt` with no NaN guard (same issue as the manual form) | [VERIFY: frontend/src/components/BeerpongScoreboard.js:387] [VERIFY: frontend/src/components/BeerpongScoreboard.js:389] |
| No test suite exists; `frontend/package.json` has a `test` script but there are no test files | [VERIFY: frontend/package.json:14] |
| The README API list includes `DELETE /api/matches/:id`, which the UI doesn't call, and omits the POST twins | [VERIFY: README.md:85-91] |

## Part D — Configuration guidance

| Scenario | What to do |
|----------|------------|
| Local dev | `npm run dev` from the root; the UI on `localhost:3000` calls `localhost:5000` directly [VERIFY: package.json:6] |
| Public host behind nginx | Use `nginx.conf`; the frontend switches to relative URLs automatically [VERIFY: frontend/src/App.js:12-13] |
| Different backend port | Set `PORT` [VERIFY: backend/server.js:7], and update nginx `upstream backend` [VERIFY: nginx.conf:5-7] and, for localhost, `REACT_APP_API_URL` |
| Inspect players quickly | `node backend/check_db.js` [VERIFY: backend/check_db.js:5-6] |

## Verification checklist
- [x] Every defect cites the code that causes it
- [x] Defect #1 reproduced; #6 measured; the others traced by reading the code
- [x] Q2 states only what the code and commit history show, with no guessed motive
