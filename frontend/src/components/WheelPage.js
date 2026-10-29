import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SpinWheel, { COLORS, toSlices } from './SpinWheel';
import ItemList from './ItemList';
import Scoreboard from './Scoreboard';
import Confetti from './Confetti';
import { api } from '../api';
import { useApp, useOnRemoteChange } from '../hooks';
import { errorMessage } from '../utils';

const UNDO_MS = 6000;
const LAST_WHEEL_KEY = 'spin-last-wheel';
const ELIMINATION_KEY = 'spin-elimination';

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode); state just won't survive a reload
  }
};

// Weight-1 items are stored as plain strings, which keeps older data compatible
const serializeItems = (slices) => slices.map(s => (s.weight > 1 ? { label: s.label, weight: s.weight } : s.label));

const partySizeFor = () => Math.max(260, Math.min(window.innerWidth - 32, window.innerHeight - 170));

function WheelPage({ onSpinningChange }) {
  const { notify, withPin, ensurePin, version, soundOn } = useApp();
  const [wheels, setWheels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState(() => readJson(LAST_WHEEL_KEY, null));
  const [selectedResult, setSelectedResult] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWheelName, setNewWheelName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [partyMode, setPartyMode] = useState(false);
  const [partySize, setPartySize] = useState(partySizeFor);
  // Per wheel: { on: boolean, removed: [label, ...] }; kept on this device only
  const [elimination, setElimination] = useState(() => readJson(ELIMINATION_KEY, {}));
  const pendingDelete = useRef(null);
  const wheelRef = useRef(null);

  const currentWheel = wheels.find(w => w.id === currentId) || null;
  const slices = useMemo(() => toSlices(currentWheel?.items), [currentWheel]);
  const elim = (currentWheel && elimination[currentWheel.id]) || { on: false, removed: [] };
  const activeSlices = useMemo(
    () => (elim.on ? slices.filter(s => !elim.removed.includes(s.label)) : slices),
    [slices, elim.on, elim.removed]
  );

  const fetchWheels = useCallback(async () => {
    try {
      const res = await api.get('/api/wheels');
      const pendingId = pendingDelete.current?.wheel.id;
      const list = res.data.filter(w => w.id !== pendingId);
      setWheels(list);
      setCurrentId(id => (list.some(w => w.id === id) ? id : list[0]?.id ?? null));
    } catch (error) {
      notify('Kon de raderen niet laden: ' + errorMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [notify]);

  const fetchScoreboard = useCallback(async (wheelId) => {
    if (!wheelId) return;
    try {
      const [historyRes, leaderboardRes] = await Promise.all([
        api.get(`/api/wheels/${wheelId}/history`),
        api.get(`/api/wheels/${wheelId}/leaderboard`)
      ]);
      setHistory(historyRes.data);
      setLeaderboard(leaderboardRes.data);
    } catch (error) {
      console.error('Error fetching scoreboard:', error);
    }
  }, []);

  useEffect(() => {
    fetchWheels();
  }, [fetchWheels]);

  useEffect(() => {
    setHistory([]);
    setLeaderboard([]);
    fetchScoreboard(currentId);
    if (currentId) writeJson(LAST_WHEEL_KEY, currentId);
  }, [currentId, fetchScoreboard]);

  // Another phone changed something: refresh, but never yank the wheel mid-spin
  useOnRemoteChange(version, () => {
    if (isSpinning) return;
    fetchWheels();
    fetchScoreboard(currentId);
  });

  useEffect(() => writeJson(ELIMINATION_KEY, elimination), [elimination]);

  // An empty wheel opens its item editor; after that the user decides
  const currentIsEmpty = !!currentWheel && currentWheel.items.length === 0;
  useEffect(() => {
    if (currentIsEmpty) setEditorOpen(true);
    // only when switching wheels, not when the last item is removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // A deletion still waiting for its undo window is carried out when leaving the page
  useEffect(() => {
    const pendingRef = pendingDelete;
    return () => {
      const pending = pendingRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        api.post(`/api/wheels/${pending.wheel.id}/delete`).catch(() => {});
      }
    };
  }, []);

  const handleSpinningChange = useCallback((spinning) => {
    setIsSpinning(spinning);
    onSpinningChange?.(spinning);
  }, [onSpinningChange]);

  useEffect(() => {
    if (!partyMode) return;
    const onResize = () => setPartySize(partySizeFor());
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPartyMode(false);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [partyMode]);

  const enterParty = async () => {
    setPartySize(partySizeFor());
    setPartyMode(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // fullscreen refused (e.g. iOS Safari); the overlay still fills the window
    }
  };

  const exitParty = () => {
    setPartyMode(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  const updateElimination = useCallback((wheelId, change) => {
    setElimination(current => {
      const prev = current[wheelId] || { on: false, removed: [] };
      return { ...current, [wheelId]: { ...prev, ...change(prev) } };
    });
  }, []);

  const saveItems = async (newSlices) => {
    const wheel = currentWheel;
    const items = serializeItems(newSlices);
    setWheels(current => current.map(w => (w.id === wheel.id ? { ...w, items } : w)));
    try {
      await api.post(`/api/wheels/${wheel.id}/update`, { name: wheel.name, items });
    } catch (error) {
      notify('Fout bij opslaan rad: ' + errorMessage(error));
      fetchWheels();
    }
  };

  const handleCreateWheel = async (e) => {
    e?.preventDefault();
    const name = newWheelName.trim();
    if (!name) return;
    try {
      const res = await api.post('/api/wheels', { name, items: [] });
      setWheels(current => [res.data, ...current]);
      setCurrentId(res.data.id);
      setNewWheelName('');
      setCreating(false);
      setEditorOpen(true);
    } catch (error) {
      notify('Fout bij aanmaken rad: ' + errorMessage(error));
    }
  };

  const handleDuplicate = async () => {
    try {
      const res = await api.post('/api/wheels', { name: `${currentWheel.name} (kopie)`, items: currentWheel.items });
      setWheels(current => [res.data, ...current]);
      setCurrentId(res.data.id);
      notify('Rad gekopieerd', 'success');
    } catch (error) {
      notify('Fout bij kopiëren rad: ' + errorMessage(error));
    }
  };

  // Hide immediately, delete for real after the undo window
  const handleDelete = async () => {
    if (!(await ensurePin())) return;
    if (pendingDelete.current) {
      clearTimeout(pendingDelete.current.timer);
      await api.post(`/api/wheels/${pendingDelete.current.wheel.id}/delete`).catch(() => {});
    }
    const wheel = currentWheel;
    const index = wheels.findIndex(w => w.id === wheel.id);
    const remaining = wheels.filter(w => w.id !== wheel.id);
    setWheels(remaining);
    setCurrentId(remaining[0]?.id ?? null);
    setIsRenaming(false);

    const restore = () => {
      setWheels(current => {
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, wheel);
        return next;
      });
      setCurrentId(wheel.id);
    };

    const timer = setTimeout(async () => {
      pendingDelete.current = null;
      try {
        const done = await withPin(() => api.post(`/api/wheels/${wheel.id}/delete`));
        if (done === undefined) restore();
      } catch (error) {
        notify('Fout bij verwijderen rad: ' + errorMessage(error));
        restore();
      }
    }, UNDO_MS);
    pendingDelete.current = { wheel, timer };

    notify(`"${wheel.name}" verwijderd`, 'info', {
      duration: UNDO_MS,
      action: {
        label: 'Ongedaan maken',
        onClick: () => {
          clearTimeout(timer);
          pendingDelete.current = null;
          restore();
        }
      }
    });
  };

  const startRename = () => {
    setRenameValue(currentWheel.name);
    setIsRenaming(true);
  };

  const saveRename = async (e) => {
    e?.preventDefault();
    const name = renameValue.trim();
    if (name && name !== currentWheel.name) {
      try {
        const res = await api.post(`/api/wheels/${currentWheel.id}/update`, { name, items: currentWheel.items });
        setWheels(current => current.map(w => (w.id === res.data.id ? res.data : w)));
      } catch (error) {
        notify('Fout bij hernoemen: ' + errorMessage(error));
        return;
      }
    }
    setIsRenaming(false);
  };

  const fillFromPlayers = async () => {
    try {
      const res = await api.get('/api/players');
      const present = res.data.filter(p => p.is_present);
      if (!present.length) {
        notify('Er zijn geen spelers aanwezig. Vink ze aan bij Beerpong → Players.');
        return;
      }
      if (slices.length && !window.confirm(`De ${slices.length} huidige items vervangen door ${present.length} aanwezige spelers?`)) return;
      await saveItems(present.map(p => ({ label: p.emoji ? `${p.emoji} ${p.name}` : p.name, weight: 1 })));
      updateElimination(currentWheel.id, () => ({ removed: [] }));
    } catch (error) {
      notify('Kon spelers niet laden: ' + errorMessage(error));
    }
  };

  const handleSpinResult = useCallback(async (label, color) => {
    setSelectedResult({ label, color, wheelId: currentId, eliminate: elim.on });
    try {
      await api.post('/api/spins', { wheel_id: currentId, item: label });
      fetchScoreboard(currentId);
    } catch (error) {
      notify('Uitslag kon niet worden opgeslagen: ' + errorMessage(error));
    }
  }, [currentId, elim.on, fetchScoreboard, notify]);

  // In elimination mode the winner leaves the wheel when the result is dismissed
  const closeResult = useCallback(() => {
    setSelectedResult(result => {
      if (result?.eliminate) {
        updateElimination(result.wheelId, prev => ({ removed: [...prev.removed, result.label] }));
      }
      return null;
    });
  }, [updateElimination]);

  useEffect(() => {
    if (!selectedResult) return;
    const onKeyDown = (e) => e.key === 'Escape' && closeResult();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedResult, closeResult]);

  const spinAgain = () => {
    closeResult();
    // Wait a frame so the eliminated item is gone before the next spin starts
    requestAnimationFrame(() => wheelRef.current?.spin());
  };

  const allEliminated = elim.on && slices.length > 0 && activeSlices.length === 0;

  const wheelElement = (size) => (
    <SpinWheel
      ref={wheelRef}
      items={activeSlices}
      onSpinEnd={handleSpinResult}
      onSpinningChange={handleSpinningChange}
      soundOn={soundOn}
      size={size}
      key={currentId}
    />
  );

  const resultModal = selectedResult && (
    <div className="result-modal" onClick={closeResult}>
      <Confetti colors={COLORS} />
      <div
        className="result-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Winner"
        style={{ '--winner-color': selectedResult.color }}
      >
        <div className="result-emoji" aria-hidden="true">🎉</div>
        <h3>Winner!</h3>
        <p>{selectedResult.label}</p>
        {selectedResult.eliminate && <div className="result-note">gaat van het rad af</div>}
        <div className="result-actions">
          {activeSlices.length > (selectedResult.eliminate ? 1 : 0) && (
            <button className="btn-primary" onClick={spinAgain}>Spin again</button>
          )}
          <button className="btn-ghost" onClick={closeResult} autoFocus>Close</button>
        </div>
      </div>
    </div>
  );

  const eliminationBar = currentWheel && (
    <div className="wheel-toolbar">
      <label className={`switch ${elim.on ? 'on' : ''}`}>
        <input
          type="checkbox"
          checked={elim.on}
          onChange={(e) => updateElimination(currentWheel.id, () => ({ on: e.target.checked, removed: [] }))}
          disabled={isSpinning}
        />
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
        Afvalrace
      </label>
      {elim.on && (
        <span className="toolbar-status">
          {activeSlices.length}/{slices.length} over
          {elim.removed.length > 0 && (
            <button type="button" className="link-btn inline" onClick={() => updateElimination(currentWheel.id, () => ({ removed: [] }))} disabled={isSpinning}>
              ↺ reset
            </button>
          )}
        </span>
      )}
      <button type="button" className="chip-btn party-btn" onClick={enterParty} disabled={!slices.length}>
        📺 Party mode
      </button>
    </div>
  );

  if (partyMode && currentWheel) {
    return (
      <div className="party-mode">
        <div className="party-top">
          <h2>{currentWheel.name}</h2>
          {elim.on && <span className="toolbar-status">{activeSlices.length}/{slices.length} over</span>}
          <button type="button" className="icon-btn" onClick={exitParty} aria-label="Party mode sluiten" disabled={isSpinning}>✕</button>
        </div>
        {allEliminated ? (
          <div className="all-out">
            <p>Iedereen is geweest! 🎉</p>
            <button className="btn-primary" onClick={() => updateElimination(currentWheel.id, () => ({ removed: [] }))}>↺ Opnieuw</button>
          </div>
        ) : wheelElement(partySize)}
        {resultModal}
      </div>
    );
  }

  return (
    <div className="wheel-page">
      <div className="wheel-picker" role="tablist" aria-label="Raderen">
        {wheels.map(wheel => (
          <button
            type="button"
            role="tab"
            aria-selected={wheel.id === currentId}
            key={wheel.id}
            className={`wheel-chip ${wheel.id === currentId ? 'active' : ''}`}
            onClick={() => { setCurrentId(wheel.id); setIsRenaming(false); setSelectedResult(null); }}
            disabled={isSpinning}
          >
            {wheel.name}
            <span className="item-count">{wheel.items.length}</span>
          </button>
        ))}
        {creating ? (
          <form className="new-wheel-form" onSubmit={handleCreateWheel}>
            <input
              type="text"
              placeholder="New wheel name..."
              value={newWheelName}
              onChange={(e) => setNewWheelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={!newWheelName.trim()}>Create</button>
          </form>
        ) : (
          <button type="button" className="wheel-chip new" onClick={() => setCreating(true)} disabled={isSpinning}>
            ＋ Nieuw rad
          </button>
        )}
      </div>

      {currentWheel ? (
        <div className="wheel-layout">
          <section className="wheel-main">
            <div className="wheel-header">
              {isRenaming ? (
                <form className="rename-form" onSubmit={saveRename}>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setIsRenaming(false)}
                    aria-label="Nieuwe naam"
                    autoFocus
                  />
                  <button type="submit" className="btn-primary">Save</button>
                  <button type="button" className="btn-ghost" onClick={() => setIsRenaming(false)}>Cancel</button>
                </form>
              ) : (
                <>
                  <h2>{currentWheel.name}</h2>
                  <div className="wheel-actions">
                    <button className="icon-btn" onClick={startRename} disabled={isSpinning} title="Rename" aria-label="Rename">✏️</button>
                    <button className="icon-btn" onClick={handleDuplicate} disabled={isSpinning} title="Kopieer rad" aria-label="Kopieer rad">⧉</button>
                    <button className="icon-btn danger" onClick={handleDelete} disabled={isSpinning} title="Delete" aria-label="Delete">🗑</button>
                  </div>
                </>
              )}
            </div>

            {eliminationBar}

            <div className="wheel-container">
              {allEliminated ? (
                <div className="all-out">
                  <p>Iedereen is geweest! 🎉</p>
                  <button className="btn-primary" onClick={() => updateElimination(currentWheel.id, () => ({ removed: [] }))}>↺ Opnieuw</button>
                </div>
              ) : wheelElement(undefined)}
            </div>
          </section>

          <aside className="wheel-side">
            <ItemList
              items={slices}
              onChange={saveItems}
              onFillFromPlayers={fillFromPlayers}
              disabled={isSpinning}
              open={editorOpen}
              onToggle={() => setEditorOpen(o => !o)}
              eliminated={elim.on ? elim.removed : []}
            />
            <Scoreboard history={history} leaderboard={leaderboard} />
          </aside>
        </div>
      ) : loaded && (
        <div className="no-wheel">
          <div className="no-wheel-emoji" aria-hidden="true">🎡</div>
          <p>Maak je eerste rad aan om te beginnen!</p>
          {!creating && <button className="btn-primary" onClick={() => setCreating(true)}>＋ Nieuw rad</button>}
        </div>
      )}

      {resultModal}
    </div>
  );
}

export default WheelPage;
