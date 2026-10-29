// Loaded by react-scripts before every test file
import '@testing-library/jest-dom';

// jsdom has no canvas: a chainable no-op 2D context so the wheel can "draw"
const ctx = new Proxy({}, {
  get: (_, prop) => {
    if (prop === 'measureText') return (text) => ({ width: String(text).length * 7 });
    return () => ctx;
  },
  set: () => true
});
HTMLCanvasElement.prototype.getContext = () => ctx;

window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

beforeEach(() => {
  localStorage.clear();
});
