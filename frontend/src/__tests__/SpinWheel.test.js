import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SpinWheel, { sliceAt, sliceBounds, sliceColor, toSlices, pickWeighted } from '../components/SpinWheel';

afterEach(() => jest.restoreAllMocks());

// Steps the mocked requestAnimationFrame until the spin ends or `limit` ms pass
const runFrames = (getCallback, until, limit = 12000, step = 50) => {
  let t = 0;
  while (!until() && t < limit) {
    t += step;
    const cb = getCallback();
    act(() => cb(t));
  }
  return t;
};

const mockFrames = () => {
  let cb = null;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { cb = fn; return 1; });
  jest.spyOn(performance, 'now').mockReturnValue(0);
  return () => cb;
};

test('landing math puts the chosen slice under the pointer (equal and weighted slices)', () => {
  for (let trial = 0; trial < 2000; trial++) {
    const n = 1 + Math.floor(Math.random() * 20);
    const slices = Array.from({ length: n }, () => ({ weight: 1 + Math.floor(Math.random() * 5) }));
    const bounds = sliceBounds(slices);
    const w = Math.floor(Math.random() * n);
    const start = Math.random() * 1e5;
    const end = (360 - (bounds[w] + bounds[w + 1]) / 2) % 360;
    const target = start + 6 * 360 + ((end - (start % 360) + 360) % 360);
    expect(sliceAt(target, bounds)).toBe(w);
  }
  expect(sliceAt(0, 4)).toBe(0);
});

test('weighted pick follows the weights', () => {
  const slices = toSlices(['a', { label: 'b', weight: 3 }]);
  let b = 0;
  for (let i = 0; i < 20000; i++) if (pickWeighted(slices) === 1) b++;
  expect(b / 20000).toBeGreaterThan(0.72);
  expect(b / 20000).toBeLessThan(0.78);
});

test('neighbouring slices never share a color, including across the seam', () => {
  for (let n = 2; n <= 40; n++) {
    for (let i = 0; i < n; i++) expect(sliceColor(i, n)).not.toBe(sliceColor((i + 1) % n, n));
  }
});

test('a spin lasts 4–9 s, reports the winner and its color, then re-enables', () => {
  const ends = [];
  for (let k = 0; k < 40; k++) {
    const frame = mockFrames();
    const onSpinEnd = jest.fn();
    const onSpinningChange = jest.fn();
    const { unmount } = render(<SpinWheel items={['a', { label: 'b', weight: 2 }, 'c']} onSpinEnd={onSpinEnd} onSpinningChange={onSpinningChange} soundOn={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spin the wheel' }));
    expect(screen.getByRole('button', { name: 'Wheel is spinning' })).toBeDisabled();
    ends.push(runFrames(frame, () => onSpinEnd.mock.calls.length > 0));
    const [label, color] = onSpinEnd.mock.calls[0];
    expect(['a', 'b', 'c']).toContain(label);
    expect(color).toMatch(/^#/);
    expect(onSpinningChange).toHaveBeenLastCalledWith(false);
    unmount();
    jest.restoreAllMocks();
  }
  expect(Math.min(...ends)).toBeGreaterThanOrEqual(4000);
  expect(Math.max(...ends)).toBeLessThanOrEqual(9000);
});

test('durationRange makes quick spins possible (team draw)', () => {
  const frame = mockFrames();
  const onSpinEnd = jest.fn();
  render(<SpinWheel items={['a', 'b']} onSpinEnd={onSpinEnd} soundOn={false} durationRange={[1000, 1500]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Spin the wheel' }));
  const t = runFrames(frame, () => onSpinEnd.mock.calls.length > 0);
  expect(t).toBeLessThanOrEqual(1500);
});

test('unmounting mid-spin cancels it and never reports a winner', () => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const onSpinEnd = jest.fn();
  const onSpinningChange = jest.fn();
  const { container, unmount } = render(<SpinWheel items={['a', 'b']} onSpinEnd={onSpinEnd} onSpinningChange={onSpinningChange} />);
  fireEvent.click(container.querySelector('canvas'));
  unmount();
  expect(cancel).toHaveBeenCalledWith(42);
  expect(onSpinningChange).toHaveBeenLastCalledWith(false);
  expect(onSpinEnd).not.toHaveBeenCalled();
});

test('an empty wheel cannot spin', () => {
  render(<SpinWheel items={[]} onSpinEnd={() => {}} />);
  expect(screen.getByRole('button', { name: 'Spin the wheel' })).toBeDisabled();
});
