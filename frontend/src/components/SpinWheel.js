import React, { useRef, useEffect, useState, useCallback } from 'react';

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF8C00'
];

function SpinWheel({ items, onSpinEnd }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const getSize = useCallback(() => {
    if (typeof window === 'undefined') return 300;
    const w = window.innerWidth;
    if (w <= 480) return w - 40;
    if (w <= 768) return Math.min(w - 60, 320);
    return 380;
  }, []);

  const [size, setSize] = useState(getSize);

  useEffect(() => {
    const handleResize = () => {
      setSize(getSize());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 15;
    const fontSize = size < 320 ? 10 : 12;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation * Math.PI / 180);

    if (!items || items.length === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2d3748';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#a0aec0';
      ctx.font = `14px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add items!', 0, 0);
      ctx.restore();
      return;
    }

    const slice = (Math.PI * 2) / items.length;

    items.forEach((item, i) => {
      const start = i * slice - Math.PI / 2;
      const end = start + slice;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.rotate(start + slice / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#111';
      ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;

      const maxLen = size < 320 ? 5 : 8;
      let text = item;
      if (text.length > maxLen) text = text.substring(0, maxLen) + '..';
      ctx.fillText(text, radius - 10, 4);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }, [items, rotation, size, isMobile]);

  const spin = useCallback(() => {
    if (isSpinning || !items || items.length === 0) return;

    setIsSpinning(true);
    const startRotation = rotationRef.current;
    
    // 1. Pick a winner first for guaranteed randomness
    const winnerIndex = Math.floor(Math.random() * items.length);
    const sliceSize = 360 / items.length;
    
    // 2. Calculate the target angle for this winner
    // Item 0 is at the top (-90deg offset in drawing).
    // To land on winnerIndex, the wheel must be rotated such that 
    // the slice is at the pointer (top).
    const endAngle = (360 - (winnerIndex * sliceSize + sliceSize / 2)) % 360;
    
    // 3. Slower rotation: 2-3 full spins + the required offset
    const spins = 2 + Math.floor(Math.random() * 2); 
    const target = startRotation + (spins * 360) + ((endAngle - (startRotation % 360) + 360) % 360);
    
    const duration = 9000; // Keep 9 seconds
    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use cubic easing (power of 3) instead of quart (power of 4) 
      // for a faster-feeling arrival at the end.
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startRotation + (target - startRotation) * eased;

      setRotation(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        rotationRef.current = current;
        onSpinEnd(items[winnerIndex]);
      }
    };

    requestAnimationFrame(animate);
  }, [isSpinning, items, onSpinEnd]);

  const handleClick = (e) => {
    e.preventDefault();
    spin();
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', touchAction: 'manipulation' }}>
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '24px solid #fff',
          zIndex: 10,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
        }} />
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onTouchEnd={handleClick}
          style={{
            display: 'block',
            cursor: isSpinning ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation'
          }}
        />
      </div>
      {items && items.length > 0 && (
        <p style={{
          marginTop: '12px',
          color: '#a0aec0',
          fontSize: '14px',
          fontFamily: '-apple-system, sans-serif'
        }}>
          {isSpinning ? '...' : 'Tap to spin!'}
        </p>
      )}
    </div>
  );
}

export default SpinWheel;
