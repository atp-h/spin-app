// API tests: run with `npm test` in backend/. Uses a throwaway database and PIN 1234.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spin-app-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.APP_PIN = '1234';

const { app, db, runBackup } = require('../server');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const call = async (method, url, body, pin) => {
  const headers = { 'Content-Type': 'application/json' };
  if (pin) headers['X-App-Pin'] = pin;
  const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};

const ids = {};
const teams = {};

test('players: create, reject duplicates, emoji', async () => {
  for (const name of ['Ann', 'Bob', 'Cas', 'Dirk']) {
    ids[name] = (await call('POST', '/players', { name })).data.id;
  }
  assert.equal((await call('POST', '/players', { name: '  Ann ' })).status, 400);
  assert.equal((await call('POST', `/players/${ids.Ann}/emoji`, { emoji: '🦄' })).status, 200);
  const ann = (await call('GET', '/players')).data.find(p => p.id === ids.Ann);
  assert.equal(ann.emoji, '🦄');
  assert.equal(ann.rating, 1000);
});

test('teams: find-or-create', async () => {
  teams.AB = (await call('POST', '/teams', { name: 'Ann & Bob', player_ids: [ids.Ann, ids.Bob] })).data;
  teams.CD = (await call('POST', '/teams', { name: 'Cas & Dirk', player_ids: [ids.Cas, ids.Dirk] })).data;
  assert.deepEqual([teams.AB.wins, teams.AB.played, teams.AB.members], [0, 0, 'Ann & Bob']);
  const again = (await call('POST', '/teams', { name: 'Ann & Bob', player_ids: [ids.Ann, ids.Bob] })).data;
  assert.equal(again.id, teams.AB.id);
});

test('matches: validation', async () => {
  const bad = [
    { score_a: 5, score_b: 5 },
    { score_a: null, score_b: 3 },
    { score_a: '', score_b: 3 },
    { score_a: -1, score_b: 3 },
    { score_a: 2.5, score_b: 3 }
  ];
  for (const scores of bad) {
    const r = await call('POST', '/matches', { team_a_id: teams.AB.id, team_b_id: teams.CD.id, ...scores });
    assert.equal(r.status, 400, JSON.stringify(scores));
  }
  assert.equal((await call('POST', '/matches', { team_a_id: teams.AB.id, team_b_id: teams.AB.id, score_a: 5, score_b: 3 })).status, 400);
  assert.equal((await call('POST', '/matches', { team_a_id: teams.AB.id, team_b_id: 999999, score_a: 5, score_b: 3 })).status, 400);
});

test('matches: winner derived from score; stats, Elo, streaks', async () => {
  const r = await call('POST', '/matches', {
    team_a_id: String(teams.AB.id), team_b_id: String(teams.CD.id), score_a: '10', score_b: '8', winner_id: teams.CD.id
  });
  assert.equal(r.data.winner_id, teams.AB.id);
  await call('POST', '/matches', { team_a_id: teams.AB.id, team_b_id: teams.CD.id, score_a: 3, score_b: 10 });
  await call('POST', '/matches', { team_a_id: teams.AB.id, team_b_id: teams.CD.id, score_a: 10, score_b: 2 });

  const allTeams = (await call('GET', '/teams')).data;
  const ab = allTeams.find(t => t.id === teams.AB.id);
  const cd = allTeams.find(t => t.id === teams.CD.id);
  assert.deepEqual([ab.wins, ab.played, cd.wins, cd.played], [2, 3, 1, 3]);
  assert.equal(ab.rating + cd.rating, 2000, 'team Elo is zero-sum');
  assert.ok(ab.rating > 1000);
  assert.equal(ab.streak, 1);
  assert.equal(cd.streak, -1);
  assert.equal(allTeams[0].id, teams.AB.id, 'sorted by rating');

  const players = (await call('GET', '/players')).data;
  const ann = players.find(p => p.id === ids.Ann);
  assert.deepEqual([ann.wins, ann.played, ann.tonight_wins, ann.tonight_played], [2, 3, 2, 3]);
});

test('head-to-head stats', async () => {
  const { data } = await call('GET', `/players/${ids.Ann}/stats`);
  assert.deepEqual(data.partners.map(p => [p.name, p.played, p.wins]), [['Bob', 3, 2]]);
  assert.deepEqual(data.opponents.map(p => [p.name, p.played, p.wins]).sort(), [['Cas', 3, 2], ['Dirk', 3, 2]]);
});

test('PIN: deletions need the PIN; wrong PIN is rejected', async () => {
  assert.deepEqual((await call('GET', '/auth')).data, { pin_required: true });
  assert.equal((await call('POST', '/auth/check', {}, '0000')).status, 401);
  assert.equal((await call('POST', '/auth/check', {}, '1234')).status, 200);

  const match = (await call('GET', '/matches')).data[0];
  assert.equal((await call('POST', `/matches/${match.id}/delete`)).status, 401);
  assert.equal((await call('POST', `/matches/${match.id}/delete`, {}, '1234')).status, 200);
  assert.equal((await call('POST', `/matches/${match.id}/delete`, {}, '1234')).status, 404);
  const ab = (await call('GET', '/teams')).data.find(t => t.id === teams.AB.id);
  assert.equal(ab.played, 2, 'stats recomputed after delete');
});

