import React, { useState } from 'react';
import { scoreProblem, parseScore } from './logic';

export const EMOJIS = [
  '🦄', '🐸', '🦊', '🐼', '🐯', '🦁', '🐙', '🦖', '🐧', '🦉', '🐝', '🦋',
  '🍕', '🌮', '🍩', '🍔', '🌶️', '🥨', '🚀', '⚡', '🔥', '🌈', '🎸', '👑',
  '😎', '🤠', '👻', '🤖', '👽', '💎', '🍀', '🎯'
];

export const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

const AVATAR_COLORS = ['#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#2563eb', '#ca8a04', '#9333ea'];

const colorFor = (name = '') => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export function Avatar({ player, size = 32, onClick }) {
  const content = player?.emoji || (player?.name || '?').slice(0, 1).toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.55, background: colorFor(player?.name) };
  return onClick ? (
    <button type="button" className="avatar clickable" style={style} onClick={onClick} aria-label={`Avatar van ${player?.name}`}>
      {content}
    </button>
  ) : (
    <span className="avatar" style={style} aria-hidden="true">{content}</span>
  );
}

export function PlayerTag({ player, size }) {
  return (
    <span className="player-tag">
      <Avatar player={player} size={size} />
      <span className="player-tag-name">{player?.name ?? '?'}</span>
    </span>
  );
}

// A duo: overlapping avatars of its members plus the team name
export function TeamTag({ team, players, crown }) {
  if (!team) return <span className="team-tag muted">…</span>;
  const members = (team.player_ids || []).map(id => players.find(p => p.id === id)).filter(Boolean);
  return (
    <span className="team-tag">
      <span className="avatar-stack">
        {members.map(p => <Avatar key={p.id} player={p} size={26} />)}
      </span>
      <span className="team-tag-name">{crown && '👑 '}{team.name}</span>
    </span>
  );
}

// Two score inputs plus a save button; validates ties and empty fields before saving
export function ScoreEntry({ labelA, labelB, onSave, onCancel, saveLabel = 'Opslaan' }) {
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = scoreProblem(scoreA, scoreB);

  const save = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      await onSave(parseScore(scoreA), parseScore(scoreB));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="score-entry">
      <div className="score-inputs">
        <label>
          <span className="score-label">{labelA}</span>
          <input type="number" min="0" inputMode="numeric" placeholder="0" value={scoreA} onChange={(e) => setScoreA(e.target.value)} aria-label={`Score ${labelA}`} />
        </label>
        <span className="score-dash">–</span>
        <label>
          <span className="score-label">{labelB}</span>
          <input type="number" min="0" inputMode="numeric" placeholder="0" value={scoreB} onChange={(e) => setScoreB(e.target.value)} aria-label={`Score ${labelB}`} />
        </label>
      </div>
      {problem && (scoreA !== '' || scoreB !== '') && <p className="form-hint">{problem}</p>}
      <div className="score-actions">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Annuleren</button>}
        <button type="button" className="btn-primary" onClick={save} disabled={!!problem || busy}>
          {busy ? 'Opslaan…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

// Player <select> that hides players already chosen elsewhere
export function PlayerSelect({ value, onChange, players, taken = [], placeholder }) {
  const takenElsewhere = taken.filter(id => id !== Number(value));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {players
        .filter(p => !takenElsewhere.includes(p.id))
        .map(p => <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ''}{p.name}</option>)}
    </select>
  );
}
