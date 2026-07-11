// ---------------------------------------------------------------------------
// CAS-2036 (design CAS-2035, umbrella CAS-27) — BUILD harness: NG+ CYCLE RECAP overlay.
// The recap is a data-driven "Ciclo N" summary + tier+1 escalation PREVIEW that COMPOSES on top of
// the CAS-450 ascend machine (CAS-2024 NG+). It ships DARK behind a new sub-flag NG_PLUS.recap:false.
// It invents no flow: offerAscend() routes into a new "ascendRecap" scene (else "ascend" verbatim),
// renderAscendRecap() draws the panel and pushes the SAME accept/skip rects to ui.ascendRects, and
// input broadens the ascend scene checks to also match "ascendRecap". NO new save field (reads
// durable/derivable state + sim.ngTierPreview only). 0 RNG on the recap branch.
//
// The seams read the REAL sim modules (importing sim/config.js + sim/sim.js drives the exact bytes
// that will deploy), so this is a pre-deploy proof, not a parallel re-implementation. renderAscendRecap
// itself is DOM-drawing (view-only, 0 RNG by construction) — the browser observation lands in QA.
//
//   AC0 [CHECK]  every touched blob loads; NG_PLUS.recap present + boolean + DARK (false).
//   AC1 [OFF]    recap:false ⇒ offerAscend scene stays "ascend"; save.v1 + srand INDEPENDENT of the
//                recap flag value (toggle true/false → byte-identical) ⇒ byte-equiv HEAD by construction.
//   AC2 [SCENE]  enabled:true + recap:true ⇒ offerAscend sets scene "ascendRecap" (payload tier+1),
//                and ngPreview(tier+1) numbers match the formula AND the live per-tier table (ngState).
//   AC3 [ACCEPT] accept/skip from the recap scene still drive acceptAscend/declineAscend (scene→play,
//                tier++ on accept / stay on skip) — the CAS-450 seam is reused verbatim.
//   AC4 [SRAND]  the recap branch adds 0 srand draws: offerAscend(recap) srand == offerAscend(ascend)
//                srand; declineAscend from "ascendRecap" draws 0 (dismiss is RNG-free).
//
// Run: node tools/cas2036-recap.mjs   (PASS×2 = invoke twice; deterministic, DOM-free)
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { RARITY_ORDER } from "../sim/gear.js";
const { G, dev, rng, createHero, configure, serializeSave } = sim;

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const approx = (a, b) => Math.abs(a - b) < 1e-9;

const noop = () => {};
configure({
  io: { pollPad: noop, moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false },
  audio: { on: false, sfx: new Proxy({}, { get: () => () => {} }) },
  view: { gcx: () => 640, gcy: () => 360, zoom: () => 1 },
});

const NG0 = { ...cfg.NG_PLUS };
const setNG = (o) => Object.assign(cfg.NG_PLUS, NG0, o || {});
const restoreNG = () => Object.assign(cfg.NG_PLUS, NG0);

// fresh, hermetic hero at a fixed conquest tier
function heroAt(seed, ngPatch, tier) {
  rng.seed(seed);
  createHero("QA2036", "warrior");
  G.enemies.length = 0; G.projectiles.length = 0; G.drops.length = 0; dev.clearFx();
  setNG(ngPatch);
  dev.setConquest(tier, []);
}
const srand4 = () => [rng.srand(), rng.srand(), rng.srand(), rng.srand()].map((x) => Math.round(x * 1e9)).join(",");

// ============================ AC0 — knob shape ============================
function acKnob() {
  const n = cfg.NG_PLUS;
  const okShape = n && typeof n.recap === "boolean" && n.recap === false;   // present + DARK
  if (okShape) pass(`[CHECK] NG_PLUS.recap present + boolean + DARK (recap:${n.recap})`);
  else fail(`[CHECK] NG_PLUS.recap invalid: ${JSON.stringify(n.recap)}`);
}

// ============================ AC1 — recap:false byte-equiv HEAD ============================
function acOff() {
  // recap:false at an armed NG+ tier ⇒ offerAscend routes to the bare "ascend" scene, exactly as HEAD.
  heroAt(2036, { enabled: true, recap: false }, 2);
  const r = dev.offerAscend();
  if (r.scene === "ascend" && r.ascend && r.ascend.tier === 3) pass(`[OFF] recap:false ⇒ scene "ascend" (tier ${r.ascend.tier}) — CAS-450 path unchanged`);
  else fail(`[OFF] recap:false scene=${r.scene} ascend=${JSON.stringify(r.ascend)}`);

  // save.v1 is INDEPENDENT of the recap flag value (recap adds no save field). Crank both ways → identical.
  heroAt(2036, { enabled: true, recap: false }, 2); dev.offerAscend(); const saveF = JSON.stringify(serializeSave());
  heroAt(2036, { enabled: true, recap: true }, 2); dev.offerAscend(); const saveT = JSON.stringify(serializeSave());
  if (saveF === saveT) pass(`[OFF] save.v1 byte-identical with recap false vs true (no new save field) len ${saveF.length}`);
  else fail(`[OFF] save.v1 diverged on recap toggle`);
  restoreNG();
}

