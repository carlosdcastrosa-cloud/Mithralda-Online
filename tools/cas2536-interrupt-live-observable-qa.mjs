// CAS-2536 — POST-FLIP QA (observable LIVE) para REMATE DE INTERRUPCIÓN (INTERRUPT_SURGE, EVO#89, flag ON) @ served 0c9fc1ae88a7 / master 17306d5.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO (porté el DARK cas2533 → LIVE; NO reusa el harness GE cas2532).
// NO es byte-verify (ya hecho por CEO 2ª byte-verify) — es verificación del EFECTO REAL con el flag ENCENDIDO en producción, 2 clientes 0-desync.
// El served (gh-pages 0c9fc1ae88a7) == master HEAD 17306d5 (CEO byte-verificó blobs == HEAD) ⇒ sirvo el árbol local = el sitio servido.
//
// EJE LIVE: interruptWeight(e)=ESTADO-DE-ACCIÓN-EN-PROGRESO del mob al remate. shield/special/cast⇒2, windup/strike normal⇒1, ocioso/stun-frozen⇒0.
//   Canal FRESCO interruptFind→h.interruptBounty (transitorio, fuera del save+fingerprint), sub-cap interruptBountyCap=2, badge ⊘.
//   El seam de killEnemy banca interruptForage(hero,tpl,_interruptPre) donde _interruptPre=interruptWeight(VÍCTIMA) muestreado en el TOP.
//   forageChargePreview = interruptForage(h,{xp:100}) = la MISMA fn PURA que el seam invoca (con score EN VIVO) ⇒ prueba observable del grant.
//
// Cobertura (issue CAS-2536):
//  L1 boot LIVE + build==version.json==0c9fc1ae88a7 (AVANZÓ de #88 9e9beb7f0958) + hooks (interrupt/affixSpawnKill/controlHarvest/saveBlob/worldFingerprint) + 0 err/404
//  L2 flag ON en prod: served config INTERRUPT_SURGE.enabled:true + channel interruptFind + params (radius300/weights heavy2 light1/cap2/tiers)
//  L3 LIVE default: __dev.interrupt().enabled===TRUE + gExists false (STATELESS) + knobs servidos == oráculos re-derivados
//  L4 REAL server-auth: spawnAct→actProbe estado real ⇒ MI oráculo(estado)==peso (heavy/shield/cast⇒2, light⇒1, stun/idle⇒0)
//  L5 forageChargePreview (seam fn interruptForage): mid-heavy⇒2, mid-light⇒1, idle⇒0, stun-frozen⇒0 (lo que el seam banca AHORA)
//  L6 LUT scoreProbe pura == oráculo (score→tier→charge), sub-cap≤2
//  L6b REAL-KILL anti-auto-conteo: affixSpawnKill (mob FRESCO ocioso) ⇒ h.interruptBounty Δ0 AUN con mid-heavy en radio (el grant es sobre la ACCIÓN de la VÍCTIMA, no proximidad)
//  L7 ACTION-crux ⊥ CC#85 observable: mid-windup NO-CC ⇒ int≥1/control0 · MISMO mob stun-frozen ⇒ int0/control2 (DISJUNTOS)
//  L8 Diferenciador ⊥ peers: mob mid-heavy sano suelto sin-CC ⇒ interrupt T2 mientras skirmish#84/pack#87/blood#86/control#85 = 0
//  L9 STATELESS: save SIN interruptFind/interruptBounty + worldFingerprint toggle-neutral (tokens fuera del fp aun con flag ON)
//  L10 0-regresión LIVE: 31 flags served enabled:true (30 previas #59-#88 + INTERRUPT_SURGE)
//  L11 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + actProbe + LUT + worldFingerprint), fp esperado 15920977
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2536-interrupt-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const EXPECT_BUILD = "0c9fc1ae88a7";     // served #89 (avanzó de #88 9e9beb7f0958)
const PREV_LIVE = "9e9beb7f0958";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2536-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ===== ORÁCULOS RE-DERIVADOS DESDE CERO (JS puro, indep del código del juego) =====
const W = { heavy: 2, light: 1 };
const TIERS = [{ min: 1, charge: 1 }, { min: 2, charge: 2 }];
const CAP = 2;
function oracleWeight(state, specialNow, castNow, stun) {
  if ((+stun || 0) > 0) return 0;
  if (state === "shield") return W.heavy;
  if (state === "windup" || state === "strike") return (specialNow || castNow) ? W.heavy : W.light;
  return 0;
}
function oracleTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
function oracleCharge(score) { const t = oracleTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge) | 0; }
function oracleControl(stun, slowT) { if ((+stun || 0) > 0) return 2; if ((+slowT || 0) > 0) return 1; return 0; }
// mapa kind→estado esperado (según spawnAct del hook)
const KIND_W = { heavy: 2, shield: 2, cast: 2, light: 1, stun: 0, idle: 0 };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALive";
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
const errors = [], reqErr = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => reqErr.push(r.url()));
  page.on("response", (r) => { if (r.status() >= 400) reqErr.push(r.status() + " " + r.url()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // ---- L1 boot LIVE + build + hooks ----
  const build = await page.evaluate(() => window.__BUILD || null);
  const verJson = await (await fetch(base + "/version.json")).json().catch(() => ({}));
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.interrupt && window.__dev.affixSpawnKill &&
    window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.packHarvest && window.__dev.bloodHarvest &&
    window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks interrupt/affixSpawnKill/peers/save/fp; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L2 flag ON en prod (served config) ----
  const cfgSrc = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const intBlock = cfgSrc.match(/export const INTERRUPT_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const bt = intBlock ? intBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(bt);
  const chOk = /channel:\s*"interruptFind"/.test(bt);
  const paramsOk = /radius:\s*300/.test(bt) && /heavy:\s*2/.test(bt) && /light:\s*1/.test(bt) && /interruptBountyCap:\s*2/.test(bt);
  ok("L2 flag ON en prod: served config INTERRUPT_SURGE.enabled:true + channel interruptFind + params (radius300/heavy2/light1/cap2)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk}`);

  // ---- L3 LIVE default: VM enabled TRUE + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.interrupt());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "interruptFind" &&
    d0.weights.heavy === W.heavy && d0.weights.light === W.light && d0.cap === CAP && d0.radius === 300 &&
    JSON.stringify(d0.tiers) === JSON.stringify(TIERS);
  ok("L3 LIVE default: __dev.interrupt().enabled===TRUE (flip aplicado) + gExists false (STATELESS, G.interruptBounty null) + knobs servidos == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} weights=${JSON.stringify(d0.weights)} cap=${d0.cap} radius=${d0.radius} tiers=${JSON.stringify(d0.tiers)}`);

  // ---- L4 REAL server-auth: spawnAct→actProbe estado real ⇒ MI oráculo == peso ----
  const KINDS = ["heavy", "shield", "cast", "light", "stun", "idle"];
  const sa = await page.evaluate((kinds) => {
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    const out = {};
    for (const kind of kinds) {
      window.__dev.interrupt({ clearAct: true });
      const spawn = window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind } }).spawnAct;
      const ap = window.__dev.interrupt({ actProbe: true }).actProbe;
      out[kind] = { spawn, m: ap.mobs[0] || null, apScore: ap.score };
    }
    window.__dev.interrupt({ clearAct: true });
    return out;
  }, KINDS);
  let saOk = true, saDetail = [];
  for (const kind of KINDS) {
    const r = sa[kind]; if (!r.m) { saOk = false; saDetail.push(`${kind}:noMob`); continue; }
    const myW = oracleWeight(r.m.state, r.m.specialNow, r.m.castNow, r.m.stun);
    if (myW !== r.spawn.weight || myW !== r.m.weight || myW !== KIND_W[kind] || r.apScore !== myW) {
      saOk = false; saDetail.push(`${kind}:st=${r.m.state}/sp=${r.m.specialNow}/ca=${r.m.castNow}/stun=${r.m.stun} myW=${myW} spawnW=${r.spawn.weight} apW=${r.m.weight} exp=${KIND_W[kind]}`);
    }
  }
  ok("L4 REAL server-auth spawnAct→actProbe: MI oráculo(estado)==peso servido (heavy/shield/cast⇒2, light⇒1, stun/idle⇒0; leído de los MISMOS campos que updateEnemies escribe)",
    saOk, saDetail.length ? saDetail.join("; ") : `OK ${KINDS.map(k => k + "=" + sa[k].m.weight).join(",")}`);

  // ---- L5 forageChargePreview (seam fn) = lo que el seam banca AHORA: mid-heavy⇒2, mid-light⇒1, idle⇒0, stun⇒0 ----
  const fcp = await page.evaluate(() => {
    const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    const read = (kind) => { window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind } }); return window.__dev.interrupt().forageChargePreview; };
    const heavy = read("heavy"), light = read("light"), idle = read("idle"), stun = read("stun");
    window.__dev.interrupt({ clearAct: true });
    return { heavy, light, idle, stun };
  });
  ok("L5 forageChargePreview (== fn PURA interruptForage que el seam invoca en killEnemy): mid-heavy⇒2, mid-light⇒1, idle⇒0, stun-frozen⇒0 (grant observable)",
    fcp.heavy === 2 && fcp.light === 1 && fcp.idle === 0 && fcp.stun === 0, JSON.stringify(fcp));

  // ---- L6 LUT scoreProbe pura == oráculo, sub-cap ≤2 ----
  const sweep = await page.evaluate(() => [0, 1, 2, 3, 9, 99].map(s => window.__dev.interrupt({ scoreProbe: { score: s } }).scoreProbe));
  let lutOk = true, lutDetail = [];
  for (const r of sweep) { const t = oracleTier(r.score), c = oracleCharge(r.score);
    if (r.tier !== t || r.charge !== c || r.charge > 2) { lutOk = false; lutDetail.push(`s${r.score}:hook(t${r.tier}/c${r.charge})!=oracle(t${t}/c${c})`); } }
  ok("L6 LUT scoreProbe pura score→tier→charge == oráculo re-derivado, sub-cap≤2", lutOk, lutDetail.length ? lutDetail.join("; ") : JSON.stringify(sweep.map(r => [r.score, r.tier, r.charge])));

  // ---- L6b REAL-KILL anti-auto-conteo: affixSpawnKill (mob FRESCO ocioso) ⇒ interruptBounty Δ0 AUN con mid-heavy en radio ----
  const realKill = await page.evaluate(() => {
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    // inyecto un mid-heavy en radio (forageChargePreview⇒2) para probar que el grant NO es por proximidad
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } });
    const previewBefore = window.__dev.interrupt().forageChargePreview;   // 2 (best available)
    const b0 = window.__dev.interrupt().hero.interruptBounty;
    window.__dev.affixSpawnKill("vampiric", "skeleton", "field");         // mata un mob FRESCO ocioso en h.x,h.y (interruptWeight=0)
    const b1 = window.__dev.interrupt().hero.interruptBounty;
    window.__dev.interrupt({ clearAct: true });
    return { previewBefore, b0, b1, delta: (b1 | 0) - (b0 | 0) };
  });
  ok("L6b REAL-KILL anti-auto-conteo: affixSpawnKill de mob FRESCO ocioso ⇒ h.interruptBounty Δ0 AUN con mid-heavy en radio (preview=2) — el grant es sobre la ACCIÓN de la VÍCTIMA, no proximidad (⊥ auto-conteo)",
    realKill.previewBefore === 2 && realKill.delta === 0, JSON.stringify(realKill));

  // ---- L7 ACTION-crux ⊥ CC#85 observable ----
  const crux = await page.evaluate(() => {
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; const RX = h.tx - 70, RY = h.ty; window.__dev.interrupt({ tp: { tx: RX, ty: RY } });
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "light" } });
    const aInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const aCtl = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "stun" } });
    const bInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const bCtl = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    return { aInt, aCtl, bInt, bCtl };
  });
  ok("L7 ★ ACTION-crux ⊥ CC#85 observable (COMPLEMENTO EXACTO): mid-windup NO-CC ⇒ int1/control0 · MISMO mob stun-frozen ⇒ int0/control2 (== oráculos, DISJUNTOS)",
    crux.aInt === oracleWeight("windup", 0, 0, 0) && crux.aCtl === oracleControl(0, 0) && crux.bInt === oracleWeight("windup", 0, 0, 999) && crux.bCtl === oracleControl(999, 0) &&
    crux.aInt === 1 && crux.aCtl === 0 && crux.bInt === 0 && crux.bCtl === 2, JSON.stringify(crux));

  // ---- L8 Diferenciador ⊥ peers ----
  const diff = await page.evaluate(() => {
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; const RX = h.tx - 90, RY = h.ty; window.__dev.interrupt({ tp: { tx: RX, ty: RY } });
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "heavy" } });
    const vm = window.__dev.interrupt();
    const ski = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pak = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const blo = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctr = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, ski, pak, blo, ctr };
  });
  ok("L8 Diferenciador ⊥ peers: mob mid-HEAVY sano suelto sin-CC ⇒ interrupt score2/T2/charge2 MIENTRAS skirmish#84/pack#87/blood#86/control#85 = 0",
    diff.score === 2 && diff.tier === 2 && diff.charge === 2 && diff.ski === 0 && diff.pak === 0 && diff.blo === 0 && diff.ctr === 0, JSON.stringify(diff));

  // ---- L9 STATELESS: save sin claves + fp toggle-neutral (flag ON) ----
  const sl = await page.evaluate(() => {
    const s = JSON.stringify(window.__dev.saveBlob());
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.interrupt({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.interrupt({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    return { clean: !/interruptFind|interruptBounty/.test(s), fpNeutral: fpOn === fpOff && fpOff === fpOn2 };
  });
  ok("L9 STATELESS: save SIN interruptFind/interruptBounty + worldFingerprint toggle-neutral ON/OFF/ON (tokens fuera del fp aun con flag LIVE)",
    sl.clean && sl.fpNeutral, JSON.stringify(sl));

  // ---- L10 0-regresión LIVE: 31 flags served enabled:true ----
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE","LONGSHOT_SURGE","INTERRUPT_SURGE"];
  const off = ARC.filter(n => flag(n) !== "true");
  ok("L10 0-regresión LIVE: 31 flags served enabled:true (30 previas #59-#88 + INTERRUPT_SURGE #89)",
    off.length === 0 && ARC.length === 31, `n=${ARC.length} off=${JSON.stringify(off)} INTERRUPT=${flag("INTERRUPT_SURGE")}`);

  // shot evidencia (mid-heavy, badge ⊘ ON)
  await page.evaluate(() => { window.__dev.interrupt({ clearAct: true }); const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.interrupt({ clearAct: true }); });

  // ---- L11 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const measure = async (pg) => await pg.evaluate(() => {
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    const M = window.__dev.interrupt().hero;
    const spawn = window.__dev.interrupt({ spawnAct: { tx: M.tx + 3, ty: M.ty, kind: "heavy" } }).spawnAct;
    const ap = window.__dev.interrupt({ actProbe: true }).actProbe;
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.interrupt({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const s = window.__dev.interrupt();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.interrupt({ clearAct: true });
    return { score: s.score, tier: s.tier, charge: s.charge, apScore: ap.score, apCount: ap.count,
      apW: ap.mobs[0] ? ap.mobs[0].weight : -1, apState: ap.mobs[0] ? ap.mobs[0].state : "", spawnW: spawn.weight,
      lut: JSON.stringify(lut), fp, fpLen: fp.length };
  });
  const A = await measure(page);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("B:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  const B = await measure(page2);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.apScore === B.apScore &&
    A.apCount === B.apCount && A.apW === B.apW && A.apState === B.apState && A.spawnW === B.spawnW &&
    A.lut === B.lut && A.fp === B.fp;
  ok("L11 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: A==B (score/tier/charge + actProbe + LUT + worldFingerprint byte-idénticos), mid-heavy⇒score2/T2/charge2",
    conv && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},apW:${A.apW},apState:${A.apState},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},apW:${B.apW},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp}`);
  ok(`L11b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP, `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} expected=${EXPECT_FP}`);

  ok("L0 no JS errors / 0 req-fail durante el run", errors.length === 0 && reqErr.length === 0, `err=${errors.length} reqErr=${reqErr.length}${errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""}`);

  console.log(`\nfp observado=${A.fpLen} (esperado ${EXPECT_FP}) · 2-cli fpMatch=${A.fp === B.fp} · served build=${build} · flag ON=${d0.enabled}`);
} catch (e) {
  FAIL++;
  console.log("FAIL  harness exception  — " + String(e && e.stack || e));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "HAS FAIL"}  ${PASS}/${PASS + FAIL}`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
