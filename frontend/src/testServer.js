// In-memory stand-in for the backend API, used by the component tests through a
// mocked axios. It implements just enough of server.js to drive real UI flows.
export function createTestServer({ pin = '', players = [], wheels = [] } = {}) {
  const db = {
    version: 1,
    wheels: wheels.map((w, i) => ({ id: i + 1, created_at: '2026-10-29 20:00:00', ...w })),
    spins: [],
    players: players.map((p, i) => ({ id: i + 1, emoji: null, is_present: 1, ...p })),
    teams: [],
    matches: [],
    sessions: [{ id: 1, name: 'Avond 1', started_at: '2026-10-29 19:00:00', matches: 0 }],
    state: {}
  };
  const calls = [];
  let nextId = 100;

  const fail = (status, data) => Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } }));
  const ok = (data) => Promise.resolve({ data });
  const pinOk = (config) => !pin || config?.headers?.['X-App-Pin'] === pin;

  const teamStats = (t) => {
    const ms = db.matches.filter(m => m.team_a_id === t.id || m.team_b_id === t.id);
    return { ...t, played: ms.length, wins: ms.filter(m => m.winner_id === t.id).length, tonight_played: ms.length, tonight_wins: ms.filter(m => m.winner_id === t.id).length, rating: 1000, streak: 0, members: t.name };
  };
  const playerStats = (p) => {
    const mine = db.teams.filter(t => t.player_ids.includes(p.id));
    const stats = mine.map(teamStats);
    const sum = (k) => stats.reduce((s, t) => s + t[k], 0);
    return { ...p, played: sum('played'), wins: sum('wins'), tonight_played: sum('played'), tonight_wins: sum('wins'), rating: 1000, streak: 0 };
  };

  const route = (method, url, body, config) => {
    calls.push({ method, url, body });
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    let m;
    const bump = (result) => { db.version++; return result; };

    if (method === 'get') {
      if (path === '/api/version') return ok({ version: db.version });
      if (path === '/api/auth') return ok({ pin_required: !!pin });
      if (path === '/api/wheels') return ok(db.wheels);
      if ((m = path.match(/^\/api\/wheels\/(\d+)\/history$/))) return ok(db.spins.filter(s => s.wheel_id === +m[1]).reverse());
      if ((m = path.match(/^\/api\/wheels\/(\d+)\/leaderboard$/))) return ok([]);
      if (path === '/api/players') return ok(db.players.map(playerStats));
      if ((m = path.match(/^\/api\/players\/(\d+)\/stats$/))) return ok({ player: db.players.find(p => p.id === +m[1]), partners: [], opponents: [] });
      if (path === '/api/teams') return ok(db.teams.map(teamStats));
      if (path === '/api/matches') return ok([...db.matches].reverse());
      if (path === '/api/sessions') return ok([...db.sessions].reverse());
      if ((m = path.match(/^\/api\/state\/(\w+)$/))) return ok({ value: db.state[m[1]] ?? null });
    }

    if (method === 'post' || method === 'put') {
      if (path === '/api/auth/check') return pinOk(config) ? ok({ ok: true }) : fail(401, { error: 'Onjuist of ontbrekend wachtwoord', pin_required: true });
      const protectedRoute = /\/delete$/.test(path) || path === '/api/sessions';
      if (protectedRoute && !pinOk(config)) return fail(401, { error: 'Onjuist of ontbrekend wachtwoord', pin_required: true });

      if (path === '/api/wheels') {
        const wheel = { id: nextId++, created_at: '2026-10-29 21:00:00', ...body };
        db.wheels.unshift(wheel);
        return bump(ok(wheel));
      }
      if ((m = path.match(/^\/api\/wheels\/(\d+)\/update$/))) {
        const wheel = db.wheels.find(w => w.id === +m[1]);
        Object.assign(wheel, body);
        return bump(ok({ ...wheel }));
      }
      if ((m = path.match(/^\/api\/wheels\/(\d+)\/delete$/))) {
        db.wheels = db.wheels.filter(w => w.id !== +m[1]);
        return bump(ok({}));
      }
      if (path === '/api/spins') {
        db.spins.push({ id: nextId++, created_at: '2026-10-29 21:00:00', ...body });
        return bump(ok({}));
      }
      if (path === '/api/players') {
        if (db.players.some(p => p.name === body.name)) return fail(400, { error: 'Player already exists' });
        const player = { id: nextId++, is_present: 1, ...body };
        db.players.push(player);
        return bump(ok(player));
      }
      if ((m = path.match(/^\/api\/players\/(\d+)\/toggle-presence$/))) {
        db.players.find(p => p.id === +m[1]).is_present = body.is_present ? 1 : 0;
        return bump(ok({}));
      }
      if ((m = path.match(/^\/api\/players\/(\d+)\/delete$/))) {
        db.players = db.players.filter(p => p.id !== +m[1]);
        db.teams.forEach(t => { t.player_ids = t.player_ids.filter(id => id !== +m[1]); });
        return bump(ok({}));
      }
      if ((m = path.match(/^\/api\/players\/(\d+)\/emoji$/))) {
        db.players.find(p => p.id === +m[1]).emoji = body.emoji || null;
        return bump(ok({}));
      }
      if (path === '/api/teams') {
        let team = db.teams.find(t => t.name === body.name);
        if (!team) {
          team = { id: nextId++, name: body.name, player_ids: body.player_ids };
          db.teams.push(team);
        }
        team.player_ids = body.player_ids;
        return bump(ok(teamStats(team)));
      }
      if ((m = path.match(/^\/api\/teams\/(\d+)\/delete$/))) {
        db.teams = db.teams.filter(t => t.id !== +m[1]);
        return bump(ok({}));
      }
      if (path === '/api/matches') {
        if (body.score_a === body.score_b) return fail(400, { error: 'Gelijkspel is niet mogelijk' });
        const match = {
          id: nextId++, session_id: db.sessions[db.sessions.length - 1].id, created_at: '2026-10-29 21:00:00', ...body,
          winner_id: body.score_a > body.score_b ? body.team_a_id : body.team_b_id
        };
        const name = (id) => db.teams.find(t => t.id === id)?.name;
        match.team_a_name = name(match.team_a_id);
        match.team_b_name = name(match.team_b_id);
        db.matches.push(match);
        return bump(ok({ id: match.id, winner_id: match.winner_id }));
      }
      if ((m = path.match(/^\/api\/matches\/(\d+)\/delete$/))) {
        db.matches = db.matches.filter(x => x.id !== +m[1]);
        return bump(ok({}));
      }
      if (path === '/api/sessions') {
        const session = { id: nextId++, name: `Avond ${db.sessions.length + 1}`, started_at: '2026-10-30 19:00:00' };
        db.sessions.push(session);
        db.players.forEach(p => { p.is_present = 0; });
        db.state = {};
        return bump(ok(session));
      }
      if ((m = path.match(/^\/api\/state\/(\w+)$/))) {
        db.state[m[1]] = body.value;
        return bump(ok({ value: body.value }));
      }
    }
    return fail(404, { error: `No test route for ${method.toUpperCase()} ${path}` });
  };

  return {
    db,
    calls,
    install(axios) {
      axios.get.mockImplementation((url, config) => route('get', url, undefined, config));
      axios.post.mockImplementation((url, body, config) => route('post', url, body, config));
      axios.put.mockImplementation((url, body, config) => route('put', url, body, config));
    }
  };
}
