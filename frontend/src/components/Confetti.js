import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';

const PIECE_COUNT = 90;

// Pure-CSS confetti burst; every piece gets random position, timing and spin via CSS variables
function Confetti({ colors }) {
  const pieces = useMemo(() => Array.from({ length: PIECE_COUNT }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2.2 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 240,
    rotate: Math.random() * 360,
    color: colors[i % colors.length],
    round: i % 4 === 0
  })), [colors]);

  return createPortal(
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={p.round ? 'round' : ''}
          style={{
            '--left': `${p.left}%`,
            '--delay': `${p.delay}s`,
            '--duration': `${p.duration}s`,
            '--drift': `${p.drift}px`,
            '--rotate': `${p.rotate}deg`,
            '--color': p.color
          }}
        />
      ))}
    </div>,
    document.body
  );
}

export default Confetti;
