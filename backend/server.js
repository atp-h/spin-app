const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

const db = new Database(path.join(__dirname, 'wheels.db'));

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
`);

// Migration: Add is_present column if it doesn't exist
try {
  db.prepare("ALTER TABLE players ADD COLUMN is_present INTEGER DEFAULT 1").run();
} catch (e) {
  // Column already exists, ignore error
}

db.exec(`
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

  -- Optimization Indexes
  CREATE INDEX IF NOT EXISTS idx_spins_wheel_id ON spins(wheel_id);
  CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON matches(winner_id);
  CREATE INDEX IF NOT EXISTS idx_team_players_team_id ON team_players(team_id);
  CREATE INDEX IF NOT EXISTS idx_team_players_player_id ON team_players(player_id);
`);

app.use(cors());
app.use(express.json());

app.get('/api/wheels', (req, res) => {
  try {
    const wheels = db.prepare('SELECT * FROM wheels ORDER BY created_at DESC').all();
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

app.post('/api/wheels', (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid request: name and items required' });
    }
    const stmt = db.prepare('INSERT INTO wheels (name, items) VALUES (?, ?)');
    const result = stmt.run(name, JSON.stringify(items));
    res.json({ id: result.lastInsertRowid, name, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/wheels/:id', (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid request: name and items required' });
    }
    const stmt = db.prepare('UPDATE wheels SET name = ?, items = ? WHERE id = ?');
    const result = stmt.run(name, JSON.stringify(items), req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Wheel not found' });
    }
    res.json({ id: parseInt(req.params.id), name, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wheels/:id/update', (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid request: name and items required' });
    }
    const stmt = db.prepare('UPDATE wheels SET name = ?, items = ? WHERE id = ?');
    const result = stmt.run(name, JSON.stringify(items), req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Wheel not found' });
    }
    res.json({ id: parseInt(req.params.id), name, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/wheels/:id', (req, res) => {
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
});

app.post('/api/wheels/:id/delete', (req, res) => {
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
});

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
    const history = db.prepare('SELECT * FROM spins WHERE wheel_id = ? ORDER BY created_at DESC LIMIT 20').all(req.params.id);
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

// Beerpong Leaderboard API
app.get('/api/players', (req, res) => {
  try {
    const players = db.prepare('SELECT * FROM players ORDER BY wins DESC, name ASC').all();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const stmt = db.prepare('INSERT INTO players (name) VALUES (?)');
    const result = stmt.run(name);
    res.json({ id: result.lastInsertRowid, name, wins: 0 });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Player already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players/:id/win', (req, res) => {
  try {
    const stmt = db.prepare('UPDATE players SET wins = wins + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const result = stmt.run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Player not found' });
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/players/:id/toggle-presence', (req, res) => {
  try {
    const { is_present } = req.body;
    const stmt = db.prepare('UPDATE players SET is_present = ? WHERE id = ?');
    stmt.run(is_present ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/players/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM players WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ message: 'Player deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Post-based delete fallback
app.post('/api/players/:id/delete', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM players WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ message: 'Player deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Teams API
app.get('/api/teams', (req, res) => {
  try {
    const teams = db.prepare(`
      SELECT t.*, GROUP_CONCAT(p.name, ' & ') as members 
      FROM teams t
      LEFT JOIN team_players tp ON t.id = tp.team_id
      LEFT JOIN players p ON tp.player_id = p.id
      GROUP BY t.id
      ORDER BY t.wins DESC, t.name ASC
    `).all();
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teams', (req, res) => {
  const { name, player_ids } = req.body;
  if (!name || !player_ids || !player_ids.length) {
    return res.status(400).json({ error: 'Name and players are required' });
  }
  
  try {
    const transaction = db.transaction(() => {
      let teamId;
      const existingTeam = db.prepare('SELECT id FROM teams WHERE name = ?').get(name);
      
      if (existingTeam) {
        teamId = existingTeam.id;
        // Zorg dat de spelers gelinkt zijn (indien ze her-aangemaakt zijn met andere IDs)
        db.prepare('DELETE FROM team_players WHERE team_id = ?').run(teamId);
        const playerStmt = db.prepare('INSERT INTO team_players (team_id, player_id) VALUES (?, ?)');
        for (const playerId of player_ids) {
          playerStmt.run(teamId, playerId);
        }
      } else {
        const stmt = db.prepare('INSERT INTO teams (name) VALUES (?)');
        const result = stmt.run(name);
        teamId = result.lastInsertRowid;
        
        const playerStmt = db.prepare('INSERT INTO team_players (team_id, player_id) VALUES (?, ?)');
        for (const playerId of player_ids) {
          playerStmt.run(teamId, playerId);
        }
      }
      return teamId;
    });

    const teamId = transaction();
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
    res.json(team);
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
      ORDER BY m.created_at DESC
      LIMIT 100
    `).all();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/matches', (req, res) => {
  const { team_a_id, team_b_id, score_a, score_b, winner_id } = req.body;
  
  const transaction = db.transaction(() => {
    const stmt = db.prepare('INSERT INTO matches (team_a_id, team_b_id, score_a, score_b, winner_id) VALUES (?, ?, ?, ?, ?)');
    stmt.run(team_a_id, team_b_id, score_a, score_b, winner_id);
    
    // Update team wins
    db.prepare('UPDATE teams SET wins = wins + 1 WHERE id = ?').run(winner_id);
    
    // Update individual player wins in that team
    db.prepare(`
      UPDATE players 
      SET wins = wins + 1 
      WHERE id IN (SELECT player_id FROM team_players WHERE team_id = ?)
    `).run(winner_id);
  });

  try {
    transaction();
    res.json({ message: 'Match recorded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/teams/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM teams WHERE id = ?');
    const result = stmt.run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/teams/:id/delete', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM teams WHERE id = ?');
    const result = stmt.run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/matches/:id', (req, res) => {
  try {
    const transaction = db.transaction(() => {
      const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
      if (!match) return false;

      // Decrement wins from winning team
      db.prepare('UPDATE teams SET wins = MAX(0, wins - 1) WHERE id = ?').run(match.winner_id);
      
      // Decrement wins from winning players
      db.prepare(`
        UPDATE players 
        SET wins = MAX(0, wins - 1) 
        WHERE id IN (SELECT player_id FROM team_players WHERE team_id = ?)
      `).run(match.winner_id);

      db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
      return true;
    });

    if (transaction()) {
      res.json({ message: 'Match deleted and wins updated' });
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Post-based delete fallback
app.post('/api/matches/:id/delete', (req, res) => {
  try {
    const transaction = db.transaction(() => {
      const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
      if (!match) return false;

      // Decrement wins from winning team
      db.prepare('UPDATE teams SET wins = MAX(0, wins - 1) WHERE id = ?').run(match.winner_id);
      
      // Decrement wins from winning players
      db.prepare(`
        UPDATE players 
        SET wins = MAX(0, wins - 1) 
        WHERE id IN (SELECT player_id FROM team_players WHERE team_id = ?)
      `).run(match.winner_id);

      db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
      return true;
    });

    if (transaction()) {
      res.json({ message: 'Match deleted and wins updated' });
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
