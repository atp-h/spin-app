# 03 — Algorithm: Spin Wheel

Source: `frontend/src/components/SpinWheel.js`

## 1. Concept

The wheel decides the winner **first**, uniformly at random, and then computes a final rotation that puts that slice under the fixed top pointer. The animation is cosmetic: the outcome does not depend on frame timing or on physics. [VERIFY: frontend/src/components/SpinWheel.js:123-131]

## 2. Geometry and coordinate frames

Canvas angles are measured clockwise from the +x axis, because the y axis points down. The drawing does this:

1. Translate to the center and rotate by `rotation` degrees (positive = clockwise). [VERIFY: frontend/src/components/SpinWheel.js:55-57]
2. Draw slice *i* over the local angles `[i·s − 90°, (i+1)·s − 90°]`, where `s = 360°/n`. The −90° offset puts slice 0's leading edge at 12 o'clock. [VERIFY: frontend/src/components/SpinWheel.js:77-86]
3. The pointer is a static CSS triangle centered above the canvas (`top:-12px; left:50%`). It points down at canvas angle −90°. [VERIFY: frontend/src/components/SpinWheel.js:171-183]

```
             pointer ▼   (canvas angle −90°)
          ┌─────────────┐
       slice n-1 │ slice 0
          │   ╲  │  ╱   │      local angle of slice i center:
          │    ╲ │ ╱    │         c_i = i·s + s/2 − 90°
          │ ────●──── → │ 0°     screen angle after rotation R:
          │    ╱ │ ╲    │         c_i + R
          │   ╱  │  ╲   │
          └─────────────┘
                90°
```

## 3. Target angle derivation

We want slice `w`'s center under the pointer:

```
c_w + R ≡ −90°            (mod 360)
w·s + s/2 − 90° + R ≡ −90°
R ≡ −(w·s + s/2) ≡ 360° − (w·s + s/2)   (mod 360)
```

This is exactly `endAngle`:

```js
const endAngle = (360 - (winnerIndex * sliceSize + sliceSize / 2)) % 360;
```
[VERIFY: frontend/src/components/SpinWheel.js:131]

The final absolute rotation must be ≡ `endAngle` (mod 360), larger than the start rotation, and include some full turns:

```js
const spins  = 2 + Math.floor(Math.random() * 2);        // 2 or 3
const target = start + spins*360 + ((endAngle - (start % 360) + 360) % 360);
```
[VERIFY: frontend/src/components/SpinWheel.js:134-135]

Proof that `target ≡ endAngle (mod 360)`: let `r = start mod 360` and `δ = (endAngle − r + 360) mod 360 ∈ [0, 360)`. Then `target mod 360 = (r + δ) mod 360 = endAngle`. The term `+360` keeps the operand non-negative before `%`, because JS `%` keeps the sign of the dividend.

Total sweep `target − start = 360·spins + δ ∈ [720°, 1440°)`.

`start` is always ≥ 0: it begins at 0 and each spin only adds a non-negative sweep, so `start % 360` is non-negative. [VERIFY: frontend/src/components/SpinWheel.js:14] [VERIFY: frontend/src/components/SpinWheel.js:155]

**Empirical check:** 60,000 random trials (n = 1..30, random start, random winner). Inverting the pointer position back to a slice index gave `winnerIndex` every time (0 mismatches). The sweep was always in [720°, 1440°).

## 4. Easing

```js
progress = min(elapsed / 9000, 1)
eased    = 1 − (1 − progress)^3            // cubic ease-out
current  = start + (target − start) · eased
```
[VERIFY: frontend/src/components/SpinWheel.js:137-147]

The angular velocity is `dθ/dt = 3(1 − p)² · Δ / T`, with `T = 9000 ms`.

| p | eased | share of sweep left | relative speed |
|---|-------|---------------------|----------------|
| 0.0 | 0.000 | 100 % | 3.00 |
| 0.25 | 0.578 | 42 % | 1.69 |
| 0.5 | 0.875 | 12.5 % | 0.75 |
| 0.75 | 0.984 | 1.6 % | 0.19 |
| 1.0 | 1.000 | 0 % | 0 |

