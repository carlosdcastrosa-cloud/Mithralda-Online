// ===========================================================================
// sim/math.js — pure math helpers shared by sim and render. No state, no DOM.
// ===========================================================================
export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const norm = (x, y) => { const m = Math.hypot(x, y) || 1; return [x / m, y / m]; };
export function angDiff(a, b){ let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
export function inRect(x, y, r){ return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
