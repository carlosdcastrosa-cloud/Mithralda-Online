// ---------------------------------------------------------------------------
// CAS-2011 (parent CAS-2010) — BUILD harness: Game-Feel / Impact Pass v1 (JUICE knob).
// Spec: design/cas2010-game-feel-impact.md (commit 5b75045). This is a BORROW, not a
// rebuild — hit-stop (freeze) + screen-shake (shakeAdd) + impact-flash already ship live
// (CAS-127/272/273). v1 adds ONE `JUICE` knob that GATES them (with independent sub-flags
// + a reduce-motion off-switch for hit-stop, closing a real accessibility gap) plus 4
// coverage seams (backstab / execute-punish / poise-break-stagger / boss phase-2).
//
// DOM-free node harness (mirrors tools/cas2005-balance-regression.mjs): it imports the REAL
// sim modules and drives the REAL hitEnemy / update paths via the dev hooks, so it exercises
// the exact bytes that will be deployed. freeze()/shakeAdd() consume 0 srand (presentation
// state only: G.hitstop / G.shake, both transient + un-serialized), so toggling JUICE changes
// the srand draw count/sequence by exactly zero — the load-bearing DoD (§4).
//
//   AC0  node --check clean (run separately) + boot 0-errors (this harness boots the sim).
//   AC1  [KNOB]   JUICE exists {enabled,hitStop,screenShake,flash,hitStopCapFrames}, enabled:true.
//   AC2  [FREEZE] freeze() honors enabled && hitStop && !reduceMotion; caps at hitStopCapFrames.
//   AC3  [SHAKE]  shakeAdd() honors enabled && screenShake ON TOP of existing reduceMotion/settings.shake.
//   AC4  [COVER]  4 new seams present (source-anchored) + poise-break drives a real hit-stop.
//   AC5  [RNG]    srand draw log identical JUICE on vs off — 0 new draws.
//   AC6  [REPRO]  same seed run-twice ⇒ byte-identical sim-state hash, JUICE on.
//   AC7  [BASE]   hitStop:false ⇒ update() never early-returns (G.t == N·dt); reduceMotion ⇒ hitstop 0 thru forced crit.
//   AC8  [SYS]    24 systems still wired (delta of cas2005) + JUICE present.
//   AC9  [FPS]    freeze() allocates nothing per frame (holds frames, doesn't drop them).
//   AC10 [ALLOFF] all sub-flags off ⇒ no freeze AND no shake (motion-safe); floaters intact.
//
// Run: node tools/cas2010-juice.mjs   (PASS×2 = invoke twice; AC6 also self-double-runs)
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
const { G, dev, rng, update, createHero, configure } = sim;

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

// ---- boot: inject no-op io/audio/view so the REAL hit/kill paths (audio.sfx.*) don't throw ----
const noop = () => {};
configure({
  io: { pollPad: noop, moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false },
  audio: { on: false, sfx: new Proxy({}, { get: () => () => {} }) },
  view: { gcx: () => 640, gcy: () => 360, zoom: () => 1 }, // camera reads (deterministic, presentation-only)
});
const SIM_SRC = readFileSync(fileURLToPath(new URL("../sim/sim.js", import.meta.url)), "utf8");

// Snapshot / restore the JUICE knob so each check runs from a known config (harness mutates it live;
// it is a plain mutable object shared with sim.js — the same singleton the game reads).
const JUICE0 = { ...cfg.JUICE };
const setJuice = (o) => Object.assign(cfg.JUICE, JUICE0, o);
const restoreJuice = () => Object.assign(cfg.JUICE, JUICE0);

// Fresh, deterministic combat: re-seed, rebuild the hero, one boss in melee, clear all transient fx.
function combat(seed = 424242, cls = "warrior") {
  rng.seed(seed);
  G.settings.reduceMotion = false; G.settings.shake = 1;
  createHero("QA2010", cls);
  G.enemies.length = 0; G.projectiles.length = 0; G.fields.length = 0;
  dev.clearFx();               // G.fx / floaters / shake / hitstop → 0
  dev.spawn("calderatyrant", 40, 0);
  return G.enemies[0];
}
// A forced-crit hero hit that draws 0 srand (riposte path is deterministic — sim.js:2537).
function forcedCritHit(n = 40) { G.hero.riposte = 1; return dev.hitBoss(n); }

