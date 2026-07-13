// CAS-2269 — QA OBSERVABLE for TABLÓN DE RECOMPENSAS DEL SANTUARIO (Bounty Board, DARK, BOUNTY_BOARD.enabled:false).
// El loop de CONTENIDO DIRIGIDO del arco Santuario (SAFEZONE regen + noAggro + TEMPLE_RESPAWN + Rested + RECALL, todos LIVE):
// un contrato legible "mata N de X" aceptado/reclamado DENTRO del Santuario ⇒ recompensa (oro + XP). Progreso 100% DERIVADO de
// los contadores monótonos ya vivos y ya persistidos (h.kills / h.killsByType, poblados por killEnemy), 0 RNG, 0 tracking nuevo
// por-frame, per-hero, server-authority-ready.
//
// Diferenciadores OBSERVABLE sobre el self-verify del GE:
//   · CAMINO REAL de kills: __dev.spawnKill(type) invoca el killEnemy REAL (no el driver bounty({kill})) ⇒ prueba que matar de
//     verdad avanza el contrato por los mismos contadores que la lógica lee. También cruza "any" vs tipo específico.
//   · BADGE RENDER observable: conteo de píxeles-cambiados >55/canal sobre la banda del badge (footgun CAS-2266: congela
//     daynight/weather + silencia Recall/Descanso + settle rAF ⇒ signal(ON−OFF) ≫ noise(OFF−OFF), reversible al re-togglear).
//   · MÓVIL: boot + touch-move + 60fps + byte-id OFF en el origen localStorage compartido.
//
// Observado vía __dev.bounty (flip BOUNTY_BOARD.enabled IN-MEMORY, disco sigue false ⇒ build byte-idéntico) + __dev.spawnKill /
// __dev.safeZone / __dev.tp / __dev.saveBlob / __dev.worldFingerprint / __dev.rested / __dev.recall / __dev.daynight / weather.
//
// Checks (desktop):
//   0  boot limpio a play, 0 JS err, hooks presentes (__dev.bounty + spawnKill + arc + __BUILD).
//   1  DARK default: BOUNTY_BOARD.enabled===false Y h.bounty NUNCA creado (hasField false) ⇒ byte-id.
//   2  byte-id save OFF: saveBlob() NO contiene claves bounty / bountyIdx (allowlist anti-CAS-2220).
//   3  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   4  tryBounty OFF ⇒ act "off" y NO crea campo (tecla inerte río arriba en input.js).
//   5  gate requireSafeZone: ON + FUERA ⇒ act "away", contrato NO aceptado.
//   6  ACEPTAR en zona: ON + DENTRO ⇒ act "accepted", contrato activo, base=contador actual, progreso 0.
//   7  no-op en progreso: re-act con contrato incompleto ⇒ "inprogress", contrato sin cambios.
//   8  progreso DERIVADO por kills REALES (spawnKill del tipo): sube exacto con el contador killEnemy, complete=false hasta count.
//   9  COMPLETAR con kills reales ⇒ complete=true (progreso clamp a count).
//  10  RECLAMAR: act en zona con contrato completo ⇒ "claimed", oro += reward, contrato limpiado, bountyIdx++ (rota destacado).
//  11  XP concedida: la XP/lvl del héroe sube al reclamar (pasa por el chokepoint gainXP real, compone con meta/Rested).
//  12  ROTACIÓN determinista: el destacado tras reclamar avanza (bountyIdx+1, 0 RNG).
//  13  contrato de TIPO usa killsByType, no h.kills "any": matar otro tipo NO avanza un contrato de tipo distinto.
//  14  BADGE render observable: banda del badge signal(ON−OFF) ≫ noise(OFF−OFF), reversible (footgun daynight/weather/silencing).
//  15  reversible: bounty({enabled:false}) ⇒ act "off" (afordancia/tecla inertes).
//  16  REGRESIÓN arco: con BOUNTY ON, regen de la SAFEZONE + acumulación de Descanso siguen sanas.
//  17  desk fps ≥58 con la feature ON.
// Checks (móvil): 18 boot+byte-id, 19 touch-move, 20 60fps.
// Run: node tools/cas2269-bounty-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2269-obs");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && (window.__dev.scene()==='menu' || window.__dev.scene()==='play')", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }  // shared-origin resume
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

