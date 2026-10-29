const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'wheels.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
const BACKUP_KEEP = 7;
const APP_PIN = process.env.APP_PIN || '';

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS wheels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    items TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wheel_id INTEGER NOT NULL,
    item TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wheel_id) REFERENCES wheels (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    wins INTEGER DEFAULT 0,
    is_present INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    wins INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS team_players (
    team_id INTEGER,
    player_id INTEGER,
    PRIMARY KEY (team_id, player_id),
    FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_a_id INTEGER,
    team_b_id INTEGER,
    score_a INTEGER,
    score_b INTEGER,
    winner_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_a_id) REFERENCES teams (id),
    FOREIGN KEY (team_b_id) REFERENCES teams (id),
    FOREIGN KEY (winner_id) REFERENCES teams (id)
  );

  -- An evening (or season) that matches belong to
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Small shared JSON documents (winner-stays-on queue, tournament)
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations: add columns that older databases lack
const addColumn = (table, column, definition) => {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  if (!exists) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
};
addColumn('players', 'is_present', 'INTEGER DEFAULT 1');
addColumn('players', 'emoji', 'TEXT');
addColumn('matches', 'session_id', 'INTEGER');

db.exec(`
  -- Optimization Indexes
  CREATE INDEX IF NOT EXISTS idx_spins_wheel_id ON spins(wheel_id);
  CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON matches(winner_id);
  CREATE INDEX IF NOT EXISTS idx_matches_session_id ON matches(session_id);
  CREATE INDEX IF NOT EXISTS idx_team_players_team_id ON team_players(team_id);
  CREATE INDEX IF NOT EXISTS idx_team_players_player_id ON team_players(player_id);
`);

// The first evening holds every match played before evenings existed
if (!db.prepare('SELECT 1 FROM sessions LIMIT 1').get()) {
  db.transaction(() => {
    const first = db.prepare('SELECT MIN(created_at) AS t FROM matches').get().t;
    const id = db.prepare('INSERT INTO sessions (name, started_at) VALUES (?, COALESCE(?, CURRENT_TIMESTAMP))')
      .run('Avond 1', first).lastInsertRowid;
    db.prepare('UPDATE matches SET session_id = ? WHERE session_id IS NULL').run(id);
  })();
}

const currentSession = () => db.prepare('SELECT * FROM sessions ORDER BY id DESC LIMIT 1').get();

// CORS_ORIGIN can restrict browser access to your own domain(s), comma-separated
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined));
app.use(express.json());

// Live updates: every successful change bumps this number; clients poll /api/version
let dataVersion = Date.now();
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) dataVersion++;
    });
  }
  next();
});

app.get('/api/version', (req, res) => {
  res.json({ version: dataVersion });
});

// Optional shared PIN (env APP_PIN) for deletions and starting a new evening
const failedPinAttempts = new Map();
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 60 * 1000;

