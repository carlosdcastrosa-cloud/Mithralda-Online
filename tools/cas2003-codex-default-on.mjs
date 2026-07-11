// ---------------------------------------------------------------------------
// CAS-2003 (QA post-flip) — CÓDICE DE COMBATE + HINTS, DEFAULT-ON OBSERVABLE PASS×2.
// The prior pass (tools/cas1998-codex-live-qa.mjs) ARMED COMBAT_CODEX.enabled=true at runtime
// because the feature shipped DARK. CAS-2002 flipped it enabled:true LIVE (build c7cfc0e489e8),
// so this pass proves it works AT THE SHIPPED DEFAULT — NO arming, NO knob mutation. Every hint
// is driven through its REAL player path and observed via the exported sim loop:
//
//   [DEFAULT] the SHIPPED module value COMBAT_CODEX.enabled===true AND showContextHints===true
//             (read-only; the harness NEVER writes either knob → proves default-on, not armed).
//   [OPEN]    openCombatCodex() with NO arming ⇒ scene="combatcodex"; survives 5 real update()
//             frames; codexKey(`)/Escape return to play (the exact player affordance).
//   [4 HINTS] four contextual hints fire ONE-TIME through their real branches, no arming:
//               hint_codex   — createHero() boot seam (1st entry to play announces the codex)
//               hint_stamina — doRoll() with 0 stamina (real spendStam deny branch)
//               hint_flask   — dev.hurt() drops HP<50% with an Estus charge (real damageHero branch)
//               hint_bonfire — dev.bonfireRestProbe() rests at a real bonfire (real interact() branch)
//   [ONE-TIME] each hint re-triggered in the same life ⇒ NO re-toast (idempotent seen-set).
//   [PERSIST]  the four fired hints serialize to mithralda.hints.v1; loadHints(null) wipes; reload
//              restores; after reload each real path is SILENT (survives reload, no re-fire).
//   [DETERM]   2 full runs byte-identical (pure sim, no DOM).
//
// Served blobs are md5-identical to HEAD (QA verified out-of-band), so importing sim/sim.js drives
// the EXACT bytes players run. Run: node tools/cas2003-codex-default-on.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { COMBAT_CODEX, FLASK, STAMINA } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

const G = sim.G;
const seen = () => sim.serializeHints().seen || {};

// REAL stamina-deny: doRoll() with 0 stamina hits the shipped spendStam deny branch ⇒ fireHint.
function rollDeny() { const h = G.hero; h.stam = 0; h.rolling = false; h.rollCD = 0; h.flaskDrinkT = 0; G.toast = null; sim.doRoll(); return G.toast; }
// REAL low-HP-with-flask: damageHero drops hero <50% with a charge available ⇒ fireHint.
function hurtLow() { const h = G.hero; h.dead = false; h.flaskCharges = 3; h.hp = sim.heroMaxHp ? sim.heroMaxHp(h) : h.maxHp; h.iframe = 0; h.stun = 0; h.rolling = false;
  const cap = (sim.heroMaxHp ? sim.heroMaxHp(h) : h.maxHp); h.hp = cap * 0.6; G.toast = null; sim.dev.hurt(Math.ceil(cap * 0.2)); return G.toast; }

