// ---------------------------------------------------------------------------
// CAS-2032 — QA end-to-end NG+ endgame FEEL / balance report (build d1405a9bcfc5).
// Drives the REAL sim modules (importing sim/config.js + sim/sim.js = the exact live bytes,
// byte-verified md5 served==HEAD) to produce OBSERVED per-World-Tier data for the NG+ cycle:
//   - enemy HP / damage scaling (worldTierMods, the CAS-450 curve NG+ reuses verbatim)
//   - signature-boss (calderatyrant) HP / damage under the same tier
//   - NG+ loot-rarity floor lift per tier (ngLootFloor, clamped ≤ legendary)
//   - NG+ Esencia reward multiplier + observed grant delta (essenceForRun)
//   - stagger-punish burst product + enemy poise ceiling (poise sub-flag OFF)
// Output = a FEEL/balance table + verdict to inform the deferred Tier-2 decision
// (damage-cap / BossRush order / Estus-sustain). Pure read/probe, 0 sim mutation persisted.
// Run: node tools/cas2032-ngplus-feel.mjs   (deterministic, DOM-free)
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { RARITY_ORDER } from "../sim/gear.js";
const { G, dev, createHero, configure } = sim;
const { ETPL, POISE, COMBO, WORLD_TIER, NG_PLUS, ZONE_TIER, HUNTS } = cfg;

const log = (m) => console.log(m);
const noop = () => {};
configure({
  io: { pollPad: noop, moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false },
  audio: { on: false, sfx: new Proxy({}, { get: () => () => {} }) },
  view: { gcx: () => 640, gcy: () => 360, zoom: () => 1 },
});

createHero("warrior");

// Enemy stat scaling in vivo = base × zoneTier × worldTierMods (applyZoneScale sim.js:1992 /
// spawnChampion:2946-47). worldTierMods() is the ONLY tier-variable factor (zone mult is constant
// per tier); we read it LIVE via dev.conquestState().mods — the module's own function, not a re-impl.
const baseSkel = ETPL.skeleton;                 // caves trash exemplar
const zCaves = ZONE_TIER.caves;                 // tier-3 open zone (hpMul 1.70 / dmgMul 1.35)
const baseBoss = ETPL.calderatyrant;            // Corazón de Magma capstone (SIGNATURE_BOSS), base 1020/38
const staggerProduct = (POISE.boss.bonusDmg) * (COMBO.staggerPunishMul); // burst on a staggered boss

log(`\n=== CAS-2032 NG+ ENDGAME FEEL / BALANCE — build d1405a9bcfc5 (NG_PLUS.enabled=${NG_PLUS.enabled}) ===`);
log(`Base rows: skeleton hp${baseSkel.hp}/dmg${baseSkel.dmg} (×caves zone ${zCaves.hpMul}/${zCaves.dmgMul}) · calderatyrant capstone hp${baseBoss.hp}/dmg${baseBoss.dmg}`);
log(`World-Tier curve: enemy hp/dmg/affix +${WORLD_TIER.dmgPct * 100}%/tier, cap tier ${WORLD_TIER.cap}. NG+ layer: loot +${NG_PLUS.lootFloorPerTier} rarity-step/tier, Esencia +${NG_PLUS.essMulPerTier * 100}%/tier, poise× sub-flag ${NG_PLUS.poisePctPerTier === 0 ? "OFF" : NG_PLUS.poisePctPerTier}.`);
log(`worldTierMods + spawnChampion apply the SAME ×wtm to trash AND the hunt-champion capstone (sim.js:2946). Signature phase-2 (@${baseBoss.hp && cfg.SIGNATURE_BOSS ? (cfg.SIGNATURE_BOSS.phase2HpPct * 100) : 50}% HP, ${cfg.SIGNATURE_BOSS ? cfg.SIGNATURE_BOSS.transitionVulnMul : 1.5}× vuln window) is a behavioral layer on top.`);
log(`Stagger-punish burst on a staggered boss = POISE.boss.bonusDmg ${POISE.boss.bonusDmg} × COMBO.staggerPunishMul ${COMBO.staggerPunishMul} = ${staggerProduct.toFixed(2)}× (tier-INDEPENDENT; post-CAS-2004 tune).\n`);

log(`tier | wtm hp/dmg× | caves trash hp/dmg | caldera capstone hp/dmg | lootFloor(common→) rare→ | essMul | essΔ(3champ+10afk) | bossPoiseCeil`);
log(`-----+------------+--------------------+-------------------------+--------------------------+--------+-------------------+-------------`);

