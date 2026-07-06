// ===========================================================================
// sim/rng.js — seeded deterministic RNG (Stage-2 determinism core)
//
// createRNG() returns an INDEPENDENT xorshift stream. The simulation owns one
// stream; presentation-only randomness (render shake jitter, menu starfield,
// blood spray) owns a separate stream. Keeping them isolated guarantees a fixed
// seed produces an identical *simulation* regardless of how many frames render —
// the single shared seed in the original build let render frame timing perturb
// gameplay, which would break server authority in Stage 2.
//
// hash2 is a pure, stateless spatial hash (no seed state) — safe to share for
// deterministic per-tile terrain detail on both sides of the boundary.
// ===========================================================================
export function createRNG(initial){
  let _seed = (initial >>> 0) || (0x9e3779b9 >>> 0);
  function srand(){ _seed ^= _seed << 13; _seed ^= _seed >>> 17; _seed ^= _seed << 5; _seed >>>= 0; return _seed / 4294967296; }
  function seed(n){ _seed = (n >>> 0) || 1; }
  const rr = (a, b) => a + srand() * (b - a);
  const ri = (a, b) => Math.floor(rr(a, b + 1));
  return { srand, seed, rr, ri };
}

export function hash2(x, y){ let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
