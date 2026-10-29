import React, { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';

export const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e'
];

// Each spin lasts a random time in this range, so you never know quite when it stops
const MIN_SPIN_DURATION = 4000;
const MAX_SPIN_DURATION = 9000;
const REDUCED_SPIN_DURATION = 1500;
const BULBS = 20;
const TICK_MIN_GAP = 35; // ms between tick sounds/pointer flicks at full speed
const FONT = "'Fredoka', ui-rounded, system-ui, sans-serif";

// The last slice touches the first; avoid giving them the same color
export const sliceColor = (i, n) => {
  if (n > 1 && i === n - 1 && i % COLORS.length === 0) return COLORS[COLORS.length / 2];
  return COLORS[i % COLORS.length];
};

// Items are strings or { label, weight }; a slice's angle is proportional to its weight
export const toSlices = (items) =>
  (items || []).map(i => (typeof i === 'string' ? { label: i, weight: 1 } : { label: i.label, weight: i.weight || 1 }));

// Cumulative slice edges in degrees, clockwise from the top: [0, ..., 360]
export const sliceBounds = (slices) => {
  const total = slices.reduce((sum, s) => sum + s.weight, 0);
  const bounds = [0];
  slices.forEach(s => bounds.push(bounds[bounds.length - 1] + (s.weight / total) * 360));
  bounds[bounds.length - 1] = 360;
  return bounds;
};

// Index of the slice under the top pointer for a rotation in degrees (see docs/analysis/03 §3).
// `bounds` is a sliceBounds() array, or a slice count for equal slices.
export const sliceAt = (rotation, bounds) => {
  if (typeof bounds === 'number') bounds = sliceBounds(Array.from({ length: bounds }, () => ({ weight: 1 })));
  const deg = ((-rotation % 360) + 360) % 360;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (deg < bounds[i + 1]) return i;
  }
  return bounds.length - 2;
};

export const pickWeighted = (slices) => {
  let r = Math.random() * slices.reduce((sum, s) => sum + s.weight, 0);
  for (let i = 0; i < slices.length; i++) {
    r -= slices[i].weight;
    if (r < 0) return i;
  }
  return slices.length - 1;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Tiny Web Audio synth, created lazily on the first spin (a user gesture)
let audioCtx = null;
const getAudio = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

const tone = (ctx, freq, start, length, volume, type = 'triangle') => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
};

const playTick = () => {
  if (audioCtx) tone(audioCtx, 1400, audioCtx.currentTime, 0.035, 0.06);
};

const playWin = () => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(audioCtx, f, t + i * 0.09, 0.35, 0.12, 'sine'));
};

const fitText = (ctx, text, maxWidth) => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
};

