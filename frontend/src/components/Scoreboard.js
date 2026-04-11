import React from 'react';

function Scoreboard({ history, leaderboard }) {
  return (
    <div className="scoreboard">
      <div className="scoreboard-section">
        <h3>Top Winners</h3>
        {leaderboard.length > 0 ? (
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Wins</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => (
                <tr key={index}>
                  <td>{entry.item}</td>
                  <td>{entry.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-msg">No wins yet!</p>
        )}
      </div>

      <div className="scoreboard-section">
        <h3>Recent History</h3>
        {history.length > 0 ? (
          <ul className="history-list">
            {history.map((spin) => (
              <li key={spin.id}>
                <span className="history-item">{spin.item}</span>
                <span className="history-time">
                  {new Date(spin.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-msg">No history yet!</p>
        )}
      </div>
    </div>
  );
}

export default Scoreboard;