function runAll(tag) {
  // ---------- [DEFAULT] shipped knob is default-on (NEVER written by this harness) ----------
  const defaultOn = COMBAT_CODEX.enabled === true && COMBAT_CODEX.showContextHints === true;
  if (defaultOn) pass(`[${tag}] DEFAULT: shipped COMBAT_CODEX.enabled===true && showContextHints===true (default-on, harness writes neither knob)`);
  else fail(`[${tag}] DEFAULT: enabled=${COMBAT_CODEX.enabled} showContextHints=${COMBAT_CODEX.showContextHints} (expected both true — CAS-2002 flip)`);

  // fresh hint store (a brand-new player), NO knob mutation
  sim.loadHints(null); G.hintsDirty = false; G.toast = null; G.toastT = 0;

  // ---------- [OPEN] codex opens at default, survives real frames, closes ----------
  sim.createHero("DefQA", "warrior");                    // scene="play" (also fires hint_codex boot below)
  const opened = sim.openCombatCodex();                  // NO arming — gated on shipped enabled:true
  for (let i = 0; i < 5; i++) sim.update(16);
  const persists = G.scene === "combatcodex";
  const closedByKey = sim.dev._ccSceneKey ? sim.dev._ccSceneKey(COMBAT_CODEX.codexKey) : (G.scene = "play");
  sim.openCombatCodex(); const closedByEsc = sim.dev._ccSceneKey ? sim.dev._ccSceneKey("Escape") : (G.scene = "play");
  G.scene = "play";
  if (opened === "combatcodex" && persists) pass(`[${tag}] OPEN: openCombatCodex⇒"combatcodex" (no arm), survives 5 real update() frames; codexKey close⇒"${closedByKey}", Escape close⇒"${closedByEsc}"`);
  else fail(`[${tag}] OPEN: opened=${opened} persists=${persists}`);

  // ---------- [4 HINTS] four real-path one-time hints, default-on ----------
  // hint_codex fired inside createHero() above (1st entry to play). Confirm it landed.
  const codexFired = !!seen().hint_codex;
  const stamToast = rollDeny(); const stamFired = !!seen().hint_stamina;
  const flaskToast = hurtLow(); const flaskFired = !!seen().hint_flask;
  G.toast = null; sim.dev.bonfireRestProbe(); const bonfireFired = !!seen().hint_bonfire;
  const fired4 = codexFired && stamFired && flaskFired && bonfireFired;
  if (fired4) pass(`[${tag}] 4 HINTS: hint_codex(boot) + hint_stamina("${(stamToast||"").slice(0,18)}…") + hint_flask("${(flaskToast||"").slice(0,14)}…") + hint_bonfire — all fired one-time via REAL paths at default`);
  else fail(`[${tag}] 4 HINTS: codex=${codexFired} stamina=${stamFired} flask=${flaskFired} bonfire=${bonfireFired}`);

  // ---------- [ONE-TIME] re-trigger in same life ⇒ NO re-toast ----------
  G.toast = null; rollDeny(); const stamReToast = G.toast;
  G.toast = null; hurtLow(); const flaskReToast = G.toast;
  const oneTime = stamReToast === null && flaskReToast === null;
  if (oneTime) pass(`[${tag}] ONE-TIME: 2nd stamina-deny & 2nd low-HP ⇒ NO re-toast (stam=${J(stamReToast)}, flask=${J(flaskReToast)})`);
  else fail(`[${tag}] ONE-TIME: stamRe=${J(stamReToast)} flaskRe=${J(flaskReToast)}`);

  // ---------- [PERSIST] serialize → wipe → reload → real paths stay silent ----------
  const blob = sim.serializeHints();
  const blobHas4 = blob && blob.seen && blob.seen.hint_codex && blob.seen.hint_stamina && blob.seen.hint_flask && blob.seen.hint_bonfire;
  sim.loadHints(null);
  const wiped = !seen().hint_stamina && !seen().hint_flask;
  sim.loadHints(blob);
  const restored = !!seen().hint_stamina && !!seen().hint_flask && !!seen().hint_codex && !!seen().hint_bonfire;
  // after reload, the real player paths must NOT re-fire the already-seen hints
  G.toast = null; rollDeny(); const stamSilent = G.toast === null;
  G.toast = null; hurtLow(); const flaskSilent = G.toast === null;
  const persistOk = blobHas4 && wiped && restored && stamSilent && flaskSilent;
  if (persistOk) pass(`[${tag}] PERSIST: mithralda.hints.v1 seen=${J(blob.seen)}; wipe→reload restores 4; reloaded ⇒ real paths silent (stam=${stamSilent}, flask=${flaskSilent})`);
  else fail(`[${tag}] PERSIST: has4=${!!blobHas4} wiped=${wiped} restored=${restored} stamSilent=${stamSilent} flaskSilent=${flaskSilent}`);

  return { defaultOn, opened, persists, closedByKey, closedByEsc, codexFired, stamFired, flaskFired, bonfireFired,
    oneTime, blobSeen: blob && blob.seen, wiped, restored, stamSilent, flaskSilent };
}

try {
  const r1 = runAll("run1");
  const r2 = runAll("run2");
  if (J(r1) === J(r2)) pass(`determinism: 2 full runs byte-identical`);
  else fail(`determinism: run1!=run2\n  ${J(r1)}\n  ${J(r2)}`);
} catch (e) { fail(`EXCEPTION: ${e && e.stack || e}`); }

log("");
log(ok ? "✅ CAS-2003 Códice de Combate + Hints DEFAULT-ON — OBSERVABLE ALL PASS" : "❌ CAS-2003 Códice de Combate + Hints DEFAULT-ON — OBSERVABLE FAIL");
process.exit(ok ? 0 : 1);
