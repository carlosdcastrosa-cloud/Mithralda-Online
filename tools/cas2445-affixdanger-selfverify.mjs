// CAS-2445 — self-verify for PELIGRO POR AFIJO DE MOB (DARK, MOB_AFFIX_DANGER.enabled:false). EVO mecánica #74 (serializa tras #73 APEX_PROXIMITY LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 15 LIVE #59-#73.
// (A) EJE FRESCO = CALIDAD/PELIGRO DE AFIJO DE MOB (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = el subsistema MOB_AFFIX (CAS-247/1585/1590) asigna afijos DETERMINISTAS al spawn (maybeAffix/spawnChampion, off-srand); cada mob afijado lleva e.affix (primario) y los campeones e.affixes=[a,b] en G.enemies (estado de sim replicado). mobAffixes(e) = lista canónica.
//     affixDangerScore(hero)=Σ affixWeights[id] sobre mobAffixes(e) de los mobs VIVOS dentro de radius del héroe ∈ [0,∞). PURO, 0-RNG, 0-timer, STATELESS. Sin afijos cerca ⇒ 0 ⇒ Tier 0 ⇒ sin ventaja.
//     ⊥ #73 (apex = DISTANCIA a UN jefe/campeón — los boss NO llevan afijo, maybeAffix los excluye; esto = SUMA DE PESO DE AFIJOS de mobs en radio, con o sin apex), ⊥ #69 (LastStand cuenta enemigos ENGANCHADOS; esto = calidad de afijo con o sin engage), ⊥ #72 (escasez = AUSENCIA de mobs vs cap; esto = PRESENCIA de mobs de ALTA CALIDAD de afijo), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = flaskPotency (recompensa de cargas de Estus/FLASK por forrajeo amid-danger — NINGUNA de las 15 flags lo usa). La familia recompensa-de-forrajeo (goldFind #60/#62, lootQuality #63/#68, xpGain #65, essenceFind #72, matFind #73) está LLENA ⇒ pivota FUERA a Estus (recurso TRANSITORIO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio dangerFlaskCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/⊥ (check 7): el tier = función PURA de la SUMA DE PESO DE AFIJOS de mobs en radio. Un mob afijado NO-boss a ≤radio ⇒ T≥1 por CALIDAD DE AFIJO — mientras el apex(#73) lo IGNORA (no es boss/campeón ⇒ apex tier 0). La señal es de fuente distinta (peso de afijos, no distancia-a-jefe ni aggro-count ni cap-de-zona).
// ★ REAL SERVER-AUTH (check 6): spawnAffix inyecta un mob REAL (spawnEnemy + e.affix) en G.enemies; dangerProbe lee el score REAL + la lista de mobs afijados en radio (x,y,affixes,weight) + affixMobCount ⇒ estado server-auth auténtico.
// ★ CANAL (check 8): forageFlasksPreview = affixDangerFlaskBonus(score). Peligro cerca ⇒ flasks>0; sin afijos / lejos ⇒ 0.
// ★ SUB-CAP (check 9): flasks EFECTIVA = min(dangerFlaskCap=2, tier.flasks). Ningún score produce flasks>2.
// ★ BYTE-NEUTRAL OFF (check 10): con MOB_AFFIX_DANGER OFF, affixDangerFlaskBonus(cualquier score)==0 y forageFlasksPreview==0 aun con un mob afijado PEGADO al héroe ⇒ 0 flask al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): el peligro (score/tier/flasks) NO cambia ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind; activar APEX/SCARCITY (los primos recompensa-forrajeo) NO cambia la señal de afijo, y el peligro ON NO cambia sus readouts.
// ★ 0-REGRESIÓN (check 12): las 15 mecánicas del arco #59-#73 siguen served enabled:true; MOB_AFFIX_DANGER served false (DARK #74).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob afijado en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/flasks + dangerProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). affixDangerScore es función PURA de afijos+posiciones deterministas ⇒ shard-consistente.
//
// Observado vía __dev.affixDanger (flip enabled IN-MEMORY + tp teleport determinista + scoreProbe LUT puro + spawnAffix inyección REAL + dangerProbe lectura server-auth) + peer channels (ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity/apex) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Peligro:").
//
// Checks:
//   1  boots to play, __dev.affixDanger + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): MOB_AFFIX_DANGER.enabled false AND G.affixDanger NUNCA se crea (gExists false); tier 0, score 0, flasks 0, forageFlasksPreview 0, channel flaskPotency, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'affixDanger'/'dangerFlask' Y sin 'flaskCharges' (Estus transitorio, fuera del allowlist ⇒ 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de Estus NO entra al fingerprint).
//   5  TABLA de tiers = función PURA del SCORE (scoreProbe): 0→T0/0, 1/2→T1/1, 3/6→T2/2; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnAffix inyecta mob REAL afijado; dangerProbe lee score REAL>0 + afijo en la lista + affixMobCount≥1.
//   7  ★ DIFERENCIADOR/⊥: mob afijado NO-boss en radio ⇒ T≥1 por CALIDAD DE AFIJO mientras apex(#73) lo IGNORA (apex tier 0); apex/scarcity LIVE coexisten ⊥.
//   8  CANAL flaskPotency: forageFlasksPreview con peligro cerca ⇒ flasks>0 (== affixDangerFlaskBonus); sin afijos / lejos ⇒ 0.
//   9  ★ SUB-CAP: scoreProbe flasks nunca > dangerFlaskCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, affixDangerFlaskBonus(mob pegado)==0 y forageFlasksPreview==0 ⇒ 0 flask al seam (byte-id).
//  11  ★ ORTOGONALIDAD flaskPotency ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind: el peligro NO cambia peers; activar APEX/SCARCITY NO cambia la señal de afijo; peligro ON NO cambia sus readouts.
//  12  ★ 0-REGRESIÓN: 15 mecanismos del arco #59-#73 served enabled:true; MOB_AFFIX_DANGER served false (DARK #74).
//  13  render badge "Peligro:" se DIBUJA ON+peligro cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMO mob afijado en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/flasks + dangerProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2445-affixdanger-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2445");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,flasks}: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, f: 0 }, { score: 1, t: 1, f: 1 },
  { score: 2, t: 1, f: 1 }, { score: 3, t: 2, f: 2 },
  { score: 6, t: 2, f: 2 }, { score: 99, t: 2, f: 2 },
];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.affixDanger && window.__dev.apex && window.__dev.scarcity && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.affixDanger + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.affixDanger());
  ok("2 byte-id OFF (fresh boot): MOB_AFFIX_DANGER.enabled false AND G.affixDanger NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.flasks === 0 && dark.forageFlasksPreview === 0 && dark.channel === "flaskPotency" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} flasks=${dark.flasks} preview=${dark.forageFlasksPreview} channel=${dark.channel} tag="${dark.tag}" affixMobCount=${dark.affixMobCount}`);

  // 3 save OFF has no affixDanger/dangerFlask/flaskCharges key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(affixDanger|dangerFlask|mobAffixDanger)[A-Za-z]*"\s*:/.test(saveOff);
  const noFlaskKey = !/"flaskCharges"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'affixDanger'/'dangerFlask' NI 'flaskCharges' (Estus transitorio; estado 100% derivado)", noFeatKey && noFlaskKey, `noFeatKey=${noFeatKey} noFlaskKey=${noFlaskKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.affixDanger({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.affixDanger({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; el Estus NO entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.affixDanger({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].flasks === c.f);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, [1,2]→T1/1, ≥3→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnAffix injects a real affixed mob; dangerProbe reads real score + list + count
  const server6 = await page.evaluate(() => {
    window.__dev.affixDanger({ enabled: true });
    const h = window.__dev.affixDanger().hero;                            // hero's current tile
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 3, ty: h.ty, affix: "volatile" } });   // inject affixed mob 3 tiles east (~96px, in radius)
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });             // hero back to origin tile
    const dp = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe;
    const vm = window.__dev.affixDanger();
    window.__dev.affixDanger({ enabled: false });
    return { dp, affixMobCount: vm.affixMobCount, tier: vm.tier, score: vm.score };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnAffix inyecta mob REAL afijado; dangerProbe lee score REAL>0 + afijo en la lista + affixMobCount≥1",
     server6.dp && server6.dp.score > 0 && server6.dp.count >= 1 && server6.dp.mobs[0] && server6.dp.mobs[0].affixes.includes("volatile") && server6.affixMobCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFFERENTIATOR/⊥: affixed NON-boss mob ⇒ T≥1 by AFFIX QUALITY, while apex(#73) IGNORES it (not a boss ⇒ apex tier 0). APEX & SCARCITY LIVE coexist ⊥.
  const diff = await page.evaluate(() => {
    window.__dev.affixDanger({ enabled: true });
    const h = window.__dev.affixDanger().hero;
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 5, ty: h.ty, affix: "frost" } });       // affixed NON-boss ~160px (in radius) → T1 by AFFIX PRESENCE
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    const vm = window.__dev.affixDanger();
    const ap = window.__dev.apex ? window.__dev.apex() : null;             // apex reward-forage cousin LIVE — señal distinta (distancia a UN jefe; NO ve el trash afijado)
    const sc = window.__dev.scarcity ? window.__dev.scarcity() : null;     // scarcity reward-forage cousin LIVE
    window.__dev.affixDanger({ enabled: false });
    return { tier: vm.tier, score: vm.score, flasks: vm.flasks, apexTier: ap ? ap.tier : null, apEnabled: ap ? ap.enabled : null, scEnabled: sc ? sc.enabled : null };
  });
  const diffOK = diff.tier >= 1 && diff.score >= 1 && diff.flasks >= 1 && diff.apexTier === 0 && diff.apEnabled === true && diff.scEnabled === true;
  ok("7 ★ DIFERENCIADOR/⊥: mob afijado NO-boss ⇒ T≥1 por CALIDAD DE AFIJO mientras apex(#73) lo IGNORA (apex tier 0); APEX & SCARCITY LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL flaskPotency: forageFlasksPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.affixDanger({ enabled: true });
    const h = window.__dev.affixDanger().hero;
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "volatile" } });     // ~128px, in radius
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.affixDanger();
    const nearPrev = nearVm.forageFlasksPreview, nearFlasks = nearVm.flasks;
    window.__dev.affixDanger({ tp: { tx: h.tx + 30, ty: h.ty } });        // hero 30 tiles away (~960px > radius 260) → score 0
    const farVm = window.__dev.affixDanger();
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.affixDanger({ enabled: false });
    return { nearPrev, nearFlasks, farPrev: farVm.forageFlasksPreview, farTier: farVm.tier, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearFlasks && forage.farPrev === 0 && forage.farTier === 0 && forage.farScore === 0;
  ok("8 CANAL flaskPotency: forageFlasksPreview con peligro cerca ⇒ flasks>0 (==affixDangerFlaskBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: flasks never exceeds dangerFlaskCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.affixDanger({ scoreProbe: { score: s } }).scoreProbe.flasks);
    return { max: Math.max(...vals), cap: window.__dev.affixDanger().cap };
  });
  ok("9 ★ SUB-CAP: ningún score produce flasks>dangerFlaskCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ flasks 0 + forageFlasksPreview 0 even with affixed mob glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.affixDanger({ enabled: true });
    const h = window.__dev.affixDanger().hero;
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx, ty: h.ty, affix: "volatile" } });         // affixed mob ON TOP of hero tile ⇒ score>0 ⇒ would be T1
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.affixDanger({ enabled: false });                        // now OFF
    const off = window.__dev.affixDanger();
    return { preview: off.forageFlasksPreview, flasks: off.flasks, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.flasks === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, affixDangerFlaskBonus(mob pegado)==0 + forageFlasksPreview==0 ⇒ 0 flask al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY: flip affixDanger OFF→ON at the SAME state ⇒ los 10 canales peer IDÉNTICOS; y toggling APEX/SCARCITY no cambia la señal de afijo.
  const orth = await page.evaluate(() => {
    window.__dev.affixDanger({ enabled: true });
    const h = window.__dev.affixDanger().hero;
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "volatile" } });
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.affixDanger({ enabled: false });
    const snap = () => { const s = window.__dev.affixDanger(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview }; };
    const peersOff = snap();                                             // AFFIX OFF (misma posición del héroe)
    window.__dev.affixDanger({ enabled: true });
    const peersOn = snap();                                              // AFFIX ON — los peers NO deben cambiar
    // enabling APEX / SCARCITY (reward-forage cousins) must NOT change the affix signal
    const beforeArc = window.__dev.affixDanger();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.affixDanger();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });          // restaura estado LIVE
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.affixDanger({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.flasks === afterArc.flasks;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD flaskPotency ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind: flip afijo OFF→ON NO cambia ningún peer; toggling APEX/SCARCITY NO cambia la señal de afijo; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 15 arc flags served true; MOB_AFFIX_DANGER served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const adDark = flag("MOB_AFFIX_DANGER") === "false";
  ok("12 ★ 0-REGRESIÓN: 15 mecanismos del arco #59-#73 served enabled:true; MOB_AFFIX_DANGER served false (DARK #74)",
     arcAllOn && adDark && arc.length === 15, `affixDanger=${flag("MOB_AFFIX_DANGER")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Peligro:" drawn ON+danger near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Peligro:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.affixDanger({ enabled: true });
    const h = window.__dev.affixDanger().hero;
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "volatile" } });
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.affixDanger({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Peligro:\" se DIBUJA ON+peligro cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.affixDanger({ enabled: true }); const h = window.__dev.affixDanger().hero; window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "volatile" } }); window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.affixDanger({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence: SAME affixed mob at SAME tile + hero at SAME tile ⇒ score/tier/flasks + dangerProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // A FIXED absolute tile so both clients teleport hero + affixed mob to the SAME coordinates (affixDangerScore es fn pura de afijos+posiciones). Lejos del cluster de inyecciones previas de A.
  const AFFIX_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };   // affixed mob 4 tiles east of hero (~128px, in radius 260)
  const readVM = async (pg) => await pg.evaluate((AT, HT) => {
    window.__dev.affixDanger({ enabled: true });
    window.__dev.affixDanger({ spawnAffix: { tx: AT.tx, ty: AT.ty, affix: "volatile" } });
    window.__dev.affixDanger({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.affixDanger();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.affixDanger({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, flasks: p.flasks }; });   // LUT PURA
    const dp = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.affixDanger({ enabled: false });
    return { score: vm.score, tier: vm.tier, flasks: vm.flasks, affixMobCount: vm.affixMobCount, dpScore: dp.score, dpCount: dp.count, lut, fp };
  }, AFFIX_TILE, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // affixMobCount NO se compara: es el nº AMBIENTAL de mobs afijados vivos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en los 13 checks previos (B es fresco). El SIGNAL determinista per-snapshot — score/tier/flasks + dangerProbe(score,count) + LUT PURA + worldFingerprint — es lo shard-consistente (mismo patrón que #72/#73).
  const conv = A.score === B.score && A.tier === B.tier && A.flasks === B.flasks && A.dpScore === B.dpScore && A.dpCount === B.dpCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO mob afijado+héroe ⇒ score/tier/flasks + dangerProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; affixMobCount ambiental excluido — contaminado por inyecciones de prueba de A)",
     conv, `A={score:${A.score},tier:${A.tier},flasks:${A.flasks},count:${A.affixMobCount},dpScore:${A.dpScore},dpCount:${A.dpCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},flasks:${B.flasks},count:${B.affixMobCount},dpScore:${B.dpScore},dpCount:${B.dpCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.affixDanger({ enabled: false }));
  await pageB.evaluate(() => window.__dev.affixDanger({ enabled: false }));

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
