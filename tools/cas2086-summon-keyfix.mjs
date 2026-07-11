// ---------------------------------------------------------------------------
// CAS-2086 — Summon key-collision FIX regression (Build-stage node harness).
// Bug: SUMMON.key === COMBO.heavyKey === "KeyN" ⇒ input.js play dispatch fires the
// heavy handler (input.js:282) and `return`s BEFORE the summon handler (input.js:324)
// ⇒ spawnSpirit() unreachable on desktop for all 5 classes.
// Fix: SUMMON.key → "Comma" (only free code; 26 letters all bound).
//
// This harness does NOT hand-copy the routing. It PARSES the real play-scene block of
// input.js, extracts the ordered `if(code===<GUARD> ...){ <call>; return; }` chain, then
// dispatches a code through that exact order against the LIVE config values — proving the
// fall-through reaches sim.spawnSpirit for the new key and would NOT for the old one.
//
// Run: node tools/cas2086-summon-keyfix.mjs
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as CFG from "../sim/config.js";
import * as sim from "../sim/sim.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const src = readFileSync(join(ROOT, "input.js"), "utf8");

let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) fails++; };

// ── Resolve a guard token like "COMBO.heavyKey" / "SUMMON.key" / '"Digit1"' to a code.
function resolveKey(tok) {
  tok = tok.trim();
  if (/^["'].*["']$/.test(tok)) return tok.slice(1, -1);           // literal e.g. "Digit1"
  const [obj, prop] = tok.split(".");
  return CFG[obj] ? CFG[obj][prop] : undefined;
}
// ── Is the feature owning this handler enabled? (guards are `code===X.key && X.enabled`)
function guardEnabled(objName) {
  if (!objName) return true;                                        // literal keys (Digit1/KeyK/KeyY/KeyL) are always live
  return CFG[objName] ? !!CFG[objName].enabled : true;
}

// Slice the play-scene block: from `if(G.scene!=="play") return;` to the end of edge().
const start = src.indexOf('if(G.scene!=="play") return;');
const end = src.indexOf("\n}", start);
const block = src.slice(start, end);

// Extract ordered dispatch entries. Two shapes appear:
//   playAction(code)                       → rebindable table (line 261)
//   if(code===<GUARD>[ && <OBJ>.enabled]){ <call>; return; }
const entries = [];
for (const line of block.split("\n")) {
  if (/const act=playAction\(code\);/.test(line)) { entries.push({ kind: "playAction" }); continue; }
  const m = line.match(/if\(\s*code===([A-Za-z0-9_."']+)(?:\s*&&\s*([A-Za-z0-9_]+)\.enabled)?\s*\)\s*\{\s*([^;]*?);\s*return;/);
  if (m) entries.push({ kind: "guard", keyTok: m[1], gateObj: m[2] || null, call: m[3].trim() });
  // handler where the enabled-gate is written BEFORE the code=== term: `if(X.enabled && code===X.key)`
  const m2 = line.match(/if\(\s*([A-Za-z0-9_]+)\.enabled\s*&&\s*code===([A-Za-z0-9_."']+)\s*\)\s*\{\s*([^;]*?);\s*return;/);
  if (m2) entries.push({ kind: "guard", keyTok: m2[2], gateObj: m2[1], call: m2[3].trim() });
}

console.log("Parsed play-scene dispatch order (" + entries.length + " entries):");
for (const e of entries)
  console.log("   " + (e.kind === "playAction" ? "playAction(code) [rebindable table]"
    : `code===${e.keyTok}${e.gateObj ? " && " + e.gateObj + ".enabled" : ""}  ⇒  ${e.call}`));

// Rebindable bind set (for the playAction step). Defaults from settings REBINDS.
const bindsSrc = readFileSync(join(ROOT, "settings.js"), "utf8");
const boundCodes = new Set();
for (const m of bindsSrc.matchAll(/def:\s*"([A-Za-z0-9]+)"/g)) boundCodes.add(m[1]);

// Dispatch `code` through the real ordered chain; return the call it resolves to (or null).
function dispatch(code) {
  for (const e of entries) {
    if (e.kind === "playAction") {
      if (boundCodes.has(code)) return "playAction:" + code;        // a rebindable verb swallows it
      continue;
    }
    if (!guardEnabled(e.gateObj)) continue;                          // gated-off ⇒ inert, fall through
    if (resolveKey(e.keyTok) === code) return e.call;
  }
  // Digit1 fixed alias tail (kbCast) is outside the return-chain; ignore for this test.
  return null;
}

console.log("\n===== CAS-2086 ASSERTIONS =====");
// 1. Config: collision gone, key is Comma, both features live.
ok(CFG.SUMMON.key === "Comma", `SUMMON.key === "Comma" (got ${CFG.SUMMON.key})`);
ok(CFG.COMBO.heavyKey !== CFG.SUMMON.key,
   `no collision: COMBO.heavyKey(${CFG.COMBO.heavyKey}) !== SUMMON.key(${CFG.SUMMON.key})`);
ok(CFG.SUMMON.enabled === true && CFG.COMBO.enabled === true,
   `both live: SUMMON.enabled=${CFG.SUMMON.enabled} COMBO.enabled=${CFG.COMBO.enabled}`);

// 2. Códice getter reads SUMMON.key → renders "," (never lies).
ok(sim.keyLabel(CFG.SUMMON.key) === ",", `keyLabel(SUMMON.key) === "," (got "${sim.keyLabel(CFG.SUMMON.key)}")`);
ok(sim.keyLabel(CFG.COMBO.heavyKey) === "N", `keyLabel(COMBO.heavyKey) === "N" (got "${sim.keyLabel(CFG.COMBO.heavyKey)}")`);

// 3. THE FIX — routing through the real dispatch chain.
const summonDest = dispatch(CFG.SUMMON.key);
ok(/spawnSpirit/.test(summonDest || ""),
   `pressing SUMMON.key("${CFG.SUMMON.key}") ⇒ ${summonDest} (must be sim.spawnSpirit — REACHABLE)`);
const heavyDest = dispatch(CFG.COMBO.heavyKey);
ok(/heavyAttack/.test(heavyDest || ""),
   `pressing COMBO.heavyKey("${CFG.COMBO.heavyKey}") ⇒ ${heavyDest} (heavy still works)`);

// 4. REGRESSION GUARD — prove the OLD value ("KeyN") WOULD be swallowed by the heavy handler.
const oldDest = dispatch("KeyN");
ok(/heavyAttack/.test(oldDest || "") && !/spawnSpirit/.test(oldDest || ""),
   `sanity: "KeyN" ⇒ ${oldDest} (heavy swallows it — this is why KeyN was the bug)`);

// 5. Comma is genuinely free — no rebindable verb, no other fixed handler claims it.
ok(!boundCodes.has("Comma"), `Comma not in rebindable defaults`);
const commaHandlers = entries.filter(e => e.kind === "guard" && resolveKey(e.keyTok) === "Comma");
ok(commaHandlers.length === 1 && /spawnSpirit/.test(commaHandlers[0].call),
   `exactly ONE handler matches Comma and it is spawnSpirit (count=${commaHandlers.length})`);

console.log("\n" + (fails === 0 ? "===== ALL PASS =====" : `===== ${fails} FAILURE(S) =====`));
process.exit(fails === 0 ? 0 : 1);
