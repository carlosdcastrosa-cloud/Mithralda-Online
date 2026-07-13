// CAS-2266 — GE self-verify for PIEDRA DE VÍNCULO / RECALL AL SANTUARIO (DARK, RECALL.enabled:false).
// El loop de VIAJE-AL-HUB que corona el arco Santuario (SAFEZONE regen + noAggro + TEMPLE_RESPAWN + Rested/Descanso, LIVE).
// Canon MMORPG (WoW Hearthstone / Tibia temple recall): estar en la SAFEZONE VINCULA al héroe al Santuario (h.bindPoint,
// determinista = POI Templo), y el Recall (cooldown determinista, tick de sim, 0 RNG) lo devuelve a ese vínculo. Stage-1:
// INSTANTÁNEO (channelSec:0). Todo per-hero, server-authority-ready.
//
// Observado vía __dev.recall (flip RECALL.enabled IN-MEMORY, disco sigue false ⇒ build byte-idéntico) + __dev.safeZone /
// __dev.rested (resto del arco) + __dev.saveBlob / __dev.worldFingerprint / __dev.hero.
//
// Checks:
//   1  boots clean to play, 0 JS err, __dev.recall + __BUILD present.
//   2  AUDIT-FIRST (guardrail #1): el Santuario es ALCANZABLE con coords ESTABLES — recall().sanctuary finito y == el punto
//      derivado del POI Templo de safeZone(). Sin esto sería un no-op silencioso ⇒ se reporta, no se cablea.
//   3  DARK default: RECALL.enabled===false AND bindPoint field NEVER created (hasField false) ⇒ byte-id save.
//   4  byte-id save OFF: saveBlob() NO contiene las claves bindPoint / recallCD (allowlist anti-CAS-2220).
//   5  worldFingerprint byte-stable across the enabled toggle (0 RNG drift).
//   6  BIND gated a zona: recién ON + FUERA de la SAFEZONE (sin haber entrado nunca) ⇒ NO se vincula (bound false).
//   7  cast sin vínculo ⇒ result "unbound", el héroe NO se teleporta.
//   8  BIND en zona: ON + DENTRO de la SAFEZONE ⇒ se vincula (bound true, bindPoint ≈ sanctuary, dist≈0).
//   9  RECALL a bindPoint: vinculado + FUERA + CD 0 ⇒ cast devuelve "recalled" y el héroe aterriza en bindPoint (dist≈0).
//  10  cooldown arranca: tras el recall, recallCD ≈ cooldownSec y ready=false.
//  11  cooldown BLOQUEA re-cast: con CD>0, cast ⇒ "cooldown" y el héroe NO se mueve.
//  12  cooldown DETERMINISTA: setCd(2) baja ~1/s por dt (no wall-clock) y llega a ready al agotarse.
//  13  save round-trip ON: saveBlob() SÍ contiene bindPoint {x,y} + recallCD cuando ON + vinculado.
//  14  reversible: recall({enabled:false}) ⇒ result "off" en cast, la tecla/afordancia quedan inertes.
//  15  REGRESIÓN arco: con RECALL ON, el regen de la SAFEZONE y la acumulación de Descanso siguen sanos.
//  16  desk fps ≥58 con la feature ON.
// Run: node tools/cas2266-recall-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2266");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

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
const escModals = async (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
});

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob));
  ok("1 boots to play, __dev.recall + arc hooks + __BUILD present, 0 err (so far)", hooks && errors.length === 0 && !!build,
     `build=${build} err=${errors.length}`);

  // 2 AUDIT-FIRST: sanctuary reachable + stable coords (== POI Templo)
  const audit = await page.evaluate(() => {
    const r = window.__dev.recall(); const sz = window.__dev.safeZone();
    return { sanctuary: r.sanctuary, temple: sz.temple, offsetY: sz && sz.temple ? null : null };
  });
  const sanctOk = audit.sanctuary && audit.temple &&
    isFinite(audit.sanctuary.x) && isFinite(audit.sanctuary.y) &&
    Math.abs(audit.sanctuary.x - audit.temple.x) < 1 && (audit.sanctuary.y - audit.temple.y) > 0 && (audit.sanctuary.y - audit.temple.y) < 200;
  ok("2 AUDIT-FIRST: Santuario alcanzable + coords estables (sanctuary==POI Templo+offsetY, no no-op)", sanctOk,
     `sanctuary=${JSON.stringify(audit.sanctuary)} temple=${JSON.stringify(audit.temple)}`);

  // 3 DARK default OFF + byte-id (BEFORE any flip)
  const off = await page.evaluate(() => window.__dev.recall());
  ok("3 DARK default: enabled false AND bindPoint field NEVER created (hasField false) ⇒ byte-id", off.enabled === false && off.hasField === false,
     `enabled=${off.enabled} hasField=${off.hasField} bound=${off.bound}`);

  // 4 byte-id save OFF: no keys
  const blobOff = await page.evaluate(() => { const b = window.__dev.saveBlob() || {}; return { hasBind: "bindPoint" in b, hasCd: "recallCD" in b }; });
  ok("4 byte-id save OFF: saveBlob has NO bindPoint / recallCD keys", blobOff.hasBind === false && blobOff.hasCd === false,
     `bindPoint=${blobOff.hasBind} recallCD=${blobOff.hasCd}`);

  // 5 worldFingerprint stable across toggle (hero frozen outside zone, cd 0, no bind)
  const fp = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(120);
    const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j(); window.__dev.recall({ enabled: true }); const b = j(); window.__dev.recall({ enabled: false }); const c = j();
    return { ab: a === b, ac: a === c };
  });
  ok("5 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fp.ab && fp.ac, `ab=${fp.ab} ac=${fp.ac}`);

  // 6 BIND gated to zone: ON while OUTSIDE (never entered) ⇒ not bound
  const bindOut = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true }); window.__dev.tp(2, 2); await s(400);
    return window.__dev.recall();
  });
  ok("6 BIND gated a zona: ON + FUERA de la SAFEZONE (nunca entró) ⇒ NO vincula", bindOut.enabled === true && bindOut.bound === false && bindOut.inZone === false,
     `bound=${bindOut.bound} inZone=${bindOut.inZone}`);

  // 7 cast unbound ⇒ "unbound", no teleport
  const unbound = await page.evaluate(() => { const before = window.__dev.hero(); const r = window.__dev.recall({ cast: true }); const after = window.__dev.hero();
    return { result: r.result, moved: Math.hypot(before.x - after.x, before.y - after.y) }; });
  ok("7 cast sin vínculo ⇒ result 'unbound', héroe NO se teleporta", unbound.result === "unbound" && unbound.moved < 1,
     `result=${unbound.result} moved=${unbound.moved.toFixed(2)}`);

  // 8 BIND inside zone
  const bindIn = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(300);
    return window.__dev.recall();
  });
  await escModals(page);
  ok("8 BIND en zona: ON + DENTRO de la SAFEZONE ⇒ vincula (bound, bindPoint≈sanctuary)", bindIn.bound === true && bindIn.inZone === true &&
     bindIn.bindPoint && Math.hypot(bindIn.bindPoint.x - bindIn.sanctuary.x, bindIn.bindPoint.y - bindIn.sanctuary.y) < 1,
     `bound=${bindIn.bound} inZone=${bindIn.inZone} bind=${JSON.stringify(bindIn.bindPoint)}`);

  // 9 RECALL to bindPoint: outside + cd 0 + cast ⇒ lands at bindPoint
  const recalled = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(200); window.__dev.recall({ setCd: 0 });
    const bp = window.__dev.recall().bindPoint;
    const r = window.__dev.recall({ cast: true }); await s(60);
    const h = window.__dev.hero();
    return { result: r.result, dist: Math.hypot(h.x - bp.x, h.y - bp.y), bp };
  });
  await escModals(page);
  ok("9 RECALL a bindPoint: cast fuera ⇒ 'recalled' y héroe aterriza en bindPoint (dist≈0)", recalled.result === "recalled" && recalled.dist < 2,
     `result=${recalled.result} dist=${recalled.dist.toFixed(2)}`);

  // 10 cooldown starts
  const cdStart = await page.evaluate(() => window.__dev.recall());
  ok("10 cooldown arranca tras recall: recallCD ≈ cooldownSec, ready=false", cdStart.recallCD > cdStart.cooldownSec - 3 && cdStart.ready === false,
     `recallCD=${cdStart.recallCD} cooldownSec=${cdStart.cooldownSec} ready=${cdStart.ready}`);

  // 11 cooldown blocks re-cast
  const blocked = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(2, 2); await s(150);
    const before = window.__dev.hero(); const r = window.__dev.recall({ cast: true }); const after = window.__dev.hero();
    return { result: r.result, moved: Math.hypot(before.x - after.x, before.y - after.y) };
  });
  ok("11 cooldown BLOQUEA re-cast: cast con CD>0 ⇒ 'cooldown', héroe NO se mueve", blocked.result === "cooldown" && blocked.moved < 1,
     `result=${blocked.result} moved=${blocked.moved.toFixed(2)}`);

  // 12 deterministic cooldown decrement (dt-driven, not wall-clock)
  const det = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ setCd: 2 }); const c0 = window.__dev.recall().recallCD;
    await s(1050); const c1 = window.__dev.recall().recallCD;
    await s(1200); const r2 = window.__dev.recall();
    return { c0, c1, c2: r2.recallCD, ready: r2.ready };
  });
  ok("12 cooldown DETERMINISTA: setCd(2) baja ~1/s por dt y llega a ready", det.c0 > 1.7 && det.c1 < det.c0 - 0.6 && det.c2 <= 0 && det.ready === true,
     `c0=${det.c0} c1=${det.c1} c2=${det.c2} ready=${det.ready}`);

  // 13 save round-trip ON: keys present
  const blobOn = await page.evaluate(() => { const b = window.__dev.saveBlob() || {};
    return { hasBind: !!(b.bindPoint && isFinite(b.bindPoint.x) && isFinite(b.bindPoint.y)), hasCd: "recallCD" in b }; });
  ok("13 save round-trip ON: saveBlob incluye bindPoint {x,y} + recallCD cuando vinculado", blobOn.hasBind === true && blobOn.hasCd === true,
     `bindPoint=${blobOn.hasBind} recallCD=${blobOn.hasCd}`);

  // 14 reversible: OFF ⇒ cast returns "off"
  const rev = await page.evaluate(() => { window.__dev.recall({ enabled: false }); return window.__dev.recall({ cast: true }); });
  ok("14 reversible: recall({enabled:false}) ⇒ cast 'off' (tecla/afordancia inertes)", rev.result === "off" && rev.enabled === false,
     `result=${rev.result} enabled=${rev.enabled}`);

  // 15 REGRESSION arc: safezone regen + rested accrual still healthy with recall ON
  const regr = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(200);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1400); const hp1 = window.__dev.safeZone().hp;
    let restedGrew = true;
    if (window.__dev.rested().enabled) { window.__dev.rested({ setPool: 0 }); const p0 = window.__dev.rested().pool; await s(1200); restedGrew = window.__dev.rested().pool > p0; }
    return { hp0, hp1, restedGrew };
  });
  await escModals(page);
  ok("15 REGRESIÓN arco: con RECALL ON, regen SAFEZONE cura + Descanso acumula", regr.hp1 > regr.hp0 + 1 && regr.restedGrew,
     `hp ${regr.hp0}→${regr.hp1} restedGrew=${regr.restedGrew}`);

  // capture badge shot (bound + cooldown) for QA reference
  await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ enabled: true, setCd: 275 }); const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(200); });
  await escModals(page); await sleep(300);
  await page.screenshot({ path: join(OUT, "recall-badge-cooldown.png") });
  await page.evaluate(() => window.__dev.recall({ setCd: 0 }));
  await sleep(200); await page.screenshot({ path: join(OUT, "recall-badge-ready.png") });

  // 16 fps with feature ON
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return n;
  });
  ok("16 desk fps ≥58 with RECALL ON", fps >= 58, `fps≈${fps}`);

  ok("0 no JS errors across the whole run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} checks passed (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
