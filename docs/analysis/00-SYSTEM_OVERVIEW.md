# 00 — System Overview

## 1. What the system is

A two-tier web app with two independent features in one UI:

1. **Spin The Wheel**: users create named wheels with text items, spin a canvas wheel, and every result is stored. Per-wheel history and win counts are shown.
2. **Beerpong hub**: players with a presence flag, 2-player teams, match results with scores, and a matchmaker that builds two duos from present players.

A third tab, **Handleiding**, is a static Dutch help page. [VERIFY: frontend/src/components/Manual.js:3-46]

## 2. Architecture

```
                    Browser (React 18 SPA, CRA build)
 ┌───────────────────────────────────────────────────────────────────┐
 │ index.js ─▶ <App>                                                 │
 │   state: wheels, currentWheel, history, leaderboard, activeTab …  │
 │   ├── sidebar: wheel list + "create wheel" input                  │
 │   └── tabs ─┬─ 'wheel'    ─▶ <SpinWheel> <ItemList> <Scoreboard>  │
 │             ├─ 'beerpong' ─▶ <BeerpongScoreboard apiBaseUrl>      │
 │             └─ 'manual'   ─▶ <Manual>                             │
 └───────────────────────────────┬───────────────────────────────────┘
                                 │ axios, JSON over HTTP, /api/*
          ┌──────────────────────┴───────────────────────┐
          │ (prod) host nginx :80  /api → :5000, / → :3000│  nginx.conf
          └──────────────────────┬───────────────────────┘
                                 ▼
 ┌───────────────────────────────────────────────────────────────────┐
 │ backend/server.js  (Express 4, cors(), express.json())            │
 │   startup: CREATE TABLE IF NOT EXISTS … + ALTER TABLE migration   │
 │   routes: /api/wheels*, /api/spins, /api/players*, /api/teams*,   │
 │           /api/matches*                                           │
 │   better-sqlite3 (synchronous) ─▶ backend/wheels.db               │
 └───────────────────────────────────────────────────────────────────┘
```

Evidence:
- React root and StrictMode. [VERIFY: frontend/src/index.js:6-11]
- Tab switch and which components each tab renders. [VERIFY: frontend/src/App.js:216-269]
- Express setup, CORS, JSON body parsing. [VERIFY: backend/server.js:6-7] [VERIFY: backend/server.js:79-80]
- One synchronous better-sqlite3 connection to `wheels.db` next to `server.js`. [VERIFY: backend/server.js:9]
- Listens on `process.env.PORT || 5000`. [VERIFY: backend/server.js:7] [VERIFY: backend/server.js:479-481]
- nginx routes `/api` to `localhost:5000` and `/` to `localhost:3000`. [VERIFY: nginx.conf:1-7] [VERIFY: nginx.conf:13-29]

## 3. Module inventory

| Module | Responsibility | Evidence |
|--------|----------------|----------|
| `backend/server.js` | Schema, migration, all REST handlers | [VERIFY: backend/server.js:11-77] |
| `backend/check_db.js` | Debug script: prints all `players` rows | [VERIFY: backend/check_db.js:1-10] |
| `App.js` | Wheel CRUD state, spin persistence, tabs, API base URL | [VERIFY: frontend/src/App.js:9-16] |
| `SpinWheel.js` | Canvas drawing, spin animation, winner selection | [VERIFY: frontend/src/components/SpinWheel.js:117-161] |
| `ItemList.js` | Add/inline-edit/remove items of the current wheel | [VERIFY: frontend/src/components/ItemList.js:3-30] |
| `Scoreboard.js` | Renders leaderboard table + recent-history list | [VERIFY: frontend/src/components/Scoreboard.js:3-48] |
| `BeerpongScoreboard.js` | Players/Teams/History/Matchmaker sub-tabs | [VERIFY: frontend/src/components/BeerpongScoreboard.js:4-8] |
| `Manual.js` | Static help text | [VERIFY: frontend/src/components/Manual.js:3-46] |

## 4. API base URL resolution

```js
let API_BASE_URL = process.env.REACT_APP_API_URL || '';
if (hostname !== 'localhost' && hostname !== '127.0.0.1') API_BASE_URL = '';
else if (!API_BASE_URL) API_BASE_URL = 'http://localhost:5000';
```
[VERIFY: frontend/src/App.js:9-16]

| Where the page is opened | Resulting base | Effect |
|--------------------------|----------------|--------|
| Any non-localhost hostname | `''` | Relative `/api/...`, served by the same origin (nginx) |
| localhost / 127.0.0.1, env var unset | `http://localhost:5000` | Cross-origin call straight to the backend; works because of `cors()` |
| localhost, `REACT_APP_API_URL` set at build | that value | — |

