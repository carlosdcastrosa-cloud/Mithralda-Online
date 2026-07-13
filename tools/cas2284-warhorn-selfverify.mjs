// CAS-2284 — GE self-verify for TOQUE DE GUERRA DEL SANTUARIO / SANCTUARY WARHORN (DARK, WORLD_EVENT.enabled:false).
// El primer EVENTO MUNDIAL PROGRAMADO del arco Santuario. Valor central = CONVERGENCIA SOCIAL SINCRONIZADA: todos los
// jugadores del shard ven el MISMO horario y la MISMA ventana activa porque se DERIVAN de forma determinista del reloj de
// pared (bucket de minutos del epoch, función pura, 0 RNG). Durante la ventana activa, matar en el MUNDO ABIERTO otorga
// participación pasiva: +RENOMBRE (SANCTUARY_REP) + multiplicador de XP estilo RESTED por el chokepoint gainXP (SIN key/moneda
// nueva ⇒ evita el bug de keybind CAS-2273). "Escalante" = 2 fases (Llamada→Fervor, pico en la 2ª mitad).
//
// Observado vía __dev.warhorn (flip WORLD_EVENT.enabled IN-MEMORY + inyección de nowMs para observar idle/ventana/pico sin
// esperar minutos reales + kill simulado por warhornOnKill) + __dev.sanctuary/rested/safeZone/tp/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.warhorn + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: WORLD_EVENT.enabled===false AND G.warhorn NEVER created on a DARK boot (now===null) ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() has NO 'warhorn' key (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift).
//   5  horario = FUNCIÓN PURA del reloj: mismo nowMs ⇒ estado idéntico (convergencia); idle/call/peak derivados correctamente.
//   6  ventana ACTIVA: xpMult/repPerKill == config por fase (Llamada 1.25/8 · Fervor 1.5/14).
//   7  objetivo de reunión DETERMINISTA: rally != null, mismo windowIdx ⇒ mismo punto, distinto windowIdx ⇒ distinto; FUERA de la SAFEZONE.
//   8  reward OFF byte-id: WORLD_EVENT OFF ⇒ warhorn({nowMs:activo,kill}) NO da XP ni RENOMBRE (xpDelta==0, repDelta==0).
//   9  reward ON (fase Llamada): kill de mundo abierto ⇒ xpDelta==round(killXp*(1.25-1)) exacto + repDelta==8 (SANCTUARY_REP ON).
//  10  ESCALANTE (fase Fervor/pico): mismo kill ⇒ xpDelta==round(killXp*(1.5-1)) > Llamada, repDelta==14 > 8.
//  11  desacople RENOMBRE: SANCTUARY_REP OFF ⇒ repDelta==0 PERO xpDelta>0 (el mult de XP no depende del knob de facción).
//  12  SÓLO mundo abierto: kill DENTRO de la SAFEZONE durante la ventana ⇒ xpDelta==0 (guard inSafeZone).
//  13  fuera de la ventana (idle) ⇒ kill NO recompensa (xpDelta==0, repDelta==0).
//  14  reversible: WORLD_EVENT({enabled:false}) ⇒ kill inerte de nuevo (xpDelta==0).
//  15  arco regr: con WORLD_EVENT ON, BOUNTY + SANCTUARY_REP + SAFEZONE + Rested + RECALL siguen sanos.
//  16  render: el badge "Toque de Guerra" se DIBUJA con la feature ON (Δ px vs OFF-control en la fila de badges).
//  17  desktop fps ≥58 con la feature ON (tick del reloj cada frame).
//   0  no JS errors during run.
// Run: node tools/cas2284-warhorn-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2284");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// horario determinista (periodSec=900, windowSec=180, epochMs=0): periodMs=900000, windowMs=180000
const P = 900000, W = 180000;
const NOW_CALL = P * 1000 + 1000;      // into=1000  → ACTIVO fase Llamada (remaining 179s)
const NOW_PEAK = P * 1000 + 120000;    // into=120000 → ACTIVO fase Fervor/pico (remaining 60s)
const NOW_IDLE = P * 1000 + 300000;    // into=300000 → OCIOSO (nextIn 600s)
const NOW_CALL2 = P * 1001 + 1000;     // windowIdx 1001 → distinto rally

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.warhorn && window.__dev.sanctuary && window.__dev.rested && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bounty && window.__dev.recall));
  ok("1 boots to play, __dev.warhorn + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default + G.warhorn never created (fresh boot, before any inject)
  const dark = await page.evaluate(() => window.__dev.warhorn());
  ok("2 DARK default: WORLD_EVENT.enabled false AND G.warhorn never created (now===null)",
     dark.enabled === false && dark.now === null, `enabled=${dark.enabled} now=${JSON.stringify(dark.now)} periodSec=${dark.periodSec} windowSec=${dark.windowSec}`);

  // 3 save OFF has no 'warhorn' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'warhorn' key in save blob (estado 100% derivado)", !/"warhorn"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.warhorn({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 schedule = pure function of the shared clock (same nowMs ⇒ identical; idle/call/peak derived)
  const sched = await page.evaluate((NC, NP, NI) => {
    const a1 = window.__dev.warhorn({ nowMs: NC }).now, a2 = window.__dev.warhorn({ nowMs: NC }).now;
    const pk = window.__dev.warhorn({ nowMs: NP }).now, id = window.__dev.warhorn({ nowMs: NI }).now;
    return { a1, a2, pk, id };
  }, NOW_CALL, NOW_PEAK, NOW_IDLE);
  ok("5 horario = función pura del reloj: mismo nowMs ⇒ estado idéntico; call/peak/idle correctos",
     JSON.stringify(sched.a1) === JSON.stringify(sched.a2) &&
     sched.a1.active === true && sched.a1.phase === "call" &&
     sched.pk.active === true && sched.pk.phase === "peak" &&
     sched.id.active === false && sched.id.phase === "idle" &&
     Math.abs(sched.id.nextInSec - 600) < 1.5 && Math.abs(sched.a1.remainingSec - 179) < 1.5,
     `call{active:${sched.a1.active},ph:${sched.a1.phase},rem:${sched.a1.remainingSec}} peak.ph=${sched.pk.phase} idle{active:${sched.id.active},next:${sched.id.nextInSec}}`);

  // 6 active window: xpMult/repPerKill per phase == config
  ok("6 ventana activa: mults por fase == config (Llamada 1.25/8 · Fervor 1.5/14)",
     sched.a1.xpMult === 1.25 && sched.a1.repPerKill === 8 && sched.pk.xpMult === 1.5 && sched.pk.repPerKill === 14,
     `call ${sched.a1.xpMult}/${sched.a1.repPerKill} peak ${sched.pk.xpMult}/${sched.pk.repPerKill}`);

  // 7 rally deterministic + outside safezone
  const rally = await page.evaluate((NC, NC2) => {
    const r1 = window.__dev.warhorn({ nowMs: NC }).now.rally;
    const r1b = window.__dev.warhorn({ nowMs: NC }).now.rally;    // same windowIdx ⇒ same point
    const r2 = window.__dev.warhorn({ nowMs: NC2 }).now.rally;     // different windowIdx
    const sz = window.__dev.safeZone(); const b = sz.bbox;
    const inZone = (p) => p && p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];
    return { r1, r1b, r2, bbox: b, r1InZone: inZone(r1) };
  }, NOW_CALL, NOW_CALL2);
  ok("7 objetivo de reunión determinista: rally!=null, mismo windowIdx⇒mismo punto, distinto⇒distinto, FUERA de la SAFEZONE",
     !!rally.r1 && JSON.stringify(rally.r1) === JSON.stringify(rally.r1b) &&
     JSON.stringify(rally.r1) !== JSON.stringify(rally.r2) && rally.r1InZone === false,
     `r1=${JSON.stringify(rally.r1)} r2=${JSON.stringify(rally.r2)} inZone=${rally.r1InZone}`);

  // 8 reward OFF byte-id: disable, inject active, simulate kill ⇒ 0 XP / 0 rep
  const rewardOff = await page.evaluate((NC) => {
    window.__dev.warhorn({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });
    return { enabled: r.enabled, ko: r.killObserved, hasRepField: r.hero ? r.hero.hasRepField : null };
  }, NOW_CALL);
  ok("8 reward OFF byte-id: WORLD_EVENT OFF ⇒ kill NO da XP ni RENOMBRE (guard río arriba)",
     rewardOff.enabled === false && rewardOff.ko.xpDelta === 0 && rewardOff.ko.repDelta === 0,
     `xpΔ=${rewardOff.ko.xpDelta} repΔ=${rewardOff.ko.repDelta}`);

  // 9 reward ON, fase Llamada (isolate rested spend by disabling RESTED for the math)
  const call = await page.evaluate((NC) => {
    window.__dev.warhorn({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    window.__dev.rested({ enabled: false });                       // aísla el mult de warhorn del gasto de Descanso
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });   // Llamada: bonus=round(40*0.25)=10
    return r.killObserved;
  }, NOW_CALL);
  ok("9 reward ON (Llamada): xpΔ==round(killXp*(1.25-1)) exacto + repΔ==8 (SANCTUARY_REP ON)",
     call.xpDelta === 10 && call.repDelta === 8, `xpΔ=${call.xpDelta} (exp 10) repΔ=${call.repDelta} (exp 8)`);

  // 10 ESCALANTE fase Fervor/pico
  const peak = await page.evaluate((NP) => {
    window.__dev.sanctuary({ setRep: 0 });
    const r = window.__dev.warhorn({ nowMs: NP, kill: true, killXp: 40 });   // Fervor: bonus=round(40*0.5)=20
    return r.killObserved;
  }, NOW_PEAK);
  ok("10 ESCALANTE (Fervor/pico): xpΔ==round(killXp*(1.5-1)) > Llamada, repΔ==14 > 8",
     peak.xpDelta === 20 && peak.xpDelta > call.xpDelta && peak.repDelta === 14 && peak.repDelta > call.repDelta,
     `xpΔ=${peak.xpDelta} (exp 20) repΔ=${peak.repDelta} (exp 14)`);

  // 11 rep decoupled from the faction knob
  const decouple = await page.evaluate((NC) => {
    window.__dev.sanctuary({ enabled: false });                    // RENOMBRE OFF, evento sigue ON
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });
    return r.killObserved;
  }, NOW_CALL);
  ok("11 desacople RENOMBRE: SANCTUARY_REP OFF ⇒ repΔ==0 PERO xpΔ>0 (mult de XP independiente del knob de facción)",
     decouple.repDelta === 0 && decouple.xpDelta > 0, `xpΔ=${decouple.xpDelta} repΔ=${decouple.repDelta}`);

  // 12 reward only in the OPEN WORLD (kill inside the safezone ⇒ 0)
  const inZoneKill = await page.evaluate((NC) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    const sz = window.__dev.safeZone(); const t = sz.temple;        // dentro de la SAFEZONE
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40, kx: t.x, ky: t.y });
    return r.killObserved;
  }, NOW_CALL);
  ok("12 SÓLO mundo abierto: kill DENTRO de la SAFEZONE durante la ventana ⇒ xpΔ==0 (guard inSafeZone)",
     inZoneKill.xpDelta === 0 && inZoneKill.repDelta === 0, `xpΔ=${inZoneKill.xpDelta} repΔ=${inZoneKill.repDelta}`);

  // 13 outside the window (idle) ⇒ no reward
  const idleKill = await page.evaluate((NI) => {
    window.__dev.sanctuary({ setRep: 0 });
    const r = window.__dev.warhorn({ nowMs: NI, kill: true, killXp: 40 });
    return r.killObserved;
  }, NOW_IDLE);
  ok("13 fuera de la ventana (idle) ⇒ kill NO recompensa (xpΔ==0, repΔ==0)",
     idleKill.xpDelta === 0 && idleKill.repDelta === 0, `xpΔ=${idleKill.xpDelta} repΔ=${idleKill.repDelta}`);

  // 14 reversible
  const rev = await page.evaluate((NC) => {
    window.__dev.warhorn({ enabled: false });
    const r = window.__dev.warhorn({ nowMs: NC, kill: true, killXp: 40 });
    return { enabled: r.enabled, ko: r.killObserved };
  }, NOW_CALL);
  ok("14 reversible: WORLD_EVENT({enabled:false}) ⇒ kill inerte (xpΔ==0)",
     rev.enabled === false && rev.ko.xpDelta === 0 && rev.ko.repDelta === 0, `xpΔ=${rev.ko.xpDelta}`);

  // 15 arc regression
  const arc = await page.evaluate(() => {
    window.__dev.warhorn({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.bounty({ enabled: true });
    window.__dev.rested({ enabled: true }); window.__dev.recall({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    const inZone = window.__dev.safeZone().inZone;
    const acc = window.__dev.bounty({ act: true }); const canAccept = !!acc.active;
    const r = window.__dev.rested(); const rc = window.__dev.recall();
    const s = window.__dev.sanctuary();
    return { inZone, safeEnabled: sz.enabled, restedEnabled: r.enabled, recallEnabled: rc.enabled, sanctEnabled: s.enabled, canAccept };
  });
  ok("15 arc regression: BOUNTY + SANCTUARY_REP + SAFEZONE + Rested + RECALL sanos con WORLD_EVENT ON",
     arc.inZone && arc.safeEnabled && arc.restedEnabled && arc.recallEnabled && arc.sanctEnabled && arc.canAccept, JSON.stringify(arc));

  // 16 render: badge draws with feature ON vs OFF-control (changed-px in the badge column band)
  const badge = await page.evaluate(async (NC) => {
    const cv = document.querySelector("canvas");
    const dpr = window.devicePixelRatio || 1;
    // badge column: right side under the minimap. Probe a generous band on the right ~third, upper area.
    const x0 = Math.floor(cv.width * 0.62), y0 = Math.floor(cv.height * 0.02), bw = Math.floor(cv.width * 0.36), bh = Math.floor(cv.height * 0.5);
    const g = cv.getContext("2d");
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) n++; } return n; };
    // OFF control: two frames with feature OFF (background noise floor)
    window.__dev.warhorn({ enabled: false });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();
    const noise = changed(off0, off1);
    // ON active window: the badge (Toque de Guerra) must appear
    window.__dev.warhorn({ enabled: true }); window.__dev.warhorn({ nowMs: NC });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    const signal = changed(off0, on);
    return { noise, signal, dpr };
  }, NOW_CALL);
  ok("16 render: badge 'Toque de Guerra' se dibuja con la feature ON (signal ≫ noise)",
     badge.signal > 60 && badge.signal > badge.noise * 3, `signal=${badge.signal} noise=${badge.noise} dpr=${badge.dpr}`);

  // 17 fps with feature ON + live clock tick
  const fps = await page.evaluate(async () => {
    window.__dev.warhorn({ enabled: true });
    let frames = 0; const t0 = performance.now();
    return await new Promise((res) => { function loop() { frames++; if (performance.now() - t0 >= 1000) res(frames); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
  });
  ok("17 desktop fps ≥58 with feature ON (reloj compartido tick cada frame)", fps >= 58, `fps≈${fps}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
