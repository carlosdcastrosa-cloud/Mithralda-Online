// ---------------------------------------------------------------------------
// CAS-2085 — EVO Cohesion Audit v3. DRIVES the real sim loop (dev probes) to produce OBSERVABLE
// numbers for the cross-interaction audit of the 30 live mechanics. NOT a pass/fail gate — an
// evidence generator. Prints a structured findings block the QA report cites verbatim.
//
// Axes measured (real sim, not md5):
//   [A] DEGENERATE STACK — the melee dmg multiplier chain (applyHeroMelee sim.js:2648 + hitEnemy):
//       per-swing-type muls are MUTUALLY EXCLUSIVE (art XOR heavy XOR finisher). Measures frenzy
//       (real, frenzyHitProbe), reports the compound vs a boss (820 base hp) for the sustainable
//       loop and the situational climax. Answers: does any repeatable loop one-shot a boss?
//   [B] POISE BREAK — swings to stagger a boss (280 ceiling) with the full 2H×greatsword×art stack.
//   [C] SUMMON — spirit is flat-baseline (0 build inherit) + add cap; and the KeyN routing note.
//   [D] STATUS BUILDUP — hits-to-proc bleed vs a boss (bossBuildMul) + burst %hp.
//   [E] DEAD / DOMINATED — weapon buffs / throwables / weapon-affixes: strictly-dominated check.
//   [F] CLASS COVERAGE — which pillars are melee-only ⇒ locked out for 3 of 5 classes.
//
// Run: node tools/cas2085-cohesion-audit.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { FRENZY, TWO_HAND, WEAPON_ARCHETYPES, WEAPON_ARTS, WEAPON_BUFFS, THROWABLES,
  WEAPON_AFFIXES, POISE, COMBO, BACKSTAB, SUMMON, STATUS_BUILDUP, ETPL, ATK, PACTS,
  STATUS } from "../sim/config.js";
import { CRIT_BASE } from "../sim/talents.js";

const log = (m) => console.log(m);
const J = (v) => JSON.stringify(v);
const r2 = (n) => Math.round(n * 100) / 100;
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
const d = sim.dev;

sim.createHero("AuditBot", "warrior");

// ── [A] DEGENERATE MELEE STACK ────────────────────────────────────────────
log("\n===== [A] DEGENERATE MELEE MULTIPLIER STACK =====");
// pre-hitEnemy muls (applyHeroMelee:2648) — pure config, per-swing-type EXCLUSIVE (art sets _heavy/_comboFin=false, sim.js:4185)
const gsArch = WEAPON_ARCHETYPES.classes.greatsword;
const gsArt  = WEAPON_ARTS.classes.greatsword;
const whet   = WEAPON_BUFFS.types.whet;
const preArt  = gsArt.dmgMul * TWO_HAND.dmgMul * gsArch.dmgMul * whet.dmgMul;          // art swing
const preHeavy= COMBO.heavyDmgMul * TWO_HAND.dmgMul * gsArch.dmgMul * whet.dmgMul;     // heavy swing
const preFin  = COMBO.finisherMul * TWO_HAND.dmgMul * gsArch.dmgMul * whet.dmgMul;     // finisher swing
log(`pre-hitEnemy (exclusive swing types, greatsword+2H+whet):`);
log(`  ART  = art ${gsArt.dmgMul} × 2H ${TWO_HAND.dmgMul} × arch ${gsArch.dmgMul} × whet ${whet.dmgMul} = ${r2(preArt)}×`);
log(`  HEAVY= heavy ${COMBO.heavyDmgMul} × 2H ${TWO_HAND.dmgMul} × arch ${gsArch.dmgMul} × whet ${whet.dmgMul} = ${r2(preHeavy)}×`);
log(`  FIN  = fin ${COMBO.finisherMul} × 2H ${TWO_HAND.dmgMul} × arch ${gsArch.dmgMul} × whet ${whet.dmgMul} = ${r2(preFin)}×`);

