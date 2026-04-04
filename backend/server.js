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
  )
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
