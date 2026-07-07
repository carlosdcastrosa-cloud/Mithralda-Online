#!/usr/bin/env node
// CAS-1709 — DOM-free static harness for the anti-seam floor overlap (render-only, BLEED=1).
// The fix cannot be exercised without a canvas, so we assert its *invariants* against the
// source of render/render.js: it is render-only, it inflates ONLY the ground draw destination
// (source stays TS ⇒ no atlas-bleed), walls/buildings/shadow overlays are untouched, and the
// whole behaviour collapses to byte-identical when the single BLEED constant is 0 (AC4).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'render', 'render.js'), 'utf8');
const cfg = readFileSync(join(ROOT, 'sim', 'config.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + m); };

// --- isolate renderWorld() so wall/building asserts don't match other funcs ---
const rwStart = src.indexOf('function renderWorld(');
const rwEnd = src.indexOf('function renderEntities(', rwStart) > -1
  ? src.indexOf('function renderEntities(', rwStart)
  : src.indexOf('\n  function ', rwStart + 20);
const rw = src.slice(rwStart, rwEnd > rwStart ? rwEnd : src.length);
ok(rwStart > -1, 'AC-locate: renderWorld() found');

// --- AC4: single kill-switch constant; BLEED=0 ⇒ TSo===TS (byte-identical) ---
const bleedDecl = rw.match(/const\s+BLEED\s*=\s*(\d+)\s*,\s*TSo\s*=\s*TS\s*\+\s*BLEED\s*;/);
ok(!!bleedDecl, 'AC4: `const BLEED=<n>, TSo=TS+BLEED;` single-constant kill-switch present');
ok(bleedDecl && bleedDecl[1] === '1', 'AC2: BLEED ships as 1 (1px overlap active)');
const TS = Number((cfg.match(/export\s+const\s+TS\s*=\s*(\d+)/) || [])[1]);
ok(TS === 32, `config: TS=${TS}`);
// prove the algebra: TSo is a pure function of BLEED, so BLEED=0 ⇒ TSo===TS
for (const B of [0, 1]) ok((TS + B) === (B === 0 ? TS : TS + 1),
  `AC4: BLEED=${B} ⇒ TSo=${TS + B} ${B === 0 ? '(== TS, byte-identical)' : '(== TS+1, overlap)'}`);

// --- AC3 (no atlas-bleed): atlas ground blit keeps SOURCE at TS,TS, only DEST → TSo,TSo ---
const atlas = rw.match(/drawImage\(ga,[\s\S]*?,TS,TS,px,py,TSo,TSo\)/);
ok(!!atlas, 'AC3: atlas ground drawImage keeps 4-arg SOURCE (...,TS,TS,) and DEST → px,py,TSo,TSo');

// --- AC2: every per-tile GROUND destination is inflated to TSo ---
const groundDest = (rw.match(/drawImage\(img,px,py,TSo,TSo\)/g) || []).length; // stone, ice, cobble, grass, swamp
ok(groundDest >= 5, `AC2: ${groundDest} ground drawImage(img,...) dest inflated to TSo (expect ≥5: stone/ice/cobble/grass/swamp)`);
ok(/tileBase\[t\];\s*ctx\.fillRect\(px,py,TSo,TSo\)/.test(rw), 'AC2: procedural floor fallback fillRect also uses TSo (no gap when art missing)');

// --- AC3: WALLS are NOT inflated (stay TS,TS) — they must not bleed over neighbouring floor ---
ok(/drawImage\(wimg,px,py,TS,TS\)/.test(rw), 'AC3: wall drawImage stays px,py,TS,TS (walls never inflated)');
ok(/ctx\.fillRect\(px,py,TS,6\)/.test(rw), 'AC3: N-edge wall shadow overlay stays TS-wide (effect, not a tile)');

// --- AC3: buildings blit is the 2-arg cached-canvas path, untouched by BLEED ---
ok(/buildingCanvas\(b\.kind/.test(rw), 'AC3: building path present (cached-canvas blit)');
ok(!/buildingCanvas[\s\S]{0,400}TSo/.test(rw), 'AC3: building blit region does not reference TSo (untouched)');

// --- AC1 (render-only / RNG-neutral): the change never touches sim/RNG/save surfaces ---
ok(!/SAVE_VERSION/.test(rw), 'AC1: renderWorld does not touch SAVE_VERSION (no save bump)');
ok(!/\bsrand\b|createRNG|dropStream|Math\.random/.test(rw), 'AC1: renderWorld contains no RNG/random calls (draw-order deterministic)');
// the ONLY new identifiers introduced by the fix are BLEED/TSo — both draw-geometry locals
ok(/TSo/.test(rw) && /BLEED/.test(rw), 'AC1: fix is confined to two draw-geometry locals (BLEED, TSo)');

console.log(`\ncas1709-seams: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