// ============================ AC1 — knob shape ============================
function acKnob() {
  const j = cfg.JUICE;
  const okShape = j && j.enabled === true
    && typeof j.hitStop === "boolean" && typeof j.screenShake === "boolean" && typeof j.flash === "boolean"
    && typeof j.hitStopCapFrames === "number" && j.hitStopCapFrames > 0;
  if (okShape) pass(`[KNOB] JUICE {enabled:${j.enabled}, hitStop, screenShake, flash, hitStopCapFrames:${j.hitStopCapFrames}} — ships enabled:true LIVE`);
  else fail(`[KNOB] JUICE shape invalid: ${JSON.stringify(j)}`);
}

// ============================ AC2 — freeze gating + cap ============================
function acFreeze() {
  // (a) ON ⇒ a crit hit sets a hit-stop (> 0)
  combat(); setJuice({ enabled: true, hitStop: true }); dev.clearFx(); forcedCritHit(40);
  const onHs = G.hitstop;
  // (b) cap ⇒ lower the cap under the kill-confirm freeze(9); the boss death must clamp to it
  combat(); setJuice({ enabled: true, hitStop: true, hitStopCapFrames: 4 }); dev.clearFx();
  forcedCritHit(999999); // lethal → killEnemy → freeze(boss=9) → clamps to cap 4
  const capHs = G.hitstop;
  // (c) hitStop:false ⇒ no-op
  combat(); setJuice({ enabled: true, hitStop: false }); dev.clearFx(); forcedCritHit(40);
  const offHs = G.hitstop;
  // (d) enabled:false ⇒ no-op even with hitStop true
  combat(); setJuice({ enabled: false, hitStop: true }); dev.clearFx(); forcedCritHit(40);
  const disHs = G.hitstop;
  // (e) reduceMotion ⇒ no-op (the NEW accessibility gate)
  combat(); setJuice({ enabled: true, hitStop: true }); G.settings.reduceMotion = true; dev.clearFx(); forcedCritHit(40);
  const rmHs = G.hitstop;
  restoreJuice();
  if (onHs > 0 && onHs <= JUICE0.hitStopCapFrames && capHs === 4 && offHs === 0 && disHs === 0 && rmHs === 0)
    pass(`[FREEZE] on=${onHs}(≤cap) cap⇒${capHs} hitStop:false⇒${offHs} enabled:false⇒${disHs} reduceMotion⇒${rmHs} — gated + capped`);
  else fail(`[FREEZE] on=${onHs} cap=${capHs}(want 4) off=${offHs} dis=${disHs} rm=${rmHs}`);
}

// ============================ AC3 — shake gating (existing gates intact) ============================
function acShake() {
  // ON ⇒ a hit adds shake
  combat(); setJuice({ enabled: true, screenShake: true }); dev.clearFx(); forcedCritHit(40);
  const onSh = G.shake;
  // screenShake:false ⇒ 0 (new master toggle)
  combat(); setJuice({ enabled: true, screenShake: false }); dev.clearFx(); forcedCritHit(40);
  const offSh = G.shake;
  // existing gate intact: reduceMotion still zeroes shake even with screenShake:true
  combat(); setJuice({ enabled: true, screenShake: true }); G.settings.reduceMotion = true; dev.clearFx(); forcedCritHit(40);
  const rmSh = G.shake;
  // existing gate intact: settings.shake scales magnitude (0.5 ⇒ ~half)
  combat(); setJuice({ enabled: true, screenShake: true }); G.settings.shake = 0.5; dev.clearFx(); forcedCritHit(40);
  const halfSh = G.shake;
  restoreJuice();
  if (onSh > 0 && offSh === 0 && rmSh === 0 && halfSh > 0 && halfSh < onSh)
    pass(`[SHAKE] on=${onSh.toFixed(2)} screenShake:false⇒${offSh} reduceMotion⇒${rmSh} settings.shake·0.5⇒${halfSh.toFixed(2)}(<on) — new gate + existing gates intact`);
  else fail(`[SHAKE] on=${onSh} off=${offSh} rm=${rmSh} half=${halfSh}`);
}

