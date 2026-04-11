# Spin The Wheel & Beerpong Hub

Interactive spin-the-wheel web application and Beerpong competition manager with React frontend and Node.js backend.

## 🌟 Features

### 🎡 Spin The Wheel
- **Wheel Management**: Create, edit, and delete multiple custom wheels.
- **Visual Animation**: Smooth Canvas-based spin animation with easing.
- **Spin History**: Automatic recording of every spin result.
- **Leaderboards**: Track which items win most frequently per wheel.

### 🍺 Beerpong Competition
- **Player Management**: Track individual player wins across all games.
- **Attendance System**: Toggle who is present for the night. Afraid of ghost players? Only "present" players appear in the Matchmaker.
- **Team Management**: Form Duo teams (2 players). The app intelligently tracks stats for unique combinations.
- **Match History**: Record full game results (e.g., 10 - 8).
- **🎲 Duo Matchmaker**: 
  - Manually pick 4 present players for a match.
  - **Random Shuffle**: Let the app randomly split 4 present players into two fair duos.
  - Quick result entry immediately after drawing.

## 🛠 Tech Stack
- **Frontend**: React.js, Vanilla CSS.
- **Backend**: Node.js, Express.
- **Database**: SQLite (`better-sqlite3`) with performance indexing.
- **Containerization**: Docker & Docker Compose.

## 📁 Project Structure

```
spin-app/
├── frontend/           # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── SpinWheel.js          # Canvas wheel logic
│   │   │   ├── BeerpongScoreboard.js # Competition manager
│   │   │   ├── ItemList.js           # Wheel items editor
│   │   │   └── Scoreboard.js         # Spin results
│   │   ├── App.js                    # Main layout & Routing
│   │   └── App.css                   # Global styling
├── backend/            # Express API server
│   ├── server.js       # API endpoints & DB schema
│   └── wheels.db       # SQLite Database
├── Dockerfile.frontend
├── Dockerfile.backend
├── docker-compose.yml
└── README.md
```

## 🚀 Getting Started

### Using Docker (Recommended)

1. Clone the repository.
2. Build and start the containers:
   ```bash
   docker-compose up --build -d
   ```
3. Open http://localhost in your browser.

### Local Development (without Docker)

1. **Backend**:
   ```bash
   cd backend
   npm install
   npm start
   ```
2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## 🔌 API Endpoints

### Wheels & Spins
- `GET /api/wheels`: List all wheels.
- `POST /api/wheels`: Create a new wheel.
- `GET /api/wheels/:id/history`: Get spin history for a wheel.
- `GET /api/wheels/:id/leaderboard`: Get win counts per item.

### Beerpong Competition
- `GET /api/players`: List all players.
- `POST /api/players`: Add a new player.
- `POST /api/players/:id/toggle-presence`: Toggle if a player is attending.
- `GET /api/teams`: List all teams and their members.
- `POST /api/matches`: Record a game result (updates team and player wins).
- `DELETE /api/matches/:id`: Remove a match from history.

## 🛡 License
MIT
