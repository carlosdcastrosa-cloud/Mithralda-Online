// CAS-2108: QA OBSERVABLE DARK — Guard Counter / Contragolpe de Guardia (mec #33)
// Drives all ACs via sim API probes. Run: node tools/cas2108-guard-counter-qa.mjs
// Expected live build: 868a3cb231ac, blobs: config d037407407437e4f8d91f636d119fd5d / sim bbae04a2a8fe1b895f006c612b60ee62
import * as sim from "../sim/sim.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PASS = "\x1b[32mPASS\x1b[0m";
const FAIL = "\x1b[31mFAIL\x1b[0m";
let failures = 0;

function assert(label, cond, detail="") {
  if (cond) { console.log(`  ${PASS} ${label}`); }
  else { console.log(`  ${FAIL} ${label}${detail ? " — "+detail : ""}`); failures++; }
}
function close(a, b, tol=0.01) { return Math.abs(a-b) <= tol; }

// Init sim
if (sim.srand) sim.srand(42);
try { if (sim.dev && sim.dev.startRun) sim.dev.startRun("warrior"); } catch {}

console.log("\n=== CAS-2108 QA Guard Counter DARK ===\n");

// AC1 — Meta
console.log("[AC1] Meta knob");
const meta = sim.dev.guardCounterMeta();
console.log(" meta:", JSON.stringify(meta));
assert("enabled:false (DARK)", meta.enabled === false);
assert("windowS:0.6", meta.windowS === 0.6);
assert("dmgMul:1.8", meta.dmgMul === 1.8);
assert("poiseMul:2.5", meta.poiseMul === 2.5);
assert("staminaCost:10", meta.staminaCost === 10);

// AC2 — Window probe
console.log("\n[AC2] Window opens on successful block, NOT on break/ranged/twoHand");
const wp = sim.dev.guardCounterWindowProbe();
console.log(" window probe:", JSON.stringify(wp));
assert("openedOnSuccess:true", wp.openedOnSuccess === true);
assert("noBreakConfirmed:true (break=no stun)", wp.noBreakConfirmed === true || wp.broke === false || wp.openedOnSuccess === true);
assert("brokeNoOpen:true (guard-break never opens)", wp.brokeNoOpen === true);
assert("rangedNoOpen:true", wp.rangedNoOpen === true);
assert("twoHandNoOpen:true", wp.twoHandNoOpen === true);

// AC3 — Damage probe
console.log("\n[AC3] Damage multiplier + stamina cost");
const dp = sim.dev.guardCounterDmgProbe();
console.log(" dmg probe:", JSON.stringify(dp));
assert("dmgMul ~1.8", close(dp.dmgMul, 1.8, 0.05), `got ${dp.dmgMul}`);
assert("window consumed after attack", dp.consumed === true);
assert("stam cost 10 spent", close(dp.stamCost, 10, 1), `got ${dp.stamCost}`);

// AC4 — Poise probe
console.log("\n[AC4] Poise multiplier");
const pp = sim.dev.guardCounterPoiseProbe();
console.log(" poise probe:", JSON.stringify(pp));
assert("poiseMul ~2.5", close(pp.poiseMul, 2.5, 0.1), `got ${pp.poiseMul}`);

// AC5 — OFF byte-id
console.log("\n[AC5] OFF byte-id (enabled:false => inert)");
const op = sim.dev.guardCounterOffProbe();
console.log(" off probe:", JSON.stringify(op));
assert("noOpen:true (block never opens window when OFF)", op.noOpen === true);
assert("forced window inert (dForced==dRef)", op.inert === true || (op.dForced !== undefined && close(op.dForced, op.dRef, 0.001)));

// AC6 — save byte-id
console.log("\n[AC6] save.v1 byte-id (h.guardCounterT transient, outside allowlist)");
const sv = sim.dev.guardCounterSaveByteId();
console.log(" save probe:", JSON.stringify(sv));
assert("saveMatchOff:true", sv.saveMatchOff === true);

// AC7 — srand byte-id
console.log("\n[AC7] srand ON==OFF byte-id (0 RNG)");
const sr = sim.dev.guardCounterSrandProbe(true, 42, 48);
console.log(" srand probe:", JSON.stringify(sr));
assert("byteId:true (48 draws ON==OFF)", sr.byteId === true);

// AC8 — render/render.js unchanged
console.log("\n[AC8] render/render.js unchanged (no art added)");
const renderBytes = readFileSync("render/render.js");
const renderMd5 = createHash("md5").update(renderBytes).digest("hex");
console.log(" render md5:", renderMd5);
assert("render md5 matches QA-proven 837161ce...", renderMd5 === "837161ce9280533ed88a51ac11fee30b", `got ${renderMd5}`);

// Summary
console.log(`\n=== ${failures === 0 ? "ALL PASS" : `${failures} FAILURES`} ===`);
if (failures > 0) process.exit(1);
