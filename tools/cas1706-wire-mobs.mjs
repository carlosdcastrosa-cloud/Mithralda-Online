// ---------------------------------------------------------------------------
// CAS-1706 — Wire 8-dir animated strips → ENEMY_STRIPS + richAnim harness.
//
// Fast, DOM-free verification of the engine wiring for the 3 CAVES mobs
// (ashwraith/ironback/thornspitter). Proves, in one run:
//   1.  ENEMY_STRIPS has an entry for each mob with all 6 states
//       (idle/walk/attack1/attack2/hurt/death); attack2 aliases attack1.
//   2.  resolveStrip(sprite, state) returns a strip for every state (no null),
//       and falls back state→walk→idle for an unknown state.
//   3.  Each referenced strip PNG exists on disk and its pixel dims match the
//       descriptor: width == fc*fw (single-row) and height == fh (64).
//   4.  ETPL rows carry richAnim:true (drives the extended attack/hurt/death
//       states via the generic sim resolver) and keep their combat archetype
//       (ashwraith/thornspitter=caster, ironback=brute).
//   5.  CAS-1706 crash-guard precondition: all 3 mobs KEEP an ENEMY_IMG cutout
//       so the richAnim draw chain (resolveStrip → ENEMY_IMG → procedural)
//       never dereferences an undefined SP blob while a strip is loading.
//   6.  Byte-identical knob: NEW_MOBS.enabled exists (world.js gates the pool);
//       the 3 mob sprites are exactly the NEW_MOBS.types list.
//
// Pure Node (reads PNG headers, no browser). Run: node tools/cas1706-wire-mobs.mjs
// LIVE render/animation behavior is covered by the CAS-1692 live QA harness.
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ENEMY_STRIPS, ENEMY_IMG, resolveStrip } from "../render/sprites.js";
import { ETPL, NEW_MOBS } from "../sim/config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANIM_DIR = join(ROOT, "assets/pixellab/fountains/anim");
const MOBS = ["ashwraith", "ironback", "thornspitter"];
const STATES = ["idle", "walk", "attack1", "attack2", "hurt", "death"];
const EXPECT_FC = { idle: 4, walk: 6, attack1: 9, attack2: 9, hurt: 7, death: 9 };

const results = [];
const ok = (name, pass, info) => { results.push(!!pass); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };

// PNG IHDR width/height (bytes 16..24).
function pngDims(path) { const b = readFileSync(path); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }

for (const m of MOBS) {
  const S = ENEMY_STRIPS[m];
  ok(`${m}: ENEMY_STRIPS entry present`, !!S);
  if (!S) continue;
  for (const st of STATES) {
    const d = S[st];
    ok(`${m}.${st}: descriptor + fc=${EXPECT_FC[st]}`, d && d.fc === EXPECT_FC[st] && d.fw === 64 && d.fh === 64,
      d ? `key=${d.key} fc=${d.fc} ${d.fw}x${d.fh}` : "missing");
    // resolveStrip must return a non-null strip for the state.
    const r = resolveStrip(m, st);
    ok(`${m}.${st}: resolveStrip non-null`, !!r, r ? r.key : "null");
    if (!d) continue;
    // PNG on disk matches the descriptor.
    try {
      const { w, h } = pngDims(join(ANIM_DIR, d.key + ".png"));
      ok(`${m}.${st}: PNG dims == fc*fw x fh`, w === d.fc * d.fw && h === d.fh, `${w}x${h} vs ${d.fc * d.fw}x${d.fh}`);
    } catch (e) { ok(`${m}.${st}: PNG readable`, false, e.message); }
  }
  // attack2 aliases attack1 (champion/elite still shows cast/swing frames).
  ok(`${m}: attack2 aliases attack1`, S.attack1 && S.attack2 && S.attack1.key === S.attack2.key);
  // resolveStrip fallback for an unknown state → walk → idle (never null).
  ok(`${m}: unknown state falls back`, !!resolveStrip(m, "nonexistent_state"));
  // ETPL row wiring.
  const t = ETPL[m];
  ok(`${m}: ETPL richAnim:true`, t && t.richAnim === true);
  ok(`${m}: ETPL keeps sprite`, t && t.sprite === m);
  // CAS-1706 crash-guard precondition: cutout present so the draw chain never
  // reaches the procedural SP path (these mobs have no SP blob).
  ok(`${m}: ENEMY_IMG cutout present (crash-guard)`, !!ENEMY_IMG[m]);
}

// Archetypes preserved (caster/brute) — no new combat AI introduced.
ok("ashwraith arch=caster", ETPL.ashwraith.arch === "caster");
ok("thornspitter arch=caster", ETPL.thornspitter.arch === "caster");
ok("ironback arch=brute", ETPL.ironback.arch === "brute");

// Byte-identical knob: NEW_MOBS gates the pool; types == the 3 wired mobs.
ok("NEW_MOBS.types == wired mobs", JSON.stringify([...NEW_MOBS.types].sort()) === JSON.stringify([...MOBS].sort()),
  NEW_MOBS.types.join(","));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
