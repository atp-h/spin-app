import React, { useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../hooks';
import { errorMessage, parseDbDate } from '../../utils';
import { Avatar, EMOJIS, randomEmoji } from './common';

function PlayersTab({ players, sessions, refresh }) {
  const { notify, withPin } = useApp();
  const [newPlayerName, setNewPlayerName] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [localPresence, setLocalPresence] = useState({});

  const session = sessions[0];
  const isPresent = (p) => (p.id in localPresence ? localPresence[p.id] : !!p.is_present);
  const presentCount = players.filter(isPresent).length;

  const handleAddPlayer = async (e) => {
    e.preventDefault();
    const name = newPlayerName.trim();
    if (!name) return;
    try {
      await api.post('/api/players', { name, emoji: randomEmoji() });
      setNewPlayerName('');
      await refresh();
    } catch (error) {
      notify(errorMessage(error));
    }
  };

  const togglePresence = async (player) => {
    const next = !isPresent(player);
    setLocalPresence(current => ({ ...current, [player.id]: next }));
    try {
      await api.post(`/api/players/${player.id}/toggle-presence`, { is_present: next });
      await refresh();
    } catch (error) {
      notify('Fout bij updaten aanwezigheid: ' + errorMessage(error));
    } finally {
      setLocalPresence(current => {
        const { [player.id]: _, ...rest } = current;
        return rest;
      });
    }
  };

  const setEmoji = async (player, emoji) => {
    setPickerFor(null);
    try {
      await api.post(`/api/players/${player.id}/emoji`, { emoji });
      await refresh();
    } catch (error) {
      notify('Fout bij opslaan avatar: ' + errorMessage(error));
    }
  };

  const handleDeletePlayer = async (player) => {
    if (!window.confirm(`Weet je zeker dat je ${player.name} wilt verwijderen?`)) return;
    try {
      const done = await withPin(() => api.post(`/api/players/${player.id}/delete`));
      if (done) notify(`${player.name} verwijderd`, 'success');
    } catch (error) {
      notify('Fout bij verwijderen speler: ' + errorMessage(error));
    }
    refresh();
  };

  const startEvening = async () => {
    if (!window.confirm('Een nieuwe avond starten?\n\nIedereen wordt op afwezig gezet (vink aan wie er is), en de wachtrij en het toernooi worden gewist. De stand van "vanavond" begint opnieuw.')) return;
    try {
      const res = await withPin(() => api.post('/api/sessions', {}));
      if (res) notify(`${res.data.name} gestart — vink aan wie er is!`, 'success');
    } catch (error) {
      notify('Kon geen nieuwe avond starten: ' + errorMessage(error));
    }
    refresh();
  };

  return (
    <div className="bp-section">
      <div className="section-head">
        <div>
          <h3>Spelers <span className="bp-count">{presentCount}/{players.length} aanwezig</span></h3>
          {session && (
            <p className="section-sub">
              🌙 {session.name} · gestart {parseDbDate(session.started_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button type="button" className="chip-btn" onClick={startEvening}>🌙 Nieuwe avond</button>
      </div>

      <form className="add-form" onSubmit={handleAddPlayer}>
        <input
          type="text"
          placeholder="Player name..."
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
        />
        <button type="submit" disabled={!newPlayerName.trim()}>Add</button>
      </form>

      {players.length === 0 ? (
        <p className="empty-msg">Nog geen spelers. Voeg hierboven de eerste toe.</p>
      ) : (
        <div className="player-grid">
          {players.map(p => (
            <div key={p.id} className={`player-card ${isPresent(p) ? '' : 'absent'}`}>
              <Avatar player={p} size={44} onClick={() => setPickerFor(pickerFor === p.id ? null : p.id)} />
              <div className="player-card-body">
                <div className="player-card-name">{p.name}</div>
                <div className="player-card-stats">
                  ⭐ {p.rating} · {p.wins}/{p.played} gewonnen
                </div>
              </div>
              <label className={`switch small ${isPresent(p) ? 'on' : ''}`} title={isPresent(p) ? 'Aanwezig' : 'Afwezig'}>
                <input type="checkbox" checked={isPresent(p)} onChange={() => togglePresence(p)} aria-label={`${p.name} aanwezig`} />
                <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
              </label>
              <button type="button" className="del-btn-small" onClick={() => handleDeletePlayer(p)} aria-label={`${p.name} verwijderen`}>×</button>

              {pickerFor === p.id && (
                <div className="emoji-picker" role="listbox" aria-label="Kies een avatar">
                  {EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => setEmoji(p, e)} className={p.emoji === e ? 'selected' : ''}>{e}</button>
                  ))}
                  <button type="button" className="emoji-clear" onClick={() => setEmoji(p, '')}>Geen</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PlayersTab;
