import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import SpinWheel from './components/SpinWheel';
import ItemList from './components/ItemList';
import Scoreboard from './components/Scoreboard';
import BeerpongScoreboard from './components/BeerpongScoreboard';
import Manual from './components/Manual';

let API_BASE_URL = process.env.REACT_APP_API_URL || '';
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  if (window.location.port === '' || window.location.port === '80' || window.location.port === '443') {
    API_BASE_URL = ''; // Rely on reverse proxy routing (HAProxy)
  } else {
    API_BASE_URL = API_BASE_URL.replace('localhost', window.location.hostname); // Direct IP access
  }
}

function App() {
  const [wheels, setWheels] = useState([]);
  const [currentWheel, setCurrentWheel] = useState(null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [wheelName, setWheelName] = useState('');
  const [newItem, setNewItem] = useState('');
  const [editingWheel, setEditingWheel] = useState(null);
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('wheel'); // 'wheel' or 'beerpong'

  useEffect(() => {
    fetchWheels();
  }, []);

  const fetchScoreboard = useCallback(async (wheelId) => {
    if (!wheelId) return;
    try {
      const [historyRes, leaderboardRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/wheels/${wheelId}/history`),
        axios.get(`${API_BASE_URL}/api/wheels/${wheelId}/leaderboard`)
      ]);
      setHistory(historyRes.data);
      setLeaderboard(leaderboardRes.data);
    } catch (error) {
      console.error('Error fetching scoreboard:', error);
    }
  }, []);

  useEffect(() => {
    if (currentWheel) {
      fetchScoreboard(currentWheel.id);
    }
  }, [currentWheel, fetchScoreboard]);

  const fetchWheels = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/wheels`);
      setWheels(res.data);
      if (res.data.length > 0 && !currentWheel) {
        const firstWheel = res.data[0];
        setCurrentWheel(firstWheel);
        setWheelName(firstWheel.name);
      }
    } catch (error) {
      console.error('Error fetching wheels:', error);
    }
  };

  const handleCreateWheel = async () => {
    if (!wheelName.trim()) return;
    try {
      const res = await axios.post(`${API_BASE_URL}/api/wheels`, {
        name: wheelName,
        items: []
      });
      setWheels([res.data, ...wheels]);
      setCurrentWheel(res.data);
      setEditingWheel(res.data.id);
      setHistory([]);
      setLeaderboard([]);
    } catch (error) {
      console.error('Error creating wheel:', error);
    }
  };

  const handleUpdateWheel = async (id, name, items) => {
    try {
      const res = await axios.put(`${API_BASE_URL}/api/wheels/${id}`, { name, items });
      setWheels(wheels.map(w => w.id === id ? res.data : w));
      if (currentWheel?.id === id) {
        setCurrentWheel(res.data);
      }
    } catch (error) {
      console.error('Error updating wheel:', error);
    }
  };

  const handleDeleteWheel = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/wheels/${id}`);
      const newWheels = wheels.filter(w => w.id !== id);
      setWheels(newWheels);
      if (currentWheel?.id === id) {
        const nextWheel = newWheels[0] || null;
        setCurrentWheel(nextWheel);
        setWheelName(nextWheel?.name || '');
        setHistory([]);
        setLeaderboard([]);
      }
    } catch (error) {
      console.error('Error deleting wheel:', error);
    }
  };

  const handleAddItem = (item) => {
    if (!currentWheel || !item.trim()) return;
    const updatedItems = [...currentWheel.items, item];
    handleUpdateWheel(currentWheel.id, currentWheel.name, updatedItems);
    setNewItem('');
  };

  const handleRemoveItem = (index) => {
    if (!currentWheel) return;
    const updatedItems = currentWheel.items.filter((_, i) => i !== index);
    handleUpdateWheel(currentWheel.id, currentWheel.name, updatedItems);
  };

  const handleEditItem = (index, newValue) => {
    if (!currentWheel) return;
    const updatedItems = [...currentWheel.items];
    updatedItems[index] = newValue;
    handleUpdateWheel(currentWheel.id, currentWheel.name, updatedItems);
  };

  const handleSpinResult = async (result) => {
    setSelectedResult(result);
    if (currentWheel) {
      try {
        await axios.post(`${API_BASE_URL}/api/spins`, {
          wheel_id: currentWheel.id,
          item: result
        });
        fetchScoreboard(currentWheel.id);
      } catch (error) {
        console.error('Error saving spin result:', error);
      }
    }
  };

  const selectWheel = (wheel) => {
    setCurrentWheel(wheel);
    setWheelName(wheel.name);
    setSelectedResult(null);
    setEditingWheel(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Spin The Wheel</h1>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="wheel-list-header">
            <h2>My Wheels</h2>
          </div>
          <div className="wheel-list">
            {wheels.map(wheel => (
              <div
                key={wheel.id}
                className={`wheel-item ${currentWheel?.id === wheel.id ? 'active' : ''}`}
                onClick={() => selectWheel(wheel)}
              >
                <span>{wheel.name}</span>
                <span className="item-count">({wheel.items.length})</span>
              </div>
            ))}
          </div>
          <div className="create-wheel">
            <input
              type="text"
              placeholder="New wheel name..."
              value={wheelName}
              onChange={(e) => setWheelName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateWheel()}
            />
            <button onClick={handleCreateWheel}>Create</button>
          </div>
        </aside>

        <main className="content">
          <div className="app-tabs">
            <button 
              className={`tab-btn ${activeTab === 'wheel' ? 'active' : ''}`}
              onClick={() => setActiveTab('wheel')}
            >
              🎡 Wheel
            </button>
            <button 
              className={`tab-btn ${activeTab === 'beerpong' ? 'active' : ''}`}
              onClick={() => setActiveTab('beerpong')}
            >
              🍺 Beerpong
            </button>
            <button 
              className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
              onClick={() => setActiveTab('manual')}
            >
              📖 Handleiding
            </button>
          </div>

          {activeTab === 'wheel' ? (
            currentWheel ? (
              <>
                <div className="wheel-header">
                  <h2>{currentWheel.name}</h2>
                  {editingWheel !== currentWheel.id && (
                    <button className="edit-btn" onClick={() => setEditingWheel(currentWheel.id)}>
                      Edit
                    </button>
                  )}
                  <button className="delete-btn" onClick={() => handleDeleteWheel(currentWheel.id)}>
                    Delete
                  </button>
                </div>

                <div className="wheel-container">
                  <SpinWheel
                    items={currentWheel.items}
                    onSpinEnd={handleSpinResult}
                    key={currentWheel.id}
                  />
                </div>

                {selectedResult && (
                  <div className="result-modal">
                    <div className="result-content">
                      <h3>Winner!</h3>
                      <p>{selectedResult}</p>
                      <button onClick={() => setSelectedResult(null)}>Close</button>
                    </div>
                  </div>
                )}

                <ItemList
                  items={currentWheel.items}
                  onAdd={handleAddItem}
                  onRemove={handleRemoveItem}
                  onEdit={handleEditItem}
                  newItem={newItem}
                  setNewItem={setNewItem}
                />

                <Scoreboard history={history} leaderboard={leaderboard} />
              </>
            ) : (
              <div className="no-wheel">
                <p>Create or select a wheel to get started!</p>
              </div>
            )
          ) : activeTab === 'beerpong' ? (
            <BeerpongScoreboard apiBaseUrl={API_BASE_URL} />
          ) : (
            <Manual />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
