const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'wheels.db'));

try {
  const players = db.prepare('SELECT * FROM players').all();
  console.log('Players in DB:', JSON.stringify(players, null, 2));
} catch (e) {
  console.error('Error reading players:', e.message);
}
