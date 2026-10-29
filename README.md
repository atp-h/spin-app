# Spin The Wheel & Beerpong Hub

Interactive spin-the-wheel web application and Beerpong competition manager with React frontend and Node.js backend. Built for a group of friends on their phones: everything syncs live between devices.

## 🌟 Features

### 🎡 Spin The Wheel
- **Multiple wheels**, picked from chips at the top: create, rename, duplicate, delete (with undo).
- **Canvas wheel** with rim lights, a ticking pointer, sound, confetti and a random 4–9 s spin.
- **Weighted items**: give an item ×2…×5 the chance (its slice grows too).
- **Bulk paste** a list of items, or **fill the wheel with tonight's present players**.
- **Elimination mode** ("Afvalrace"): the winner leaves the wheel after each spin.
- **Party mode**: a fullscreen wheel for a TV or tablet.
- **History & leaderboard** per wheel.

### 🍺 Beerpong
- **Players** with emoji avatars and a presence switch. **Evenings**: start a new evening to reset presence and tonight's standings.
- **Standings** for players or duos, tonight or all-time, with **Elo ratings**, win streaks, and highlights (best duo, on fire). Tap a player for best partner and nemesis.
- **Play modes**
  - ⚡ **Quick match**: pick four players, or let the wheel **spin for teams**.
  - 👑 **Winner stays on**: a shared queue; the winner keeps the table, the loser goes to the back.
  - 🏆 **Tournament**: random duos from present players in a knock-out bracket (byes handled).
- **History** grouped per evening; matches can also be entered by hand. Ties are rejected and the winner is derived from the score.

### 📱 App
- Bottom tab bar on phones, two-column wheel page on desktop.
- **Live updates**: changes from other phones appear within ~4 seconds.
- **Optional PIN** for deleting and for starting a new evening.
- **Installable (PWA)**: add to home screen; the app shell works offline.
- **Daily database backups** (last 7 kept).

## 🛠 Tech Stack
- **Frontend**: React 18 (Create React App), plain CSS.
- **Backend**: Node.js, Express, SQLite (`better-sqlite3`).
- **Containerization**: Docker & Docker Compose.

## 📁 Project Structure

```
spin-app/
├── frontend/
│   ├── public/                  # index.html, manifest.json, service-worker.js, icons
│   └── src/
│       ├── App.js               # Shell: header, navigation, PIN prompt, toasts
│       ├── api.js               # API base URL + PIN header
│       ├── hooks.js             # Live-update polling, app context
│       ├── components/
│       │   ├── WheelPage.js     # Wheel chips, editor, elimination, party mode
│       │   ├── SpinWheel.js     # Canvas wheel, weighted spin, sound
│       │   ├── ItemList.js      # Item editor (bulk paste, weights)
│       │   ├── BeerpongScoreboard.js  # Loads beerpong data, sub-tabs
│       │   └── beerpong/        # PlayTab, StandingsTab, PlayersTab, HistoryTab, TeamDraw, logic.js
│       ├── __tests__/           # Component and logic tests
│       └── testServer.js        # In-memory fake API used by the tests
├── backend/
│   ├── server.js                # Schema, migrations, API, Elo, backups
│   ├── test/api.test.js         # API tests (node:test)
│   ├── wheels.db                # SQLite database (live data, not for git)
│   └── backups/                 # Daily backups
├── Dockerfile.frontend / Dockerfile.backend / docker-compose.yml
└── nginx.conf                   # Example reverse proxy
```

## 🚀 Getting Started

### Using Docker (Recommended)

1. Optionally create a `.env` file next to `docker-compose.yml`:
   ```bash
   APP_PIN=1234                       # PIN for deleting / starting a new evening (leave out for none)
   CORS_ORIGIN=https://your-domain.com # restrict API access to your site (leave out to allow all)
   ```
2. Build and start the containers:
   ```bash
   docker compose up --build -d
   ```
3. Open http://localhost in your browser (via the nginx config), or http://localhost:3000 directly.

> Installing the app on a phone (PWA) requires the site to be served over **HTTPS** (or `localhost`).

### Local Development (without Docker)

```bash
npm run install:all
npm run dev          # backend on :5000, frontend on :3000
```

### Tests

```bash
cd backend && npm test       # API tests on a throwaway database
cd frontend && npm test      # component and logic tests
```

## ⚙️ Configuration (backend environment)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5000` | API port |
| `DB_PATH` | `backend/wheels.db` | SQLite file |
| `APP_PIN` | *(none)* | PIN for deletions and new evenings |
| `CORS_ORIGIN` | *(allow all)* | Comma-separated allowed origins |
| `BACKUP_DIR` | `<db dir>/backups` | Where daily backups go |
| `BACKUPS` | on | Set to `off` to disable backups |

## 🔌 API Endpoints

### Wheels & Spins
- `GET /api/wheels` · `POST /api/wheels` · `POST /api/wheels/:id/update` · `POST /api/wheels/:id/delete` 🔒
- Items are strings or `{ "label": "Pizza", "weight": 2 }` (weight 1–10).
- `POST /api/spins` · `GET /api/wheels/:id/history` · `GET /api/wheels/:id/leaderboard`

### Beerpong
- `GET /api/players`: players with `wins`, `played`, `tonight_wins`, `tonight_played`, `rating` (Elo), `streak`.
- `POST /api/players` · `POST /api/players/:id/toggle-presence` · `POST /api/players/:id/emoji` · `POST /api/players/:id/delete` 🔒
- `GET /api/players/:id/stats`: partners and opponents (head-to-head).
- `GET /api/teams` · `POST /api/teams` (find or create by name) · `POST /api/teams/:id/delete` 🔒 (also deletes its matches)
- `GET /api/matches` · `POST /api/matches` (winner derived from the score; ties rejected) · `POST /api/matches/:id/delete` 🔒
- `GET /api/sessions` · `POST /api/sessions` 🔒: start a new evening (marks everyone absent, clears queue/tournament).
- `GET /api/state/:key` · `PUT /api/state/:key`: shared `queue` and `tournament` documents.

### App
- `GET /api/version`: change counter for live updates.
- `GET /api/auth` · `POST /api/auth/check`: PIN status and check (send the PIN as `X-App-Pin`).

🔒 = requires the PIN when `APP_PIN` is set. Every `POST …/update` and `POST …/delete` route also exists as `PUT` / `DELETE`.

## 🛡 License
MIT