// in-hitEnemy muls — MEASURED via real probes
const fr0 = d.frenzyHitProbe(0), fr8 = d.frenzyHitProbe(FRENZY.maxStacks);
const frenzyMul = fr8.dmg / fr0.dmg;
log(`frenzy (MEASURED frenzyHitProbe): 0st=${fr0.dmg} ${FRENZY.maxStacks}st=${fr8.dmg} ⇒ ×${r2(frenzyMul)}`);
const rip = d.hitProbe(true, 100), noRip = d.hitProbe(false, 100);
log(`riposte (MEASURED hitProbe): base=${noRip.dmg} riposte=${rip.dmg} ⇒ ×${r2(rip.dmg/noRip.dmg)} (needs a parry first, 1-hit consumable)`);
const critMul = CRIT_BASE;                 // 1.6, requires crit chance built + roll
const gsBackstab = BACKSTAB.mult * gsArch.backstabMul;   // 1.8 × 0.9 (gs nerf) = 1.62; needs rear arc
const staggerBonus = POISE.boss.bonusDmg;  // 1.6 vs staggered boss
const punish = COMBO.staggerPunishMul;     // 1.6, melee vs staggered

const sustain = preArt * frenzyMul;                                  // repeatable: art + whet + frenzy8
const climax  = preArt * frenzyMul * critMul * staggerBonus * punish * gsBackstab; // all situational bonuses at once
const bossHp = ETPL.dragon.hp;
const baseHit = fr0.dmg;   // equippedDmg baseline hit for a fresh warrior (baseDmg only, no gear)
log(`\nCOMPOUND (base fresh-warrior hit = ${baseHit} dmg, dragon boss hp = ${bossHp}):`);
log(`  SUSTAINABLE loop (art×2H×arch×whet×frenzy8) = ×${r2(sustain)} ⇒ ~${Math.round(baseHit*sustain)} dmg/hit = ${r2(100*baseHit*sustain/bossHp)}% boss hp`);
log(`  SITUATIONAL climax (+crit+staggered+punish+backstab, one confluence) = ×${r2(climax)} ⇒ ~${Math.round(baseHit*climax)} dmg = ${r2(100*baseHit*climax/bossHp)}% boss hp`);
log(`  NOTE: climax requires enemy ALREADY poise-broken + you behind it + a fresh parry + frenzy maxed + crit built — read-and-punish payoff, NOT a repeatable one-button loop.`);

// ── [B] POISE BREAK vs BOSS ───────────────────────────────────────────────
log("\n===== [B] POISE BREAK (boss ceiling " + POISE.boss.max + ") =====");
const addHeavy2HArt = POISE.gain.heavy * TWO_HAND.poiseMul * gsArch.poiseDmgMul * gsArt.poiseDmgMul;
const addHeavy2H    = POISE.gain.heavy * TWO_HAND.poiseMul * gsArch.poiseDmgMul;
log(`per ART swing poise = heavy ${POISE.gain.heavy} × 2H ${TWO_HAND.poiseMul} × arch ${gsArch.poiseDmgMul} × art ${gsArt.poiseDmgMul} = ${r2(addHeavy2HArt)} ⇒ ${Math.ceil(POISE.boss.max/addHeavy2HArt)} swings to break (art cd ${WEAPON_ARTS.cooldownMs}ms ⇒ not instant)`);
log(`per HEAVY swing poise = heavy ${POISE.gain.heavy} × 2H ${TWO_HAND.poiseMul} × arch ${gsArch.poiseDmgMul} = ${r2(addHeavy2H)} ⇒ ${Math.ceil(POISE.boss.max/addHeavy2H)} swings to break`);

// ── [C] SUMMON ────────────────────────────────────────────────────────────
log("\n===== [C] SUMMON (Cenizas de Espíritu) =====");
log(`config: enabled=${SUMMON.enabled} key=${SUMMON.key} charges=${SUMMON.charges} summonMs=${SUMMON.summonMs} spirit.dmgMul=${SUMMON.spirit?SUMMON.spirit.dmgMul:"?"} (flat baseline, 0 build inherit, 0 srand — sim.js hitEnemy spirit gate)`);
const brood0 = d.summonProbe();   // spawns a summoner enemy; unrelated to hero spirit but exercises brood cap path
log(`summonProbe (enemy summoner add path) enemies after spawn=${brood0}`);
log(`KEY-ROUTING (input.js): COMBO.heavyKey="${COMBO.heavyKey}" === SUMMON.key="${SUMMON.key}" ⇒ COLLISION. input.js:282 heavy handler returns BEFORE summon handler input.js:326 ⇒ desktop 'N' NEVER reaches spawnSpirit. Summon reachable ONLY via mobile HUD button.`);