Non-localhost hosts always override `REACT_APP_API_URL`, so the build arg in `Dockerfile.frontend` only matters on localhost. [VERIFY: Dockerfile.frontend:9-10] [VERIFY: frontend/src/App.js:12-13] The CRA dev-server `proxy` setting also exists, but on localhost the code uses an absolute URL, so the proxy is bypassed. [VERIFY: frontend/package.json:17]

## 5. Deployment

| Item | Value | Evidence |
|------|-------|----------|
| Backend image | `node:18-alpine`, `npm start` → `node server.js`, port 5000 | [VERIFY: Dockerfile.backend:1-12] [VERIFY: backend/package.json:5-6] |
| Frontend image | Two-stage: CRA build, then `serve -s build -l 3000` | [VERIFY: Dockerfile.frontend:1-23] |
| Networking | Both services use `network_mode: host` | [VERIFY: docker-compose.yml:6] [VERIFY: docker-compose.yml:13] |
| Persistence | `./backend` bind-mounted to `/app`; `/app/node_modules` is an anonymous volume | [VERIFY: docker-compose.yml:14-16] |
| Reverse proxy | `nginx.conf` is not part of compose; it targets a host-level nginx (`server_name your-domain.com`) | [VERIFY: nginx.conf:9-11] |

Because of the bind mount, the live database is the `backend/wheels.db` file in the working tree. That file is tracked by git: it shows up in `git ls-files` and in the diffs of recent commits.

## 6. REST API surface

| Method & path | Handler lines | Used by frontend? |
|---------------|---------------|-------------------|
| `GET /api/wheels` | [VERIFY: backend/server.js:82-93] | Yes, `fetchWheels` |
| `GET /api/wheels/:id` | [VERIFY: backend/server.js:95-108] | No |
| `POST /api/wheels` | [VERIFY: backend/server.js:110-122] | Yes |
| `PUT /api/wheels/:id` | [VERIFY: backend/server.js:124-139] | No (duplicate) |
| `POST /api/wheels/:id/update` | [VERIFY: backend/server.js:141-156] | Yes [VERIFY: frontend/src/App.js:88] |
| `DELETE /api/wheels/:id` | [VERIFY: backend/server.js:158-169] | No (duplicate) |
| `POST /api/wheels/:id/delete` | [VERIFY: backend/server.js:171-182] | Yes [VERIFY: frontend/src/App.js:101] |
| `POST /api/spins` | [VERIFY: backend/server.js:185-197] | Yes |
| `GET /api/wheels/:id/history` | [VERIFY: backend/server.js:199-206] | Yes |
| `GET /api/wheels/:id/leaderboard` | [VERIFY: backend/server.js:208-221] | Yes |
| `GET /api/players` | [VERIFY: backend/server.js:224-231] | Yes |
| `POST /api/players` | [VERIFY: backend/server.js:233-246] | Yes |
| `POST /api/players/:id/win` | [VERIFY: backend/server.js:248-258] | No |
| `POST /api/players/:id/toggle-presence` | [VERIFY: backend/server.js:260-269] | Yes |
| `DELETE /api/players/:id` | [VERIFY: backend/server.js:271-279] | No (duplicate) |
| `POST /api/players/:id/delete` | [VERIFY: backend/server.js:282-290] | Yes |
| `GET /api/teams` | [VERIFY: backend/server.js:293-307] | Yes |
| `POST /api/teams` | [VERIFY: backend/server.js:309-347] | Yes, matchmaker |
| `DELETE /api/teams/:id` | [VERIFY: backend/server.js:396-405] | No (duplicate) |
| `POST /api/teams/:id/delete` | [VERIFY: backend/server.js:407-416] | Yes |
| `GET /api/matches` | [VERIFY: backend/server.js:350-368] | Yes |
| `POST /api/matches` | [VERIFY: backend/server.js:370-394] | Yes |
| `DELETE /api/matches/:id` | [VERIFY: backend/server.js:418-446] | No (duplicate) |
| `POST /api/matches/:id/delete` | [VERIFY: backend/server.js:449-477] | Yes |

The frontend calls only the POST variants for update and delete. [VERIFY: frontend/src/components/BeerpongScoreboard.js:70] [VERIFY: frontend/src/components/BeerpongScoreboard.js:81] [VERIFY: frontend/src/components/BeerpongScoreboard.js:92] Each `PUT`/`DELETE` route and its POST twin have identical bodies, so a fix to one must be copied to the other.

There is no authentication or authorization on any route. `cors()` is called with no options, which allows any origin. [VERIFY: backend/server.js:79]

## Verification checklist
- [x] Every module listed has a file reference
- [x] Route table generated from `app.(get|post|put|delete)` occurrences in `server.js`
- [x] Frontend usage taken from the axios call sites
