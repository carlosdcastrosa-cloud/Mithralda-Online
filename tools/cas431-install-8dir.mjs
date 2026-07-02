// CAS-431 — install the approved hand-authored warrior 8-dir grids (CAS-400 idle,
// CAS-405 walk, CAS-407 dash) into assets/erw/hero/classes/ for render.js wiring.
//
// The authoring grids stack their 8 rows in DIRS order
//   [south, south-east, east, north-east, north, north-west, west, south-west]
// but render.js picks the row with dir8FromAngle (0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE,
// screen-space y-down). This installer re-rows each grid into dir8FromAngle order so
// the render path needs no per-class remap table, then cross-checks every output row
// byte-for-byte against the per-direction source strips.
import { load, save, img, get, set } from './cas400-lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
// target row r (dir8FromAngle bucket) -> index into DIRS-ordered source rows
const DIRS = ['south','south-east','east','north-east','north','north-west','west','south-west'];
const BUCKETS = ['east','south-east','south','south-west','west','north-west','north','north-east'];
const MAP = BUCKETS.map(d => DIRS.indexOf(d)); // [2,1,0,7,6,5,4,3]

const JOBS = [
  // src grid, per-dir strip pattern (frames per row in the GRID), out file
  { grid: 'assets/erw/hero/gen/cas400/warrior_idle8.png', strip: d => `assets/erw/hero/gen/cas400/warrior_idle_${d}.png`, gridFrames: 1, out: 'assets/erw/hero/classes/warrior_idle8.png' },
  { grid: 'assets/erw/hero/gen/cas405/warrior_walk8.png', strip: d => `assets/erw/hero/gen/cas405/warrior_walk_${d}.png`, gridFrames: 8, out: 'assets/erw/hero/classes/warrior_walk8.png' },
  { grid: 'assets/erw/hero/gen/cas407/warrior_dash8.png', strip: d => `assets/erw/hero/gen/cas407/warrior_dash_${d}.png`, gridFrames: 8, out: 'assets/erw/hero/classes/warrior_dash8.png' },
];

let fail = 0;
for (const j of JOBS) {
  const src = load(ROOT + j.grid);
  const fh = src.H / 8;
  if (!Number.isInteger(fh)) { console.error(`FAIL ${j.grid}: H ${src.H} not /8`); fail++; continue; }
  const out = img(src.W, src.H);
  for (let r = 0; r < 8; r++) {
    const sr = MAP[r];
    for (let y = 0; y < fh; y++) for (let x = 0; x < src.W; x++) set(out, x, r * fh + y, get(src, x, sr * fh + y));
  }
  // cross-check: output row r must byte-match the per-direction source strip for BUCKETS[r]
  // (idle grid holds frame 0 of the 6f idle strip; walk/dash grids hold all 8 frames).
  for (let r = 0; r < 8; r++) {
    const strip = load(ROOT + j.strip(BUCKETS[r]));
    const cmpW = j.gridFrames === 1 ? src.W : Math.min(src.W, strip.W);
    let diff = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < cmpW; x++) {
      const a = get(out, x, r * fh + y), b = get(strip, x, y);
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3]) diff++;
    }
    console.log(`${j.out} row${r} (${BUCKETS[r]}) vs strip: diff=${diff}`);
    if (diff) fail++;
  }
  save(out, ROOT + j.out);
  console.log(`WROTE ${j.out} ${out.W}x${out.H}`);
}
console.log(fail ? `FAIL (${fail})` : 'ALL OK');
process.exit(fail ? 1 : 0);
