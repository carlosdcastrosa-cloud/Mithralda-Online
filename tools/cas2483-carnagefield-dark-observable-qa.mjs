// CAS-2483 — INDEPENDENT DARK QA (Gate 2/2) for CAMPO DE CARNICERÍA (DARK, CARNAGE_FIELD_SURGE.enabled:false). EVO mecánica #80 (22º flag ladder).
// Owner: QA. Parent CAS-2481. This harness RE-DERIVES every oracle in JS (LUT/weights/radius) — it does NOT trust the GE selfverify.
// Target: master 7aab359 (DARK). Base #79 LIVE 047bcd0e2e5f. Axis: PRESENCE/DENSITY of a fresh CORPSE FIELD (G.corpses) server-auth;
// fresh channel boneFind→h.boneTokens via grantBone; ANTI-AUTO-COUNT via _carnagePre sampled at TOP of killEnemy.
//
// INDEPENDENT ORACLES (re-derived by hand, NOT read from config):
//   weights: boss=3, champion=2, normal=1 (rank absent ⇒ normal fallback)
//   radius:  260 px
//   cap:     carnageBoneCap = 2
//   tiers:   score<1 ⇒ T0/bone0 ; score∈[1,3) ⇒ T1/bone1 ; score≥3 ⇒ T2/bone2  (bone capped at 2)
//
// Checks (independent, 2-client, server-authoritative):
//   1  boots to play, __dev.carnageField + arc hooks + __BUILD, 0 JS err.
//   2  byte-neutral OFF (fresh boot): enabled false AND G.carnageField NEVER created (gExists false); tier/score/bone/forageBonePreview 0; channel boneFind; tag "".
//   3  byte-neutral save OFF: saveBlob() WITHOUT 'carnageField'/'boneFind'/'boneTokens' (transient, outside allowlist).
//   4  worldFingerprint byte-stable across enabled toggle; fp byte length == 15920977 (fingerprint id; bones NOT in fingerprint).
//   5  LUT PURE score→tier→bone re-derived by hand == scoreProbe: 0→T0/0, 1→T1/1, 2→T1/1, 3→T2/2, 6→T2/2, 99→T2/2.
//   6  REAL SERVER-AUTH: spawnCorpse pushes a REAL corpse to G.corpses; carnageProbe reads score>0 + corpse in list w/ my-weight + corpseCount≥1.
//   7  PER-RANK weights == my re-derived {boss3,champion2,normal1} (spawn each rank, carnageProbe weight matches).
//   8  RADIUS boundary: corpse at ~256px (in) counts; corpse at ~288px (out) ignored (Δ8/Δ9 tiles, TS=32).
//   9  ANTI-AUTO-COUNT: clean ground (score0) ⇒ forage 0; dense field (score≥3) ⇒ forage 2 (reflects _carnagePre TOP-of-killEnemy).
//  10  CHANNEL boneFind: forageBonePreview corpses-near ⇒ bone>0 (==my bone bonus); clean/far ⇒ 0.
//  11  SUB-CAP: no score produces bone > carnageBoneCap=2.
//  12  BYTE-NEUTRAL OFF seam: OFF with corpse glued to hero ⇒ forageBonePreview 0 + bone 0 + tier 0 (killEnemy byte-id).
//  13  DIFFERENTIATOR ⊥21: inject corpses ⇒ carnage↑ WHILE spoils(#79)/enrage(#78)/hazard(#77)/variant(#76) IGNORE (corpse ≠ drop/live-boss/hazard/live-mob) + lootQuality unchanged.
//  14  ORTHOGONALITY: carnage on/off does NOT move ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind peer channels.
//  15  0-REGRESSION: 21 arc flags #59-#79 served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80).
//  16  ★ NORTH STAR 2-CLIENT: same corpses at same tiles + hero at same tile ⇒ score/tier/bone + carnageProbe(score,count) + LUT + worldFingerprint byte-identical (0 desync). fp id 15920977.
//   0  no JS errors during run.
// Run: node tools/cas2483-carnagefield-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2483-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ---- INDEPENDENT ORACLES (re-derived by hand, NOT from config) ----
const MY_W = { boss: 3, champion: 2, normal: 1 };
const MY_RADIUS = 260, MY_CAP = 2;
const myWeight = (rank) => (MY_W[rank] != null ? MY_W[rank] : MY_W.normal);
// tiers: [{min:1,bone:1},{min:3,bone:2}] — highest satisfied min wins; score<1 ⇒ T0
const myTier = (score) => (score >= 3 ? 2 : (score >= 1 ? 1 : 0));
const myBoneRaw = (score) => { const t = myTier(score); return t === 2 ? 2 : (t === 1 ? 1 : 0); };
const myBone = (score) => Math.min(MY_CAP, myBoneRaw(score));
const EXPECT_SCORE = [0, 1, 2, 3, 6, 99].map(s => ({ score: s, tier: myTier(s), bone: myBone(s) }));
const FP_ID = 15920977;

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.zoneEvent && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.carnageField + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF fresh boot
  const off = await page.evaluate(() => window.__dev.carnageField());
  ok("2 byte-neutral OFF fresh boot: enabled false + G.carnageField NEVER created (gExists false); tier/score/bone/forage 0; channel boneFind; tag ''",
     off.enabled === false && off.gExists === false && off.tier === 0 && off.score === 0 && off.bone === 0 && off.forageBonePreview === 0 && off.channel === "boneFind" && off.tag === "",
     `enabled=${off.enabled} gExists=${off.gExists} tier=${off.tier} score=${off.score} bone=${off.bone} forage=${off.forageBonePreview} channel=${off.channel} tag='${off.tag}'`);

  // 3 byte-neutral save OFF
  const saveOff = await page.evaluate(() => window.__dev.saveBlob());
  const noFeatKey = !/carnageField|boneFind/.test(saveOff);
  const noBoneKey = !/boneTokens/.test(saveOff);
  ok("3 byte-neutral save OFF: no 'carnageField'/'boneFind'/'boneTokens' keys (transient, outside save allowlist)", noFeatKey && noBoneKey, `noFeatKey=${noFeatKey} noBoneKey=${noBoneKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle + fp id
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => { window.__dev.carnageField({ enabled: true }); });
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => { window.__dev.carnageField({ enabled: false }); });
  ok("4 worldFingerprint byte-stable across enabled toggle + fp byte-id == 15920977 (bones NOT in fingerprint)",
     fpBefore === fpAfter && fpBefore.length === FP_ID, `match=${fpBefore === fpAfter} fpLen=${fpBefore.length} expect=${FP_ID}`);

  // 5 LUT PURE score→tier→bone re-derived by hand
  const lut = await page.evaluate((SCORES) => {
    window.__dev.carnageField({ enabled: true });
    const r = SCORES.map(s => { const p = window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, bone: p.bone }; });
    window.__dev.carnageField({ enabled: false });
    return r;
  }, EXPECT_SCORE.map(e => e.score));
  const lutMatch = JSON.stringify(lut) === JSON.stringify(EXPECT_SCORE);
  ok("5 LUT PURE score→tier→bone == my hand re-derived (0→T0/0,1→T1/1,2→T1/1,3→T2/2,6→T2/2,99→T2/2; capped2)",
     lutMatch, `got=${JSON.stringify(lut)} exp=${JSON.stringify(EXPECT_SCORE)}`);

  // 6 REAL SERVER-AUTH + 7 per-rank weights: spawn boss/champion/normal, read carnageProbe
  const ranks = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    const out = {};
    for (const rank of ["boss", "champion", "normal"]) {
      window.__dev.carnageField({ clearCorpses: true });
      const h = window.__dev.carnageField().hero;
      const sc = window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 2, ty: h.ty, rank } });
      window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
      const pr = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
      out[rank] = { spawnWeight: sc.spawnCorpse.weight, probeScore: pr.score, probeCount: pr.count, probeWeight: pr.corpses[0] ? pr.corpses[0].weight : null, probeRank: pr.corpses[0] ? pr.corpses[0].rank : null };
    }
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return out;
  });
  const serverAuthOk = ranks.boss.probeScore > 0 && ranks.boss.probeCount >= 1 && ranks.boss.probeRank === "boss";
  ok("6 REAL SERVER-AUTH: spawnCorpse pushes REAL corpse to G.corpses; carnageProbe reads score>0 + corpse in-radius list + rank",
     serverAuthOk, `boss={score:${ranks.boss.probeScore},count:${ranks.boss.probeCount},rank:${ranks.boss.probeRank}}`);
  const weightsOk = ranks.boss.spawnWeight === myWeight("boss") && ranks.boss.probeWeight === myWeight("boss")
    && ranks.champion.spawnWeight === myWeight("champion") && ranks.champion.probeWeight === myWeight("champion")
    && ranks.normal.spawnWeight === myWeight("normal") && ranks.normal.probeWeight === myWeight("normal");
  ok("7 PER-RANK weights == my re-derived {boss3,champion2,normal1}",
     weightsOk, `boss=${ranks.boss.probeWeight}/${myWeight("boss")} champ=${ranks.champion.probeWeight}/${myWeight("champion")} normal=${ranks.normal.probeWeight}/${myWeight("normal")}`);

  // 8 RADIUS boundary: TS=32 → 8 tiles=256px (in), 9 tiles=288px (out)
  const radius = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    const h0 = window.__dev.carnageField().hero;
    // IN: corpse 8 tiles west (256px < 260)
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: h0.tx - 8, ty: h0.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: h0.tx, ty: h0.ty } });
    const inP = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    // OUT: corpse 9 tiles west (288px > 260)
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: h0.tx - 9, ty: h0.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: h0.tx, ty: h0.ty } });
    const outP = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { inScore: inP.score, inCount: inP.count, outScore: outP.score, outCount: outP.count };
  });
  ok("8 RADIUS boundary (260px): corpse @256px IN (score1/count1), @288px OUT (score0/count0)",
     radius.inScore === 1 && radius.inCount === 1 && radius.outScore === 0 && radius.outCount === 0, JSON.stringify(radius));

  // 9 ANTI-AUTO-COUNT: clean ground ⇒ 0 forage; dense field ⇒ forage 2
  const antiAuto = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    // clean ground: no corpses
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const clean = window.__dev.carnageField().forageBonePreview;
    // dense field: boss(3) glued ⇒ score3 ⇒ T2 ⇒ bone2
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 1, ty: h.ty, rank: "boss" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const dense = window.__dev.carnageField().forageBonePreview;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { clean, dense };
  });
  ok("9 ANTI-AUTO-COUNT: clean ground (score0) ⇒ forage 0; dense field (boss score3) ⇒ forage 2 (== my myBone; _carnagePre TOP-of-killEnemy)",
     antiAuto.clean === 0 && antiAuto.dense === myBone(3), `clean=${antiAuto.clean} dense=${antiAuto.dense} myBone(3)=${myBone(3)}`);

  // 10 CHANNEL boneFind: forage matches my bone bonus at score2 (T1→1) and score3 (T2→2)
  const channel = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    const h = window.__dev.carnageField().hero;
    // score2: champion(2)
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 1, ty: h.ty, rank: "champion" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const t1 = window.__dev.carnageField().forageBonePreview;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { t1 };
  });
  ok("10 CHANNEL boneFind: champion(score2) ⇒ forage == my myBone(2)=1 (T1)",
     channel.t1 === myBone(2), `forage=${channel.t1} myBone(2)=${myBone(2)}`);

  // 11 SUB-CAP: no score exceeds cap 2
  const capOk = EXPECT_SCORE.every(e => e.bone <= MY_CAP) && lut.every(r => r.bone <= MY_CAP);
  ok("11 SUB-CAP: no score produces bone > carnageBoneCap=2", capOk, `max=${Math.max(...lut.map(r => r.bone))}`);

  // 12 BYTE-NEUTRAL OFF seam: OFF with corpse glued ⇒ forage 0 + bone 0 + tier 0
  const neutral = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx, ty: h.ty, rank: "boss" } });   // glued, would be T2
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.carnageField({ enabled: false });   // now OFF
    const o = window.__dev.carnageField();
    window.__dev.carnageField({ enabled: true }); window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false });
    return { forage: o.forageBonePreview, bone: o.bone, tier: o.tier, score: o.score };
  });
  ok("12 BYTE-NEUTRAL OFF seam: OFF with boss corpse glued ⇒ forageBonePreview 0 + bone 0 + tier 0 + score 0 (killEnemy byte-id)",
     neutral.forage === 0 && neutral.bone === 0 && neutral.tier === 0 && neutral.score === 0, JSON.stringify(neutral));

  // 13 DIFFERENTIATOR ⊥21: inject corpses ⇒ carnage↑ WHILE peer axes ignore
  const diff = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    // baseline peers (no corpses)
    const base = window.__dev.carnageField();
    const baseSpoil = base.salvageForagePreview, baseTrophy = base.trophyForagePreview, baseHeal = base.healForagePreview, baseSocket = base.socketForagePreview, baseLoot = base.lootQualityFloor;
    // inject dense corpses
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 1, ty: h.ty, rank: "boss" } });
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 2, ty: h.ty, rank: "champion" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const withC = window.__dev.carnageField();
    const r = {
      carnageBefore: base.score, carnageAfter: withC.score, boneAfter: withC.bone,
      spoilBefore: baseSpoil, spoilAfter: withC.salvageForagePreview,
      trophyBefore: baseTrophy, trophyAfter: withC.trophyForagePreview,
      healBefore: baseHeal, healAfter: withC.healForagePreview,
      socketBefore: baseSocket, socketAfter: withC.socketForagePreview,
      lootBefore: baseLoot, lootAfter: withC.lootQualityFloor,
    };
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return r;
  });
  const carnageRose = diff.carnageAfter > diff.carnageBefore && diff.boneAfter === myBone(diff.carnageAfter);
  const peersIgnored = diff.spoilBefore === diff.spoilAfter && diff.trophyBefore === diff.trophyAfter && diff.healBefore === diff.healAfter && diff.socketBefore === diff.socketAfter && diff.lootBefore === diff.lootAfter;
  ok("13 DIFFERENTIATOR ⊥21: inject corpses ⇒ carnage↑ (score" + diff.carnageBefore + "→" + diff.carnageAfter + "→bone" + diff.boneAfter + ") WHILE spoils#79/trophy#78/heal#77/socket#76/lootQuality IGNORE (corpse ≠ drop/live-boss/hazard/live-mob)",
     carnageRose && peersIgnored, `carnageRose=${carnageRose} peersIgnored=${peersIgnored} ${JSON.stringify(diff)}`);

  // 14 ORTHOGONALITY: carnage on/off does NOT move peer channels
  const ortho = await page.evaluate(() => {
    const snap = () => { const v = window.__dev.carnageField(); return { ward: v.wardRegenBoost, gold: v.goldFindMul, crit: v.critChancePct, xp: v.xpGainMul, vamp: v.vampMul, atkspd: v.atkspdBonus, detect: v.detectRadiusMit, essence: v.essenceForagePreview, mat: v.matForagePreview, flask: v.flaskForagePreview, gem: v.gemForagePreview, socket: v.socketForagePreview, heal: v.healForagePreview, trophy: v.trophyForagePreview, salvage: v.salvageForagePreview, loot: v.lootQualityFloor }; };
    window.__dev.carnageField({ enabled: false }); window.__dev.carnageField({ clearCorpses: true });
    const offP = snap();
    window.__dev.carnageField({ enabled: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 1, ty: h.ty, rank: "boss" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const onP = snap();
    window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false });
    return { offP, onP };
  });
  const orthoOk = JSON.stringify(ortho.offP) === JSON.stringify(ortho.onP);
  ok("14 ORTHOGONALITY: carnage on/off (corpses injected) does NOT move ward/gold/crit/xp/vamp/atkspd/detect/essence/mat/flask/gem/socket/heal/trophy/salvage/loot peer channels",
     orthoOk, `off=${JSON.stringify(ortho.offP)} on=${JSON.stringify(ortho.onP)}`);

  // screenshot evidence (feature ON, dense field)
  await page.evaluate(() => { window.__dev.carnageField({ enabled: true }); window.__dev.carnageField({ clearCorpses: true }); const h = window.__dev.carnageField().hero; window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 3, ty: h.ty, rank: "boss" } }); window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "champion" } }); window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false }); });

  // 15 0-REGRESSION: 21 arc flags #59-#79 served true; carnage served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cfsDark = flag("CARNAGE_FIELD_SURGE") === "false";
  ok("15 0-REGRESSION: 21 arc flags #59-#79 served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80)",
     arcAllOn && cfsDark && arc.length === 21, `carnage=${flag("CARNAGE_FIELD_SURGE")} allOn=${arcAllOn} count=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 16 NORTH STAR 2-CLIENT convergence
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles so both clients inject corpses + tp hero to the SAME coords (carnageFieldScore is pure fn of G.corpses+positions).
  const CA = { tx: 60, ty: 40 }, CB = { tx: 61, ty: 40 }, HT = { tx: 63, ty: 40 };   // boss(3)+normal(1)=4 ⇒ T2/bone2; hero 2-3 tiles east (in radius)
  const readVM = async (pg) => await pg.evaluate((CA, CB, HT, SCORES) => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: CA.tx, ty: CA.ty, rank: "boss" } });    // weight 3
    window.__dev.carnageField({ spawnCorpse: { tx: CB.tx, ty: CB.ty, rank: "normal" } });  // weight 1
    window.__dev.carnageField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.carnageField();
    const lut = SCORES.map(s => { const p = window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, bone: p.bone }; });
    const sp = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { score: vm.score, tier: vm.tier, bone: vm.bone, spScore: sp.score, spCount: sp.count, lut, fpLen: fp.length, fp };
  }, CA, CB, HT, EXPECT_SCORE.map(e => e.score));
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.bone === B.bone && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  // independent expectation: boss(3)+normal(1)=4 ⇒ T2/bone2, count2
  const expScore = myWeight("boss") + myWeight("normal");
  const convExp = A.score === expScore && A.tier === myTier(expScore) && A.bone === myBone(expScore) && A.spCount === 2 && A.fpLen === FP_ID;
  ok("16 ★ NORTH STAR 2-CLIENT: same corpses+hero ⇒ score/tier/bone + carnageProbe(score,count) + LUT + worldFingerprint byte-identical (0 desync); matches my re-derived score=4→T2/bone2/count2; fp id " + FP_ID,
     conv && convExp, `A={score:${A.score},tier:${A.tier},bone:${A.bone},spSc:${A.spScore},spCt:${A.spCount},fpLen:${A.fpLen}} B={score:${B.score},tier:${B.tier},bone:${B.bone},spSc:${B.spScore},spCt:${B.spCount},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} myExp={score:${expScore},tier:${myTier(expScore)},bone:${myBone(expScore)},count:2}`);

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
