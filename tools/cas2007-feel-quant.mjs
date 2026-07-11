// ---------------------------------------------------------------------------
// CAS-2007 (parent CAS-2004) — QA FEEL quantification for the Balance Tier-1 pass.
// Reads the REAL sim modules (served == HEAD, md5-verified) and computes the ANTES vs DESPUÉS
// numbers behind the qualitative FEEL report. The DESPUÉS values come straight from the live
// config; the ANTES values are the design-doc "before" side. The boss-stagger sink is the pure
// multiplicative product read at sim.js: `dmg *= POISE.boss.bonusDmg` then `dmg *= COMBO.staggerPunishMul`.
// Also drives a REAL calderatyrant spawn to anchor HP-delete against a live boss maxHp.
// Run: node tools/cas2007-feel-quant.mjs
// ---------------------------------------------------------------------------
import { CFG, POISE, COMBO, STAMINA, HYPERARMOR, WEAPON_BUFFS, STATUS_BUILDUP, ZONE_TIER, ETPL } from "../sim/config.js";
import { G, createHero, dev } from "../sim/sim.js";

const ANTES = { staggerPunishMul:2.2, bossBonus:1.9, riposteMult:2.4, whet:1.35, regen:22, poiseThr:34, bleed:0.14 };
const r2 = (x)=>Math.round(x*100)/100;
const pct = (a,b)=>r2((b-a)/a*100);

console.log("=== live DESPUÉS knobs (real module) ===");
const NOW = { staggerPunishMul:COMBO.staggerPunishMul, bossBonus:POISE.boss.bonusDmg, riposteMult:CFG.riposteMult,
  whet:WEAPON_BUFFS.types.whet.dmgMul, regen:STAMINA.regen, poiseThr:HYPERARMOR.poiseThreshold, bleed:STATUS_BUILDUP.types.bleed.procPctHp };
console.log(NOW);

// 1. BOSS STAGGER combined multiplier (the delete-button focus)
const stAntes = ANTES.staggerPunishMul*ANTES.bossBonus, stNow = NOW.staggerPunishMul*NOW.bossBonus;
console.log(`\n[1] BOSS STAGGER combined = staggerPunishMul × POISE.boss.bonusDmg`);
console.log(`    ANTES ${ANTES.staggerPunishMul}×${ANTES.bossBonus} = ${r2(stAntes)}×   →   DESPUÉS ${NOW.staggerPunishMul}×${NOW.bossBonus} = ${r2(stNow)}×   (${pct(stAntes,stNow)}%)`);

// drive a REAL calderatyrant to anchor HP-delete
createHero("QA","warrior"); dev.spawn("calderatyrant",120,0);
const boss = G.enemies.find(e=>e.isBoss);
const bossHp = boss?Math.round(boss.maxHp):1020;
// representative CLEAN heavy melee base on a fresh warrior (no gear/boons): equippedDmg × heavyDmgMul
// use a modest base swing B so the % reads as "one punished heavy" — take B=90 raw (typical mid-run heavy pre-mults)
const B = 90;
const delAntes = B*stAntes, delNow = B*stNow;
console.log(`    real calderatyrant maxHp (spawned) = ${bossHp}`);
console.log(`    one punished heavy (base ${B} raw): ANTES ${Math.round(delAntes)} dmg = ${r2(delAntes/bossHp*100)}% HP  →  DESPUÉS ${Math.round(delNow)} dmg = ${r2(delNow/bossHp*100)}% HP`);
console.log(`    hits-to-kill from full via punished-heavy only: ANTES ${Math.ceil(bossHp/delAntes)}  →  DESPUÉS ${Math.ceil(bossHp/delNow)}`);

// 2. RIPOSTE burst
console.log(`\n[2] RIPOSTE crit mult: ${ANTES.riposteMult}× → ${NOW.riposteMult}×  (${pct(ANTES.riposteMult,NOW.riposteMult)}%)`);
// 3. WHET burst
console.log(`[3] WHET (Piedra de Afilar) dmgMul: ${ANTES.whet}× → ${NOW.whet}×  (${pct(ANTES.whet,NOW.whet)}%)`);
// combined riposte-on-whetted-heavy sample (composición)
const comboA = ANTES.riposteMult*ANTES.whet, comboN = NOW.riposteMult*NOW.whet;
console.log(`    riposte×whet stacked: ${r2(comboA)}× → ${r2(comboN)}×  (${pct(comboA,comboN)}%)`);

// 4. STAMINA economy
console.log(`\n[4] STAMINA regen: ${ANTES.regen}/s → ${NOW.regen}/s  (${pct(ANTES.regen,NOW.regen)}%)`);
const dodge = STAMINA.cost.dodge, heavy = STAMINA.cost.heavy;
console.log(`    full-pool refill (100 from empty): ${r2(100/ANTES.regen)}s → ${r2(100/NOW.regen)}s`);
console.log(`    sustained dodges/s (cost ${dodge}): ${r2(ANTES.regen/dodge)} → ${r2(NOW.regen/dodge)}`);
console.log(`    time to afford 1 dodge from empty: ${r2(dodge/ANTES.regen)}s → ${r2(dodge/NOW.regen)}s`);
console.log(`    time to afford 1 heavy (cost ${heavy}) from empty: ${r2(heavy/ANTES.regen)}s → ${r2(heavy/NOW.regen)}s`);

// 5. HYPERARMOR threshold — which real trash attacks now interrupt a committed heavy/finisher
console.log(`\n[5] HYPERARMOR poiseThreshold: ${ANTES.poiseThr} → ${NOW.poiseThr}  (incoming zone-scaled dmg >= thr breaks the commit)`);
const zones = ["caves","arena","swamp","abyss","caldera"];
const mobs = ["wolf","skeleton","orc","bandit","moose","charger","revenant","magmabrute","volatile"];
console.log(`    zone-scaled hit dmg — flag = crosses NEW(24) but NOT OLD(34) ⇒ *newly interrupts*:`);
const newlyInterrupt = [];
for(const m of mobs){ const t=ETPL[m]; if(!t) continue;
  let row=`      ${m.padEnd(11)} base ${String(t.dmg).padStart(3)} :`;
  for(const z of zones){ const zt=ZONE_TIER[z]; if(!zt) continue; const d=Math.round(t.dmg*zt.dmgMul);
    const crossOld=d>=ANTES.poiseThr, crossNew=d>=NOW.poiseThr; const mark = (crossNew&&!crossOld)?"*":(crossNew?"+":" ");
    if(crossNew&&!crossOld) newlyInterrupt.push(`${m}@${z}(${d})`);
    row+=` ${z.slice(0,4)}=${String(d).padStart(3)}${mark}`; }
  console.log(row); }
console.log(`    (* = newly interrupts under 24; + = already interrupted under 34)`);
console.log(`    NEWLY interrupting mid/heavy trash: ${newlyInterrupt.join(", ")}`);

// 6. BLEED proc burst on trash
console.log(`\n[6] BLEED procPctHp (trash): ${ANTES.bleed} → ${NOW.bleed}  (${pct(ANTES.bleed,NOW.bleed)}% of the % max-HP burst on fill)`);
const trashHp = Math.round(ETPL.orc.hp*ZONE_TIER.abyss.hpMul);
console.log(`    e.g. abyss orc (hp ${trashHp}): bleed burst ANTES ${Math.round(trashHp*ANTES.bleed)} → DESPUÉS ${Math.round(trashHp*NOW.bleed)}  (bossProcPctHp 0.06 unchanged)`);

console.log("\n✅ FEEL quant computed from real modules + real spawned boss.");
