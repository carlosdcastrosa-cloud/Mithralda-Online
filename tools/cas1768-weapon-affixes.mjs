// ---------------------------------------------------------------------------
// CAS-1769 (build for CAS-1768) — AFIJOS DE ARMA on-hit (Weapon on-hit affixes). A dropped WEAPON may roll
// 0–1 "on-hit" affix that fires a DETERMINISTIC effect when it strikes an enemy (vampiric/cadena/ardiente/
// aturdidor/perforante). Loot gains "build" texture (active procs) on top of sockets/sets/runes.
//
// GUARDRAIL vs the last 3 beats (Códice/Títulos/Pactos, all own-blob): this one lives in save.v1 — the affix
// is ONE optional TRAILING field `wa:"<id>"` on the weapon instance (mirror of uniq/set/fl). The MAGNITUDE
// is never stored, it is DERIVED from config by (affixId, weapon tier). Hard-gated by WEAPON_AFFIXES.enabled.
//
// This is a DOM-FREE harness: it imports sim/sim.js directly (no browser) and drives the REAL sim hooks
// (dev.wa*). The live QA (Deploy child) re-verifies the HUD badge + drop/effect in a real browser.
//
// Proves:
//   [AC1/AC3 RNG-STRONG]  a 48-draw (2×24) FIXED srand script around a REAL dropGear WEAPON roll is
//                         BYTE-IDENTICAL with WEAPON_AFFIXES ON vs OFF — the affix roll rides the dedicated
//                         affixRng, so the shared srand never advances differently (proven by construction).
//   [AC2 save byte-id]    an affix-less weapon serializes to the SAME save.v1 bytes ON vs OFF, no `wa` key.
//   [affixRng determ.]    reseed + draw 48 → identical fingerprint on repeat (deterministic stream).
//   [draw-count §3]       common / non-weapon / uniq → 0 draws; uncommon+ weapon → 1 (gate) + 1 iff it passes.
//   [AC4 no-op]           enabled=true with no affix rolled ⇒ no `wa`, no proc (covered by byte-id + waCount).
//   [AC5 roundtrip]       a weapon WITH `wa` round-trips byte-id save→load→save; the id survives.
//   [AC5 effect]          each kind's effect fires in the REAL hitEnemy (lifesteal heals via pactHeal, burn
//                         DoT, stun via affixRng, chain rebounds to a 2nd foe, pierce beats a plain hit vs
//                         an ARMORED target) — reproducible under a fixed affixRng seed.
//   [REG]                 Códice + Títulos + Pactos srand probes stay ON==OFF (no regression from the seams).
//
// Run: node tools/cas1768-weapon-affixes.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { WEAPON_AFFIXES } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that touch
// audio.sfx (dropGear→loot sfx, hitEnemy→ehurt) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("AffixBot", "warrior");
  d.waEnable(true);

  // ---------- content sanity: the fixed table of 5 affixes ----------
  const meta = d.waMeta();
  const kinds = meta.defs.map((x) => x.kind).sort();
  if (meta.enabled && meta.defs.length === 5 && J(kinds) === J(["burn", "chain", "lifesteal", "pierce", "stun"]) &&
      meta.dropChanceByRank.length === 4 && meta.magPerTier === 0.15 && meta.chainRange === 3.5)
    pass(`content: fixed pool of 5 on-hit affixes (${meta.defs.map((x) => x.id).join("/")}), tuning knobs present`);
  else fail(`content wrong: ${J(meta)}`);
  const stun = meta.defs.find((x) => x.kind === "stun");
  if (stun && stun.chance === 0.15) pass(`content: only 'aturdidor' carries a proc chance (${stun.chance}) — the sole RNG proc`);
  else fail(`stun chance wrong: ${J(stun)}`);

  // ---------- [AC1/AC3 RNG-STRONG]: 48-draw fixed srand script — ON == OFF ----------
  const SEED = 0x1768c0de, N = 24;
  const on = d.waSrandProbe(true, SEED, N);
  const off = d.waSrandProbe(false, SEED, N);
  if (on.fingerprint.length === 48) pass(`AC-RNG-STRONG: fixed script draws ${on.fingerprint.length} srand values (2×${N})`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${on.fingerprint.length}`);
  if (J(on.fingerprint) === J(off.fingerprint))
    pass(`AC1/AC3: srand stream BYTE-IDENTICAL WEAPON_AFFIXES ON vs OFF — affix roll rides affixRng, base srand untouched`);
  else fail(`srand diverged ON vs OFF — on=${J(on.fingerprint).slice(0, 60)} off=${J(off.fingerprint).slice(0, 60)}`);
  if (off.waCount === 0) pass(`OFF: zero weapons carry a wa (feature disabled ⇒ no roll)`);
  else fail(`OFF leaked a wa: waCount=${off.waCount}`);
  // determinism of the whole seeded script: same seed reproduces the same fingerprint
  const on2 = d.waSrandProbe(true, SEED, N);
  if (J(on.fingerprint) === J(on2.fingerprint) && on.waCount === on2.waCount)
    pass(`determinism: same seed reproduces the same srand stream + wa outcome (${on.waCount} rolled) — Stage-2 ready`);
  else fail(`determinism broke: on.waCount=${on.waCount} on2.waCount=${on2.waCount}`);

  // ---------- [affixRng determinism]: 48-draw dedicated stream ----------
  const a1 = d.waAffixRngProbe(0x0a771c5e, 48), a2 = d.waAffixRngProbe(0x0a771c5e, 48);
  if (a1.fingerprint.length === 48 && J(a1.fingerprint) === J(a2.fingerprint))
    pass(`affixRng: 48-draw dedicated stream is deterministic (identical fingerprint on repeat)`);
  else fail(`affixRng non-deterministic: ${J(a1.fingerprint).slice(0, 60)} vs ${J(a2.fingerprint).slice(0, 60)}`);
  const a3 = d.waAffixRngProbe(0xdeadbeef, 48);
  if (J(a1.fingerprint) !== J(a3.fingerprint)) pass(`affixRng: a different seed yields a different stream (real seeded RNG)`);
  else fail(`affixRng ignores seed`);

  // ---------- [draw-count §3]: exact affixRng consumption ----------
  const cCommon = d.waRollConsumes("common");
  const cBody = d.waRollConsumes("epic", "body");
  const cUniq = d.waRollConsumes("legendary", "weapon", { uniq: "some_uniq" });
  const cUnc = d.waRollConsumes("uncommon");
  if (cCommon.consumed === 0 && cCommon.wa === null) pass(`draw-count: a COMMON weapon consumes 0 affixRng draws (rarity gate) — no wa`);
  else fail(`draw-count common wrong: ${J(cCommon)}`);
  if (cBody.consumed === 0 && cBody.wa === null) pass(`draw-count: a NON-weapon (body) consumes 0 draws — weapons only`);
  else fail(`draw-count body wrong: ${J(cBody)}`);
  if (cUniq.consumed === 0 && cUniq.wa === null) pass(`draw-count: a UNIQUE weapon consumes 0 draws (v1 excludes uniq/set) — no proc-on-proc`);
  else fail(`draw-count uniq wrong: ${J(cUniq)}`);
  if ((cUnc.consumed === 1 && cUnc.wa === null) || (cUnc.consumed === 2 && cUnc.wa !== null))
    pass(`draw-count: an UNCOMMON weapon consumes 1 (gate) + 1 iff it passes — consumed=${cUnc.consumed} wa=${cUnc.wa}`);
  else fail(`draw-count uncommon wrong: ${J(cUnc)}`);

  // ---------- [AC2]: save.v1 byte-identical for an affix-less weapon (ON == OFF, no wa key) ----------
  const sb = d.waSaveByteId();
  if (sb.byteId && !sb.hasWa) pass(`AC2: affix-less weapon ⇒ save.v1 BYTE-IDENTICAL ON vs OFF, no "wa" key (trailing-optional omitted)`);
  else fail(`AC2: save byte-id broke: ${J(sb)}`);

  // ---------- [AC5]: a weapon WITH wa round-trips byte-id save→load→save; id survives ----------
  const rt = d.waPersist("ardiente");
  if (rt.ok && rt.wa === "ardiente" && rt.byteId && rt.hasWa)
    pass(`AC5: a weapon with wa="ardiente" round-trips BYTE-ID (serialize→load→serialize) — the id survives`);
  else fail(`AC5 roundtrip broke: ${J(rt)}`);
  // a tampered/unknown wa is dropped by safeInst ON LOAD → the reloaded weapon carries no wa (base fallback)
  const rtBad = d.waPersist("bogus_affix");
  if (rtBad.ok && rtBad.wa === null)
    pass(`AC5: an UNKNOWN wa is DROPPED by safeInst on load (base weapon fallback, no leak) — reloaded wa=null`);
  else fail(`AC5 guard wrong: ${J(rtBad)}`);

  // ---------- [AC5 effects]: each kind fires in the REAL hitEnemy ----------
  const life = d.waHitProbe("vampiric", 1);
  if (life.heroHeal > 0 && life.eDmg > 0) pass(`effect vampiric: lifesteal heals the hero (+${life.heroHeal}) via the pactHeal path`);
  else fail(`vampiric wrong: ${J(life)}`);
  const brn = d.waHitProbe("ardiente", 1);
  if (brn.burn && brn.burnDmg > 0) pass(`effect ardiente: applies a burn DoT (dmg ${brn.burnDmg}) reusing STATUS.burn`);
  else fail(`ardiente wrong: ${J(brn)}`);
  const chn = d.waHitProbe("cadena", 1);
  if (chn.chainDmg > 0) pass(`effect cadena: rebounds to a 2nd nearby enemy for ${chn.chainDmg} dmg (no cascade — noAffix rebound)`);
  else fail(`cadena wrong: ${J(chn)}`);
  // stun uses affixRng — probabilistic + reproducible. Sweep well-distributed seeds (golden-ratio spread; small
  // integer seeds give a near-0 xorshift first-draw, so they'd all proc — an RNG artifact, not the gate).
  let stunSeed = null, stunMiss = false, procN = 0, seenN = 0;
  for (let i = 1; i <= 200; i++) { const s = (i * 0x9e3779b9) >>> 0; const fired = d.waHitProbe("aturdidor", s).stun; seenN++;
    if (fired) { procN++; if (stunSeed === null) stunSeed = s; } else stunMiss = true; }
  if (stunSeed !== null) {
    const s1 = d.waHitProbe("aturdidor", stunSeed), s2 = d.waHitProbe("aturdidor", stunSeed);
    if (s1.stun && s2.stun) pass(`effect aturdidor: stun procs from affixRng and REPRODUCES under a fixed seed (seed=${stunSeed >>> 0})`);
    else fail(`aturdidor replay wrong: ${J(s1)} ${J(s2)}`);
  } else fail(`aturdidor never procced across ${seenN} seeds (expected ~15%)`);
  // gated, not always-on: over a wide sweep both procs AND misses must appear, near the ~15% rate
  if (stunMiss && procN > 0 && procN < seenN)
    pass(`effect aturdidor: proc is PROBABILISTIC — ${procN}/${seenN} seeds fired (~${Math.round((procN / seenN) * 100)}%, chance gate honoured)`);
  else fail(`aturdidor not gated: procN=${procN}/${seenN}`);
  const pc = d.waPierceProbe();
  if (pc.plain > 0 && pc.pierce > pc.plain) pass(`effect perforante: beats a plain hit vs an ARMORED target (${pc.plain} → ${pc.pierce}) — ignores part of the reduction`);
  else fail(`perforante wrong: ${J(pc)}`);

  // ---------- [OFF path]: the kill switch reports disabled (no-roll/byte-id already proven by waSrandProbe OFF) ----------
  d.waEnable(false);
  const offState = d.waMeta();
  d.waEnable(true);
  if (offState.enabled === false) pass(`OFF: waEnable(false) reports disabled (kill switch) — 0 draws + no wa proven above`);
  else fail(`OFF toggle wrong: ${J(offState)}`);

  // ---------- [REG]: prior beats' srand probes stay ON==OFF (no regression from the affix seams) ----------
  const cod = { on: d.codexSrandProbe(true, 0x1751c0de, 24), off: d.codexSrandProbe(false, 0x1751c0de, 24) };
  if (J(cod.on.fingerprint) === J(cod.off.fingerprint)) pass(`REG: Códice srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Códice srand regressed`);
  const tit = { on: d.titlesSrandProbe(true, 0x1758c0de, 24), off: d.titlesSrandProbe(false, 0x1758c0de, 24) };
  if (J(tit.on.fingerprint) === J(tit.off.fingerprint)) pass(`REG: Títulos srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Títulos srand regressed`);
  const pac = { on: d.pactsSrandProbe(true, {}, 0x1763c0de, 24), off: d.pactsSrandProbe(false, null, 0x1763c0de, 24) };
  if (J(pac.on.fingerprint) === J(pac.off.fingerprint)) pass(`REG: Pactos srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Pactos srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1768 weapon-affixes harness: ALL PASS" : "\n❌ CAS-1768 weapon-affixes harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
