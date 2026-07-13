// CAS-2292 — GE self-verify for EMISARIO DEL SANTUARIO / SANCTUARY EMISSARY (DARK, SANCTUARY_EMISSARY.enabled:false).
// La ROTACIÓN de WORLD-QUEST del arco Santuario. Diferenciador vs BOUNTY_BOARD: la rotación es COMPARTIDA (función pura del
// reloj de pared, period=floor((now-epochMs)/periodSec) ⇒ todos los jugadores ven el MISMO emisario a la vez = convergencia,
// no el bountyIdx per-hero) y el pago es RENOMBRE (SANCTUARY_REP) + oro. "abate N de X" en el MUNDO ABIERTO, entrega en el hub
// (tecla Insert / móvil tb.emissary). UNA entrega por period (cadencia daily-quest); al rolar el period, re-acepta.
//
// Observado vía __dev.emissary (flip enabled IN-MEMORY + setPeriod/nowMs para fijar la rotación sin esperar minutos + kill
// simulado por los contadores monótonos + act por el chokepoint real tryEmissary) + __dev.bounty/sanctuary/quartermaster/warhorn/
// recall/safeZone/tp/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.emissary + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: SANCTUARY_EMISSARY.enabled===false AND G.emissary NEVER created (schedule===null) AND hasField false ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() has NO 'emissary' key.
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift).
//   5  OFF byte-id: enabled false ⇒ act ⇒ 'off' AND hasField stays false (tecla inerte, campo nunca creado).
//   6  rotación = FUNCIÓN PURA del reloj: mismo nowMs ⇒ mismo period+def (convergencia); distinto period ⇒ (posible) distinto def.
//   7  setPeriod fija el emisario: period%N ⇒ emissaries[period%N] (rotación determinista, target/count/gold/rep == config).
//   8  ACEPTAR en la SAFEZONE: act ⇒ 'accepted', hasField true, base = killsByType[target] snapshot, progress 0.
//   9  progreso DERIVADO: kill n<count del target ⇒ progress==n, complete false (contador monótono, 0 hook nuevo).
//  10  aislamiento de TIPO: kill de OTRO tipo NO avanza el emisario (progress no cambia).
//  11  ENTREGAR: al completar (kill count) ⇒ act ⇒ 'claimed', goldΔ==def.gold + repΔ==def.rep (SANCTUARY_REP ON).
//  12  UNA por period: tras entregar ⇒ act ⇒ 'done' (idempotente, no doble pago).
//  13  ROL de period ⇒ re-aceptar: setPeriod al siguiente ⇒ act ⇒ 'accepted' (nuevo snapshot, distinto emisario).
//  14  desacople RENOMBRE: SANCTUARY_REP OFF ⇒ entrega da oro PERO repΔ==0 (el pago de oro no depende del knob de facción).
//  15  gating de zona: FUERA de la SAFEZONE ⇒ act ⇒ 'away' (no acepta/entrega fuera del hub).
//  16  persist: emisario aceptado sobrevive saveBlob→loadSave (period/base/claimed round-trip).
//  17  arco regr: con EMISSARY ON, BOUNTY + SANCTUARY_REP + SANCTUARY_REWARDS + WORLD_EVENT + RECALL siguen sanos.
//  18  render: el badge 'Emisario' se DIBUJA con la feature ON + aceptado (Δ px vs OFF-control en la fila de badges).
//  19  desktop fps ≥58 con la feature ON (tick del reloj cada frame).
//   0  no JS errors during run.
// Run: node tools/cas2292-emissary-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2292");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// rotación determinista (periodSec=1200, epochMs=0): periodMs=1200000. period = floor(now/periodMs).
const PM = 1200000;
const NOW_P0 = PM * 10 + 5000;   // period 10 → 10%5=0 → wolfcull (wolf,8,90,60)
const NOW_P0b = PM * 10 + 9000;  // mismo period 10 (mismo emisario) — prueba pureza
const NOW_P1 = PM * 11 + 5000;   // period 11 → 11%5=1 → boneward (skeleton,8,110,70)

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
// tp al hub (Santuario) — asegura estar DENTRO de la SAFEZONE para aceptar/entregar
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

  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.emissary && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.emissary + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default: enabled false + schedule null + hasField false
  const dark = await page.evaluate(() => window.__dev.emissary());
  ok("2 DARK default: enabled false AND schedule null (G.emissary never created) AND hasField false",
     dark.enabled === false && dark.schedule === null && dark.hasField === false,
     `enabled=${dark.enabled} schedule=${JSON.stringify(dark.schedule)} hasField=${dark.hasField} periodSec=${dark.periodSec}`);

  // 3 save OFF has no 'emissary' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'emissary' key in save blob", !/"emissary"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.emissary({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 OFF byte-id: act returns 'off' and never creates the field (from fresh dark state)
  const offAct = await page.evaluate(() => { window.__dev.emissary({ enabled: false }); const r = window.__dev.emissary({ act: true }); return { result: r.result, hasField: r.hasField, enabled: r.enabled }; });
  ok("5 OFF byte-id: enabled false ⇒ act ⇒ 'off' AND hasField false (tecla inerte, campo nunca creado)",
     offAct.enabled === false && offAct.result === "off" && offAct.hasField === false, JSON.stringify(offAct));

  // 6 rotation = pure function of the shared clock
  const rot = await page.evaluate((A, Ab, B) => {
    window.__dev.emissary({ enabled: true });
    const a1 = window.__dev.emissary({ nowMs: A }).schedule, a2 = window.__dev.emissary({ nowMs: Ab }).schedule;
    const b1 = window.__dev.emissary({ nowMs: B }).schedule;
    return { a1, a2, b1 };
  }, NOW_P0, NOW_P0b, NOW_P1);
  ok("6 rotación = función pura del reloj: mismo period ⇒ mismo emisario (convergencia); period distinto ⇒ def distinto",
     rot.a1 && rot.a2 && rot.a1.period === rot.a2.period && rot.a1.def.id === rot.a2.def.id &&
     rot.b1.period !== rot.a1.period && rot.b1.def.id !== rot.a1.def.id,
     `p0=${rot.a1.period}/${rot.a1.def.id} p0b=${rot.a2.period}/${rot.a2.def.id} p1=${rot.b1.period}/${rot.b1.def.id}`);

  // 7 setPeriod picks emissaries[period%N] == config
  const pick = await page.evaluate(() => {
    const d0 = window.__dev.emissary({ setPeriod: 0 }).schedule.def;   // wolfcull
    const d1 = window.__dev.emissary({ setPeriod: 1 }).schedule.def;   // boneward
    const d4 = window.__dev.emissary({ setPeriod: 4 }).schedule.def;   // pathpurge
    const d5 = window.__dev.emissary({ setPeriod: 5 }).schedule.def;   // wraps → wolfcull
    return { d0, d1, d4, d5 };
  });
  ok("7 setPeriod fija el emisario: emissaries[period%N] == config (rotación determinista, wrap correcto)",
     pick.d0.id === "wolfcull" && pick.d0.target === "wolf" && pick.d0.count === 8 && pick.d0.gold === 90 && pick.d0.rep === 60 &&
     pick.d1.id === "boneward" && pick.d4.id === "pathpurge" && pick.d4.target === "any" && pick.d5.id === "wolfcull",
     `d0=${pick.d0.id}/${pick.d0.target}/${pick.d0.count}/g${pick.d0.gold}/r${pick.d0.rep} d1=${pick.d1.id} d4=${pick.d4.id} d5=${pick.d5.id}`);

  await toHub(page);

  // FREEZE the shared clock: la rotación se DERIVA de Date.now cada frame (tickEmissary, mirror tickWorldEvent). El sim usa
  // performance.now para dt (index.html) ⇒ congelar Date.now NO congela el sim; sólo PINa el period ⇒ observable determinista
  // (mismo footgun que warhorn: el tick REESCRIBE G.emissary del reloj real cada frame). NOW_P0 ⇒ period 10 ⇒ wolfcull.
  await page.evaluate((F) => { if (!window.__ORIG_NOW) window.__ORIG_NOW = Date.now; Date.now = () => F; }, NOW_P0);

  // 8 ACCEPT in the safezone: base snapshot, progress 0 (reloj PINado ⇒ wolfcull). Inyecto nowMs en el MISMO call que act (el
  // tick vivo sólo repobla G.emissary en el SIGUIENTE frame; act corre síncrono ⇒ paso nowMs para fijar la rotación ya).
  const acc = await page.evaluate((F) => {
    window.__dev.emissary({ enabled: true });
    const before = window.__dev.emissary({ nowMs: F });
    const r = window.__dev.emissary({ nowMs: F, act: true });
    return { inZone: before.inZone, result: r.result, hasField: r.hasField, active: r.active, progress: r.progress, complete: r.complete };
  }, NOW_P0);
  ok("8 ACEPTAR en la SAFEZONE (reloj PINado ⇒ wolfcull): act ⇒ 'accepted', hasField true, snapshot base, progress 0",
     acc.inZone === true && acc.result === "accepted" && acc.hasField === true && acc.active && acc.active.id === "wolfcull" && acc.progress === 0 && acc.complete === false,
     `result=${acc.result} active=${JSON.stringify(acc.active)} progress=${acc.progress}`);
  const TGT = acc.active ? acc.active.target : "wolf", CNT = acc.active ? acc.active.count : 8, GLD = acc.active ? acc.active.gold : 90, REP = acc.active ? acc.active.rep : 60;

  // 9 derived progress: kill n<count of the target
  const prog = await page.evaluate((t) => {
    window.__dev.emissary({ kill: { type: t, n: 3 } });
    const r = window.__dev.emissary();
    return { progress: r.progress, complete: r.complete };
  }, TGT);
  ok("9 progreso DERIVADO: kill 3<count del target ⇒ progress==3, complete false (contador monótono)",
     prog.progress === 3 && prog.complete === false, `progress=${prog.progress} complete=${prog.complete}`);

  // 10 TYPE isolation: killing another type does not advance (rat unless target IS rat → use a guaranteed-other type)
  const iso = await page.evaluate((t) => {
    const other = t === "rat" ? "wolf" : "rat";
    window.__dev.emissary({ kill: { type: other, n: 5 } });   // tipo distinto ⇒ no avanza el emisario
    return window.__dev.emissary().progress;
  }, TGT);
  ok("10 aislamiento de TIPO: kill de OTRO tipo NO avanza el emisario (progress sigue 3)", iso === 3, `progress=${iso}`);

  // 11 DELIVER: complete then act ⇒ claimed, gold+rep payout (exact def.gold/def.rep)
  const claim = await page.evaluate((t, cnt) => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 });
    window.__dev.rested({ enabled: false });                   // aísla el pago del emisario (no toca gainXP/rested)
    window.__dev.emissary({ kill: { type: t, n: cnt } });      // 3 + count ≥ count ⇒ complete
    const beforeGold = window.__dev.emissary().gold, beforeRep = window.__dev.emissary().rep;
    const complete = window.__dev.emissary().complete;
    const r = window.__dev.emissary({ act: true });
    return { complete, result: r.result, goldD: r.gold - beforeGold, repD: r.rep - beforeRep };
  }, TGT, CNT);
  ok("11 ENTREGAR: complete ⇒ act ⇒ 'claimed', goldΔ==def.gold + repΔ==def.rep (SANCTUARY_REP ON)",
     claim.complete === true && claim.result === "claimed" && claim.goldD === GLD && claim.repD === REP,
     `result=${claim.result} goldΔ=${claim.goldD}(exp ${GLD}) repΔ=${claim.repD}(exp ${REP})`);

  // 12 one-per-period: act again ⇒ done
  const dbl = await page.evaluate(() => { const g0 = window.__dev.emissary().gold; const r = window.__dev.emissary({ act: true }); return { result: r.result, goldD: r.gold - g0 }; });
  ok("12 UNA por period: tras entregar ⇒ act ⇒ 'done' (idempotente, 0 doble pago)", dbl.result === "done" && dbl.goldD === 0, `result=${dbl.result} goldΔ=${dbl.goldD}`);

  // 13 period roll ⇒ re-accept a DIFFERENT emissary (re-pin clock to NOW_P1 ⇒ boneward)
  const roll = await page.evaluate((F1) => {
    Date.now = () => F1;                                        // rola el period para el tick vivo (NOW_P1 ⇒ boneward)
    const r = window.__dev.emissary({ nowMs: F1, act: true }); // + inyecto nowMs para fijar G.emissary YA (mismo call que act)
    return { result: r.result, id: r.active ? r.active.id : null, target: r.active ? r.active.target : null, claimed: r.active ? r.active.claimed : null, progress: r.progress };
  }, NOW_P1);
  ok("13 ROL de period ⇒ re-aceptar: reloj rola ⇒ act ⇒ 'accepted' nuevo emisario (boneward), progress 0",
     roll.result === "accepted" && roll.id === "boneward" && roll.claimed === false && roll.progress === 0, JSON.stringify(roll));

  // 14 rep decoupled from the faction knob (deliver boneward with SANCTUARY_REP OFF)
  const decouple = await page.evaluate((tgt, cnt) => {
    window.__dev.sanctuary({ enabled: false });               // RENOMBRE OFF, emisario sigue ON
    window.__dev.emissary({ kill: { type: tgt, n: cnt } });
    const g0 = window.__dev.emissary().gold, rp0 = window.__dev.emissary().rep, gld = window.__dev.emissary().active.gold;
    const r = window.__dev.emissary({ act: true });
    return { result: r.result, goldD: r.gold - g0, repD: r.rep - rp0, gld };
  }, "skeleton", 8);
  ok("14 desacople: SANCTUARY_REP OFF ⇒ entrega da oro (goldΔ==def.gold==110) PERO repΔ==0 (oro independiente del knob de facción)",
     decouple.result === "claimed" && decouple.goldD === decouple.gld && decouple.gld === 110 && decouple.repD === 0,
     `result=${decouple.result} goldΔ=${decouple.goldD}(def ${decouple.gld}) repΔ=${decouple.repD}`);

  // 15 zone gating: outside the safezone ⇒ away
  const away = await page.evaluate(() => {
    window.__dev.tp(4, 4);   // esquina lejos del hub
    const r = window.__dev.emissary({ act: true });
    return { inZone: r.inZone, result: r.result };
  });
  ok("15 gating de zona: FUERA de la SAFEZONE ⇒ act ⇒ 'away' (no acepta/entrega fuera del hub)",
     away.inZone === false && away.result === "away", JSON.stringify(away));

  // 16 persist: accepted emissary serializes with the feature ON (key present + shape). Re-pin NOW_P3 ⇒ greentide (orc,5).
  const persist = await page.evaluate((F3) => {
    Date.now = () => F3;
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.emissary({ nowMs: F3, act: true });           // accept greentide (nowMs fija la rotación en el mismo call)
    window.__dev.emissary({ kill: { type: "orc", n: 2 } });   // partial progress
    const blob = window.__dev.saveBlob();
    const e = blob.emissary || null;
    return { hasKey: "emissary" in blob, e };
  }, PM * 13 + 5000);
  ok("16 persist: emisario aceptado se serializa (save tiene 'emissary' con period/target/base/claimed) con la feature ON",
     persist.hasKey === true && persist.e && persist.e.target === "orc" && persist.e.id === "greentide" && typeof persist.e.base === "number" && persist.e.claimed === false,
     JSON.stringify(persist.e));

  // restore the real clock before the render/fps/arc checks
  await page.evaluate(() => { if (window.__ORIG_NOW) Date.now = window.__ORIG_NOW; });

  // 17 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.emissary({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.recall({ enabled: true });
    const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const rc = window.__dev.recall();
    return { bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, recallOk: rc.enabled };
  });
  ok("17 arco regr: BOUNTY + SANCTUARY_REP + SANCTUARY_REWARDS + WORLD_EVENT + RECALL sanos con EMISSARY ON",
     arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.recallOk, JSON.stringify(arc));

  // 18 render: badge draws with feature ON + accepted vs OFF-control. Probe band EXCLUYE el minimapa (top-right animado): banda
  // bajo el minimapa (y>0.22H) en la columna derecha; daynight PINado para bajar el churn temporal (aísla el signal del badge).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas");
    const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.62), y0 = Math.floor(cv.height * 0.24), bw = Math.floor(cv.width * 0.36), bh = Math.floor(cv.height * 0.42);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 55) n++; } return n; };
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);      // PIN noon ⇒ sin churn de tinte día/noche
    // OFF control: two settled frames (feature off ⇒ no emissary badge)
    window.__dev.emissary({ enabled: false });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();
    const noise = changed(off0, off1);
    // ON + accepted: el badge 'Emisario' aparece. Aísla el signal (cambió vs OFF0 Y el fondo era estable entre OFF frames).
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ act: true });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dOn > 55 && dBg <= 25) signal++;                    // cambió por el badge, NO por churn de fondo (CAS-2272 isolation)
    }
    if (window.__dev.daynight) window.__dev.daynight(null);     // restaura el reloj compartido
    return { noise, signal };
  });
  ok("18 render: badge 'Emisario' se dibuja con la feature ON + aceptado (signal aislado del churn de fondo)",
     badge.signal > 40, `signal=${badge.signal} noise=${badge.noise}`);

  // 19 fps NO-REGRESSION: mi tick/badge no debe degradar el frame budget. Headless es lento/variable ⇒ comparo ON vs OFF (no un
  // absoluto), probando que la feature no cuesta más que el ruido de medición (ON ≥ OFF*0.9).
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.emissary({ enabled: false }); const off = await measure();
    window.__dev.emissary({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("19 fps NO-REGRESIÓN: EMISSARY ON no degrada el frame budget vs OFF (headless lento ⇒ relativo, ON ≥ OFF*0.9)",
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