// ============================ AC4 — coverage: 4 new seams ============================
function acCoverage() {
  // (1) source-anchored: the 4 new freeze/shakeAdd calls exist at the right verb seams (CAS-2010 markers)
  const seams = [
    { name: "backstab freeze(6)",        re: /backstab.*shakeAdd\(6\); freeze\(6\);/s },
    { name: "execute-punish freeze(5)",  re: /punish.*shakeAdd\(7\); freeze\(5\);/s },
    { name: "poise-break shakeAdd(5)+freeze(6)", re: /stagger[\s\S]*?shakeAdd\(5\); freeze\(6\);/ },
    { name: "boss phase-2 freeze(9)",    re: /shakeAdd\(14\); freeze\(9\); audio\.sfx\.boss\(\);/ },
  ];
  let srcOk = 0;
  for (const s of seams) { if (s.re.test(SIM_SRC)) srcOk++; else fail(`[COVER] seam missing in sim.js source: ${s.name}`); }
  if (srcOk === seams.length) pass(`[COVER] all 4 new coverage seams wired in sim.js (backstab, execute-punish, poise-break/stagger, boss phase-2)`);

  // (2) behavioral: drive a REAL poise-break on the boss and prove the stagger seam produces a hit-stop.
  // Small fixed hits keep the generic hit-pop freeze low (min ≈2) so the break frame's freeze(6) is attributable.
  restoreJuice();
  const e = combat(); setJuice({ enabled: true }); G.hero.riposte = 0; // NON-crit small hits
  let staggerHs = -1, sawStagger = false, genericMax = 0;
  for (let i = 0; i < 400 && !sawStagger; i++) {
    dev.clearFx();                       // hitstop → 0 before each hit so we read THIS hit's request
    const st0 = e.staggerT || 0;
    dev.hitBoss(6);                      // tiny dmg → generic hit-pop freeze stays ≈2
    if ((e.staggerT || 0) > 0 && st0 <= 0) { sawStagger = true; staggerHs = G.hitstop; }
    else genericMax = Math.max(genericMax, G.hitstop);
    if (e.hp <= 0) break;
  }
  restoreJuice();
  if (sawStagger && staggerHs >= 6 && staggerHs > genericMax)
    pass(`[COVER] live poise-break drives hit-stop=${staggerHs} (≥6 stagger seam) > generic hit-pop max=${genericMax} — new stagger freeze fires`);
  else fail(`[COVER] poise-break behavioral: sawStagger=${sawStagger} staggerHs=${staggerHs} genericMax=${genericMax}`);
}

// ============================ AC5 — RNG-neutral (0 new draws) ============================
// A hero-sourced BOSS KILL draws real srand (loot/reward rolls in killEnemy: sim.js:2758/2763/2916…).
// Drive exactly ONE lethal forced-crit hit (the riposte crit path is itself 0-draw, sim.js:2537) and
// capture the shared srand state right after. The hit+kill exercises every JUICE-gated seam (freeze,
// shakeAdd, crit/execute/backstab flash floaters). If JUICE toggling changed the srand draw count/
// sequence by even one, the post-kill state would differ. No update() loop ⇒ no ambush/zone-event
// timing (which legitimately draws srand off G.t) can leak between the two configs — a clean isolation.
function killSrandSig(juice) {
  rng.seed(20100711);
  G.settings.reduceMotion = false; G.settings.shake = 1;
  createHero("QA2010", "warrior");
  G.enemies.length = 0; G.projectiles.length = 0; G.fields.length = 0;
  G.drops.length = 0; G.corpses.length = 0;   // loot draws don't depend on these, but reset for parity
  dev.clearFx();
  Object.assign(cfg.JUICE, JUICE0, juice);
  dev.spawn("calderatyrant", 40, 0);
  G.hero.riposte = 1;                          // force crit (0-draw) → exercises crit flash + shake + freeze seams
  dev.hitBoss(9999999);                        // lethal → killEnemy → real loot/reward srand draws
  const sig = [rng.srand(), rng.srand(), rng.srand(), rng.srand()].map((x) => Math.round(x * 1e9)).join(",");
  Object.assign(cfg.JUICE, JUICE0);
  return sig;
}
function acRng() {
  const onSig = killSrandSig({ enabled: true, hitStop: true, screenShake: true, flash: true });
  const offSig = killSrandSig({ enabled: false, hitStop: false, screenShake: false, flash: false });
  if (onSig === offSig) pass(`[RNG] srand state identical JUICE fully-on vs fully-off after an identical boss kill (sig ${onSig.slice(0, 24)}…) — 0 new draws`);
  else fail(`[RNG] srand diverged on=${onSig} off=${offSig} (juice consumed RNG — DoD violation)`);

  // And prove a FROZEN frame draws nothing: with a hit-stop pending, one update() early-returns before any draw.
  rng.seed(555); const s0 = [rng.srand(), rng.srand()].join(",");            // fresh baseline
  rng.seed(555); G.hitstop = 3; update(16.67); const s1 = [rng.srand(), rng.srand()].join(","); // frozen frame between seed & draw
  restoreJuice();
  if (s0 === s1) pass(`[RNG] frozen frame (G.hitstop>0) advances srand by 0 — update() early-returns before any draw`);
  else fail(`[RNG] frozen frame drew srand: baseline=${s0} afterFrozen=${s1}`);
}

