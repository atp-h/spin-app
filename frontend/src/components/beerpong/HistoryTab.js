import React, { useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../hooks';
import { errorMessage, parseDbDate } from '../../utils';
import { ScoreEntry } from './common';

function HistoryTab({ teams, matches, sessions, refresh, recordMatch }) {
  const { notify, withPin } = useApp();
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [formKey, setFormKey] = useState(0);

  const sessionName = new Map(sessions.map(s => [s.id, s.name]));
  // matches arrive newest first; group them by evening, keeping that order
  const groups = [];
  for (const m of matches) {
    const last = groups[groups.length - 1];
    if (last && last.id === m.session_id) last.matches.push(m);
    else groups.push({ id: m.session_id, matches: [m] });
  }

  const teamName = (id) => teams.find(t => t.id === Number(id))?.name || '';

  const save = async (scoreA, scoreB) => {
    const result = await recordMatch(Number(teamA), Number(teamB), scoreA, scoreB);
    if (result) {
      notify('Wedstrijd opgeslagen', 'success');
      setTeamA('');
      setTeamB('');
      setFormKey(k => k + 1);
    }
  };

  const handleDeleteMatch = async (id) => {
    if (!window.confirm('Weet je zeker dat je deze wedstrijd wilt verwijderen?')) return;
    try {
      await withPin(() => api.post(`/api/matches/${id}/delete`));
    } catch (error) {
      notify('Fout bij verwijderen wedstrijd: ' + errorMessage(error));
    }
    refresh();
  };

  return (
    <div className="bp-section">
      <h3>Historie</h3>
      <details className="record-match-form">
        <summary>✍️ Wedstrijd handmatig invoeren</summary>
        <div className="match-row">
          <select value={teamA} onChange={(e) => setTeamA(e.target.value)} aria-label="Team A">
            <option value="">Select Team A</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <span>VS</span>
          <select value={teamB} onChange={(e) => setTeamB(e.target.value)} aria-label="Team B">
            <option value="">Select Team B</option>
            {teams.filter(t => String(t.id) !== teamA).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {teamA && teamB ? (
          <ScoreEntry key={formKey} labelA={teamName(teamA)} labelB={teamName(teamB)} onSave={save} saveLabel="Record Match" />
        ) : (
          <p className="form-hint">Kies twee teams. Nieuwe duo's maak je via 🎲 Spelen.</p>
        )}
      </details>

      {matches.length === 0 && <p className="empty-msg">Nog geen wedstrijden gespeeld.</p>}
      {groups.map(group => (
        <section key={`${group.id}-${group.matches[0].id}`} className="history-group">
          <h4 className="history-group-title">
            🌙 {sessionName.get(group.id) || 'Eerder'} <span className="muted">· {group.matches.length} potje{group.matches.length === 1 ? '' : 's'}</span>
          </h4>
          <div className="match-history-list">
            {group.matches.map(m => (
              <div key={m.id} className="match-card">
                <div className="match-header-row">
                  <div className="match-date">
                    {parseDbDate(m.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <button type="button" className="del-btn-small" onClick={() => handleDeleteMatch(m.id)} aria-label="Wedstrijd verwijderen">×</button>
                </div>
                <div className="match-main">
                  <span className={m.winner_id === m.team_a_id ? 'winner' : ''}>{m.team_a_name}</span>
                  <span className="score">{m.score_a} - {m.score_b}</span>
                  <span className={m.winner_id === m.team_b_id ? 'winner' : ''}>{m.team_b_name}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default HistoryTab;