// ============================ AC2 — armed recap scene + preview data ============================
function acScene() {
  heroAt(2036, { enabled: true, recap: true }, 2);          // completed tier 2 → offer tier 3
  const r = dev.offerAscend();
  if (r.scene === "ascendRecap" && r.ascend && r.ascend.tier === 3) pass(`[SCENE] recap:true ⇒ scene "ascendRecap" (offer tier ${r.ascend.tier})`);
  else fail(`[SCENE] recap:true scene=${r.scene} ascend=${JSON.stringify(r.ascend)}`);

  // preview numbers for tier+1 match the WORLD_TIER/NG_PLUS formula (the CAS-2032 per-tier table).
  const t = 3, k = t - 1;
  const p = dev.ngPreview(t);
  const expHp = cfg.WORLD_TIER.hpPct * k, expDmg = cfg.WORLD_TIER.dmgPct * k;
  const expEss = 1 + cfg.NG_PLUS.essMulPerTier * k;
  const expLoot = RARITY_ORDER[Math.min(4, 0 + cfg.NG_PLUS.lootFloorPerTier * k)];
  const good = approx(p.hpPct, expHp) && approx(p.dmgPct, expDmg) && approx(p.essMul, expEss) && p.lootFloor === expLoot;
  if (good) pass(`[SCENE] ngPreview(${t}) = {hp +${Math.round(p.hpPct*100)}% dmg +${Math.round(p.dmgPct*100)}% essMul ${p.essMul} loot ${p.lootFloor}} — matches WORLD_TIER/NG_PLUS formula`);
  else fail(`[SCENE] ngPreview(${t})=${JSON.stringify(p)} exp hp${expHp} dmg${expDmg} ess${expEss} loot${expLoot}`);

  // preview is tied to the LIVE per-tier table: at conquest tier==t, ngState() essMul/poiseMul == ngPreview(t).
  heroAt(2036, { enabled: true, recap: true }, t);
  const st = dev.ngState();
  if (approx(st.essMul, p.essMul) && approx(st.poiseMul, p.poiseMul)) pass(`[SCENE] ngPreview(${t}) essMul/poiseMul == live ngState() at tier ${t} (${st.essMul}/${st.poiseMul})`);
  else fail(`[SCENE] preview vs ngState drift ess ${p.essMul}/${st.essMul} poise ${p.poiseMul}/${st.poiseMul}`);
  restoreNG();
}

// ============================ AC3 — accept/skip reuse CAS-450 seam ============================
function acAccept() {
  // accept from the recap scene climbs one tier and returns to play.
  heroAt(2036, { enabled: true, recap: true }, 2);
  dev.offerAscend();
  const a = dev.acceptAscend();
  if (a.ok && a.scene === "play" && a.tier === 3) pass(`[ACCEPT] acceptAscend from "ascendRecap" ⇒ scene play, tier 2→${a.tier}`);
  else fail(`[ACCEPT] accept from recap ${JSON.stringify(a)}`);

  // skip from the recap scene stays put and returns to play.
  heroAt(2036, { enabled: true, recap: true }, 2);
  dev.offerAscend();
  const d = dev.declineAscend();
  if (d.ok && d.scene === "play" && d.tier === 2) pass(`[ACCEPT] declineAscend from "ascendRecap" ⇒ scene play, tier stays ${d.tier}`);
  else fail(`[ACCEPT] skip from recap ${JSON.stringify(d)}`);
  restoreNG();
}

// ============================ AC4 — recap branch is srand-neutral ============================
function acSrand() {
  // offerAscend draws 0 srand whether it routes to "ascend" or "ascendRecap": the scene value differs,
  // the RNG stream does not. Reseed → capture srand AFTER offerAscend on each branch → identical.
  heroAt(4004, { enabled: true, recap: false }, 2); dev.offerAscend(); const sA = srand4();
  heroAt(4004, { enabled: true, recap: true }, 2); dev.offerAscend(); const sR = srand4();
  if (sA === sR) pass(`[SRAND] offerAscend srand identical on "ascend" vs "ascendRecap" branch (0 recap draws)`);
  else fail(`[SRAND] offerAscend srand drift ascend=${sA} recap=${sR}`);

  // dismiss (declineAscend) from the recap scene is RNG-free: srand before == after.
  heroAt(4004, { enabled: true, recap: true }, 2); dev.offerAscend();
  const before = srand4();
  heroAt(4004, { enabled: true, recap: true }, 2); dev.offerAscend(); dev.declineAscend();
  const after = srand4();
  if (before === after) pass(`[SRAND] declineAscend from "ascendRecap" draws 0 srand (dismiss RNG-free)`);
  else fail(`[SRAND] decline drew srand before=${before} after=${after}`);
  restoreNG();
}

acKnob();
acOff();
acScene();
acAccept();
acSrand();

log("");
if (ok) log("✅ CAS-2036 NG+ RECAP BUILD — ALL PASS (recap sub-flag DARK; off ⇒ scene \"ascend\" + save byte-id; armed ⇒ \"ascendRecap\" + preview==per-tier table; accept/skip reuse CAS-450; 0 recap srand draws)");
else { console.error("❌ CAS-2036 NG+ RECAP BUILD — FAIL"); process.exit(1); }
