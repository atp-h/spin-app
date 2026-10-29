import React, { useState, useRef, useCallback, useEffect } from 'react';
import Modal from '../Modal';
import SpinWheel from '../SpinWheel';
import { useApp } from '../../hooks';
import { Avatar } from './common';

const DRAW_SPEED = [1800, 2800];
const PAUSE_BETWEEN_SPINS = 700;
const SLOTS = ['Side A', 'Side A', 'Side B', 'Side B'];

const labelFor = (p) => (p.emoji ? `${p.emoji} ${p.name}` : p.name);

// Draws four present players one spin at a time: the first two form side A, the next two side B
function TeamDraw({ players, onDone, onClose }) {
  const { soundOn } = useApp();
  const [drawn, setDrawn] = useState([]);
  const [running, setRunning] = useState(false);
  const wheelRef = useRef(null);
  const timer = useRef(null);

  const remaining = players.filter(p => !drawn.some(d => d.id === p.id));
  const finished = drawn.length === 4;
  const size = Math.min(300, window.innerWidth - 80);

  // After each draw, wait for the wheel to re-render without that player, then spin again
  useEffect(() => {
    if (!running || drawn.length === 0) return undefined;
    if (drawn.length >= 4) {
      setRunning(false);
      return undefined;
    }
    timer.current = setTimeout(() => wheelRef.current?.spin(), PAUSE_BETWEEN_SPINS);
    return () => clearTimeout(timer.current);
  }, [drawn, running]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    setDrawn([]);
    setRunning(true);
    timer.current = setTimeout(() => wheelRef.current?.spin(), 50);
  };

  const handleSpinEnd = useCallback((label) => {
    const player = players.find(p => labelFor(p) === label);
    if (player) setDrawn(current => [...current, player]);
  }, [players]);

  return (
    <Modal title="🎡 Spin de teams" onClose={running ? () => {} : onClose} className="draw-modal">
      <div className="draw-slots">
        {SLOTS.map((side, i) => (
          <div key={i} className={`draw-slot ${i < 2 ? 'side-a' : 'side-b'} ${drawn[i] ? 'filled' : ''}`}>
            {drawn[i] ? (<><Avatar player={drawn[i]} size={28} /> {drawn[i].name}</>) : <span className="muted">{side}</span>}
          </div>
        ))}
      </div>

      {!finished && (
        <div className="draw-wheel">
          <SpinWheel
            ref={wheelRef}
            items={remaining.map(labelFor)}
            onSpinEnd={handleSpinEnd}
            soundOn={soundOn}
            size={size}
            durationRange={DRAW_SPEED}
          />
        </div>
      )}

      <div className="draw-actions">
        {finished ? (
          <>
            <button type="button" className="btn-ghost" onClick={start}>🔁 Opnieuw</button>
            <button type="button" className="btn-primary" onClick={() => onDone(drawn)}>✅ Deze teams!</button>
          </>
        ) : (
          <button type="button" className="btn-primary" onClick={start} disabled={running}>
            {running ? `Trekking… (${drawn.length}/4)` : '🎲 Start de trekking'}
          </button>
        )}
      </div>
    </Modal>
  );
}

export default TeamDraw;