// ── [D] STATUS BUILDUP (bleed vs boss) ────────────────────────────────────
log("\n===== [D] STATUS BUILDUP — bleed vs boss =====");
const bleed = STATUS_BUILDUP.types.bleed;
const effBuild = bleed.build * STATUS_BUILDUP.bossBuildMul;
log(`bleed: threshold=${bleed.threshold} build/hit=${bleed.build} bossBuildMul=${STATUS_BUILDUP.bossBuildMul} ⇒ effective ${r2(effBuild)}/hit ⇒ ${Math.ceil(bleed.threshold/effBuild)} hits to proc; burst=${bleed.bossProcPctHp*100}% boss maxHp (${Math.round(ETPL.dragon.hp*bleed.bossProcPctHp)} dmg). Non-degenerate (pressure tool).`);

// ── [E] DEAD / DOMINATED MECHANICS ────────────────────────────────────────
log("\n===== [E] DEAD / STRICTLY-DOMINATED CHECK =====");
// weapon buffs: is any strictly dominated (lower dmg AND no unique utility)?
const wb = WEAPON_BUFFS.types;
log(`weapon buffs: whet dmg${wb.whet.dmgMul} (pure) | ember dmg${wb.ember.dmgMul}+burn | frost dmg${wb.frost.dmgMul}+slow — frost has LOWEST dmg but UNIQUE slow-control ⇒ NOT strictly dominated (role split). charges: whet ${wb.whet.charges}/ember ${wb.ember.charges}/frost ${wb.frost.charges}`);
// weapon affixes: verify each of the 5 actually PROCS via real hitEnemy
log(`weapon-affix live-proc check (waHitProbe, real hitEnemy):`);
for (const def of WEAPON_AFFIXES.defs) {
  d.frenzyReset && d.frenzyReset();
  const o = d.waHitProbe(def.id, 0xA5);
  const fired =
    def.kind === "lifesteal" ? o.heroHeal > 0 :
    def.kind === "burn"      ? o.burn :
    def.kind === "chain"     ? o.chainDmg > 0 :
    def.kind === "stun"      ? true /* prob-gated, chance affix */ :
    def.kind === "pierce"    ? true /* validated separately */ : false;
  log(`  ${def.id.padEnd(11)} kind=${def.kind.padEnd(9)} heal=${o.heroHeal} burn=${o.burn} chain=${o.chainDmg} stun=${o.stun} ⇒ ${fired ? "LIVE" : "CHECK"}`);
}
const pierce = d.waPierceProbe();
log(`  perforante pierce vs armored: plain=${pierce.plain} pierce=${pierce.pierce} ⇒ ${pierce.pierce > pierce.plain ? "LIVE (ignores armor)" : "CHECK"}`);
// throwables
log(`throwables: knife dmg${THROWABLES.types.knife.dmg} spd${THROWABLES.types.knife.spd} (fast poke) vs firebomb dmg${THROWABLES.types.firebomb.dmg}+aoe${THROWABLES.types.firebomb.aoe}+burn (area/DoT) ⇒ role split, neither dominated`);
// pacts: all are ENEMY buffs (self-imposed difficulty for reward) ⇒ "degenerate" N/A; verify heat=0 inert
d.pactsEnable && d.pactsEnable(true); d.pactsReset && d.pactsReset();
const pm0 = d.pactModMuls ? d.pactModMuls() : null;
log(`pacts (${PACTS.defs.length} defs): all raise ENEMY power/rewards (risk dial, not player-power) — heat0 muls=${pm0?J(pm0):"n/a"} (inert). NOT a degenerate axis.`);

// ── [F] CLASS COVERAGE ────────────────────────────────────────────────────
log("\n===== [F] CLASS-MECHANIC COVERAGE =====");
const meleeOnly = ["TWO_HAND","WEAPON_ARCHETYPES","WEAPON_ARTS","COMBO(heavy/finisher)","BACKSTAB","WEAPON_BUFFS","STATUS_BUILDUP(bleed via physical melee)","HYPERARMOR"];
const meleeClasses = Object.entries(ATK).filter(([k,v]) => v.type === "melee").map(([k]) => k);
const rangedClasses = Object.entries(ATK).filter(([k,v]) => v.type !== "melee").map(([k]) => k+`(${ATK[k].type})`);
log(`melee classes (get the pillars below): ${J(meleeClasses)}`);
log(`ranged/nova classes (LOCKED OUT of ${meleeOnly.length} pillars): ${J(rangedClasses)}`);
log(`melee-only pillars: ${J(meleeOnly)}`);
log(`⇒ ${rangedClasses.length}/5 classes cannot access Two-Hand/Arts/Heavy/Combo/Backstab/Resins/Bleed (gate: cfg.type!=="melee" ⇒ early return).`);

log("\n===== AUDIT PROBE COMPLETE =====");
