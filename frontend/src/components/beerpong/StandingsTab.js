import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { api } from '../../api';
import { useApp } from '../../hooks';
import { errorMessage } from '../../utils';
import { winRate } from './logic';
import { Avatar, PlayerTag, TeamTag } from './common';

const MEDALS = ['🥇', '🥈', '🥉'];
const MIN_GAMES_FOR_HIGHLIGHT = 3;

const streakBadge = (streak) => {
  if (streak >= 3) return <span className="streak hot" title={`${streak} op rij gewonnen`}>🔥{streak}</span>;
  if (streak <= -3) return <span className="streak cold" title={`${-streak} op rij verloren`}>🥶{-streak}</span>;
  return null;
};

function PlayerDetail({ player, onClose }) {
  const { notify } = useApp();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get(`/api/players/${player.id}/stats`)
      .then(res => setStats(res.data))
      .catch(error => notify('Kon statistieken niet laden: ' + errorMessage(error)));
  }, [player.id, notify]);

  const bestPartner = stats?.partners
    .filter(p => p.played >= 2)
    .sort((a, b) => b.wins / b.played - a.wins / a.played || b.played - a.played)[0];
  const nemesis = stats?.opponents
    .filter(p => p.played - p.wins > 0)
    .sort((a, b) => (b.played - b.wins) - (a.played - a.wins) || a.wins / a.played - b.wins / b.played)[0];

  return (
    <Modal title={`${player.emoji || ''} ${player.name}`} onClose={onClose}>
      <div className="detail-stats">
        <div><strong>{player.rating}</strong><span>rating</span></div>
        <div><strong>{player.wins}–{player.played - player.wins}</strong><span>W–V</span></div>
        <div><strong>{winRate(player.wins, player.played)}</strong><span>winst</span></div>
      </div>
      {!stats ? <p className="empty-msg">Laden…</p> : (
        <>
          <div className="detail-highlights">
            {bestPartner && <div className="highlight-card">🤝 Beste partner<strong>{bestPartner.name}</strong><span>{bestPartner.wins}/{bestPartner.played} samen gewonnen</span></div>}
            {nemesis && <div className="highlight-card">😈 Aartsvijand<strong>{nemesis.name}</strong><span>{nemesis.played - nemesis.wins}× van verloren</span></div>}
          </div>
          <h4 className="detail-heading">Met</h4>
          {stats.partners.length === 0 ? <p className="empty-msg">Nog niet samen gespeeld.</p> : (
            <ul className="detail-list">
              {stats.partners.map(p => <li key={p.id}><PlayerTag player={p} size={24} /><span>{p.wins}/{p.played}</span></li>)}
            </ul>
          )}
          <h4 className="detail-heading">Tegen</h4>
          {stats.opponents.length === 0 ? <p className="empty-msg">Nog geen tegenstanders.</p> : (
            <ul className="detail-list">
              {stats.opponents.map(p => <li key={p.id}><PlayerTag player={p} size={24} /><span>{p.wins}–{p.played - p.wins}</span></li>)}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

function StandingsTab({ players, teams, refresh }) {
  const { notify, withPin } = useApp();
  const [view, setView] = useState('players'); // 'players' | 'teams'
  const [scope, setScope] = useState('tonight'); // 'tonight' | 'all'
  const [detail, setDetail] = useState(null);

  const tonight = scope === 'tonight';
  const wins = (r) => (tonight ? r.tonight_wins : r.wins);
  const played = (r) => (tonight ? r.tonight_played : r.played);

  const rows = (view === 'players' ? players : teams)
    .filter(r => played(r) > 0)
    .sort((a, b) => (tonight
      ? wins(b) - wins(a) || wins(b) / played(b) - wins(a) / played(a) || b.rating - a.rating
      : b.rating - a.rating || b.wins - a.wins));

  const bestDuo = teams
    .filter(t => t.played >= MIN_GAMES_FOR_HIGHLIGHT)
    .sort((a, b) => b.wins / b.played - a.wins / a.played || b.rating - a.rating)[0];
  const hottest = [...players].sort((a, b) => b.streak - a.streak)[0];
  const topRated = players.filter(p => p.played > 0).sort((a, b) => b.rating - a.rating)[0];

  const handleDeleteTeam = async (team) => {
    const warning = team.played > 0
      ? `\n\nDit team heeft ${team.played} wedstrijd(en) gespeeld. Die worden ook verwijderd en tellen niet meer mee in de stand.`
      : '';
    if (!window.confirm(`Weet je zeker dat je team "${team.name}" wilt verwijderen?${warning}`)) return;
    try {
      const done = await withPin(() => api.post(`/api/teams/${team.id}/delete`));
      if (done) notify(`Team "${team.name}" verwijderd`, 'success');
    } catch (error) {
      notify('Fout bij verwijderen team: ' + errorMessage(error));
    }
    refresh();
  };

  return (
    <div className="bp-section">
      <div className="highlights">
        {topRated && (
          <button type="button" className="highlight-card" onClick={() => setDetail(topRated)}>
            ⭐ Hoogste rating<strong>{topRated.emoji} {topRated.name}</strong><span>{topRated.rating}</span>
          </button>
        )}
        {hottest && hottest.streak >= 2 && (
          <button type="button" className="highlight-card" onClick={() => setDetail(hottest)}>
            🔥 On fire<strong>{hottest.emoji} {hottest.name}</strong><span>{hottest.streak} op rij</span>
          </button>
        )}
        {bestDuo && (
          <div className="highlight-card">
            🤝 Beste duo<strong>{bestDuo.name}</strong><span>{winRate(bestDuo.wins, bestDuo.played)} van {bestDuo.played}</span>
          </div>
        )}
      </div>

      <div className="segmented-row">
        <div className="segmented">
          <button className={view === 'players' ? 'active' : ''} onClick={() => setView('players')}>Spelers</button>
          <button className={view === 'teams' ? 'active' : ''} onClick={() => setView('teams')}>Duo's</button>
        </div>
        <div className="segmented">
          <button className={tonight ? 'active' : ''} onClick={() => setScope('tonight')}>Vanavond</button>
          <button className={!tonight ? 'active' : ''} onClick={() => setScope('all')}>Altijd</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty-msg">{tonight ? 'Vanavond nog niet gespeeld. Ga naar 🎲 Spelen!' : 'Nog geen wedstrijden gespeeld.'}</p>
      ) : (
        <ol className="standings">
          {rows.map((r, i) => (
            <li key={r.id} className={`standing-row ${i < 3 ? 'podium' : ''}`}>
              <span className="rank">{MEDALS[i] || i + 1}</span>
              {view === 'players' ? (
                <button type="button" className="standing-name" onClick={() => setDetail(r)}>
                  <Avatar player={r} size={30} />
                  <span>{r.name}</span>
                </button>
              ) : (
                <span className="standing-name"><TeamTag team={r} players={players} /></span>
              )}
              {streakBadge(r.streak)}
              <span className="standing-stats">
                <span className="rating" title="Elo-rating">{r.rating}</span>
                <span className="record">{wins(r)}–{played(r) - wins(r)} · {winRate(wins(r), played(r))}</span>
              </span>
              {view === 'teams' && (
                <button type="button" className="del-btn-small" onClick={() => handleDeleteTeam(r)} aria-label={`Team ${r.name} verwijderen`}>×</button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="item-hint">Rating = Elo: winnen van sterkere tegenstanders levert meer op. Iedereen begint op 1000.</p>

      {detail && <PlayerDetail player={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default StandingsTab;