const pinMatches = (pin) => {
  const a = Buffer.from(String(pin || ''));
  const b = Buffer.from(APP_PIN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const checkPin = (req, res) => {
  if (!APP_PIN) return true;
  const ip = req.ip;
  const entry = failedPinAttempts.get(ip);
  if (entry && entry.count >= PIN_MAX_FAILS && Date.now() - entry.last < PIN_LOCK_MS) {
    res.status(429).json({ error: 'Te veel foute pogingen, probeer het over een minuut opnieuw', pin_required: true });
    return false;
  }
  if (pinMatches(req.get('x-app-pin'))) {
    failedPinAttempts.delete(ip);
    return true;
  }
  if (req.get('x-app-pin')) {
    const count = entry && Date.now() - entry.last < PIN_LOCK_MS ? entry.count + 1 : 1;
    failedPinAttempts.set(ip, { count, last: Date.now() });
  }
  res.status(401).json({ error: 'Onjuist of ontbrekend wachtwoord', pin_required: true });
  return false;
};

const requirePin = (req, res, next) => {
  if (checkPin(req, res)) next();
};

app.get('/api/auth', (req, res) => {
  res.json({ pin_required: !!APP_PIN });
});

app.post('/api/auth/check', (req, res) => {
  if (checkPin(req, res)) res.json({ ok: true });
});

// Wheels API
app.get('/api/wheels', (req, res) => {
  try {
    const wheels = db.prepare('SELECT * FROM wheels ORDER BY created_at DESC, id DESC').all();
    const parsed = wheels.map(w => ({
      ...w,
      items: JSON.parse(w.items)
    }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wheels/:id', (req, res) => {
  try {
    const wheel = db.prepare('SELECT * FROM wheels WHERE id = ?').get(req.params.id);
    if (!wheel) {
      return res.status(404).json({ error: 'Wheel not found' });
    }
    res.json({
      ...wheel,
      items: JSON.parse(wheel.items)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Items are strings (weight 1) or { label, weight }
const validItems = (items) => Array.isArray(items) && items.every(item =>
  (typeof item === 'string' && item.trim()) ||
  (item && typeof item.label === 'string' && item.label.trim() &&
    Number.isInteger(item.weight) && item.weight >= 1 && item.weight <= 10)
);

app.post('/api/wheels', (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name || !validItems(items)) {
      return res.status(400).json({ error: 'Invalid request: name and items required' });
    }
    const stmt = db.prepare('INSERT INTO wheels (name, items) VALUES (?, ?)');
    const result = stmt.run(name, JSON.stringify(items));
    const wheel = db.prepare('SELECT * FROM wheels WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ...wheel, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const updateWheel = (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name || !validItems(items)) {
      return res.status(400).json({ error: 'Invalid request: name and items required' });
    }
    const stmt = db.prepare('UPDATE wheels SET name = ?, items = ? WHERE id = ?');
    const result = stmt.run(name, JSON.stringify(items), req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Wheel not found' });
    }
    const wheel = db.prepare('SELECT * FROM wheels WHERE id = ?').get(req.params.id);
    res.json({ ...wheel, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteWheel = (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM wheels WHERE id = ?');
    const result = stmt.run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Wheel not found' });
    }
    res.json({ message: 'Wheel deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST variants are kept as fallbacks for clients that cannot send PUT/DELETE
app.put('/api/wheels/:id', updateWheel);
app.post('/api/wheels/:id/update', updateWheel);
app.delete('/api/wheels/:id', requirePin, deleteWheel);
app.post('/api/wheels/:id/delete', requirePin, deleteWheel);

// Spin API
app.post('/api/spins', (req, res) => {
  try {
    const { wheel_id, item } = req.body;
    if (!wheel_id || !item) {
      return res.status(400).json({ error: 'wheel_id and item are required' });
    }
    const stmt = db.prepare('INSERT INTO spins (wheel_id, item) VALUES (?, ?)');
    const result = stmt.run(wheel_id, item);
    res.json({ id: result.lastInsertRowid, wheel_id, item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wheels/:id/history', (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM spins WHERE wheel_id = ? ORDER BY created_at DESC, id DESC LIMIT 20').all(req.params.id);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wheels/:id/leaderboard', (req, res) => {
  try {
    const leaderboard = db.prepare(`
      SELECT item, COUNT(*) as wins
      FROM spins
      WHERE wheel_id = ?
      GROUP BY item
      ORDER BY wins DESC
    `).all(req.params.id);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Beerpong statistics
// Everything is derived from the matches table on read, so it can never drift
// from the match history. The legacy players.wins/teams.wins columns are unused.
const ELO_START = 1000;
const ELO_K = 32;

const expectedScore = (rating, opponent) => 1 / (1 + Math.pow(10, (opponent - rating) / 400));

const computeStats = () => {
  const players = db.prepare('SELECT id, name, emoji, is_present, updated_at FROM players').all();
  const teams = db.prepare('SELECT id, name, created_at FROM teams').all();
  const links = db.prepare('SELECT team_id, player_id FROM team_players').all();
  const matches = db.prepare('SELECT * FROM matches ORDER BY created_at ASC, id ASC').all();
  const session = currentSession();

  const membersOf = new Map(teams.map(t => [t.id, []]));
  for (const l of links) membersOf.get(l.team_id)?.push(l.player_id);

  const blank = () => ({ wins: 0, played: 0, tonight_wins: 0, tonight_played: 0, rating: ELO_START, streak: 0 });
  const playerStats = new Map(players.map(p => [p.id, blank()]));
  const teamStats = new Map(teams.map(t => [t.id, blank()]));

  const record = (stats, won, tonight) => {
    stats.played++;
    if (won) stats.wins++;
    if (tonight) {
      stats.tonight_played++;
      if (won) stats.tonight_wins++;
    }
    // Positive streak = consecutive wins, negative = consecutive losses
    stats.streak = won ? Math.max(stats.streak, 0) + 1 : Math.min(stats.streak, 0) - 1;
  };

  for (const m of matches) {
    const teamA = teamStats.get(m.team_a_id);
    const teamB = teamStats.get(m.team_b_id);
    if (!teamA || !teamB) continue;
    const aWon = m.winner_id === m.team_a_id;
    const tonight = !!session && m.session_id === session.id;

    // Team Elo
    const expA = expectedScore(teamA.rating, teamB.rating);
    const teamDelta = ELO_K * ((aWon ? 1 : 0) - expA);
    teamA.rating += teamDelta;
    teamB.rating -= teamDelta;
    record(teamA, aWon, tonight);
    record(teamB, !aWon, tonight);

    // Player Elo: a duo plays at its members' average rating, both members move by the same amount
    const sideA = (membersOf.get(m.team_a_id) || []).map(id => playerStats.get(id)).filter(Boolean);
    const sideB = (membersOf.get(m.team_b_id) || []).map(id => playerStats.get(id)).filter(Boolean);
    if (sideA.length && sideB.length) {
      const avg = (side) => side.reduce((sum, s) => sum + s.rating, 0) / side.length;
      const expPlayersA = expectedScore(avg(sideA), avg(sideB));
      const playerDelta = ELO_K * ((aWon ? 1 : 0) - expPlayersA);
      sideA.forEach(s => { s.rating += playerDelta; });
      sideB.forEach(s => { s.rating -= playerDelta; });
    }
    sideA.forEach(s => record(s, aWon, tonight));
    sideB.forEach(s => record(s, !aWon, tonight));
  }

  const round = (s) => ({ ...s, rating: Math.round(s.rating) });
  const byRating = (a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name);
  const nameOf = new Map(players.map(p => [p.id, p.name]));

  return {
    players: players.map(p => ({ ...p, ...round(playerStats.get(p.id)) })).sort(byRating),
    teams: teams.map(t => ({
      ...t,
      members: membersOf.get(t.id).map(id => nameOf.get(id)).sort().join(' & ') || null,
      player_ids: membersOf.get(t.id),
      ...round(teamStats.get(t.id))
    })).sort(byRating)
  };
};

app.get('/api/players', (req, res) => {
  try {
    res.json(computeStats().players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Partners and opponents of one player, for the head-to-head view
app.get('/api/players/:id/stats', (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const player = db.prepare('SELECT id, name, emoji FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const membersOf = new Map();
    for (const l of db.prepare('SELECT team_id, player_id FROM team_players').all()) {
      if (!membersOf.has(l.team_id)) membersOf.set(l.team_id, []);
      membersOf.get(l.team_id).push(l.player_id);
    }
    const people = new Map(db.prepare('SELECT id, name, emoji FROM players').all().map(p => [p.id, p]));

    const partners = new Map();
    const opponents = new Map();
    const bump = (map, id, won) => {
      if (!people.has(id)) return;
      const entry = map.get(id) || { ...people.get(id), played: 0, wins: 0 };
      entry.played++;
      if (won) entry.wins++;
      map.set(id, entry);
    };

    for (const m of db.prepare('SELECT * FROM matches').all()) {
      const a = membersOf.get(m.team_a_id) || [];
      const b = membersOf.get(m.team_b_id) || [];
      const mine = a.includes(playerId) ? a : b.includes(playerId) ? b : null;
      if (!mine) continue;
      const theirs = mine === a ? b : a;
      const won = m.winner_id === (mine === a ? m.team_a_id : m.team_b_id);
      mine.filter(id => id !== playerId).forEach(id => bump(partners, id, won));
      theirs.forEach(id => bump(opponents, id, won));
    }

    const list = (map) => [...map.values()].sort((x, y) => y.played - x.played || y.wins - x.wins);
    res.json({ player, partners: list(partners), opponents: list(opponents) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players', (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const emoji = typeof req.body.emoji === 'string' && req.body.emoji ? req.body.emoji.slice(0, 8) : null;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const stmt = db.prepare('INSERT INTO players (name, emoji) VALUES (?, ?)');
    const result = stmt.run(name, emoji);
    res.json({ id: result.lastInsertRowid, name, emoji, wins: 0, played: 0, is_present: 1, rating: ELO_START });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Player already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players/:id/toggle-presence', (req, res) => {
  try {
    const { is_present } = req.body;
    const stmt = db.prepare('UPDATE players SET is_present = ? WHERE id = ?');
    const result = stmt.run(is_present ? 1 : 0, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players/:id/emoji', (req, res) => {
  try {
    const emoji = typeof req.body.emoji === 'string' && req.body.emoji ? req.body.emoji.slice(0, 8) : null;
    const result = db.prepare('UPDATE players SET emoji = ? WHERE id = ?').run(emoji, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    res.json({ success: true, emoji });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const deletePlayer = (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM players WHERE id = ?');
    const result = stmt.run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    res.json({ message: 'Player deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.delete('/api/players/:id', requirePin, deletePlayer);
app.post('/api/players/:id/delete', requirePin, deletePlayer);

// Teams API
app.get('/api/teams', (req, res) => {
  try {
    res.json(computeStats().teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Find-or-create by name. An existing team is always re-linked to the given players,
// so a player who was deleted and re-added gets their team back.
app.post('/api/teams', (req, res) => {
  const { name, player_ids } = req.body;
  if (!name || !Array.isArray(player_ids) || !player_ids.length) {
    return res.status(400).json({ error: 'Name and players are required' });
  }

  try {
    const transaction = db.transaction(() => {
      const existingTeam = db.prepare('SELECT id FROM teams WHERE name = ?').get(name);
      const teamId = existingTeam
        ? existingTeam.id
        : db.prepare('INSERT INTO teams (name) VALUES (?)').run(name).lastInsertRowid;

      db.prepare('DELETE FROM team_players WHERE team_id = ?').run(teamId);
      const playerStmt = db.prepare('INSERT INTO team_players (team_id, player_id) VALUES (?, ?)');
      for (const playerId of player_ids) {
        playerStmt.run(teamId, playerId);
      }
      return Number(teamId);
    });

    const teamId = transaction();
    res.json(computeStats().teams.find(t => t.id === teamId));
  } catch (error) {
    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(400).json({ error: 'Een van de spelers bestaat niet meer' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Deleting a team also deletes its matches; matches reference teams, so the team
// row cannot be removed while they exist.
const deleteTeam = (req, res) => {
  try {
    const transaction = db.transaction(() => {
      const deletedMatches = db.prepare(
        'DELETE FROM matches WHERE team_a_id = ? OR team_b_id = ? OR winner_id = ?'
      ).run(req.params.id, req.params.id, req.params.id).changes;
      const deletedTeams = db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id).changes;
      return { deletedTeams, deletedMatches };
    });

    const { deletedTeams, deletedMatches } = transaction();
    if (deletedTeams === 0) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team deleted', deleted_matches: deletedMatches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.delete('/api/teams/:id', requirePin, deleteTeam);
app.post('/api/teams/:id/delete', requirePin, deleteTeam);

// Sessions (evenings) API
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT s.*, (SELECT COUNT(*) FROM matches m WHERE m.session_id = s.id) AS matches
      FROM sessions s ORDER BY s.id DESC
    `).all();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Starting a new evening marks everyone absent (people check in again) and
// clears the shared queue and tournament
app.post('/api/sessions', requirePin, (req, res) => {
  try {
    const session = db.transaction(() => {
      const count = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
      const name = typeof req.body.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : `Avond ${count + 1}`;
      const id = db.prepare('INSERT INTO sessions (name) VALUES (?)').run(name).lastInsertRowid;
      db.prepare('UPDATE players SET is_present = 0').run();
      db.prepare("DELETE FROM app_state WHERE key IN ('queue', 'tournament')").run();
      return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    })();
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Matches API
app.get('/api/matches', (req, res) => {
  try {
    const matches = db.prepare(`
      SELECT m.*,
             COALESCE(ta.name, 'Verwijderd Team') as team_a_name,
             COALESCE(tb.name, 'Verwijderd Team') as team_b_name,
             COALESCE(w.name, 'Onbekend') as winner_name
      FROM matches m
      LEFT JOIN teams ta ON m.team_a_id = ta.id
      LEFT JOIN teams tb ON m.team_b_id = tb.id
      LEFT JOIN teams w ON m.winner_id = w.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 200
    `).all();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The winner is derived from the scores here; a client-sent winner_id is ignored.
app.post('/api/matches', (req, res) => {
  const teamA = Number(req.body.team_a_id);
  const teamB = Number(req.body.team_b_id);
  // Number('') and Number(null) are 0, so empty inputs must be rejected before converting
  const toScore = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const scoreA = toScore(req.body.score_a);
  const scoreB = toScore(req.body.score_b);

  if (!Number.isInteger(teamA) || !Number.isInteger(teamB) || teamA === teamB) {
    return res.status(400).json({ error: 'Kies twee verschillende teams' });
  }
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return res.status(400).json({ error: 'Vul voor beide teams een geldige score in' });
  }
  if (scoreA === scoreB) {
    return res.status(400).json({ error: 'Gelijkspel is niet mogelijk' });
  }

  const winnerId = scoreA > scoreB ? teamA : teamB;
  try {
    const result = db.prepare(
      'INSERT INTO matches (team_a_id, team_b_id, score_a, score_b, winner_id, session_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(teamA, teamB, scoreA, scoreB, winnerId, currentSession().id);
    res.json({ message: 'Match recorded', id: Number(result.lastInsertRowid), winner_id: winnerId });
  } catch (error) {
    if (error.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(400).json({ error: 'Een van de teams bestaat niet meer' });
    }
    res.status(500).json({ error: error.message });
  }
});

const deleteMatch = (req, res) => {
  try {
    const result = db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Match not found' });
    res.json({ message: 'Match deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.delete('/api/matches/:id', requirePin, deleteMatch);
app.post('/api/matches/:id/delete', requirePin, deleteMatch);

// Shared state API: whole-document get/put, last write wins
const STATE_KEYS = ['queue', 'tournament'];

app.get('/api/state/:key', (req, res) => {
  if (!STATE_KEYS.includes(req.params.key)) return res.status(404).json({ error: 'Unknown state' });
  try {
    const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(req.params.key);
    res.json({ value: row ? JSON.parse(row.value) : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const putState = (req, res) => {
  if (!STATE_KEYS.includes(req.params.key)) return res.status(404).json({ error: 'Unknown state' });
  try {
    const { value } = req.body;
    if (value === null || value === undefined) {
      db.prepare('DELETE FROM app_state WHERE key = ?').run(req.params.key);
    } else {
      db.prepare(`
        INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(req.params.key, JSON.stringify(value));
    }
    res.json({ value: value ?? null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

app.put('/api/state/:key', putState);
app.post('/api/state/:key', putState);

// Daily backups next to the database, keeping the newest BACKUP_KEEP files
const runBackup = async () => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await db.backup(path.join(BACKUP_DIR, `wheels-${stamp}.db`));
    fs.readdirSync(BACKUP_DIR)
      .filter(f => /^wheels-.*\.db$/.test(f))
      .sort()
      .slice(0, -BACKUP_KEEP)
      .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch (error) {
    console.error('Backup failed:', error.message);
  }
};

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}${APP_PIN ? ' (PIN enabled)' : ''}`);
  });
  if (process.env.BACKUPS !== 'off') {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }
}

module.exports = { app, db, runBackup };
