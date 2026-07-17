// CAS-2478 — INDEPENDENT DARK QA (Gate 2/2) for CAMPO DE BOTÍN DENSO (SPOILS_FIELD_SURGE.enabled:false). EVO mecánica #79.
// This harness RE-DERIVES its own oracles (does NOT trust the game's scoreProbe/LUT for expected values). It is the QA
// counter-verify to the GE self-verify (cas2477, PASS 15/15) + CEO byte-verify DARK (Gate 1/2, 8/8). NO flip here.
//
// AXIS (re-derived): server-auth LOOT-FIELD DENSITY. spoilsFieldScore(h)=Σ spoilsWeights[d.kind] over UNTAKEN drops
//   (!d.taken) of G.drops within radius 260 of the hero. Weights {gear:2,rune:2,gold:1,potionhp:1,potionmp:1}. Tiers
//   [1→T1, 3→T2], sub-cap spoilsSalvageCap=2. FRESH channel salvageFind→h.salvageShards (transient, via grantSalvage).
//   ANTI-AUTO-COUNT: score sampled at TOP of killEnemy (_spoilsPre) BEFORE that kill pushes its own drops.
// GROUNDING (read from source, re-derived here in JS): TS=32 px/tile; R=260 ⇒ Δ8 tiles=256px IN, Δ9=288px OUT.
//
// AC (independent, 2-client, server-authoritative):
//   0  no JS errors during run.
//   1  boots to play; __dev.spoilsField + peer arc hooks + __BUILD present.
//   2  OFF byte-neutral (fresh boot): enabled:false, G.spoilsField NEVER created (gExists false), tier/score/salvage/
//      forageSalvagePreview all 0, tag "", channel salvageFind.
//   3  STATELESS: saveBlob() has NO spoilsField*/salvageFind*/salvageShards key; save→reload leaves VM byte-identical.
//   4  worldFingerprint byte-stable across enabled toggle (fp id 15920977) — salvage NOT in fingerprint.
//   5  LUT re-derived INDEPENDENTLY (I compute tier+salvage from weights/tiers/cap myself) == scoreProbe for a battery.
//   6  server-auth REAL + per-kind weights: inject EACH kind ⇒ spoilsProbe weight == my re-derived spoilsWeights[kind];
//      score in radius == Σ my weights.
//   7  radius gating re-derived (TS=32,R=260): drop at Δ8 tiles counts, Δ9 tiles does not.
//   8  ANTI-AUTO-COUNT: clean ground (score 0) ⇒ forageSalvagePreview 0 (remate sobre suelo limpio NO forrajea);
//      drops present ⇒ forageSalvagePreview == my re-derived LUT salvage (>0). (mirrors _spoilsPre pre-kill snapshot).
//   9  DIFFERENTIATOR ⊥20: inject drops ⇒ spoils→T2 WHILE enrage(#78)/hazard(#77)/variant(#76)/event(#75) IGNORE and
//      lootQuality (#63/#68) unchanged; all 4 neighbors served enabled:true coexist.
//  10  CHANNEL freshness: flip spoils OFF→ON at same state ⇒ 16 peer channels byte-identical (0 cross-contam).
//  11  BYTE-NEUTRAL OFF seam: OFF with a drop glued to hero ⇒ forageSalvagePreview 0 + salvage 0 ⇒ killEnemy byte-id.
//  12  0-REGRESSION: 20 arc flags #59-#78 served enabled:true; SPOILS_FIELD_SURGE served false (DARK #79).
//  13  NORTH STAR 2-CLIENT: same drops+hero ⇒ score/tier/salvage + spoilsProbe(score,count) + LUT + worldFingerprint
//      byte-identical across two independent pages (0 desync; sev-1 if desync). fp id 15920977.
// Run: node tools/cas2478-spoilsfield-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2478-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ============ INDEPENDENT ORACLES (re-derived from source, NOT from the game runtime) ============
const TS = 32;                                                    // sim/config.js:6 (world px per tile)
const RADIUS = 260;                                               // SPOILS_FIELD_SURGE.radius
const WEIGHTS = { gear: 2, rune: 2, gold: 1, potionhp: 1, potionmp: 1 };  // spoilsWeights
const TIERS = [{ min: 1, salvage: 1 }, { min: 3, salvage: 2 }];   // tiers
const CAP = 2;                                                    // spoilsSalvageCap
const myWeight = (kind) => (WEIGHTS[kind] != null ? WEIGHTS[kind] : 1);
const myTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const mySalvage = (score) => { const t = myTier(score); if (t <= 0) return 0; const raw = TIERS[t - 1].salvage; return Math.min(CAP, raw); };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= RADIUS * RADIUS;   // same-row px distance

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play; __dev.spoilsField + peer arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 OFF byte-neutral fresh boot
  const dark = await page.evaluate(() => window.__dev.spoilsField());
  ok("2 OFF byte-neutral (fresh boot): enabled false, G.spoilsField NEVER created (gExists false), score/tier/salvage/preview 0, tag \"\", channel salvageFind",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.salvage === 0 && dark.forageSalvagePreview === 0 && dark.tag === "" && dark.channel === "salvageFind",
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} salvage=${dark.salvage} preview=${dark.forageSalvagePreview} tag="${dark.tag}" channel=${dark.channel}`);

  // 3 STATELESS: save has no new keys + save/reload byte-identical VM
  const save3 = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noKeys = !/"(spoilsField|salvageFind)[A-Za-z]*"\s*:/.test(save3) && !/"salvageShards"\s*:/.test(save3);
  ok("3 STATELESS: saveBlob has NO spoilsField*/salvageFind*/salvageShards key (transient runtime-only)", noKeys, `noKeys=${noKeys} len=${save3.length}`);

  // 4 worldFingerprint stable across toggle
  const fp0 = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.spoilsField({ enabled: true }));
  const fp1 = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.spoilsField({ enabled: false }));
  const fpId = JSON.parse(fp0).length !== undefined ? fp0.length : 0;
  ok("4 worldFingerprint byte-stable across enabled toggle (salvage NOT in fingerprint)", fp0 === fp1, `match=${fp0 === fp1} fpLen=${fp0.length}`);

  // 5 LUT re-derived INDEPENDENTLY == scoreProbe
  const scores = [0, 1, 2, 3, 4, 6, 12, 99];
  const probe5 = await page.evaluate((ss) => ss.map(s => { const p = window.__dev.spoilsField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, salvage: p.salvage }; }), scores);
  const lutOK = scores.every((s, i) => probe5[i].tier === myTier(s) && probe5[i].salvage === mySalvage(s)) && probe5.every(p => p.salvage <= CAP);
  ok("5 LUT re-derived INDEPENDENTLY (my tier+salvage from weights/tiers/cap) == scoreProbe; sub-cap 2",
     lutOK, JSON.stringify(scores.map((s, i) => ({ s, mine: [myTier(s), mySalvage(s)], game: [probe5[i].tier, probe5[i].salvage] }))));

  // 6 server-auth REAL + per-kind weight: inject each kind, spoilsProbe weight == my re-derived weight; score == Σ my weights
  const kinds = ["gear", "rune", "gold", "potionhp", "potionmp"];
  const perKind = await page.evaluate((kk) => {
    const out = [];
    for (const k of kk) {
      window.__dev.spoilsField({ enabled: true });
      window.__dev.spoilsField({ clearDrops: true });
      const h = window.__dev.spoilsField().hero;
      const sd = window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 3, ty: h.ty, kind: k } }).spawnDrop;   // 96px, in radius
      window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
      const sp = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe;
      window.__dev.spoilsField({ clearDrops: true });
      window.__dev.spoilsField({ enabled: false });
      out.push({ kind: k, spawnWeight: sd.weight, probeScore: sp.score, probeCount: sp.count, probeKind: sp.drops[0] ? sp.drops[0].kind : null, probeWeight: sp.drops[0] ? sp.drops[0].weight : null });
    }
    return out;
  }, kinds);
  const perKindOK = perKind.every(r => r.spawnWeight === myWeight(r.kind) && r.probeWeight === myWeight(r.kind) && r.probeScore === myWeight(r.kind) && r.probeCount === 1 && r.probeKind === r.kind);
  ok("6 server-auth REAL + per-kind weight: inject each kind ⇒ spoilsProbe weight == my re-derived spoilsWeights[kind]; score == Σ weights",
     perKindOK, JSON.stringify(perKind.map(r => ({ k: r.kind, mine: myWeight(r.kind), game: r.probeWeight, score: r.probeScore }))));

  // 7 radius gating re-derived: Δ8 tiles (256px) in, Δ9 tiles (288px) out
  const rad = await page.evaluate(() => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.spoilsField({ enabled: true });
      window.__dev.spoilsField({ clearDrops: true });
      const h = window.__dev.spoilsField().hero;
      window.__dev.spoilsField({ spawnDrop: { tx: h.tx + d, ty: h.ty, kind: "gold" } });   // weight 1
      window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
      res[tag] = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score;
      window.__dev.spoilsField({ clearDrops: true });
      window.__dev.spoilsField({ enabled: false });
    }
    return res;
  });
  const radOK = rad.in === 1 && rad.out === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("7 radius gating re-derived (TS=32,R=260): Δ8 tiles=256px IN (score 1), Δ9 tiles=288px OUT (score 0)",
     radOK, `in=${rad.in} out=${rad.out} myIn8=${inRadiusTiles(8)} myOut9=${inRadiusTiles(9)}`);

  // 8 ANTI-AUTO-COUNT: clean ground ⇒ forage 0; drops present ⇒ forage == my LUT salvage
  const anti = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    // remote clean tile: no drops in radius ⇒ live score 0 ⇒ a kill here forages nothing (even though the kill drops gold)
    window.__dev.spoilsField({ tp: { tx: h.tx - 100, ty: h.ty } });
    const cleanForage = window.__dev.spoilsField().forageSalvagePreview;
    const cleanScore = window.__dev.spoilsField().score;
    // dense field: gear(2)+rune(2)=4 ⇒ T2 ⇒ salvage 2
    const h2 = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h2.tx + 2, ty: h2.ty, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: h2.tx + 3, ty: h2.ty, kind: "rune" } });
    window.__dev.spoilsField({ tp: { tx: h2.tx, ty: h2.ty } });
    const denseVm = window.__dev.spoilsField();
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { cleanForage, cleanScore, denseScore: denseVm.score, denseForage: denseVm.forageSalvagePreview, denseSalvage: denseVm.salvage };
  });
  const antiOK = anti.cleanForage === 0 && anti.cleanScore === 0 && anti.denseScore === 4 && anti.denseForage === mySalvage(4) && anti.denseForage === 2;
  ok("8 ANTI-AUTO-COUNT: clean ground (score 0) ⇒ forage 0 (remate suelo limpio NO forrajea); dense field score 4 ⇒ forage == my LUT salvage(4)=2",
     antiOK, JSON.stringify({ ...anti, myLut4: mySalvage(4) }));

  // 9 DIFFERENTIATOR ⊥20 (remote fresh tile, deltas): drop ⇒ spoils T2 while enrage/hazard/variant/event IGNORE + lootQuality unchanged
  const diff = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h0 = window.__dev.spoilsField().hero;
    const RX = h0.tx + 150, RY = h0.ty + 60;   // remote fresh tile isolated from prior injections
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const base = window.__dev.spoilsField().score;
    const enB = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const hzB = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    const vrB = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    const evB = window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score;
    const lootB = window.__dev.spoilsField().lootQualityFloor;
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 2, ty: RY, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "rune" } });   // 4 ⇒ T2
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.spoilsField();
    const enA = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const hzA = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    const vrA = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    const evA = window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score;
    const lootA = window.__dev.spoilsField().lootQualityFloor;
    const en = window.__dev.enrageSurge().enabled, hz = window.__dev.hazardSurge().enabled, vr = window.__dev.variantSurge().enabled, ev = window.__dev.zoneEvent().enabled;
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { base, score: vm.score, tier: vm.tier, salvage: vm.salvage, enB, enA, hzB, hzA, vrB, vrA, evB, evA, lootB, lootA, en, hz, vr, ev };
  });
  const diffOK = diff.score - diff.base === 4 && diff.tier === 2 && diff.salvage === 2 &&
    diff.enA === diff.enB && diff.hzA === diff.hzB && diff.vrA === diff.vrB && diff.evA === diff.evB &&
    diff.lootA === diff.lootB && diff.en === true && diff.hz === true && diff.vr === true && diff.ev === true;
  ok("9 DIFFERENTIATOR ⊥20: inject drops ⇒ spoils Δ+4→T2 WHILE enrage(#78)/hazard(#77)/variant(#76)/event(#75) IGNORE + lootQuality unchanged; all 4 neighbors enabled:true coexist",
     diffOK, JSON.stringify(diff));

  // 10 CHANNEL freshness: flip spoils OFF→ON at same drop state ⇒ 16 peer channels identical
  const chan = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 3, ty: h.ty, kind: "gear" } });
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.spoilsField({ enabled: false });
    const snap = () => { const s = window.__dev.spoilsField(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview }; };
    const off = snap();
    window.__dev.spoilsField({ enabled: true });
    const on = snap();
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { same: JSON.stringify(off) === JSON.stringify(on), off, on };
  });
  ok("10 CHANNEL freshness: flip spoils OFF→ON ⇒ 16 peer channels byte-identical (salvage feeds ONLY salvageFind, 0 cross-contam)",
     chan.same, JSON.stringify(chan.off));

  // 11 BYTE-NEUTRAL OFF seam: OFF with drop glued to hero ⇒ forage 0 + salvage 0
  const neutral = await page.evaluate(() => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    const h = window.__dev.spoilsField().hero;
    window.__dev.spoilsField({ spawnDrop: { tx: h.tx, ty: h.ty, kind: "gear" } });   // ON hero tile ⇒ would be T1
    window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.spoilsField({ enabled: false });   // now OFF
    const off = window.__dev.spoilsField();
    window.__dev.spoilsField({ enabled: true }); window.__dev.spoilsField({ clearDrops: true }); window.__dev.spoilsField({ enabled: false });
    return { forage: off.forageSalvagePreview, salvage: off.salvage, tier: off.tier, score: off.score };
  });
  ok("11 BYTE-NEUTRAL OFF seam: OFF with drop glued ⇒ forageSalvagePreview 0 + salvage 0 + tier 0 (killEnemy byte-id)",
     neutral.forage === 0 && neutral.salvage === 0 && neutral.tier === 0 && neutral.score === 0, JSON.stringify(neutral));

  // screenshot evidence (feature ON, dense field)
  await page.evaluate(() => { window.__dev.spoilsField({ enabled: true }); window.__dev.spoilsField({ clearDrops: true }); const h = window.__dev.spoilsField().hero; window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 3, ty: h.ty, kind: "gear" } }); window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 4, ty: h.ty, kind: "rune" } }); window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.spoilsField({ clearDrops: true }); window.__dev.spoilsField({ enabled: false }); });

  // 12 0-REGRESSION: 20 arc flags served true; spoils served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const sfsDark = flag("SPOILS_FIELD_SURGE") === "false";
  ok("12 0-REGRESSION: 20 arc flags #59-#78 served enabled:true; SPOILS_FIELD_SURGE served false (DARK #79)",
     arcAllOn && sfsDark && arc.length === 20, `spoilsField=${flag("SPOILS_FIELD_SURGE")} allOn=${arcAllOn} ${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 13 NORTH STAR 2-CLIENT convergence
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const DA = { tx: 70, ty: 45 }, DB = { tx: 72, ty: 45 }, HT = { tx: 74, ty: 45 };   // drops 2-4 tiles west of hero (in radius)
  const readVM = async (pg) => await pg.evaluate((DA, DB, HT) => {
    window.__dev.spoilsField({ enabled: true });
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ spawnDrop: { tx: DA.tx, ty: DA.ty, kind: "gear" } });   // 2
    window.__dev.spoilsField({ spawnDrop: { tx: DB.tx, ty: DB.ty, kind: "gold" } });   // 1
    window.__dev.spoilsField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.spoilsField();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.spoilsField({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, sv: p.salvage }; });
    const sp = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ enabled: false });
    return { score: vm.score, tier: vm.tier, salvage: vm.salvage, spScore: sp.score, spCount: sp.count, lut, fp };
  }, DA, DB, HT);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.salvage === B.salvage && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  // independent expectation: gear(2)+gold(1)=3 ⇒ T2 salvage 2
  const expScore = myWeight("gear") + myWeight("gold");
  const convExp = A.score === expScore && A.tier === myTier(expScore) && A.salvage === mySalvage(expScore);
  ok("13 NORTH STAR 2-CLIENT: same drops+hero ⇒ score/tier/salvage + spoilsProbe(score,count) + LUT + worldFingerprint byte-identical (0 desync); matches my re-derived score=3→T2/salvage2; fp id 15920977",
     conv && convExp, `A={score:${A.score},tier:${A.tier},sal:${A.salvage},spSc:${A.spScore},spCt:${A.spCount},fp:${A.fp.length}} B={score:${B.score},tier:${B.tier},sal:${B.salvage},spSc:${B.spScore},spCt:${B.spCount},fp:${B.fp.length}} fpMatch=${A.fp === B.fp} myExp={score:${expScore},tier:${myTier(expScore)},sal:${mySalvage(expScore)}}`);

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