function drawWheel(ctx, size, rotation, slices, winnerIndex, spinning) {
  const c = size / 2;
  const outer = c - 4;
  const rim = Math.max(12, size * 0.05);
  const radius = outer - rim;

  ctx.clearRect(0, 0, size, size);

  // Rim with chasing lights (static frame; only the slices rotate)
  const rimGrad = ctx.createLinearGradient(0, 0, size, size);
  rimGrad.addColorStop(0, '#2e1065');
  rimGrad.addColorStop(1, '#4c1d95');
  ctx.beginPath();
  ctx.arc(c, c, outer, 0, Math.PI * 2);
  ctx.fillStyle = rimGrad;
  ctx.fill();

  const phase = spinning ? Math.floor(performance.now() / 90) : 0;
  for (let b = 0; b < BULBS; b++) {
    const a = (b / BULBS) * Math.PI * 2;
    const lit = spinning ? (b + phase) % 2 === 0 : true;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * (outer - rim / 2), c + Math.sin(a) * (outer - rim / 2), Math.max(2.5, rim * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#fde68a' : 'rgba(253, 230, 138, 0.25)';
    ctx.shadowColor = lit ? 'rgba(253, 230, 138, 0.9)' : 'transparent';
    ctx.shadowBlur = lit ? 8 : 0;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.translate(c, c);

  if (slices.length === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
    ctx.fillStyle = '#a9a3c9';
    ctx.font = `600 ${Math.round(size * 0.05)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add items!', 0, radius * 0.45);
    ctx.restore();
    return;
  }

  ctx.rotate(rotation * Math.PI / 180);
  const n = slices.length;
  const bounds = sliceBounds(slices).map(d => d * Math.PI / 180);
  const textMax = radius * 0.62;

  slices.forEach((item, i) => {
    const start = bounds[i] - Math.PI / 2;
    const end = bounds[i + 1] - Math.PI / 2;
    const slice = end - start;
    // Font size bounded by wheel size and by the slice's height at the label's radius
    const fontSize = Math.max(10, Math.min(size * 0.05, radius * 0.6 * slice * 0.55, 20));

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = sliceColor(i, n);
    ctx.fill();

    if (winnerIndex !== null && i !== winnerIndex) {
      ctx.fillStyle = 'rgba(11, 8, 32, 0.45)';
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = n > 24 ? 1 : 2;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + slice / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillText(fitText(ctx, item.label, textMax), radius - 14, 0);
    ctx.restore();
  });

  // Soft depth: light center, darker edge
  const shade = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  shade.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = shade;
  ctx.fill();

  if (winnerIndex !== null && winnerIndex < n) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, bounds[winnerIndex] - Math.PI / 2, bounds[winnerIndex + 1] - Math.PI / 2);
    ctx.closePath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.restore();
}

const getSize = () => {
  if (typeof window === 'undefined') return 320;
  const w = window.innerWidth;
  if (w <= 480) return w - 48;
  if (w <= 768) return Math.min(w - 60, 360);
  return 420;
};

const SpinWheel = forwardRef(function SpinWheel({
  items, onSpinEnd, onSpinningChange, soundOn = true, size: fixedSize, durationRange
}, ref) {
  const canvasRef = useRef(null);
  const pointerRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState(null);
  const [autoSize, setSize] = useState(getSize);
  const size = fixedSize || autoSize;
  const slices = useMemo(() => toSlices(items), [items]);
  const [fontsReady, setFontsReady] = useState(0);
  const rotationRef = useRef(0);
  const frameRef = useRef(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    const handleResize = () => setSize(getSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Redraw once the web font has loaded so labels don't stay in the fallback font
  useEffect(() => {
    document.fonts?.ready?.then(() => setFontsReady(n => n + 1));
  }, []);

  // A changed item list invalidates the highlighted winner
  useEffect(() => setWinnerIndex(null), [slices]);

  // Stop a running spin when the wheel unmounts (wheel or tab switch), so a
  // stale animation never reports a winner for a wheel that is no longer shown
  useEffect(() => () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      onSpinningChange?.(false);
    }
  }, [onSpinningChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);
    drawWheel(ctx, size, rotation, slices, winnerIndex, isSpinning);
  }, [slices, rotation, size, winnerIndex, isSpinning, fontsReady]);

  const flickPointer = () => {
    const el = pointerRef.current;
    if (!el) return;
    el.classList.remove('tick');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('tick');
  };

  const spin = useCallback(() => {
    if (isSpinning || slices.length === 0) return;
    if (soundRef.current) getAudio();

    setIsSpinning(true);
    setWinnerIndex(null);
    onSpinningChange?.(true);
    const startRotation = rotationRef.current;
    const n = slices.length;
    const bounds = sliceBounds(slices);

    // 1. Pick a winner first (chance proportional to weight)
    const winner = pickWeighted(slices);

    // 2. Rotation that puts the winner's center under the pointer (item 0 starts at the top)
    const endAngle = (360 - (bounds[winner] + bounds[winner + 1]) / 2) % 360;

    // 3. Random duration; full turns scale with it (~1.2 per second, plus 0-1 extra)
    //    so a long spin is not just a slow one
    const [minDuration, maxDuration] = durationRange || [MIN_SPIN_DURATION, MAX_SPIN_DURATION];
    const duration = prefersReducedMotion()
      ? Math.min(REDUCED_SPIN_DURATION, minDuration)
      : minDuration + Math.random() * (maxDuration - minDuration);
    const spins = Math.round((duration / 1000) * 1.2) + Math.floor(Math.random() * 2);
    const target = startRotation + (spins * 360) + ((endAngle - (startRotation % 360) + 360) % 360);

    const startTime = performance.now();
    let lastSlice = sliceAt(startRotation, bounds);
    let lastTick = 0;

    const animate = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      // Cubic ease-out: fast start, smooth stop
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startRotation + (target - startRotation) * eased;

      setRotation(current);

      const sliceNow = sliceAt(current, bounds);
      if (sliceNow !== lastSlice && time - lastTick >= TICK_MIN_GAP) {
        lastSlice = sliceNow;
        lastTick = time;
        flickPointer();
        if (soundRef.current) playTick();
      }

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
        rotationRef.current = current;
        setIsSpinning(false);
        setWinnerIndex(winner);
        onSpinningChange?.(false);
        if (soundRef.current) playWin();
        onSpinEnd(slices[winner].label, sliceColor(winner, n));
      }
    };

    frameRef.current = requestAnimationFrame(animate);
  }, [isSpinning, slices, onSpinEnd, onSpinningChange, durationRange]);

  useImperativeHandle(ref, () => ({ spin }), [spin]);

  const handleClick = (e) => {
    e.preventDefault();
    spin();
  };

  const hasItems = slices.length > 0;
  const hub = Math.round(size * 0.22);

  return (
    <div className="wheel-wrap">
      <div className={`wheel-stage ${isSpinning ? 'spinning' : ''}`} style={{ width: size, height: size }}>
        <div className="wheel-glow" aria-hidden="true" />
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onTouchEnd={handleClick}
          className="wheel-canvas"
          style={{ cursor: isSpinning || !hasItems ? 'default' : 'pointer' }}
        />
        <div className="wheel-pointer" ref={pointerRef} aria-hidden="true" />
        <button
          type="button"
          className="spin-hub"
          onClick={spin}
          disabled={isSpinning || !hasItems}
          style={{ width: hub, height: hub, fontSize: Math.max(14, hub * 0.24) }}
          aria-label={isSpinning ? 'Wheel is spinning' : 'Spin the wheel'}
        >
          {isSpinning ? '🎲' : 'SPIN'}
        </button>
      </div>
      {hasItems && (
        <p className="wheel-hint">{isSpinning ? 'Good luck…' : 'Tap the wheel or press SPIN'}</p>
      )}
    </div>
  );
});

export default SpinWheel;
