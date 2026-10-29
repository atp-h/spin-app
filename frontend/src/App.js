import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import WheelPage from './components/WheelPage';
import BeerpongScoreboard from './components/BeerpongScoreboard';
import Manual from './components/Manual';
import Modal from './components/Modal';
import PinPrompt from './components/PinPrompt';
import Toasts from './components/Toasts';
import { api, getStoredPin, setStoredPin, isPinError } from './api';
import { AppContext, useLiveVersion } from './hooks';

const readSoundSetting = () => {
  try {
    return localStorage.getItem('spin-sound') !== 'off';
  } catch {
    return true;
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('wheel'); // 'wheel' or 'beerpong'
  const [isSpinning, setIsSpinning] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [soundOn, setSoundOn] = useState(readSoundSetting);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(null); // resolver of the open PIN prompt
  const toastId = useRef(0);
  const version = useLiveVersion();

  useEffect(() => {
    api.get('/api/auth')
      .then(res => setPinRequired(!!res.data.pin_required))
      .catch(() => {});
  }, []);

  const dismissToast = useCallback((id) => setToasts(current => current.filter(t => t.id !== id)), []);

  // notify(message, type = 'error' | 'success' | 'info', { duration, action: { label, onClick } })
  const notify = useCallback((message, type = 'error', options = {}) => {
    const id = ++toastId.current;
    setToasts(current => [...current, { id, message, type, action: options.action }]);
    setTimeout(() => dismissToast(id), options.duration || 4000);
  }, [dismissToast]);

  const askPin = useCallback(() => new Promise(resolve => setPinPrompt(() => resolve)), []);

  // Resolves true when the action may go ahead (no PIN configured, PIN known, or just entered)
  const ensurePin = useCallback(async (force = false) => {
    if (!force && (!pinRequired || getStoredPin())) return true;
    return askPin();
  }, [pinRequired, askPin]);

  // Runs a protected request; on a PIN rejection asks once and retries.
  // Resolves undefined when the user cancels the PIN prompt.
  const withPin = useCallback(async (action) => {
    if (!(await ensurePin())) return undefined;
    try {
      return await action();
    } catch (error) {
      if (isPinError(error) && error.response.status === 401) {
        setStoredPin('');
        setPinRequired(true);
        if (await ensurePin(true)) return action();
        return undefined;
      }
      throw error;
    }
  }, [ensurePin]);

  const toggleSound = () => {
    setSoundOn(on => {
      try {
        localStorage.setItem('spin-sound', on ? 'off' : 'on');
      } catch {
        // storage unavailable (private mode); the toggle still works for this visit
      }
      return !on;
    });
  };

  const context = useMemo(
    () => ({ notify, withPin, ensurePin, version, soundOn }),
    [notify, withPin, ensurePin, version, soundOn]
  );

  const closeHelp = useCallback(() => setShowHelp(false), []);

  return (
    <AppContext.Provider value={context}>
      <div className="app">
        <header className="header">
          <div className="brand">
            <span className="header-logo" aria-hidden="true">🎡</span>
            <h1>Spin The Wheel</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="icon-btn header-help" onClick={() => setShowHelp(true)} title="Handleiding" aria-label="Handleiding">
              ?
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleSound}
              aria-pressed={soundOn}
              title={soundOn ? 'Geluid uit' : 'Geluid aan'}
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>
        </header>

        <nav className="main-nav" aria-label="Hoofdmenu">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'wheel' ? 'active' : ''}`}
            onClick={() => setActiveTab('wheel')}
          >
            <span className="nav-icon" aria-hidden="true">🎡</span>
            <span className="nav-label">Wheel</span>
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'beerpong' ? 'active' : ''}`}
            onClick={() => setActiveTab('beerpong')}
            disabled={isSpinning}
          >
            <span className="nav-icon" aria-hidden="true">🍺</span>
            <span className="nav-label">Beerpong</span>
          </button>
          <button type="button" className="nav-btn nav-help" onClick={() => setShowHelp(true)}>
            <span className="nav-icon" aria-hidden="true">📖</span>
            <span className="nav-label">Help</span>
          </button>
        </nav>

        <main className="content">
          {activeTab === 'wheel'
            ? <WheelPage onSpinningChange={setIsSpinning} />
            : <BeerpongScoreboard />}
        </main>

        {showHelp && (
          <Modal title="📖 Handleiding" onClose={closeHelp} className="help-modal">
            <Manual />
          </Modal>
        )}

        {pinPrompt && (
          <PinPrompt onDone={(ok) => { pinPrompt(ok); setPinPrompt(null); }} />
        )}

        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppContext.Provider>
  );
}

export default App;
