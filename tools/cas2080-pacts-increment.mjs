// ---------------------------------------------------------------------------
// CAS-2080 (build for CAS-2078, Option B) — PACTOS increment. THIN, additive-only extension of the live
// CAS-1763 Pactos de Poder covenant: 3 new modifier effect.kinds, each wired to an EXISTING seam, plus the
// in-run INTENSIDAD HUD badge (render-only, verified in the browser QA). This DOM-free harness drives the
// REAL sim hooks (dev.pact*) and proves the increment is RNG-neutral STRONG + byte-identical at heat=0.
//
// The 3 new defs (default rank 0 ⇒ inert):
//   · presagio  (variantRate) — +35%/rango a ENCOUNTER_VARIANTS.chancePerZone (threshold-shift; NO toca enemyVariantRng)
//   · corrosion (statusBuild) — +20%/rango a la acumulación de estado SOBRE EL HÉROE (STATUS_BUILDUP, sink isHero)
//   · quebranto (enemyPoise)  — +15%/rango postura enemiga (poiseCeil) + ventana de parada −15%/rango (tryParry, inverso, floor 0.5)
//
// Proves:
//   [content]   the table is now 8 (5 base + 3 new); the 3 new defs exist with the right kinds; heat 0 ⇒ muls 1.0.
//   [heat=0 byte-id] with NO new pact ranked every mod mul is EXACTLY 1.0 ⇒ every seam value == baseline (byte-id HEAD).
//   [AC-a variant]  presagio r3 scales the variant chance threshold (base×(1+3·0.35)); a base-0 zone (town) stays 0.
//   [AC-b buildup]  corrosion r3 makes a hero-side meter PROC in fewer hits (faster affliction); enemy-side feed untouched.
//   [AC-c poise/parry] quebranto r3 raises the élite postura ceiling AND narrows the parry window (inverse, floored).
//   [AC-RNG-STRONG] a 48-draw FIXED srand script with ALL 3 new pacts active == OFF, byte-identical (0 new draws).
//   [persist]   the 3 new prefs round-trip through the OWN mithralda.pacts.v1 blob (save.v1 untouched); clamps to [0,max].
//   [reward]    opting into the new pacts raises Ardor ⇒ the Esencia/Botín reward muls scale (same reward path).
//   [REG]       the base CAS-1763 harness still passes (run it too).
//
// Run: node tools/cas2080-pacts-increment.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { PACTS } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("PactBot2", "warrior");
  d.pactsEnable(true); d.pactsReset();

  // ---------- content: 8 defs, the 3 new kinds present ----------
  const st0 = d.pactsState();
  const ids = st0.items.map(i => i.id);
  const has3 = ["presagio","corrosion","quebranto"].every(x => ids.includes(x));
  if (st0.total === 8 && has3 && st0.heat === 0 && st0.essMul === 1 && st0.dropMul === 1)
    pass(`content: table grew 5→8, has [presagio,corrosion,quebranto], heat 0, muls 1.0`);
  else fail(`content wrong: total=${st0.total} has3=${has3} ${J(st0.items.map(i=>i.id))}`);

  // ---------- heat=0 byte-id: every mod mul EXACTLY 1.0, every seam == baseline ----------
  d.pactsReset();
  const m0 = d.pactModMuls();
  const vc0 = d.pactVariantChance("forest");
  const pp0 = d.pactPoiseParry();
  const bu0 = d.pactHeroBuildupHits("frost");
  const seamsNeutral =
    m0.variantRate === 1 && m0.statusBuild === 1 && m0.enemyPoise === 1 && m0.parryWindowMul === 1 &&
    vc0.base === vc0.scaled &&
    pp0.poiseBase === pp0.poiseScaled && pp0.parryMsBase === pp0.parryMsScaled &&
    bu0.baseHits === bu0.pactHits;
  if (seamsNeutral) pass(`heat=0 byte-id: all mod muls 1.0; variant/poise/parry/buildup seams == baseline`);
  else fail(`heat=0 NOT neutral: muls=${J(m0)} vc=${J(vc0)} pp=${J(pp0)} bu=${J(bu0)}`);

  // ---------- AC-a: presagio raises the variant chance threshold; town (base 0) stays 0 ----------
  d.pactsReset(); d.pactsSetRank("presagio", 3);
  const vc = d.pactVariantChance("forest");
  const town = d.pactVariantChance("town");
  const expVarMul = 1 + 3 * 0.35; // 2.05
  const varOk = Math.abs(d.pactModMuls().variantRate - expVarMul) < 1e-6 &&
    Math.abs(vc.scaled - Math.min(1, vc.base * expVarMul)) < 1e-6 && vc.scaled > vc.base &&
    town.base === 0 && town.scaled === 0;
  if (varOk) pass(`AC-a variant: presagio r3 ×${expVarMul} ⇒ forest ${vc.base}→${vc.scaled}; town stays 0 (variant-free)`);
  else fail(`AC-a wrong: vc=${J(vc)} town=${J(town)} mul=${d.pactModMuls().variantRate}`);

  // ---------- AC-b: corrosion makes a hero-side meter proc in FEWER hits ----------
  d.pactsReset(); d.pactsSetRank("corrosion", 3);
  const bu = d.pactHeroBuildupHits("frost");   // frost threshold 100 / build 26 ⇒ base 4 hits
  const expBuildMul = 1 + 3 * 0.20; // 1.60
  const buOk = Math.abs(d.pactModMuls().statusBuild - expBuildMul) < 1e-6 &&
    bu.pactHits < bu.baseHits && bu.pactHits >= 1;
  if (buOk) pass(`AC-b buildup: corrosion r3 ×${expBuildMul} ⇒ hero frost procs in ${bu.pactHits} hits (baseline ${bu.baseHits})`);
  else fail(`AC-b wrong: bu=${J(bu)} mul=${d.pactModMuls().statusBuild}`);

  // ---------- AC-c: quebranto raises enemy poise ceiling AND narrows the parry window ----------
  d.pactsReset(); d.pactsSetRank("quebranto", 3);
  const pp = d.pactPoiseParry();
  const expPoiseMul = 1 + 3 * 0.15; // 1.45
  const expParryMul = Math.max(0.5, 1 - 3 * 0.15); // 0.55
  const ppOk = Math.abs(d.pactModMuls().enemyPoise - expPoiseMul) < 1e-6 &&
    pp.poiseScaled === Math.round(pp.poiseBase * expPoiseMul) && pp.poiseScaled > pp.poiseBase &&
    Math.abs(pp.parryMsScaled - pp.parryMsBase * expParryMul) < 0.01 && pp.parryMsScaled < pp.parryMsBase;
  if (ppOk) pass(`AC-c poise/parry: quebranto r3 ⇒ postura ${pp.poiseBase}→${pp.poiseScaled}, parada ${pp.parryMsBase}→${pp.parryMsScaled}ms`);
  else fail(`AC-c wrong: pp=${J(pp)} mul=${d.pactModMuls().enemyPoise}`);

  // parry floor: at max rank the window never collapses below 0.5×
  d.pactsReset(); d.pactsSetRank("quebranto", 3);
  const floorOk = d.pactModMuls().parryWindowMul >= 0.5;
  if (floorOk) pass(`AC-c floor: parryWindowMul ${d.pactModMuls().parryWindowMul} ≥ 0.5 (never unparryable)`);
  else fail(`AC-c floor breached: ${d.pactModMuls().parryWindowMul}`);

  // ---------- AC-RNG-STRONG: 48-draw fixed srand script, ALL 3 new pacts ON == OFF ----------
  const SEED = 0x2080c0de, N = 24;
  const ranks = { presagio: 3, corrosion: 3, quebranto: 3 };
  const off = d.pactsSrandProbe(false, null, SEED, N);
  const on  = d.pactsSrandProbe(true, ranks, SEED, N);
  const fpMatch = J(off.fingerprint) === J(on.fingerprint);
  if (fpMatch && on.heat > 0 && off.heat === 0)
    pass(`AC-RNG-STRONG: 48-draw srand ON(heat ${on.heat})==OFF byte-identical (0 new draws)`);
  else fail(`RNG NOT neutral: fpMatch=${fpMatch} offHeat=${off.heat} onHeat=${on.heat}`);

  // ---------- persist: the 3 new prefs round-trip through the OWN blob; clamp to [0,max] ----------
  d.pactsReset();
  d.pactsSetRank("presagio", 2); d.pactsSetRank("corrosion", 99); d.pactsSetRank("quebranto", 1);
  const per = d.pactsPersist();
  const after = {}; for (const it of per.after.items) after[it.id] = it.rank;
  const persistOk = after.presagio === 2 && after.corrosion === 3 /*clamped to max*/ && after.quebranto === 1 &&
    J(per.blob.ranks.presagio ?? null) !== "null";
  if (persistOk) pass(`persist: presagio2/corrosion3(clamped)/quebranto1 round-trip via mithralda.pacts.v1`);
  else fail(`persist wrong: after=${J(after)} blob=${J(per.blob)}`);

  // ---------- reward: opting into a new pact raises Ardor ⇒ reward muls scale ----------
  d.pactsReset(); d.pactsSetRank("quebranto", 3); // heat = 3*14 = 42
  const rw = d.pactsState();
  const expHeat = 3 * 14;
  const rewardOk = rw.heat === expHeat && rw.essMul > 1 && rw.dropMul > 1;
  if (rewardOk) pass(`reward: quebranto r3 ⇒ Ardor ${rw.heat}, Esencia ×${rw.essMul.toFixed(3)}, Botín ×${rw.dropMul.toFixed(3)}`);
  else fail(`reward wrong: ${J(rw)}`);

  d.pactsReset();
} catch (e) {
  fail("EXCEPTION: " + (e && e.stack || e));
}

log("");
log(ok ? "✅ CAS-2080 pactos increment harness: ALL PASS" : "❌ CAS-2080 pactos increment harness: FAIL");
process.exit(ok ? 0 : 1);
