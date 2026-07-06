// ---------------------------------------------------------------------------
// CAS-1583 — LIVE QA: Habilidades bloqueables + desbloqueo altar (CAS-1580)
// on the canonical gh-pages build.
//
// Pre-condition (asserted by the caller, not here): the 4 changed runtime files
// (input.js, sim/config.js, sim/sim.js, strings.js) served by the live build
//   https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// are byte-for-byte identical (md5) to the repo HEAD blobs. So driving the local
// sim import is a faithful proxy for the LIVE runtime. This harness exercises the
// player-visible END-TO-END path the build-time logic test (cas1580-ability-
// unlocks.mjs) does NOT cover: for EACH of the 4 lockable abilities,
//   altar unlock (spend Esencia) → ability enters the run-start draft pool →
//   the ability actually CASTS in a live run and its resolver produces its effect.
//
// Verifies the player-visible acceptance:
//   1. RNG-NEUTRAL baseline: with 0 unlocks, the draft is EXACTLY the 4 originals
//      (no locked ability leaks; draft identical to pre-CAS-1580).
//   2. Each locked ability is HIDDEN from the draft until its unlock_* row is bought.
//   3. Buying unlock_<id> spends the data-driven Esencia (60/90/120/150), cap 1,
//      ungated by Tier-2, and the ability THEN appears in the draft pool.
//   4. Once unlocked+drafted, each ability CASTS and its resolver fires the right effect:
//        parpadeo(dash) contact dmg, llamarada(nova) dmg+burn, furia(buff) +dmg buff,
//        brasas(field) tick dmg — REUSING the existing spell resolvers ($0 new engine).
//   5. Unlock persists across recarga (mithralda.meta.v2 round-trip).
//
// Run: node tools/cas1583-ability-unlocks-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ACTIVE_ABILITIES, ABILITY_UNLOCK_MAP } from "../sim/config.js";

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const io = { intent: () => ({}), clear: noop, pollPad: noop, moveVec: () => ({ x: 0, y: 0 }),
  aim: () => ({ x: 1, y: 0 }), aimActive: () => false, isTouch: () => false, on: noop,
  playMusic: noop, setAmbient: noop, sfx };
sim.configure({ io, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop, gcx: () => 400, gcy: () => 300, zoom: () => 1 } });
sim.dev.noSave && sim.dev.noSave();

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };

const ORIGINALS = ACTIVE_ABILITIES.filter((a) => !a.locked).map((a) => a.id);
const LOCKED = ACTIVE_ABILITIES.filter((a) => a.locked).map((a) => a.id);
const poolIds = () => sim.draftPool().map((a) => a.id);
function freshRun() { sim.resetMeta(); sim.createHero("QA", "warrior"); }

// ============ 1. RNG-neutral baseline draft ================================
freshRun();
if (JSON.stringify(poolIds()) === JSON.stringify(ORIGINALS))
  pass("baseline draft (0 unlocks) is EXACTLY the 4 originals [" + ORIGINALS.join(",") + "] — RNG-neutral, no locked leak");
else fail("baseline draft not the 4 originals: " + JSON.stringify(poolIds()));

// ============ 2-4. per-ability: hidden → unlock → draftable → casts ========
// Effect assertion per resolver type, matching the observed in-run output.
const EFFECT = {
  parpadeo: (r) => r.type === "dash" && r.mpSpent > 0 && r.dmg > 0,          // dash contact dmg
  llamarada: (r) => r.type === "nova" && r.dmg > 0 && r.statusType === "burn", // fire nova + burn
  brasas:   (r) => r.type === "field" && r.dmg > 0,                          // persistent field tick
  // furia is a +dmg self-buff — probe doesn't surface dmgBonus, so verified below via direct cast.
  furia:    (r) => r.type === "buff" && r.mpSpent > 0 && r.cdmax > 0,
};
const EFFECT_DESC = {
  parpadeo: (r) => `dash contact dmg ${r.dmg}, mp ${r.mpSpent}, cd ${r.cdmax}s`,
  llamarada: (r) => `nova dmg ${r.dmg} + burn status, mp ${r.mpSpent}`,
  brasas:   (r) => `field tick dmg ${r.dmg}, mp ${r.mpSpent}`,
  furia:    (r) => `buff cast, mp ${r.mpSpent}, cd ${r.cdmax}s`,
};

