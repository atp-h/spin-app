import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { api } from './api';

const POLL_MS = 4000;

// Live updates: polls the server's change counter while the page is visible.
// Components refetch when the returned number changes.
export function useLiveVersion() {
  const [version, setVersion] = useState(null);
  const last = useRef(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await api.get('/api/version');
        if (!stopped && res.data.version !== last.current) {
          // The first answer is just the baseline, not a change
          if (last.current !== null) setVersion(res.data.version);
          last.current = res.data.version;
        }
      } catch {
        // offline or server restarting; try again on the next tick
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return version;
}

// Runs `effect` whenever the live version changes (not on mount)
export function useOnRemoteChange(version, effect) {
  const effectRef = useRef(effect);
  effectRef.current = effect;
  useEffect(() => {
    if (version !== null) effectRef.current();
  }, [version]);
}

// App-wide helpers handed down through context: notifications, PIN gate, live version
export const AppContext = createContext({
  notify: () => {},
  withPin: (action) => action(),
  version: null,
  soundOn: true
});

export const useApp = () => useContext(AppContext);
