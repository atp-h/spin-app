import {
  shuffle, pairUp, teamNameFor, scoreProblem, queueAfterMatch, emptyQueue,
  buildBracket, recordBracketResult, roundName, BYE
} from '../components/beerpong/logic';

test('shuffle is a permutation and roughly uniform', () => {
  const counts = [0, 0, 0, 0, 0, 0];
  const trials = 30000;
  for (let i = 0; i < trials; i++) {
    const s = shuffle([0, 1, 2, 3, 4, 5]);
    expect([...s].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    counts[s[0]]++;
  }
  // The old sort(() => 0.5 - Math.random()) put item 0 first ~29% of the time
  counts.forEach(c => expect(Math.abs(c / trials - 1 / 6)).toBeLessThan(0.02));
});

test('pairUp makes duos and reports the odd one out', () => {
  const players = ['a', 'b', 'c', 'd', 'e'].map((name, id) => ({ id, name }));
  const { pairs, leftover } = pairUp(players);
  expect(pairs).toHaveLength(2);
  const used = [...pairs.flat(), leftover].map(p => p.id).sort();
  expect(used).toEqual([0, 1, 2, 3, 4]);
  expect(pairUp(players.slice(0, 4)).leftover).toBeNull();
});

test('team names are order independent', () => {
  expect(teamNameFor([{ name: 'Bob' }, { name: 'Ann' }])).toBe('Ann & Bob');
});

test('scoreProblem rejects ties and empty or negative scores', () => {
  expect(scoreProblem('10', '8')).toBeNull();
  expect(scoreProblem(5, 5)).toMatch(/Gelijkspel/);
  expect(scoreProblem('', 3)).toBeTruthy();
  expect(scoreProblem(-1, 3)).toBeTruthy();
  expect(scoreProblem(2.5, 3)).toBeTruthy();
});

describe('winner stays on', () => {
  test('winner keeps the table, loser joins the back, streak counts', () => {
    let q = { ...emptyQueue(), order: [1, 2, 3, 4] };
    q = queueAfterMatch(q, 1);
    expect(q).toEqual({ order: [1, 3, 4, 2], streak: 1 });
    q = queueAfterMatch(q, 1);
    expect(q).toEqual({ order: [1, 4, 2, 3], streak: 2 });
    q = queueAfterMatch(q, 4);
    expect(q).toEqual({ order: [4, 2, 3, 1], streak: 1 });
  });

  test('works with only two teams', () => {
    expect(queueAfterMatch({ order: [1, 2], streak: 0 }, 2)).toEqual({ order: [2, 1], streak: 1 });
  });
});

describe('tournament bracket', () => {
  test('power of two: no byes, three rounds for 8 teams', () => {
    const b = buildBracket([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(b.rounds.map(r => r.length)).toEqual([4, 2, 1]);
    expect(b.rounds[0].every(m => m.a !== BYE && m.b !== BYE)).toBe(true);
    expect(b.champion).toBeNull();
  });

  test('byes advance automatically and never meet each other', () => {
    for (let n = 2; n <= 16; n++) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const b = buildBracket(ids);
      const first = b.rounds[0];
      expect(first.some(m => m.a === BYE && m.b === BYE)).toBe(false);
      // every team appears exactly once in round 1
      const placed = first.flatMap(m => [m.a, m.b]).filter(x => x !== BYE).sort((x, y) => x - y);
      expect(placed).toEqual(ids);
      // bye matches are already decided
      first.filter(m => m.b === BYE).forEach(m => expect(m.winner).toBe(m.a));
    }
  });

  test('3 teams: bye team waits in the final, then a champion is crowned', () => {
    let b = buildBracket([1, 2, 3]);
    expect(b.rounds[0][0]).toMatchObject({ a: 1, b: BYE, winner: 1 });
    expect(b.rounds[1][0]).toMatchObject({ a: 1, b: null });
    b = recordBracketResult(b, 0, 1, { scoreA: 4, scoreB: 10, matchId: 77 });
    expect(b.rounds[0][1]).toMatchObject({ winner: 3, match_id: 77 });
    expect(b.rounds[1][0]).toMatchObject({ a: 1, b: 3 });
    b = recordBracketResult(b, 1, 0, { scoreA: 10, scoreB: 9, matchId: 78 });
    expect(b.champion).toBe(1);
  });

  test('needs at least two teams', () => {
    expect(() => buildBracket([1])).toThrow();
  });

  test('round names', () => {
    expect([0, 1, 2].map(i => roundName(i, 3))).toEqual(['Kwartfinale', 'Halve finale', 'Finale']);
  });
});