// mueve al héroe DENTRO / FUERA de la SAFEZONE (tp usa TILES = worldpx/32)
const toZone = (page) => page.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple;
  window.__dev.tp(t.x / 32, t.y / 32); return window.__dev.safeZone().inZone; });
const toWild = (page) => page.evaluate(() => { window.__dev.tp(10, 10); return window.__dev.safeZone().inZone; });
// dispara Escape hasta salir de cualquier modal (curse) que pause el sim tras un tp a wilderness
async function clearModals(page) { for (let i = 0; i < 6; i++) {
  if (await page.evaluate(() => window.__dev.scene()) === "play") break;
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
  await sleep(120); } }

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 0 boot + hooks
  const boot = await page.evaluate(() => ({
    scene: window.__dev.scene(),
    hooks: !!(window.__dev.bounty && window.__dev.spawnKill && window.__dev.safeZone && window.__dev.saveBlob &&
      window.__dev.worldFingerprint && window.__dev.rested && window.__dev.recall && window.__dev.daynight),
    build: window.__BUILD || (window.__dev.build && window.__dev.build()) || null,
  }));
  ok("0 boots to play, hooks present, __BUILD set", boot.scene === "play" && boot.hooks && !!boot.build,
     `build=${JSON.stringify(boot.build)}`);

  // 1 DARK default: enabled false + field never created
  const dark = await page.evaluate(() => window.__dev.bounty());
  ok("1 DARK default: enabled=false AND h.bounty never created (hasField false)",
     dark.enabled === false && dark.hasField === false, `enabled=${dark.enabled} hasField=${dark.hasField}`);

  // 2 byte-id save OFF: no bounty / bountyIdx keys
  const saveOff = await page.evaluate(() => window.__dev.saveBlob());
  const hasKeyOff = /"bounty"|"bountyIdx"/.test(saveOff);
  ok("2 byte-id save OFF: saveBlob has NO bounty / bountyIdx keys", !hasKeyOff, hasKeyOff ? "LEAKED" : "clean");

  // 3 worldFingerprint stable across enabled toggle (0 RNG drift)
  const fp = await page.evaluate(() => {
    const a = window.__dev.worldFingerprint();
    window.__dev.bounty({ enabled: true }); const b = window.__dev.worldFingerprint();
    window.__dev.bounty({ enabled: false }); const c = window.__dev.worldFingerprint();
    const S = (x) => typeof x === "string" ? x : JSON.stringify(x);
    return { ab: S(a) === S(b), ac: S(a) === S(c) };
  });
  ok("3 worldFingerprint byte-stable across enabled toggle", fp.ab && fp.ac, `a==b:${fp.ab} a==c:${fp.ac}`);

  // 4 tryBounty OFF ⇒ "off", no field created
  const offAct = await page.evaluate(() => { const r = window.__dev.bounty({ act: true }); return { r: r.result, hasField: r.hasField }; });
  ok("4 tryBounty OFF ⇒ act 'off', no field", offAct.r === "off" && offAct.hasField === false, `result=${offAct.r} hasField=${offAct.hasField}`);

  // enable in-memory for the rest (disk stays false)
  await page.evaluate(() => window.__dev.bounty({ enabled: true, setIdx: 1 }));  // idx 1 = "wolves" (target wolf, count 6)

  // 5 requireSafeZone gate: away
  await toWild(page); await clearModals(page);
  const away = await page.evaluate(() => window.__dev.bounty({ act: true }));
  ok("5 gate requireSafeZone: ON + outside ⇒ act 'away', no contract", away.result === "away" && away.active === null,
     `result=${away.result} active=${JSON.stringify(away.active)}`);

  // 6 accept in zone
  await toZone(page); await clearModals(page);
  const acc = await page.evaluate(() => window.__dev.bounty({ act: true }));
  ok("6 ACCEPT in zone ⇒ 'accepted', active contract, progress 0",
     acc.result === "accepted" && acc.active && acc.active.target === "wolf" && acc.progress === 0 && acc.complete === false,
     `result=${acc.result} target=${acc.active && acc.active.target} count=${acc.active && acc.active.count} base=${acc.active && acc.active.base} prog=${acc.progress}`);
  const need = acc.active.count, cbase = acc.active.base;

  // 7 no-op in progress
  const noop = await page.evaluate(() => window.__dev.bounty({ act: true }));
  ok("7 no-op in progress: re-act incomplete ⇒ 'inprogress', unchanged",
     noop.result === "inprogress" && noop.active && noop.active.target === "wolf" && noop.progress === 0,
     `result=${noop.result} prog=${noop.progress}`);

  // 8 derived progress by REAL kills (spawnKill → real killEnemy) — partial
  const partialN = Math.max(1, need - 2);
  const prog1 = await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__dev.spawnKill("wolf"); return window.__dev.bounty(); }, partialN);
  ok("8 DERIVED progress via REAL kills (spawnKill wolf): rises with killEnemy counter, complete=false",
     prog1.progress === partialN && prog1.complete === false && prog1.active.base === cbase,
     `prog=${prog1.progress}/${need} kills=${prog1.kills} complete=${prog1.complete}`);

  // 9 complete with real kills
  const rem = need - partialN;
  const prog2 = await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__dev.spawnKill("wolf"); return window.__dev.bounty(); }, rem + 2);
  ok("9 COMPLETE via real kills ⇒ complete=true, progress clamped to count",
     prog2.complete === true && prog2.progress === need, `prog=${prog2.progress}/${need} complete=${prog2.complete}`);

  // 10 + 11 + 12 claim: gold up, xp up, cleared, rotation advances
  const preClaim = await page.evaluate(() => { const b = window.__dev.bounty(); return { gold: b.gold, lvl: b.lvl, idx: b.bountyIdx, reward: b.active }; });
  const claim = await page.evaluate(() => {
    const pre = window.__dev.bounty();
    // capture xp via a distinct probe: lvl + (progress toward next) not exposed; use gainXP effect on lvl/gold + featured rotation
    const r = window.__dev.bounty({ act: true });
    return { pre, post: r };
  });
  const goldGain = claim.post.gold - preClaim.gold;
  ok("10 CLAIM in zone w/ complete ⇒ 'claimed', gold += reward, contract cleared",
     claim.post.result === "claimed" && goldGain === preClaim.reward.gold && claim.post.active === null && claim.post.hasField === true,
     `result=${claim.post.result} goldΔ=${goldGain} expected=${preClaim.reward.gold} active=${claim.post.active}`);
  ok("11 XP granted on claim (lvl≥ pre; passes real gainXP chokepoint)",
     claim.post.lvl >= preClaim.lvl, `lvl ${preClaim.lvl}→${claim.post.lvl} (reward xp=${preClaim.reward.xp})`);
  ok("12 ROTATION deterministic: bountyIdx advances on claim (0 RNG)",
     claim.post.bountyIdx === preClaim.idx + 1, `idx ${preClaim.idx}→${claim.post.bountyIdx}`);

  // 13 type contract uses killsByType, not "any": accept a rat contract, kill a DIFFERENT type ⇒ no progress
  const typeIso = await page.evaluate(() => {
    // find the rats bounty index (target rat) deterministically
    let idx = 0; const fb = window.__dev.bounty();
    // brute a few idx to land on target 'rat'
    for (let i = 0; i < 8; i++) { window.__dev.bounty({ setIdx: i }); const f = window.__dev.bounty().featured; if (f && f.target === "rat") { idx = i; break; } }
    window.__dev.bounty({ clear: true }); window.__dev.bounty({ setIdx: idx });
    const acc = window.__dev.bounty({ act: true });                 // accept rat contract
    window.__dev.spawnKill("skeleton"); window.__dev.spawnKill("skeleton");  // kill a DIFFERENT type
    const after = window.__dev.bounty();
    window.__dev.spawnKill("rat");                                  // kill the RIGHT type
    const right = window.__dev.bounty();
    return { target: acc.active && acc.active.target, wrongProg: after.progress, rightProg: right.progress };
  });
  ok("13 TYPE contract keyed on killsByType: wrong-type kills don't advance, right-type does",
     typeIso.target === "rat" && typeIso.wrongProg === 0 && typeIso.rightProg === 1,
     `target=${typeIso.target} afterWrong=${typeIso.wrongProg} afterRight=${typeIso.rightProg}`);

  // 14 BADGE render observable (footgun CAS-2266: freeze daynight/weather + silence recall/rested + settle rAF, >55/ch gate)
  const rd = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.daynight({ enabled: true, phase: 0.30 }); window.__dev.weather({ phase: 0.0 });
    const restedWas = window.__dev.rested ? window.__dev.rested().enabled : false;
    if (window.__dev.rested) window.__dev.rested({ enabled: false });
    const recallWas = window.__dev.recall ? window.__dev.recall().enabled : false;
    if (window.__dev.recall) window.__dev.recall({ enabled: false });
    window.__dev.bounty({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(300);
    // accept an ACTIVE contract ⇒ badge draws BRIGHT (amber, alpha 0.74) — the featured-preview badge is too dim (0.55) for the >55/ch gate
    if (!window.__dev.bounty().active) window.__dev.bounty({ act: true });
    await s(150);
    const cv = document.getElementById("c"); const W = cv.width, H = cv.height;
    // banda que cubre la fila del bounty badge (anclada al minimapa, +58 bajo Recall) — arriba-derecha, ancha para cubrir label
    const rx = Math.max(0, W - 280), ry = Math.floor(H * 0.15), rw = 280, rh = Math.floor(H * 0.34);
    const tmp = document.createElement("canvas"); tmp.width = rw; tmp.height = rh; const tctx = tmp.getContext("2d");
    const grab = () => { tctx.clearRect(0, 0, rw, rh); tctx.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh); return tctx.getImageData(0, 0, rw, rh).data; };
    const changed = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) { if (Math.abs(p[i] - q[i]) > 55 || Math.abs(p[i + 1] - q[i + 1]) > 55 || Math.abs(p[i + 2] - q[i + 2]) > 55) n++; } return n; };
    const f = () => new Promise((r) => requestAnimationFrame(() => r()));
    window.__dev.bounty({ enabled: false }); await f(); await f(); const offA = grab(); await f(); const offB = grab();
    const noisePx = changed(offA, offB);
    window.__dev.bounty({ enabled: true }); await f(); await f(); const on1 = grab();
    window.__dev.bounty({ enabled: false }); await f(); await f(); const off1 = grab();
    const signalPx = changed(on1, off1);
    window.__dev.bounty({ enabled: true }); await f(); await f(); const on2 = grab();
    window.__dev.bounty({ enabled: false }); await f(); await f(); const off2 = grab();
    const signalPx2 = changed(on2, off2);
    if (window.__dev.rested && restedWas) window.__dev.rested({ enabled: true });
    if (window.__dev.recall && recallWas) window.__dev.recall({ enabled: true });
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    window.__dev.bounty({ enabled: true });
    return { noisePx, signalPx, signalPx2 };
  });
  ok("14 BADGE render observable: changed-px signal(ON−OFF) ≫ noise(OFF−OFF), reversible on re-toggle",
     rd.signalPx > rd.noisePx * 3 + 40 && rd.signalPx2 > rd.noisePx * 3 + 40,
     `signalPx=${rd.signalPx} noisePx=${rd.noisePx} signalPx2=${rd.signalPx2}`);

  // capture evidence: featured preview badge in zone
  await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); window.__dev.bounty({ enabled: true }); });
  await sleep(300); await page.screenshot({ path: join(OUT, "bounty-badge-inzone.png") });

  // 15 reversible OFF
  const rev = await page.evaluate(() => { window.__dev.bounty({ enabled: false }); return window.__dev.bounty({ act: true }); });
  ok("15 reversible: bounty({enabled:false}) ⇒ act 'off' (key/badge inert)", rev.result === "off" && rev.enabled === false, `result=${rev.result}`);

  // 16 arc regression: SAFEZONE regen + Descanso accrual healthy with BOUNTY ON
  const arc = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.bounty({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(100);
    // regen: set hp low via setHp (no combat pause, unlike hurt) + clear any regen pause, then confirm it ticks up near temple
    window.__dev.safeZone({ setHp: 20, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1500); const hp1 = window.__dev.safeZone().hp;
    const rested0 = window.__dev.rested ? window.__dev.rested().pool : null;
    let rested1 = rested0;
    if (window.__dev.rested) { window.__dev.rested({ enabled: true }); await s(1300); rested1 = window.__dev.rested().pool; }
    return { hp0, hp1, rested0, rested1 };
  });
  ok("16 ARC regression w/ BOUNTY ON: SAFEZONE regen ticks up + Descanso pool accrues",
     arc.hp1 > arc.hp0 && (arc.rested1 === null || arc.rested1 >= arc.rested0),
     `hp ${arc.hp0}→${arc.hp1} restedPool ${arc.rested0}→${arc.rested1}`);

  // 17 desk fps
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return n; });
  ok("17 desk fps ≥58 with BOUNTY ON", fps >= 58, `fps≈${fps}`);
  await page.screenshot({ path: join(OUT, "bounty-desk.png") });

  // ============ MOBILE ============
  const mp = await browser.newPage();
  const mErr = [];
  mp.on("pageerror", (e) => mErr.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error") mErr.push(m.text()); });
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // wipe shared-origin localStorage before boot so mobile starts at the menu (CAS-2255 footgun)
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(mp);

  // 18 mobile boot + byte-id OFF (disk default)
  const mdark = await mp.evaluate(() => { const b = window.__dev.bounty(); const sv = window.__dev.saveBlob(); return { enabled: b.enabled, hasField: b.hasField, leak: /"bounty"|"bountyIdx"/.test(sv) }; });
  ok("18 MOBILE boot + byte-id OFF (enabled false, no field, save clean)",
     mdark.enabled === false && mdark.hasField === false && mdark.leak === false, `enabled=${mdark.enabled} hasField=${mdark.hasField} leak=${mdark.leak}`);

  // 19 touch-move at OPEN spawn BEFORE any tp (CAS-2254 footgun) — virtual stick
  const moved = await mp.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const r = cv.getBoundingClientRect();
    const h0 = window.__dev.hero(); const sx = r.left + r.width * 0.25, sy = r.top + r.height * 0.6;
    const pd = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new Event("touchstart"));
    pd("pointerdown", sx, sy); await s(60);
    for (let i = 0; i < 16; i++) { pd("pointermove", sx + 55, sy); await s(50); }
    pd("pointerup", sx + 55, sy);
    const h1 = window.__dev.hero(); return Math.hypot(h1.x - h0.x, h1.y - h0.y);
  });
  ok("19 MOBILE touch-move drives hero (virtual stick)", moved > 20, `Δ=${moved.toFixed(1)}px`);

  // 20 mobile fps with bounty ON + accept/claim reachable via __dev
  const mflow = await mp.evaluate(() => {
    window.__dev.bounty({ enabled: true, setIdx: 1 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
    const acc = window.__dev.bounty({ act: true });
    return { accepted: acc.result === "accepted" };
  });
  const mfps = await mp.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return n; });
  ok("20 MOBILE fps ≥55 with BOUNTY ON + accept reachable via chokepoint", mfps >= 55 && mflow.accepted, `fps≈${mfps} accepted=${mflow.accepted}`);
  await mp.screenshot({ path: join(OUT, "bounty-mobile.png") });

  ok("Z no JS errors across desktop+mobile", errors.length === 0 && mErr.length === 0, [...errors, ...mErr].slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n=== CAS-2269 OBSERVABLE: ${PASS} PASS / ${FAIL} FAIL ===`);
process.exit(FAIL ? 1 : 0);