So 87.5 % of the rotation happens in the first 4.5 s, and the last 2.25 s cover only 1.6 % of the sweep (≤ 23° of a 1440° sweep). That slow crawl is where the suspense comes from. At p = 1 the code assigns `current` exactly: `eased = 1` gives `current = target`, so there is no floating-point drift from accumulating frame deltas. The ref then stores it. [VERIFY: frontend/src/components/SpinWheel.js:151-157]

## 5. Animation loop and rendering cost

```
spin() ─ requestAnimationFrame(animate)
animate(t):
   setRotation(current)  ─▶ React re-render ─▶ draw effect runs
   progress<1 ? rAF(animate) : { setIsSpinning(false); rotationRef=current; onSpinEnd(winner) }
```
[VERIFY: frontend/src/components/SpinWheel.js:140-160]

The draw effect depends on `[items, rotation, size, isMobile]`, so **each frame does a full redraw**. [VERIFY: frontend/src/components/SpinWheel.js:115] The redraw:
- resets `canvas.width/height`, which clears the canvas and resets the transform, then re-applies `ctx.scale(dpr)` [VERIFY: frontend/src/components/SpinWheel.js:42-48];
- draws n slice paths, n texts and the hub [VERIFY: frontend/src/components/SpinWheel.js:79-112].

That is O(n) canvas operations per frame, plus one React render of `SpinWheel` per frame. At n ≤ a few dozen this is negligible. The design trades efficiency for simplicity: the alternative would be pre-rendering the wheel once to an offscreen canvas and only rotating a bitmap.

Labels are truncated to 8 characters, or 5 when `size < 320`, with `..` appended. [VERIFY: frontend/src/components/SpinWheel.js:99-101] Colors cycle through 15 hard-coded colors, so with more than 15 items, slices 0 and 15 share a color. [VERIFY: frontend/src/components/SpinWheel.js:3-7] [VERIFY: frontend/src/components/SpinWheel.js:87]

## 6. Randomness and fairness

- `Math.floor(Math.random() * n)` is uniform over `0..n−1` for practical purposes. [VERIFY: frontend/src/components/SpinWheel.js:124]
- Because the winner is fixed up front, slice size, start angle and frame drops cannot bias the result.
- Duplicate item texts get one slice each, so "A" listed twice has 2/n odds. They collapse into one row in the leaderboard, which groups by text. [VERIFY: backend/server.js:211-214]

## 7. Input handling and edge cases

| Case | Behavior | Evidence |
|------|----------|----------|
| Click during spin | ignored by the `isSpinning` guard | [VERIFY: frontend/src/components/SpinWheel.js:118] |
| Empty wheel | draws a grey disk with "Add items!"; `spin` returns early | [VERIFY: frontend/src/components/SpinWheel.js:59-75] [VERIFY: frontend/src/components/SpinWheel.js:118] |
| Touch | `onTouchEnd` and `onClick` share `handleClick`, which calls `preventDefault()` | [VERIFY: frontend/src/components/SpinWheel.js:163-166] [VERIFY: frontend/src/components/SpinWheel.js:186-187] |
| Items edited mid-spin | `animate` closes over the `items` from spin start, so `onSpinEnd` reports the old array's entry | [VERIFY: frontend/src/components/SpinWheel.js:156] [VERIFY: frontend/src/components/SpinWheel.js:161] |
| Wheel switched mid-spin | `<SpinWheel key={currentWheel.id}>` remounts. The old rAF loop is never cancelled, so it keeps running until p = 1 and then calls the `onSpinEnd` it captured | [VERIFY: frontend/src/App.js:232-236] |

In the last row, the captured `onSpinEnd` is the `handleSpinResult` from the render in which the spin started. That function closed over the old `currentWheel`, so the spin is posted to the **old** wheel's id. The winner modal opens over the new wheel, showing the old wheel's result.

## 8. Alternatives considered (not in code)

| Approach | Trade-off |
|----------|-----------|
| Physics spin (random initial velocity + friction), read result at stop | Feels "real", but the result depends on float math. You must map the angle back to a slice, and the outcome is harder to make provably uniform |
| CSS `transform: rotate()` transition | No per-frame React renders; the browser composites. The easing curve is limited to cubic-bézier |
| Current: pre-pick + eased tween | Provably uniform, deterministic landing, simple. Costs a re-render per frame |

## Verification checklist
- [x] Formula for `endAngle` derived and matched to line 131
- [x] Modular arithmetic proven and checked by simulation
- [x] Easing table computed from `1 − (1−p)^3`