// ============================ AC6 — reproducibility (byte-identical run-twice) ============================
function stateHash(seed) {
  const e = combat(seed);
  setJuice({ enabled: true, hitStop: true, screenShake: true, flash: true });
  let acc = "";
  for (let i = 0; i < 50; i++) {
    if (i % 4 === 0) { G.hero.riposte = 1; dev.hitBoss(25); }
    update(16.67);
    const h = G.hero;
    acc += `${Math.round(h.x * 100)},${Math.round(h.y * 100)},${Math.round(h.hp)},${Math.round((e.hp > 0 ? e.hp : 0))},${G.hitstop}|`;
  }
  restoreJuice();
  return acc;
}
function acRepro() {
  const a = stateHash(90210), b = stateHash(90210);
  if (a === b) pass(`[REPRO] same seed run-twice ⇒ byte-identical state hash (len ${a.length}), JUICE on`);
  else fail(`[REPRO] non-deterministic: a≠b (a=${a.slice(0, 48)} b=${b.slice(0, 48)})`);
}

// ============================ AC7 — off == baseline ============================
function acBaseline() {
  const N = 40, dt = 16.67;
  // (A) hitStop:false ⇒ update() NEVER early-returns ⇒ G.t advances by exactly N·dt.
  combat(); setJuice({ enabled: true, hitStop: false }); G.hero.riposte = 0;
  const t0 = G.t;
  for (let i = 0; i < N; i++) { if (i % 3 === 0) { G.hero.riposte = 1; dev.hitBoss(40); } update(dt); }
  const advOff = +(G.t - t0).toFixed(4), wantAdv = +((N * dt) / 1000).toFixed(4);
  // (B) contrast: hitStop:true ⇒ some frames freeze ⇒ G.t advances LESS than N·dt (proof the gate actually pauses).
  combat(); setJuice({ enabled: true, hitStop: true }); G.hero.riposte = 0;
  const t1 = G.t;
  for (let i = 0; i < N; i++) { if (i % 3 === 0) { G.hero.riposte = 1; dev.hitBoss(40); } update(dt); }
  const advOn = +(G.t - t1).toFixed(4);
  // (C) reduceMotion:true ⇒ G.hitstop stays 0 through a forced crit.
  combat(); setJuice({ enabled: true, hitStop: true }); G.settings.reduceMotion = true; dev.clearFx(); forcedCritHit(40);
  const rmHs = G.hitstop;
  restoreJuice();
  const aOk = Math.abs(advOff - wantAdv) < 1e-3;   // never froze
  const bOk = advOn < advOff - 1e-3;               // did freeze (advanced less)
  if (aOk && bOk && rmHs === 0)
    pass(`[BASE] hitStop:false advances t by ${advOff}s == N·dt ${wantAdv}s (never froze); hitStop:true advances ${advOn}s (< baseline ⇒ froze); reduceMotion⇒hitstop ${rmHs}`);
  else fail(`[BASE] advOff=${advOff} want=${wantAdv} advOn=${advOn} rmHs=${rmHs} (aOk=${aOk} bOk=${bOk})`);
}

