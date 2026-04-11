import React, { useState, useEffect } from 'react';
import axios from 'axios';

function BeerpongScoreboard({ apiBaseUrl }) {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [subTab, setSubTab] = useState('players'); // 'players', 'teams', 'matches', 'matchmaker'

  // Form states
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  
  const [matchData, setMatchData] = useState({
    team_a_id: '',
    team_b_id: '',
    score_a: 0,
    score_b: 0
  });

  // Matchmaker state
  const [mmSideA, setMmSideA] = useState({ p1: '', p2: '' });
  const [mmSideB, setMmSideB] = useState({ p1: '', p2: '' });
  const [mmResult, setMmResult] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [pRes, tRes, mRes] = await Promise.all([
        axios.get(`${apiBaseUrl}/api/players`),
        axios.get(`${apiBaseUrl}/api/teams`),
        axios.get(`${apiBaseUrl}/api/matches`)
      ]);
      setPlayers(pRes.data);
      setTeams(tRes.data);
      setMatches(mRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return;
    try {
      await axios.post(`${apiBaseUrl}/api/players`, { name: newPlayerName });
      setNewPlayerName('');
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Error adding player');
    }
  };

  const togglePresence = async (id, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      setPlayers(players.map(p => p.id === id ? { ...p, is_present: newStatus ? 1 : 0 } : p));
      await axios.post(`${apiBaseUrl}/api/players/${id}/toggle-presence`, { is_present: newStatus });
    } catch (error) {
      console.error('Fout bij updaten aanwezigheid:', error);
      fetchData();
    }
  };

  const handleDeletePlayer = async (id) => {
    alert('Verwijderen speler ID: ' + id); // TEST MELDING
    try {
      setPlayers(players.filter(p => p.id !== id));
      await axios.delete(`${apiBaseUrl}/api/players/${id}`);
      fetchData();
    } catch (error) {
      alert('Fout: ' + error.message);
      fetchData();
    }
  };

  const handleDeleteTeam = async (id) => {
    alert('Verwijderen team ID: ' + id); // TEST MELDING
    try {
      setTeams(teams.filter(t => t.id !== id));
      await axios.delete(`${apiBaseUrl}/api/teams/${id}`);
      fetchData();
    } catch (error) {
      alert('Fout: ' + error.message);
      fetchData();
    }
  };

  const handleDeleteMatch = async (id) => {
    alert('Verwijderen wedstrijd ID: ' + id); // TEST MELDING
    try {
      setMatches(matches.filter(m => m.id !== id));
      await axios.delete(`${apiBaseUrl}/api/matches/${id}`);
      fetchData();
    } catch (error) {
      alert('Fout: ' + error.message);
      fetchData();
    }
  };

  const findOrCreateTeam = async (playerIds) => {
    const sortedIds = [...playerIds].sort((a, b) => a - b);
    const pNames = players.filter(p => sortedIds.includes(p.id)).map(p => p.name).sort();
    const teamName = pNames.join(' & ');
    
    const existingTeam = teams.find(t => t.name === teamName);
    if (existingTeam) return existingTeam.id;

    try {
      const res = await axios.post(`${apiBaseUrl}/api/teams`, { 
        name: teamName, 
        player_ids: sortedIds 
      });
      const tRes = await axios.get(`${apiBaseUrl}/api/teams`);
      setTeams(tRes.data);
      return res.data.id;
    } catch (error) {
      console.error('Error creating team:', error);
      return null;
    }
  };

  const handleRecordMatch = async (customData) => {
    const data = customData || matchData;
    const { team_a_id, team_b_id, score_a, score_b } = data;
    
    if (!team_a_id || !team_b_id || team_a_id === team_b_id) {
      alert('Selecteer twee verschillende teams');
      return;
    }

    const winner_id = score_a > score_b ? team_a_id : team_b_id;
    try {
      await axios.post(`${apiBaseUrl}/api/matches`, { ...data, winner_id });
      setMatchData({ team_a_id: '', team_b_id: '', score_a: 0, score_b: 0 });
      setMmResult(null);
      fetchData();
      setSubTab('matches');
    } catch (error) {
      alert('Fout bij opslaan match');
    }
  };

  const handleMatchmakerSubmit = async () => {
    const pIdsA = [parseInt(mmSideA.p1), parseInt(mmSideA.p2)].filter(id => !isNaN(id));
    const pIdsB = [parseInt(mmSideB.p1), parseInt(mmSideB.p2)].filter(id => !isNaN(id));

    if (pIdsA.length < 2 || pIdsB.length < 2) {
      alert('Kies 2 spelers per kant');
      return;
    }

    const allIds = [...pIdsA, ...pIdsB];
    if (new Set(allIds).size !== 4) {
      alert('Een speler kan niet twee keer meedoen!');
      return;
    }

    const teamAId = await findOrCreateTeam(pIdsA);
    const teamBId = await findOrCreateTeam(pIdsB);

    if (teamAId && teamBId) {
      setMmResult({ teamAId, teamBId, scoreA: 0, scoreB: 0 });
    }
  };

  const handleMmSave = async () => {
    await handleRecordMatch({
      team_a_id: mmResult.teamAId,
      team_b_id: mmResult.teamBId,
      score_a: mmResult.scoreA,
      score_b: mmResult.scoreB
    });
  };

  const shuffleSelected = () => {
    const presentPlayers = players.filter(p => p.is_present);
    if (presentPlayers.length < 4) {
      alert('Niet genoeg spelers aanwezig om te husselen (minimaal 4)!');
      return;
    }
    const shuffled = [...presentPlayers].sort(() => 0.5 - Math.random());
    setMmSideA({ p1: shuffled[0].id, p2: shuffled[1].id });
    setMmSideB({ p1: shuffled[2].id, p2: shuffled[3].id });
  };

  const presentPlayers = players.filter(p => p.is_present);

  return (
    <div className="beerpong-container">
      <div className="beerpong-subtabs">
        <button className={subTab === 'players' ? 'active' : ''} onClick={() => setSubTab('players')}>Players</button>
        <button className={subTab === 'teams' ? 'active' : ''} onClick={() => setSubTab('teams')}>Teams</button>
        <button className={subTab === 'matches' ? 'active' : ''} onClick={() => setSubTab('matches')}>History</button>
        <button className={subTab === 'matchmaker' ? 'active' : ''} onClick={() => setSubTab('matchmaker')}>🎲 Matchmaker</button>
      </div>

      {subTab === 'players' && (
        <div className="bp-section">
          <h3>Individual Players</h3>
          <div className="add-form">
            <input 
              type="text" 
              placeholder="Player name..." 
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
            />
            <button onClick={handleAddPlayer}>Add</button>
          </div>
          <table className="bp-table">
            <thead>
              <tr><th>Hier?</th><th>Name</th><th>Wins</th><th>Wissen</th></tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id} className={!p.is_present ? 'absent-row' : ''}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={!!p.is_present} 
                      onChange={() => togglePresence(p.id, p.is_present)}
                    />
                  </td>
                  <td>{p.name} {!p.is_present && '(Afwezig)'}</td>
                  <td>{p.wins}</td>
                  <td><button type="button" className="del-btn-small" onClick={(e) => { e.preventDefault(); handleDeletePlayer(p.id); }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'teams' && (
        <div className="bp-section">
          <h3>Teams</h3>
          <table className="bp-table">
            <thead>
              <tr><th>Rank</th><th>Team</th><th>Members</th><th>Wins</th><th>Wissen</th></tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr key={t.id}>
                  <td>{i+1}</td>
                  <td>{t.name}</td>
                  <td>{t.members}</td>
                  <td>{t.wins}</td>
                  <td><button type="button" className="del-btn-small" onClick={(e) => { e.preventDefault(); handleDeleteTeam(t.id); }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'matches' && (
        <div className="bp-section">
          <h3>History</h3>
          <div className="record-match-form">
            <div className="match-row">
              <select value={matchData.team_a_id} onChange={(e) => setMatchData({...matchData, team_a_id: e.target.value})}>
                <option value="">Select Team A</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input type="number" value={matchData.score_a} onChange={(e) => setMatchData({...matchData, score_a: parseInt(e.target.value)})}/>
              <span>VS</span>
              <input type="number" value={matchData.score_b} onChange={(e) => setMatchData({...matchData, score_b: parseInt(e.target.value)})}/>
              <select value={matchData.team_b_id} onChange={(e) => setMatchData({...matchData, team_b_id: e.target.value})}>
                <option value="">Select Team B</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button className="full-width-btn" onClick={() => handleRecordMatch()}>Record Match</button>
          </div>

          <div className="match-history-list">
            {matches.map(m => (
              <div key={m.id} className="match-card">
                <div className="match-header-row">
                  <div className="match-date">{new Date(m.created_at).toLocaleDateString()}</div>
                  <button type="button" className="del-btn-small" onClick={(e) => { e.preventDefault(); handleDeleteMatch(m.id); }}>×</button>
                </div>
                <div className="match-main">
                  <span className={m.winner_id === m.team_a_id ? 'winner' : ''}>{m.team_a_name}</span>
                  <span className="score">{m.score_a} - {m.score_b}</span>
                  <span className={m.winner_id === m.team_b_id ? 'winner' : ''}>{m.team_b_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'matchmaker' && (
        <div className="bp-section">
          <h3>🎲 Matchmaker</h3>
          {!mmResult ? (
            <div className="mm-setup">
              <div className="mm-grid">
                <div className="mm-column">
                  <h4>Side A</h4>
                  <select value={mmSideA.p1} onChange={(e) => setMmSideA({...mmSideA, p1: e.target.value})}>
                    <option value="">Player 1</option>
                    {presentPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={mmSideA.p2} onChange={(e) => setMmSideA({...mmSideA, p2: e.target.value})}>
                    <option value="">Player 2</option>
                    {presentPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="vs-divider">VS</div>
                <div className="mm-column">
                  <h4>Side B</h4>
                  <select value={mmSideB.p1} onChange={(e) => setMmSideB({...mmSideB, p1: e.target.value})}>
                    <option value="">Player 3</option>
                    {presentPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={mmSideB.p2} onChange={(e) => setMmSideB({...mmSideB, p2: e.target.value})}>
                    <option value="">Player 4</option>
                    {presentPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mm-actions">
                <button className="full-width-btn" onClick={handleMatchmakerSubmit}>Start Match</button>
                <button className="outline-btn" onClick={shuffleSelected} style={{marginTop: '10px'}}>🎲 Random Shuffle 4 present players</button>
              </div>
            </div>
          ) : (
            <div className="draw-result">
               <div className="versus-display">
                  <div className="vs-team">
                    <h4>{teams.find(t => t.id === mmResult.teamAId)?.name}</h4>
                  </div>
                  <div className="vs-divider">VS</div>
                  <div className="vs-team">
                    <h4>{teams.find(t => t.id === mmResult.teamBId)?.name}</h4>
                  </div>
                </div>
                <div className="quick-score-form">
                  <h4>Enter Final Score:</h4>
                  <div className="match-row">
                    <input type="number" value={mmResult.scoreA} onChange={(e) => setMmResult({...mmResult, scoreA: parseInt(e.target.value)})}/>
                    <span>-</span>
                    <input type="number" value={mmResult.scoreB} onChange={(e) => setMmResult({...mmResult, scoreB: parseInt(e.target.value)})}/>
                  </div>
                  <button className="full-width-btn" onClick={handleMmSave}>Save & Finish</button>
                  <button className="outline-btn" style={{marginTop: '10px'}} onClick={() => setMmResult(null)}>Cancel</button>
                </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BeerpongScoreboard;
