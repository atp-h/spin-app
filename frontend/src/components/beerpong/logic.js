// Pure beerpong helpers: no React, no network, so they are easy to test.

// Score inputs are kept as strings so a field can be empty while typing
export const parseScore = (value) => (value === '' || value === null || value === undefined ? NaN : Number(value));

export const scoreProblem = (scoreA, scoreB) => {
  const a = parseScore(scoreA);
  const b = parseScore(scoreB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Vul voor beide teams een score in';
  if (a === b) return 'Gelijkspel is niet mogelijk';
  return null;
};

export const winRate = (wins, played) => (played > 0 ? `${Math.round((wins / played) * 100)}%` : '–');

// Fisher–Yates: every ordering is equally likely (sort with a random comparator is not)
export const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Random duos; an odd player out is returned separately
export const pairUp = (players) => {
  const shuffled = shuffle(players);
  const pairs = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) pairs.push([shuffled[i], shuffled[i + 1]]);
  return { pairs, leftover: shuffled.length % 2 ? shuffled[shuffled.length - 1] : null };
};

// Team names are the sorted player names, so a duo always maps to the same team
export const teamNameFor = (players) => players.map(p => p.name).sort().join(' & ');

// --- Winner stays on -------------------------------------------------------
// queue = { order: [teamId, ...], streak: number }
// order[0] and order[1] are at the table; the winner stays, the loser joins the back.
export const emptyQueue = () => ({ order: [], streak: 0 });

export const queueAfterMatch = (queue, winnerId) => {
  const [first, second, ...rest] = queue.order;
  const loserId = winnerId === first ? second : first;
  // The streak counts consecutive wins of whoever holds the table
  const streak = winnerId === first ? queue.streak + 1 : 1;
  return { order: [winnerId, ...rest, loserId], streak };
};

// --- Tournament (single elimination) ---------------------------------------
// bracket = { rounds: [[{ a, b, winner, score_a, score_b, match_id }]], champion }
// a/b hold a team id, null (not decided yet) or BYE.
export const BYE = -1;

export const buildBracket = (teamIds) => {
  if (teamIds.length < 2) throw new Error('Minimaal 2 teams nodig');
  let size = 2;
  while (size < teamIds.length) size *= 2;
  const byes = size - teamIds.length;

  // The first `byes` matches get a bye, so two byes never meet
  const first = [];
  let next = 0;
  for (let i = 0; i < size / 2; i++) {
    const a = teamIds[next++];
    const b = i < byes ? BYE : teamIds[next++];
    first.push({ a, b, winner: null, score_a: null, score_b: null, match_id: null });
  }

  const rounds = [first];
  for (let len = size / 4; len >= 1; len /= 2) {
    rounds.push(Array.from({ length: len }, () => ({ a: null, b: null, winner: null, score_a: null, score_b: null, match_id: null })));
  }
  return propagate({ rounds, champion: null });
};

// Push winners (including bye walkovers) into the next round until nothing changes
const propagate = (bracket) => {
  const rounds = bracket.rounds.map(r => r.map(m => ({ ...m })));
  for (let r = 0; r < rounds.length; r++) {
    rounds[r].forEach((m, i) => {
      if (m.winner === null && m.a !== null && m.b !== null) {
        if (m.b === BYE) m.winner = m.a;
        else if (m.a === BYE) m.winner = m.b;
      }
      if (m.winner !== null && r + 1 < rounds.length) {
        const target = rounds[r + 1][Math.floor(i / 2)];
        target[i % 2 === 0 ? 'a' : 'b'] = m.winner;
      }
    });
  }
  const final = rounds[rounds.length - 1][0];
  return { rounds, champion: final.winner };
};

export const recordBracketResult = (bracket, roundIndex, matchIndex, { scoreA, scoreB, matchId }) => {
  const rounds = bracket.rounds.map(r => r.map(m => ({ ...m })));
  const m = rounds[roundIndex][matchIndex];
  m.score_a = scoreA;
  m.score_b = scoreB;
  m.match_id = matchId;
  m.winner = scoreA > scoreB ? m.a : m.b;
  return propagate({ ...bracket, rounds });
};

export const roundName = (index, total) => {
  const fromEnd = total - index;
  if (fromEnd === 1) return 'Finale';
  if (fromEnd === 2) return 'Halve finale';
  if (fromEnd === 3) return 'Kwartfinale';
  return `Ronde ${index + 1}`;
};