// ============================ AC8 — 24 systems still wired (+ JUICE) ============================
function acSystems() {
  const KNOBS = ["TELEGRAPH", "DODGE", "PARRY", "POISE", "COMBO", "BACKSTAB", "STAMINA", "LOCK_ON", "FLASK",
    "BLOODSTAIN", "SHIELD_BLOCK", "BONFIRE", "ENEMY_ABILITIES", "EQUIP_LOAD", "TWO_HAND", "HYPERARMOR",
    "WEAPON_ARCHETYPES", "WEAPON_ARTS", "THROWABLES", "WEAPON_BUFFS", "STATUS_BUILDUP", "SIGNATURE_BOSS",
    "SUMMON", "BOSS_RUSH", "COMBAT_CODEX"]; // 25 named; the "24 systems" = 23 pillars + SUMMON/BOSS_RUSH/CODEX go-lives
  let present = 0;
  for (const k of KNOBS) { const v = cfg[k]; if (v && typeof v === "object") present++; else fail(`[SYS] knob missing: ${k}`); }
  // the 4 go-live-flippable pillars must remain enabled:true (no regression from prior deploys)
  const live = ["SIGNATURE_BOSS", "SUMMON", "BOSS_RUSH", "COMBAT_CODEX"].every((k) => cfg[k] && cfg[k].enabled === true);
  const juiceLive = cfg.JUICE && cfg.JUICE.enabled === true;
  if (present === KNOBS.length && live && juiceLive)
    pass(`[SYS] ${present}/25 combat knobs present + 4 go-lives enabled:true + JUICE enabled:true (24 systems green, delta of cas2005)`);
  else fail(`[SYS] present=${present}/${KNOBS.length} goLive=${live} juice=${juiceLive}`);
}

// ============================ AC9 — freeze holds frames, allocates nothing ============================
function acFps() {
  // Extract freeze()'s one-line body from source; assert it does no per-call allocation
  // (no new/array/object literal/push) — pure numeric compare+assign, so a freeze cannot cause GC churn.
  const m = SIM_SRC.match(/function freeze\(n\)\{([^\n]*)\}/);
  const body = m ? m[1] : "";
  const allocFree = body && !/\bnew\b|\.push\(|=\s*\[|=\s*\{/.test(body) && /G\.hitstop\s*=\s*n/.test(body);
  // and the update() early-return returns WITHOUT touching the render list — the RAF loop keeps drawing (hold, not drop).
  const holdsFrames = /if\(G\.hitstop>0\)\{ G\.hitstop--; if\(G\.scene==="play"\)\{ io\.pollPad\(\); return; \} \}/.test(SIM_SRC);
  if (allocFree && holdsFrames) pass(`[FPS] freeze() body allocation-free (numeric only) + update() holds the frame (early-return keeps RAF/render live) — no GC churn, no dropped frames`);
  else fail(`[FPS] allocFree=${allocFree} holdsFrames=${holdsFrames} body="${body.trim()}"`);
}

// ============================ AC10 — all sub-flags off ⇒ motion-safe, floaters intact ============================
function acAllOff() {
  const e = combat(); setJuice({ enabled: true, hitStop: false, screenShake: false, flash: true }); // flash on so a dmg number still pops
  dev.clearFx();
  const fl0 = dev.juiceState().floaters;
  forcedCritHit(40);
  const js = dev.juiceState();
  const floatersFired = js.floaters > fl0;
  restoreJuice();
  if (js.hitstop === 0 && js.shake === 0 && floatersFired)
    pass(`[ALLOFF] hitStop+screenShake off ⇒ hitstop=${js.hitstop} shake=${js.shake} (motion-safe) yet floaters fired (${fl0}→${js.floaters}, legibility intact)`);
  else fail(`[ALLOFF] hitstop=${js.hitstop} shake=${js.shake} floaters ${fl0}→${js.floaters}`);
  void e;
}

// ============================ run ============================
acKnob();
acFreeze();
acShake();
acCoverage();
acRng();
acRepro();
acBaseline();
acSystems();
acFps();
acAllOff();

log("");
if (ok) log("✅ CAS-2011 JUICE BUILD — ALL PASS (knob + freeze/shake gating + 4 coverage seams + RNG-neutral 0-draw + repro + off==baseline + 24 systems + JUICE enabled:true LIVE)");
else { console.error("❌ CAS-2011 JUICE BUILD — FAIL"); process.exit(1); }
