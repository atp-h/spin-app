import React, { useState } from 'react';
import Confetti from '../Confetti';
import { COLORS } from '../SpinWheel';
import { useApp } from '../../hooks';
import { errorMessage } from '../../utils';
import {
  shuffle, pairUp, emptyQueue, queueAfterMatch, buildBracket, recordBracketResult, roundName, BYE
} from './logic';
import { PlayerSelect, ScoreEntry, TeamTag } from './common';
import TeamDraw from './TeamDraw';

const MODES = [
  { id: 'quick', label: '⚡ Snelle pot' },
  { id: 'queue', label: '👑 Winnaar blijft' },
  { id: 'tournament', label: '🏆 Toernooi' }
];

function NotEnoughPlayers({ count, needed, goTo }) {
  return (
    <div className="callout">
      Er zijn {count} spelers aanwezig; je hebt er minimaal {needed} nodig.
      <button type="button" className="link-btn inline" onClick={() => goTo('players')}>Vink ze aan bij Spelers →</button>
    </div>
  );
}

// --- Quick match ------------------------------------------------------------
function QuickMatch({ players, teams, ensureTeam, recordMatch, goTo }) {
  const { notify } = useApp();
  const [slots, setSlots] = useState(['', '', '', '']);
  const [match, setMatch] = useState(null); // { teamA, teamB }
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);

  const present = players.filter(p => p.is_present);
  const ids = slots.map(Number).filter(Boolean);
  const ready = ids.length === 4 && new Set(ids).size === 4;
  const setSlot = (i, value) => setSlots(current => current.map((s, j) => (j === i ? value : s)));

  const instantShuffle = () => {
    const picked = shuffle(present).slice(0, 4);
    setSlots(picked.map(p => String(p.id)));
  };

  const start = async () => {
    setBusy(true);
    try {
      const teamA = await ensureTeam(ids.slice(0, 2));
      const teamB = await ensureTeam(ids.slice(2, 4));
      setMatch({ teamA, teamB });
    } catch (error) {
      notify('Kon de teams niet maken: ' + errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const save = async (scoreA, scoreB) => {
    const result = await recordMatch(match.teamA.id, match.teamB.id, scoreA, scoreB);
    if (result) {
      const winner = result.winner_id === match.teamA.id ? match.teamA : match.teamB;
      notify(`🏆 ${winner.name} wint!`, 'success');
      setMatch(null);
      setSlots(['', '', '', '']);
    }
  };

  if (match) {
    const live = (team) => teams.find(t => t.id === team.id) || team;
    return (
      <div className="draw-result">
        <div className="versus-display">
          <div className="vs-team"><TeamTag team={live(match.teamA)} players={players} /></div>
          <div className="vs-divider">VS</div>
          <div className="vs-team"><TeamTag team={live(match.teamB)} players={players} /></div>
        </div>
        <ScoreEntry labelA={match.teamA.name} labelB={match.teamB.name} onSave={save} onCancel={() => setMatch(null)} saveLabel="Save & Finish" />
      </div>
    );
  }

  return (
    <div className="mm-setup">
      {present.length < 4 && <NotEnoughPlayers count={present.length} needed={4} goTo={goTo} />}
      <button type="button" className="big-action" onClick={() => setDrawing(true)} disabled={present.length < 4}>
        🎡 Spin de teams
        <small>Laat het rad 4 spelers uit de aanwezigen trekken</small>
      </button>

      <div className="mm-grid">
        {[0, 2].map(start => (
          <div className="mm-column" key={start}>
            <h4>{start === 0 ? 'Side A' : 'Side B'}</h4>
            {[start, start + 1].map(i => (
              <PlayerSelect
                key={i}
                value={slots[i]}
                onChange={(v) => setSlot(i, v)}
                players={present}
                taken={ids}
                placeholder={`Player ${i + 1}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mm-actions">
        <button className="full-width-btn" onClick={start} disabled={!ready || busy}>
          {busy ? 'Bezig...' : 'Start Match'}
        </button>
        <div className="mm-links">
          <button className="link-btn inline" onClick={instantShuffle} disabled={present.length < 4}>🔀 Direct husselen</button>
          {ids.length > 0 && <button className="link-btn inline" onClick={() => setSlots(['', '', '', ''])}>Selectie wissen</button>}
        </div>
      </div>

      {drawing && (
        <TeamDraw
          players={present}
          onClose={() => setDrawing(false)}
          onDone={(drawn) => {
            setSlots(drawn.map(p => String(p.id)));
            setDrawing(false);
          }}
        />
      )}
    </div>
  );
}

// --- Winner stays on ----------------------------------------------------------
function WinnerStaysOn({ players, teams, queue: savedQueue, ensureTeam, recordMatch, saveState, goTo }) {
  const { notify } = useApp();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const queue = savedQueue || emptyQueue();

  const present = players.filter(p => p.is_present);
  const teamById = (id) => teams.find(t => t.id === id);
  const queuedPlayerIds = queue.order.flatMap(id => teamById(id)?.player_ids || []);
  const available = present.filter(p => !queuedPlayerIds.includes(p.id));

  const addTeams = async (pairs) => {
    setBusy(true);
    try {
      const order = [...queue.order];
      for (const pair of pairs) {
        const team = await ensureTeam(pair);
        if (!order.includes(team.id)) order.push(team.id);
      }
      await saveState('queue', { ...queue, order });
    } catch (error) {
      notify('Kon duo niet toevoegen: ' + errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const addDuo = async () => {
    await addTeams([[Number(p1), Number(p2)]]);
    setP1('');
    setP2('');
  };

  const drawDuos = async () => {
    const { pairs, leftover } = pairUp(available);
    await addTeams(pairs.map(pair => pair.map(p => p.id)));
    if (leftover) notify(`${leftover.name} blijft over — voeg later een partner toe`, 'info');
  };

  const removeAt = (index) => saveState('queue', { ...queue, order: queue.order.filter((_, i) => i !== index), streak: index === 0 ? 0 : queue.streak });

  const save = async (scoreA, scoreB) => {
    const [a, b] = queue.order;
    const result = await recordMatch(a, b, scoreA, scoreB);
    if (!result) return;
    const next = queueAfterMatch(queue, result.winner_id);
    await saveState('queue', next);
    const champ = teamById(result.winner_id);
    notify(next.streak >= 3 ? `🔥 ${champ?.name} wint ${next.streak}× op rij!` : `👑 ${champ?.name} blijft staan!`, 'success');
  };

  const clear = () => {
    if (window.confirm('De hele wachtrij leegmaken?')) saveState('queue', null);
  };

  const [atTableA, atTableB, ...waiting] = queue.order;

  return (
    <div className="queue-mode">
      {present.length < 4 && queue.order.length < 2 && <NotEnoughPlayers count={present.length} needed={4} goTo={goTo} />}

      {atTableA && atTableB ? (
        <div className="table-card">
          <div className="table-label">🍺 Aan tafel</div>
          <div className="versus-display">
            <div className="vs-team"><TeamTag team={teamById(atTableA)} players={players} crown={queue.streak > 0} /></div>
            <div className="vs-divider">VS</div>
            <div className="vs-team"><TeamTag team={teamById(atTableB)} players={players} /></div>
          </div>
          {queue.streak > 0 && <p className="streak-note">👑 {teamById(atTableA)?.name} heeft {queue.streak}× op rij gewonnen</p>}
          <ScoreEntry key={`${atTableA}-${atTableB}-${queue.streak}`} labelA={teamById(atTableA)?.name} labelB={teamById(atTableB)?.name} onSave={save} saveLabel="Uitslag opslaan" />
        </div>
      ) : (
        <div className="callout">Voeg minstens twee duo's toe om te beginnen. De winnaar blijft staan, de verliezer sluit achteraan aan.</div>
      )}

      <h4 className="detail-heading">Wachtrij {waiting.length > 0 && <span className="muted">({waiting.length})</span>}</h4>
      {queue.order.length === 0 ? <p className="empty-msg">Nog niemand in de rij.</p> : (
        <ol className="queue-list">
          {queue.order.map((id, i) => (
            <li key={id} className={i < 2 ? 'at-table' : ''}>
              <span className="queue-pos">{i < 2 ? '🍺' : i - 1}</span>
              <TeamTag team={teamById(id)} players={players} />
              <button type="button" className="del-btn-small" onClick={() => removeAt(i)} aria-label="Uit de rij halen">×</button>
            </li>
          ))}
        </ol>
      )}

      <div className="queue-add">
        <PlayerSelect value={p1} onChange={setP1} players={available} taken={[Number(p2)]} placeholder="Speler 1" />
        <PlayerSelect value={p2} onChange={setP2} players={available} taken={[Number(p1)]} placeholder="Speler 2" />
        <button type="button" className="btn-primary" onClick={addDuo} disabled={!p1 || !p2 || busy}>＋ Duo</button>
      </div>
      <div className="mm-links">
        <button type="button" className="link-btn inline" onClick={drawDuos} disabled={available.length < 2 || busy}>
          🎲 Loot duo's uit de {available.length} vrije spelers
        </button>
        {queue.order.length > 0 && <button type="button" className="link-btn inline" onClick={clear}>Wachtrij leegmaken</button>}
      </div>
    </div>
  );
}

// --- Tournament -------------------------------------------------------------
function Tournament({ players, teams, tournament, ensureTeam, recordMatch, saveState, goTo }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null); // "round-match" currently entering a score

  const present = players.filter(p => p.is_present);
  const teamById = (id) => teams.find(t => t.id === id);

  const create = async () => {
    setBusy(true);
    try {
      const { pairs, leftover } = pairUp(present);
      const teamIds = [];
      for (const pair of pairs) teamIds.push((await ensureTeam(pair.map(p => p.id))).id);
      await saveState('tournament', buildBracket(shuffle(teamIds)));
      if (leftover) notify(`${leftover.name} speelt niet mee (oneven aantal spelers)`, 'info');
    } catch (error) {
      notify('Kon toernooi niet starten: ' + errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const save = (r, i) => async (scoreA, scoreB) => {
    const m = tournament.rounds[r][i];
    const result = await recordMatch(m.a, m.b, scoreA, scoreB);
    if (!result) return;
    setActive(null);
    await saveState('tournament', recordBracketResult(tournament, r, i, { scoreA, scoreB, matchId: result.id }));
  };

  const reset = () => {
    if (window.confirm('Dit toernooi afsluiten en een nieuw beginnen? De gespeelde wedstrijden blijven in de historie.')) {
      saveState('tournament', null);
    }
  };

  if (!tournament) {
    return (
      <div className="mm-setup">
        {present.length < 4 && <NotEnoughPlayers count={present.length} needed={4} goTo={goTo} />}
        <div className="callout">
          Maakt willekeurige duo's van de {present.length} aanwezige spelers en zet ze in een knock-out schema.
          {present.length % 2 === 1 && ' Bij een oneven aantal valt één speler af.'}
        </div>
        <button type="button" className="big-action" onClick={create} disabled={present.length < 4 || busy}>
          🏆 Start toernooi
          <small>{Math.floor(present.length / 2)} duo's</small>
        </button>
      </div>
    );
  }

  const label = (id) => (id === BYE ? 'Bye' : teamById(id)?.name || '…');
  const champion = tournament.champion !== null && tournament.champion !== undefined ? teamById(tournament.champion) : null;

  return (
    <div className="tournament">
      {champion && (
        <div className="champion-banner">
          <Confetti colors={COLORS} />
          <div className="champion-trophy" aria-hidden="true">🏆</div>
          <div className="champion-label">Kampioen</div>
          <TeamTag team={champion} players={players} />
        </div>
      )}

      <div className="bracket">
        {tournament.rounds.map((round, r) => (
          <div className="bracket-round" key={r}>
            <h4>{roundName(r, tournament.rounds.length)}</h4>
            {round.map((m, i) => {
              const key = `${r}-${i}`;
              const playable = m.winner === null && m.a !== null && m.b !== null && m.a !== BYE && m.b !== BYE;
              return (
                <div key={key} className={`bracket-match ${playable ? 'playable' : ''}`}>
                  {[['a', m.score_a], ['b', m.score_b]].map(([side, score]) => (
                    <div key={side} className={`bracket-team ${m.winner !== null && m.winner === m[side] && m[side] !== BYE ? 'won' : ''} ${m[side] === BYE ? 'bye' : ''}`}>
                      <span>{m[side] === null ? '…' : label(m[side])}</span>
                      {score !== null && <span className="bracket-score">{score}</span>}
                    </div>
                  ))}
                  {playable && active !== key && (
                    <button type="button" className="chip-btn" onClick={() => setActive(key)}>Uitslag invoeren</button>
                  )}
                  {playable && active === key && (
                    <ScoreEntry labelA={label(m.a)} labelB={label(m.b)} onSave={save(r, i)} onCancel={() => setActive(null)} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mm-links">
        <button type="button" className="link-btn inline" onClick={reset}>{champion ? '🏆 Nieuw toernooi' : 'Toernooi stoppen'}</button>
      </div>
    </div>
  );
}

function PlayTab(props) {
  const [mode, setMode] = useState(() => (props.tournament ? 'tournament' : props.queue?.order?.length ? 'queue' : 'quick'));

  return (
    <div className="bp-section">
      <div className="segmented mode-switch">
        {MODES.map(m => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
      </div>
      {mode === 'quick' && <QuickMatch {...props} />}
      {mode === 'queue' && <WinnerStaysOn {...props} />}
      {mode === 'tournament' && <Tournament {...props} />}
    </div>
  );
}

export default PlayTab;