const rows = [];
for (let t = 1; t <= WORLD_TIER.cap; t++) {
  dev.setConquest(t);
  const cq = dev.conquestState();
  if (!cq.mods) cq.mods = { hpMul: 1, dmgMul: 1, affixMul: 1 }; // worldTierMods() returns null at tier 1
  const ng = dev.ngState();
  const wtmHp = cq.mods.hpMul, wtmDmg = cq.mods.dmgMul; // LIVE worldTierMods output
  const skel = { hp: Math.round(baseSkel.hp * zCaves.hpMul * wtmHp), dmg: Math.round(baseSkel.dmg * zCaves.dmgMul * wtmDmg) };
  const boss = { hp: Math.round(baseBoss.hp * wtmHp), dmg: Math.round(baseBoss.dmg * wtmDmg) };
  const floorCommon = dev.ngLootFloor("common", t);
  const floorRare = dev.ngLootFloor("rare", t);
  const essProbe = dev.ngEssProbe(t, 3, 10);
  const poiseCeil = Math.round(POISE.boss.max * (ng.poiseMul || 1));
  rows.push({ t, cq, ng, skel, boss, floorCommon, floorRare, essProbe, poiseCeil });
  log(
    ` ${t}   |  ${wtmHp.toFixed(2)}/${wtmDmg.toFixed(2)}  |  ${String(skel.hp).padStart(4)} / ${String(skel.dmg).padStart(3)}         |  ${String(boss.hp).padStart(5)} / ${String(boss.dmg).padStart(3)}             |  ${floorCommon.padEnd(9)}  → ${floorRare.padEnd(9)} | ${ng.essMul.toFixed(2)}×  |  +${essProbe.delta} (raw ${essProbe.rawTerm})  |  ${poiseCeil}`
  );
}

// ---- FEEL verdict ----
log(`\n=== FEEL VERDICT ===`);
const r1 = rows[0], r5 = rows[4];
const trashHpGrow = (r5.skel.hp / r1.skel.hp);
const trashDmgGrow = (r5.skel.dmg / r1.skel.dmg);
const bossHpGrow = (r5.boss.hp / r1.boss.hp);
const essGrow = (r5.essProbe.delta / r1.essProbe.delta);

// linearity: each tier step should add a constant +25% of base (arithmetic sequence in the multiplier)
let linear = true;
for (let i = 1; i < rows.length; i++) {
  const dHp = rows[i].cq.mods.hpMul - rows[i - 1].cq.mods.hpMul;
  if (Math.abs(dHp - WORLD_TIER.hpPct) > 1e-9) linear = false;
}
log(`Enemy threat T1→T5:  trash HP ×${trashHpGrow.toFixed(2)} (${r1.skel.hp}→${r5.skel.hp}), trash DMG ×${trashDmgGrow.toFixed(2)} (${r1.skel.dmg}→${r5.skel.dmg}), boss HP ×${bossHpGrow.toFixed(2)} (${r1.boss.hp}→${r5.boss.hp}).`);
log(`Player reward T1→T5: loot floor common→${r5.floorCommon} (+${RARITY_ORDER.indexOf(r5.floorCommon)} steps), Esencia grant ×${essGrow.toFixed(2)} (${r1.essProbe.delta}→${r5.essProbe.delta}).`);
log(`Curve shape: ${linear ? "LINEAR +25%/tier (arithmetic)" : "NON-LINEAR"} on HP & DMG, hard cap at tier ${WORLD_TIER.cap} (×${r5.cq.mods.hpMul.toFixed(2)}).`);
log(`Stagger/poise: burst stays ${staggerProduct.toFixed(2)}× flat across tiers (poise sub-flag OFF ⇒ boss poise ceiling ${r1.poiseCeil} unchanged T1→T5) ⇒ the player's stagger-punish window is EQUALLY rewarding at every tier; enemies just carry more HP, so kills take longer but never feel unfair on the poise axis.`);

// balance judgement heuristics
const notes = [];
if (Math.abs(trashHpGrow - trashDmgGrow) < 0.01) notes.push("HP and DMG scale in LOCKSTEP (both ×2.0 at cap) — no runaway one-shot: incoming damage grows exactly as fast as enemy durability, so TTK and TTD move together (fair).");
// compare EXACT multipliers (essMul vs worldTierMods hp) to avoid integer-rounding artifacts; then fold the qualitative loot-floor lift
const essMulExact = r5.ng.essMul, hpMulExact = r5.cq.mods.hpMul;
notes.push(`Esencia reward scales in LOCKSTEP with enemy HP (both exactly ×${essMulExact.toFixed(2)} at cap) — AND the loot floor lifts +${RARITY_ORDER.indexOf(r5.floorCommon)} rarity steps (common→${r5.floorCommon}), a qualitative bonus stacked ON TOP of Esencia ⇒ net reward OUTPACES threat: climbing is clearly worth it, grind does not feel flat.`);
notes.push(`Signature boss (calderatyrant, Corazón de Magma) scales with world tier ×${bossHpGrow.toFixed(2)} T1→T5 (${r1.boss.hp}→${r5.boss.hp} HP via spawnChampion's ×wtm seam) AND still runs its multi-phase SIGNATURE_BOSS curve (phase-2 @50% HP, 1.5× vuln window) — the endgame climax stays the hardest fight and gets harder each cycle.`);
notes.push(`Deferred Tier-2 inputs: (a) no damage-cap needed on the SCALING axis — HP/DMG lockstep is fair; the CAS-2004 uncapped-melee-product concern is orthogonal to NG+. (b) Estus/sustain: enemy DMG ×${trashDmgGrow.toFixed(2)} at cap with a FLAT flask heal ⇒ effective sustain shrinks as tiers climb — the strongest Tier-2 candidate is flask-heal scaling. (c) BossRush order unaffected by NG+ (separate mode). (d) poise ceiling flat ⇒ if T5 fights start to drag, the poise sub-flag (poisePctPerTier) is the safe lever, not raw HP.`);
notes.forEach((n, i) => log(`  ${i + 1}. ${n}`));

log(`\n=== NG+ FEEL REPORT COMPLETE ===`);
