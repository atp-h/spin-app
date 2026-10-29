import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useApp, useOnRemoteChange } from '../hooks';
import { errorMessage } from '../utils';
import { teamNameFor, scoreProblem } from './beerpong/logic';
import PlayTab from './beerpong/PlayTab';
import StandingsTab from './beerpong/StandingsTab';
import PlayersTab from './beerpong/PlayersTab';
import HistoryTab from './beerpong/HistoryTab';

const SUB_TABS = [
  { id: 'play', label: '🎲 Spelen' },
  { id: 'standings', label: '🏆 Stand' },
  { id: 'players', label: '👥 Spelers' },
  { id: 'history', label: '📜 Historie' }
];

const EMPTY = { players: [], teams: [], matches: [], sessions: [], queue: null, tournament: null };

// Loads all beerpong data, keeps it live, and hands shared actions to the sub-tabs
function BeerpongScoreboard() {
  const { notify, version } = useApp();
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [subTab, setSubTab] = useState('play');

  const refresh = useCallback(async () => {
    try {
      const [players, teams, matches, sessions, queue, tournament] = await Promise.all([
        api.get('/api/players'),
        api.get('/api/teams'),
        api.get('/api/matches'),
        api.get('/api/sessions'),
        api.get('/api/state/queue'),
        api.get('/api/state/tournament')
      ]);
      setData({
        players: players.data,
        teams: teams.data,
        matches: matches.data,
        sessions: sessions.data,
        queue: queue.data.value,
        tournament: tournament.data.value
      });
    } catch (error) {
      notify('Kon de beerpong-gegevens niet laden: ' + errorMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [notify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useOnRemoteChange(version, refresh);

  // Find-or-create the duo for these player ids (the server re-links its players)
  const ensureTeam = useCallback(async (playerIds) => {
    const members = playerIds.map(id => data.players.find(p => p.id === Number(id)));
    if (members.some(p => !p)) throw new Error('Een van de spelers bestaat niet meer');
    const res = await api.post('/api/teams', {
      name: teamNameFor(members),
      player_ids: members.map(p => p.id).sort((a, b) => a - b)
    });
    return res.data;
  }, [data.players]);

  // Returns { id, winner_id } or null when it was not saved
  const recordMatch = useCallback(async (teamAId, teamBId, scoreA, scoreB) => {
    const problem = teamAId === teamBId ? 'Kies twee verschillende teams' : scoreProblem(scoreA, scoreB);
    if (problem) {
      notify(problem);
      return null;
    }
    try {
      const res = await api.post('/api/matches', { team_a_id: teamAId, team_b_id: teamBId, score_a: scoreA, score_b: scoreB });
      await refresh();
      return res.data;
    } catch (error) {
      notify('Fout bij opslaan match: ' + errorMessage(error));
      return null;
    }
  }, [notify, refresh]);

  // Shared queue/tournament documents: optimistic locally, then saved for everyone
  const saveState = useCallback(async (key, value) => {
    setData(current => ({ ...current, [key]: value }));
    try {
      await api.put(`/api/state/${key}`, { value });
    } catch (error) {
      notify('Kon niet opslaan: ' + errorMessage(error));
      refresh();
    }
  }, [notify, refresh]);

  const shared = useMemo(
    () => ({ ...data, refresh, ensureTeam, recordMatch, saveState }),
    [data, refresh, ensureTeam, recordMatch, saveState]
  );

  const present = data.players.filter(p => p.is_present).length;

  return (
    <div className="beerpong-container">
      <div className="beerpong-subtabs" role="tablist">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={subTab === t.id}
            className={subTab === t.id ? 'active' : ''}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
            {t.id === 'players' && loaded && <span className="tab-badge">{present}</span>}
          </button>
        ))}
      </div>

      {subTab === 'play' && <PlayTab {...shared} goTo={setSubTab} />}
      {subTab === 'standings' && <StandingsTab {...shared} />}
      {subTab === 'players' && <PlayersTab {...shared} />}
      {subTab === 'history' && <HistoryTab {...shared} />}
    </div>
  );
}

export default BeerpongScoreboard;
