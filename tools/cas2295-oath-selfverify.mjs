// CAS-2295 — GE self-verify for JURAMENTO DEL SANTUARIO / SANCTUARY OATH (DARK, SANCTUARY_OATH.enabled:false).
// Identidad LIGERA de ORDEN/gremio del arco Santuario: 3 Órdenes deterministas, cada una con UN pasivo FIJO que REUTILIZA un knob
// ya vivo (safeRegen / restedCap / recallCd), elegidas desde la UI YA existente del Tablón (escena `bounty`, 0 hotkey nuevo — chips
// tappables por el MISMO ui.bountyRects), gateadas por rango mínimo de SANCTUARY_REP, con cooldown determinista en kills para
// cambiar, y un TAG de orden sobre el nameplate reutilizando la ruta de TITLES/renombre.
//
// Observado vía __dev.oath (flip enabled IN-MEMORY + grantRep para el gate de rango + kill para el cooldown + pledge por el
// chokepoint real tryPledgeOath) + __dev.bounty/sanctuary/quartermaster/warhorn/emissary/recall/safeZone/tp/bountyTP/daynight/
// saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.oath + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: SANCTUARY_OATH.enabled===false AND order null AND hasField false AND tag null ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() has NO 'sanctuaryOath' key.
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift).
//   5  OFF byte-id: enabled false ⇒ pledge ⇒ 'off' AND hasField false (campo nunca creado).
//   6  OFF knob byte-id: oathMul* == 0 AND recallCdSec/restedCap == base (RECALL.cooldownSec / RESTED_XP.poolCap, 0-reward Intendente).
//   7  RANK GATE: rep neutral (idx0) ⇒ enabled ⇒ rankOk false ⇒ pledge ⇒ 'rank' (bloqueado, hasField sigue false).
//   8  PLEDGE tras rango: grantRep→recognized ⇒ rankOk true ⇒ pledge('dawn') ⇒ 'pledged', order 'dawn', tag 'Alba', effect{safeRegen,0.25}, hasField true.
//   9  PASSIVE aplicado: oathMulSafeRegen==0.25 tras jurar Alba (el knob reutilizado refleja la orden).
//  10  re-jurar la MISMA orden ⇒ 'same' (no-op, no consume cooldown).
//  11  SWITCH cooldown: cambiar sin kills ⇒ 'cooldown' (killsToSwitch>0, order sigue 'dawn').
//  12  SWITCH tras cooldown: kill≥switchCooldownKills ⇒ canSwitch ⇒ pledge('wander') ⇒ 'switched', recallCdSec==base*0.85, oathMulRecallCd==0.15.
//  13  SWITCH a 'iron': kill≥cd ⇒ 'switched', restedCap==poolCap*1.30, oathMulRestedCap==0.30 (3ª orden = 3er knob).
//  14  persist: saveBlob() con la feature ON tiene 'sanctuaryOath'==order + 'sanctuaryOathAt' número (afiliación sobrevive al reload).
//  15  render nameplate: el TAG de orden se DIBUJA con la feature ON + jurado (Δ px vs OFF-control, aislado del churn).
//  16  render orders-row: en la escena `bounty` (Tablón) la fila de Órdenes crece el panel + se dibuja con ON vs OFF (Δ px panel estático).
//  17  arco regr: con OATH ON, BOUNTY + SANCTUARY_REP + SANCTUARY_REWARDS + WORLD_EVENT + EMISSARY + RECALL siguen sanos.
//  18  desktop fps NO-REGRESIÓN con la feature ON vs OFF (relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2295-oath-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2295");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }

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
  await toHub(page);

  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots to play, __dev.oath + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.oath());
  ok("2 DARK default: enabled false AND order null AND hasField false AND tag null",
     dark.enabled === false && dark.order === null && dark.hasField === false && dark.tag === null,
     `enabled=${dark.enabled} order=${dark.order} hasField=${dark.hasField} tag=${dark.tag} minRank=${dark.minRank}`);

  // 3 save OFF has no key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'sanctuaryOath' key in save blob", !/"sanctuaryOath"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.oath({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.oath({ enabled: false }));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 OFF byte-id: pledge returns 'off', field never created
  const offAct = await page.evaluate(() => { window.__dev.oath({ enabled: false }); const r = window.__dev.oath({ pledge: "dawn" }); return { result: r.result, hasField: r.hasField, enabled: r.enabled }; });
  ok("5 OFF byte-id: enabled false ⇒ pledge ⇒ 'off' AND hasField false (campo nunca creado)",
     offAct.enabled === false && offAct.result === "off" && offAct.hasField === false, JSON.stringify(offAct));

  // 6 OFF knob byte-id: oathMul* == 0 and knobs == base (0-reward quartermaster ⇒ base = config)
  const knobBase = await page.evaluate(() => { const o = window.__dev.oath(); return { mR: o.oathMulRecallCd, mC: o.oathMulRestedCap, mS: o.oathMulSafeRegen, recallCdSec: o.recallCdSec, restedCap: o.restedCap }; });
  ok("6 OFF knob byte-id: oathMul*==0 AND recallCdSec/restedCap == base (sin contribución del Juramento)",
     knobBase.mR === 0 && knobBase.mC === 0 && knobBase.mS === 0, `oathMul={r:${knobBase.mR},c:${knobBase.mC},s:${knobBase.mS}} recallCdSec=${knobBase.recallCdSec} restedCap=${knobBase.restedCap}`);
  const BASE_RECALL = knobBase.recallCdSec, BASE_CAP = knobBase.restedCap;

  // 7 RANK GATE: neutral rep ⇒ enabled ⇒ pledge blocked 'rank'
  const gate = await page.evaluate(() => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });   // neutral (idx0) < recognized (idx1)
    window.__dev.oath({ enabled: true });
    const g0 = window.__dev.oath();
    const r = window.__dev.oath({ pledge: "dawn" });
    return { rankOk: g0.rankOk, result: r.result, hasField: r.hasField, order: r.order };
  });
  ok("7 RANK GATE: rep neutral ⇒ rankOk false ⇒ pledge ⇒ 'rank' (bloqueado, hasField false)",
     gate.rankOk === false && gate.result === "rank" && gate.hasField === false && gate.order === null, JSON.stringify(gate));

  // 8 PLEDGE after rank
  const pledge = await page.evaluate(() => {
    window.__dev.oath({ grantRep: 150 });   // → recognized (idx1) == minRank
    const rankOk = window.__dev.oath().rankOk;
    const r = window.__dev.oath({ pledge: "dawn" });
    return { rankOk, result: r.result, order: r.order, tag: r.tag, effect: r.effect, hasField: r.hasField };
  });
  ok("8 PLEDGE tras rango: rankOk true ⇒ pledge('dawn') ⇒ 'pledged', order 'dawn', tag 'Alba', effect{safeRegen,0.25}, hasField true",
     pledge.rankOk === true && pledge.result === "pledged" && pledge.order === "dawn" && pledge.tag === "Alba" &&
     pledge.effect && pledge.effect.kind === "safeRegen" && near(pledge.effect.value, 0.25) && pledge.hasField === true, JSON.stringify(pledge));

  // 9 passive applied to safeRegen knob
  const passive = await page.evaluate(() => window.__dev.oath().oathMulSafeRegen);
  ok("9 PASSIVE aplicado: oathMulSafeRegen==0.25 tras jurar Alba", near(passive, 0.25), `oathMulSafeRegen=${passive}`);

  // 10 re-pledge same ⇒ 'same'
  const same = await page.evaluate(() => { const r = window.__dev.oath({ pledge: "dawn" }); return { result: r.result, order: r.order }; });
  ok("10 re-jurar la MISMA orden ⇒ 'same' (no-op)", same.result === "same" && same.order === "dawn", JSON.stringify(same));

  // 11 switch cooldown blocks (no kills advanced)
  const cd = await page.evaluate(() => { const r = window.__dev.oath({ pledge: "wander" }); return { result: r.result, order: r.order, killsToSwitch: r.killsToSwitch, canSwitch: r.canSwitch }; });
  ok("11 SWITCH cooldown: cambiar sin kills ⇒ 'cooldown' (killsToSwitch>0, order sigue 'dawn')",
     cd.result === "cooldown" && cd.order === "dawn" && cd.killsToSwitch > 0 && cd.canSwitch === false, JSON.stringify(cd));

  // 12 switch after cooldown ⇒ wander, recallCd knob reflects -15%
  const sw = await page.evaluate((baseRecall) => {
    window.__dev.oath({ kill: { n: 20 } });   // avanza el contador monótono ≥ switchCooldownKills
    const canSwitch = window.__dev.oath().canSwitch;
    const r = window.__dev.oath({ pledge: "wander" });
    return { canSwitch, result: r.result, order: r.order, recallCdSec: r.recallCdSec, mR: r.oathMulRecallCd, expected: +(baseRecall * 0.85).toFixed(3) };
  }, BASE_RECALL);
  ok("12 SWITCH tras cooldown: kill≥cd ⇒ canSwitch ⇒ 'switched' a 'wander', recallCdSec==base*0.85, oathMulRecallCd==0.15",
     sw.canSwitch === true && sw.result === "switched" && sw.order === "wander" && near(sw.mR, 0.15) && near(sw.recallCdSec, sw.expected, 0.01),
     `result=${sw.result} recallCdSec=${sw.recallCdSec}(exp ${sw.expected}) mR=${sw.mR}`);

  // 13 switch to iron ⇒ restedCap +30%
  const iron = await page.evaluate((baseCap) => {
    window.__dev.oath({ kill: { n: 20 } });
    const r = window.__dev.oath({ pledge: "iron" });
    return { result: r.result, order: r.order, restedCap: r.restedCap, mC: r.oathMulRestedCap, expected: +(baseCap * 1.30).toFixed(2) };
  }, BASE_CAP);
  ok("13 SWITCH a 'iron': ⇒ 'switched', restedCap==base*1.30, oathMulRestedCap==0.30 (3er knob)",
     iron.result === "switched" && iron.order === "iron" && near(iron.mC, 0.30) && near(iron.restedCap, iron.expected, 0.05),
     `result=${iron.result} restedCap=${iron.restedCap}(exp ${iron.expected}) mC=${iron.mC}`);

  // 14 persist: save blob carries the oath (feature ON)
  const persist = await page.evaluate(() => { const blob = window.__dev.saveBlob(); return { hasKey: "sanctuaryOath" in blob, order: blob.sanctuaryOath, at: blob.sanctuaryOathAt }; });
  ok("14 persist: saveBlob ON tiene 'sanctuaryOath'==order + 'sanctuaryOathAt' número",
     persist.hasKey === true && persist.order === "iron" && typeof persist.at === "number", JSON.stringify(persist));

  // 15 render nameplate tag: ON (pledged) vs OFF-control, isolated from churn
  const tag = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.34), y0 = Math.floor(cv.height * 0.24), bw = Math.floor(cv.width * 0.32), bh = Math.floor(cv.height * 0.30);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    window.__dev.oath({ enabled: false });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();
    window.__dev.oath({ enabled: true });   // h.sanctuaryOath 'iron' persiste ⇒ tag ⟦Hierro⟧ aparece
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dOn > 45 && dBg <= 25) signal++;
    }
    if (window.__dev.daynight) window.__dev.daynight(null);
    return { signal };
  });
  ok("15 render nameplate: el TAG de orden se dibuja con la feature ON + jurado (signal aislado)", tag.signal > 8, `signal=${tag.signal}`);

  // 16 render orders-row in the bounty board scene: open board (advance dialogue intro → bounty), compare ON vs OFF panel
  const row = await page.evaluate(async () => {
    const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "e", bubbles: true }));
    window.__dev.oath({ enabled: false });
    window.__dev.bountyTP();
    await new Promise(r => setTimeout(r, 60));
    // el NPC del Tablón saluda en 'dialogue' y al AVANZAR (KeyE) transiciona a la escena 'bounty' (sim.js interact)
    let scene = "";
    for (let i = 0; i < 6 && (scene = window.__dev.scene()) !== "bounty"; i++) { press(); await new Promise(r => setTimeout(r, 90)); }
    scene = window.__dev.scene();
    if (scene !== "bounty") return { scene, signal: -1 };
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.18), y0 = Math.floor(cv.height * 0.10), bw = Math.floor(cv.width * 0.64), bh = Math.floor(cv.height * 0.80);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off = grab();
    window.__dev.oath({ enabled: true });   // panel crece +76 + fila de Órdenes
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 45) signal++;
    }
    press();   // cerrar el tablón
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 60));
    return { scene, signal, back: window.__dev.scene() };
  });
  ok("16 render orders-row: en la escena `bounty` la fila de Órdenes cambia el panel con ON vs OFF (panel estático)",
     row.signal > 300, `scene=${row.scene} signal=${row.signal} back=${row.back}`);

  // 17 arc regression — asegura escena 'play' (por si el tablón/diálogo quedó abierto), luego valida el stack de flags
  await page.evaluate(async () => {
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
  });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("17 arco regr: BOUNTY + SANCTUARY_REP + SANCTUARY_REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con OATH ON",
     arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 18 fps NO-REGRESSION
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.oath({ enabled: false }); const off = await measure();
    window.__dev.oath({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("18 fps NO-REGRESIÓN: OATH ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fps.on >= fps.off * 0.9, `on≈${Math.round(fps.on)} off≈${Math.round(fps.off)}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