for (const id of LOCKED) {
  const key = "unlock_" + id;
  const cost = ABILITY_UNLOCK_MAP[id].cost(0);
  freshRun();
  // 2. hidden by default
  if (!poolIds().includes(id)) pass(`[${id}] hidden from draft while locked`);
  else fail(`[${id}] leaked into draft while still locked`);
  if (sim.metaSnap().t2Unlocked) fail(`[${id}] precheck: T2 unexpectedly unlocked`);
  // 3. fund + buy the unlock row (ungated by Tier-2)
  sim.dev.metaGrant(cost);            // grant EXACTLY the cost → proves the price
  const e0 = sim.metaSnap().essence;
  const bought = sim.buyMetaNode(key);
  const spent = e0 - sim.metaSnap().essence;
  if (bought && spent === cost) pass(`[${id}] unlock bought for ${cost} Esencia (ungated by Tier-2)`);
  else fail(`[${id}] unlock buy wrong: bought=${bought} spent=${spent} expected ${cost}`);
  if (sim.buyMetaNode(key) === false) pass(`[${id}] cap:1 — cannot re-buy`); else fail(`[${id}] over-bought past cap 1`);
  // 3b. now draftable
  if (poolIds().includes(id)) pass(`[${id}] appears in draft pool AFTER unlock`);
  else fail(`[${id}] missing from draft pool after unlock`);
  // 4. resolver fires in a live run
  const r = sim.dev.abilityProbe(id);
  if (r && EFFECT[id](r)) pass(`[${id}] casts in-run — ${EFFECT_DESC[id](r)}`);
  else fail(`[${id}] in-run cast/effect wrong: ${JSON.stringify(r)}`);
}

// ============ 4b. furia self-buff actually lands (+dmg) ====================
freshRun();
sim.dev.metaGrant(ABILITY_UNLOCK_MAP.furia.cost(0));
sim.buyMetaNode("unlock_furia");
const h = sim.G.hero; h.mp = 300; h.abilCD = [0, 0]; h.abilCDmax = [0, 0]; h.loadout = ["furia", "arremetida"];
const dmg0 = h.dmgBonus; sim.castAbility(0); const dmgUp = h.dmgBonus;
if (dmgUp > dmg0 && h.dmgBuffT > 0) pass(`[furia] +dmg self-buff lands: dmgBonus ${dmg0} → ${dmgUp} for ${h.dmgBuffT}s`);
else fail(`[furia] buff did not apply: dmgBonus ${dmg0}→${dmgUp} buffT ${h.dmgBuffT}`);

// ============ 5. persistence across recarga (v2 round-trip) ================
freshRun();
for (const id of LOCKED) { sim.dev.metaGrant(ABILITY_UNLOCK_MAP[id].cost(0)); sim.buyMetaNode("unlock_" + id); }
const blob = sim.serializeMeta();
sim.resetMeta();
if (LOCKED.every((id) => !poolIds().includes(id))) pass("resetMeta re-locks all 4 (unlock is persisted state, not code)");
else fail("some ability stayed unlocked after reset");
sim.loadMeta(blob);
if (blob.v === 2 && LOCKED.every((id) => poolIds().includes(id)))
  pass("all 4 unlocks persist across recarga (mithralda.meta.v2 round-trip) — draft holds all 8");
else fail("unlocks lost on reload: " + JSON.stringify(poolIds()));

console.log(ok ? "\nCAS-1583 ability-unlock LIVE QA: ALL PASS" : "\nCAS-1583 ability-unlock LIVE QA: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