test('re-added player is re-linked to their team', async () => {
  await call('POST', `/players/${ids.Bob}/delete`, {}, '1234');
  const bob2 = (await call('POST', '/players', { name: 'Bob' })).data.id;
  const team = (await call('POST', '/teams', { name: 'Ann & Bob', player_ids: [ids.Ann, bob2] })).data;
  assert.equal(team.id, teams.AB.id);
  assert.equal(team.members, 'Ann & Bob');
  const bob = (await call('GET', '/players')).data.find(p => p.id === bob2);
  assert.ok(bob.played > 0, 'inherits team history');
});

test('sessions: new evening resets presence, queue and tournament; tonight stats restart', async () => {
  await call('PUT', '/state/queue', { value: { waiting: [1, 2] } });
  assert.deepEqual((await call('GET', '/state/queue')).data.value, { waiting: [1, 2] });

  assert.equal((await call('POST', '/sessions', {})).status, 401);
  const session = (await call('POST', '/sessions', {}, '1234')).data;
  assert.equal(session.name, 'Avond 2');

  const players = (await call('GET', '/players')).data;
  assert.ok(players.every(p => p.is_present === 0));
  assert.ok(players.every(p => p.tonight_played === 0));
  assert.equal((await call('GET', '/state/queue')).data.value, null);

  await call('POST', '/matches', { team_a_id: teams.AB.id, team_b_id: teams.CD.id, score_a: 10, score_b: 4 });
  const sessions = (await call('GET', '/sessions')).data;
  assert.deepEqual(sessions.map(s => [s.name, s.matches]), [['Avond 2', 1], ['Avond 1', 2]]);
});

test('state: unknown keys are rejected', async () => {
  assert.equal((await call('GET', '/state/secrets')).status, 404);
  assert.equal((await call('PUT', '/state/secrets', { value: 1 })).status, 404);
});

test('team delete removes its matches', async () => {
  const r = await call('POST', `/teams/${teams.CD.id}/delete`, {}, '1234');
  assert.equal(r.status, 200);
  assert.equal(r.data.deleted_matches, 3);
  assert.equal((await call('GET', '/matches')).data.length, 0);
});

test('version bumps on changes only', async () => {
  const v1 = (await call('GET', '/version')).data.version;
  await call('GET', '/players');
  assert.equal((await call('GET', '/version')).data.version, v1);
  await call('POST', '/players', { name: 'Eva' });
  assert.ok((await call('GET', '/version')).data.version > v1);
  await call('POST', '/players', { name: 'Eva' }); // 400: no bump
  const v2 = (await call('GET', '/version')).data.version;
  assert.equal((await call('GET', '/version')).data.version, v2);
});

test('wheels: weighted items, validation, PIN on delete, history order', async () => {
  const w = (await call('POST', '/wheels', { name: 'W', items: ['a', { label: 'b', weight: 3 }] })).data;
  assert.ok(w.created_at);
  assert.equal((await call('POST', '/wheels', { name: 'X', items: [{ label: 'b', weight: 0 }] })).status, 400);
  assert.equal((await call('POST', `/wheels/${w.id}/update`, { name: 'W2', items: ['a'] })).data.name, 'W2');
  await call('POST', '/spins', { wheel_id: w.id, item: 'a' });
  await call('POST', '/spins', { wheel_id: w.id, item: 'c' });
  assert.equal((await call('GET', `/wheels/${w.id}/history`)).data[0].item, 'c');
  assert.equal((await call('POST', `/wheels/${w.id}/delete`)).status, 401);
  assert.equal((await call('POST', `/wheels/${w.id}/delete`, {}, '1234')).status, 200);
});

test('backup writes a copy of the database', async () => {
  await runBackup();
  const files = fs.readdirSync(path.join(tmpDir, 'backups'));
  assert.equal(files.length, 1);
  assert.match(files[0], /^wheels-.*\.db$/);
});

test('deleting a player requires the password', async () => {
  const id = (await call('POST', '/players', { name: 'Zoe' })).data.id;
  assert.equal((await call('POST', `/players/${id}/delete`)).status, 401);
  assert.equal((await call('POST', `/players/${id}/delete`, {}, 'wrong')).status, 401);
  assert.equal((await call('DELETE', `/players/${id}`)).status, 401);
  assert.ok((await call('GET', '/players')).data.some(p => p.id === id), 'still there');
  assert.equal((await call('POST', `/players/${id}/delete`, {}, '1234')).status, 200);
  assert.ok(!(await call('GET', '/players')).data.some(p => p.id === id));
});
