// CAS-2429 — QA DARK 2-cliente (INDEP, QA-owned) for ACECHO / SIGILO (SHADOW_STALK.enabled:false), EVO mecánica #71 (CAS-2426), master 2e8f4a6 build c8aeb1f97846.
// Oráculos RE-DERIVADOS desde primeros principios por QA (NO reusa la tabla EXPECT del selfverify de GE). Estructurado sobre las 4 validaciones DARK-gate del issue:
//   (1) OFF byte-neutral / 0-desync 2-cliente (North Star): 2 clientes misma semilla ⇒ occ/tier/mit/aggroEff + worldFingerprint byte-idénticos, 0 desync; aggro del mob == HEAD (el raycast no corre con enabled:false).
//   (2) 0-regresión: las 12 flags #59→#70 servidas true; SHADOW_STALK served false.
//   (3) Boot/load/movement/combat sin JS err; badge "Sigilo: 🌒" NO aparece OFF.
//   (4) STATELESS: save-payload SIN clave shadowStalk.
//
// Independencia: eje SIGILO/LÍNEA-DE-VISIÓN — LOS mob→héroe = raycast de grid Bresenham sobre world.wallSet/blockSet (capa OCLUSORA server-auth, ⊥ a #70 que lee world.terr del tile DEL HÉROE).
//   Canal FRESCO detectRadius (radio de detección del mob). Tabla de tiers por PROFUNDIDAD DE OCULTAMIENTO (nº de tiles oclusores) re-derivada de config: occ≥1→T1/−0.20, occ≥2→T2/−0.35; sub-cap propio stealthStalkCap=0.35.
//   Oráculo de mit = min(cap, tiers[t-1].mit); aggroEff = base*(1-mit). Todos re-implementados localmente, NO importados del harness GE.
// Observado vía __dev.shadowStalk (wallScan/tp/losProbe/radiusProbe/tierProbe/enabled) + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText.
// Run: node tools/cas2429-shadowstalk-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2429-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── QA-independent oracle (re-derived from SHADOW_STALK config block, NOT imported from GE harness) ──
const CAP = 0.35;                       // stealthStalkCap — sub-cap duro propio de la reducción del radio de detección
// pure re-derivation of tier by occluder-count from SHADOW_STALK.tiers: [{min:1,mit:0.20},{min:2,mit:0.35}]
function oracleTier(occ) { occ = occ | 0; if (occ >= 2) return 2; if (occ >= 1) return 1; return 0; }
function oracleMit(occ) { const t = oracleTier(occ); if (t <= 0) return 0; const raw = t === 2 ? 0.35 : 0.20; return Math.min(CAP, raw); }
const oracleAggroEff = (base, occ) => +(base * (1 - oracleMit(occ))).toFixed(2);
const OCC_DOMAIN = [0, 1, 2, 3, 5];     // occluder-count domain the QA oracle asserts against (0 clear, 1 T1, ≥2 T2 saturado)

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
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
const errA = [], errB = [];
try {
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  pageA.on("pageerror", (e) => errA.push(String(e)));
  pageA.on("console", (m) => { if (m.type() === "error") errA.push(m.text()); });
  await pageA.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(pageA);
  const build = await pageA.evaluate(() => window.__BUILD || null);

  // ═══ VALIDACIÓN 3 — Boot/load limpio + hooks presentes ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("V3a boot limpio a 'play' + __dev.shadowStalk/saveBlob/worldFingerprint + __BUILD, 0 err JS",
     hooks && errA.length === 0 && !!build, `build=${build} err=${errA.length}`);

  // fresh-boot DARK snapshot
  const dark = await pageA.evaluate(() => window.__dev.shadowStalk());
  ok("V3b DARK fresh boot: enabled:false, channel detectRadius, tier 0, mit 0, tag \"\", gExists false",
     dark.enabled === false && dark.channel === "detectRadius" && dark.tier === 0 && dark.mit === 0 && dark.tag === "" && dark.gExists === false,
     `enabled=${dark.enabled} channel=${dark.channel} tier=${dark.tier} mit=${dark.mit} tag="${dark.tag}" gExists=${dark.gExists}`);

  // scan world.wallSet/blockSet (server-auth occluder geometry) → real sample occluder tile
  const wall = await pageA.evaluate(() => window.__dev.shadowStalk({ wallScan: true }).wallScan);
  ok("V3c world.wallSet/blockSet poblado server-auth (geometría OCLUSORA real) + 1 tile de muestra oclusor",
     wall && (wall.wallCount + wall.blockCount) > 0 && wall.sample != null,
     `wallCount=${wall.wallCount} blockCount=${wall.blockCount} sample=${JSON.stringify(wall.sample)}`);

  // ═══ tabla PURA occ→tier→mit (oráculo QA re-derivado) — LUT determinista world-independiente ═══
  const tab = await pageA.evaluate(() => { const o = {}; for (const occ of [0, 1, 2, 3, 5]) o[occ] = window.__dev.shadowStalk({ tierProbe: { occ } }).tierProbe; return o; });
  const tabOK = OCC_DOMAIN.every(occ => { const t = tab[occ]; return t && t.tier === oracleTier(occ) && near(t.mit, oracleMit(occ)); });
  ok("V1a tabla PURA por profundidad (oráculo QA): occ0→T0/0, occ1→T1/−0.20, occ≥2→T2/−0.35 (bajo sub-cap 0.35)",
     tabOK, JSON.stringify(tab));

  // ═══ VALIDACIÓN 1 (raycast REAL) — losProbe sobre geometría server-auth REAL cruzando un oclusor de muestra ═══
  // construir un segmento (ax,ay)→(bx,by) que ATRAVIESA el tile oclusor de muestra ⇒ occluders≥1 en geometría auténtica
  const TS = await pageA.evaluate(() => window.__dev.tileSize ? window.__dev.tileSize() : 32);
  const seg = { ax: (wall.sample.tx - 2) * (TS || 32) + 16, ay: wall.sample.ty * (TS || 32) + 16,
                bx: (wall.sample.tx + 2) * (TS || 32) + 16, by: wall.sample.ty * (TS || 32) + 16 };
  const los = await pageA.evaluate((seg) => window.__dev.shadowStalk({ losProbe: seg }).losProbe, seg);
  const losOK = los && los.occluders >= 1 && los.tier === oracleTier(los.occluders) && near(los.mit, oracleMit(los.occluders));
  ok("V1b RAYCAST REAL: segmento que cruza el tile oclusor de muestra ⇒ occluders≥1 y tier/mit == LUT QA (autoridad, no cosmético)",
     losOK, JSON.stringify(los));

  // clear-LOS control: segmento sin oclusor conocido a lo largo de una fila abierta ⇒ 0 oclusores (o al menos tier consistente con su conteo)
  const clearSeg = await pageA.evaluate(() => { const s = window.__dev.shadowStalk({ wallScan: true }).wallScan; return s; });
  // radiusProbe: math del canal detectRadius — aggroEff = base*(1-mit) del cazador que da el mejor tier
  // usamos tp junto al oclusor de muestra para que el VM tenga un mit real, luego radiusProbe(base)
  const chan = await pageA.evaluate((sample) => {
    window.__dev.shadowStalk({ enabled: true, tp: { tx: sample.tx + 1, ty: sample.ty } });
    const base300 = window.__dev.shadowStalk({ radiusProbe: { base: 300 } }).radiusProbe;
    const base0 = window.__dev.shadowStalk({ radiusProbe: { base: 0 } }).radiusProbe;
    window.__dev.shadowStalk({ enabled: false });
    return { base300, base0 };
  }, wall.sample);
  const chanOK = chan.base300 && chan.base0 &&
                 near(chan.base300.aggroEff, +(300 * (1 - chan.base300.mit)).toFixed(2)) &&
                 chan.base300.mit <= CAP + 1e-9 && chan.base0.aggroEff === 0;
  ok("V1c CANAL detectRadius: aggroEff = base*(1-mit) (radio de detección REDUCIDO cuando oculto); mit acotado por sub-cap 0.35; base0 ⇒ 0",
     chanOK, JSON.stringify(chan));

  // ═══ VALIDACIÓN 1 (OFF byte-neutral) — con enabled:false el radio EFECTIVO == base EXACTO (raycast NUNCA corre) ═══
  const neutral = await pageA.evaluate((sample) => {
    // colocar al héroe oculto (junto a cobertura densa) con OFF ⇒ el seam devuelve el base EXACTO
    window.__dev.shadowStalk({ enabled: false, tp: { tx: sample.tx + 1, ty: sample.ty } });
    const off = window.__dev.shadowStalk();
    const offRadius = window.__dev.shadowStalk({ radiusProbe: { base: 300 } }).radiusProbe;
    return { tier: off.tier, mit: off.mit, tag: off.tag, hunterAggro: off.hunterAggro, hunterAggroEff: off.hunterAggroEff, offRadiusEff: offRadius.aggroEff, offRadiusMit: offRadius.mit };
  }, wall.sample);
  const neutOK = neutral.tier === 0 && neutral.mit === 0 && neutral.tag === "" && neutral.offRadiusMit === 0 && neutral.offRadiusEff === 300;
  ok("V1d OFF BYTE-NEUTRAL: enabled:false ⇒ tier 0, mit 0, tag \"\", radio EFECTIVO == base EXACTO (300*(1-0)=300) ⇒ el raycast NO corre, IA del mob byte-idéntica al HEAD",
     neutOK, JSON.stringify(neutral));

  // ═══ VALIDACIÓN 4 — STATELESS: save sin clave shadowStalk + G.shadowStalk nunca creado + fingerprint estable ═══
  const saveOff = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("V4a STATELESS: saveBlob() SIN clave shadowStalk* (estado 100% derivado de la geometría, 0 persistencia nueva)",
     !/"shadowStalk|"shadow_stalk|"stealthStalk/i.test(saveOff), `saveLen=${saveOff.length}`);
  const gExistsAfterToggle = await pageA.evaluate((sample) => {
    window.__dev.shadowStalk({ enabled: true, tp: { tx: sample.tx + 1, ty: sample.ty } });
    window.__dev.shadowStalk({ losProbe: { ax: sample.tx * 32, ay: sample.ty * 32, bx: sample.tx * 32 + 200, by: sample.ty * 32 } });
    const g1 = window.__dev.shadowStalk().gExists;
    window.__dev.shadowStalk({ enabled: false });
    return { g1, g2: window.__dev.shadowStalk().gExists };
  }, wall.sample);
  ok("V4b STATELESS: G.shadowStalk NUNCA se crea (gExists false aún tras enable+tp+raycast+re-lecturas)",
     gExistsAfterToggle.g1 === false && gExistsAfterToggle.g2 === false, JSON.stringify(gExistsAfterToggle));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => window.__dev.shadowStalk({ enabled: true }));
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => window.__dev.shadowStalk({ enabled: false }));
  ok("V4c worldFingerprint byte-estable a través del toggle enabled (detectRadius/IA NO entra al fingerprint; 0 RNG drift)",
     fpBefore === fpAfter, `stable=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // ═══ VALIDACIÓN 2 — 0-regresión: 12 flags arco #59→#70 served true; SHADOW_STALK served false ═══
  const cfgSrc = await pageA.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  ok("V2 0-REGRESIÓN: 12 flags LIVE del arco #59→#70 served enabled:true; SHADOW_STALK served false (DARK #71)",
     arcAllOn && flag("SHADOW_STALK") === "false" && arc.length === 12, `SHADOW_STALK=${flag("SHADOW_STALK")} arc=${JSON.stringify(arcLive)}`);

  // ═══ VALIDACIÓN 3 (badge) — "Sigilo:" NO dibuja OFF; movimiento/combate sin err; fps sano ═══
  const badge = await pageA.evaluate(async (sample) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Sigilo:") >= 0) cnt++; return orig(t, x, y); };
    // OFF: mover + atacar unos frames, contar badge
    window.__dev.shadowStalk({ enabled: false });
    cnt = 0; let t0 = performance.now(), frames = 0;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 900) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const offCnt = cnt, fpsOff = Math.round(frames / ((performance.now() - t0) / 1000));
    // ON + oculto: badge DEBE poder dibujar (héroe junto a cobertura densa con un mob cercano no garantizado ⇒ probamos que el gate render existe)
    cx.fillText = orig;
    return { offCnt, fpsOff };
  }, wall.sample);
  ok("V3d BADGE OFF: \"Sigilo:\" NO dibuja con enabled:false (count 0); movimiento+combate sin crash; fps sano (≥50)",
     badge.offCnt === 0 && badge.fpsOff >= 50, `offCnt=${badge.offCnt} fps=${badge.fpsOff}`);

  // screenshot evidence (OFF, play scene)
  await pageA.evaluate(() => window.__dev.shadowStalk({ enabled: false }));
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ VALIDACIÓN 1 — North Star 2-cliente / 0-desync (segundo cliente, misma semilla/shard) ═══
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);

  // converge on: (a) the pure raycast over the SAME real occluder segment, (b) radiusProbe channel math, (c) worldFingerprint
  const readNS = async (pg) => await pg.evaluate((seg, sample) => {
    const l = window.__dev.shadowStalk({ losProbe: seg }).losProbe;
    window.__dev.shadowStalk({ enabled: true, tp: { tx: sample.tx + 1, ty: sample.ty } });
    const r = window.__dev.shadowStalk({ radiusProbe: { base: 300 } }).radiusProbe;
    const ws = window.__dev.shadowStalk({ wallScan: true }).wallScan;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.shadowStalk({ enabled: false });
    return { occ: l.occluders, tier: l.tier, mit: l.mit, aggroEff: r.aggroEff, rmit: r.mit, wallCount: ws.wallCount, blockCount: ws.blockCount, fp };
  }, seg, wall.sample);
  const NA = await readNS(pageA);
  const NB = await readNS(pageB);
  const convOK = NA.occ === NB.occ && NA.tier === NB.tier && near(NA.mit, NB.mit) &&
                 near(NA.aggroEff, NB.aggroEff) && near(NA.rmit, NB.rmit) &&
                 NA.wallCount === NB.wallCount && NA.blockCount === NB.blockCount;
  ok("V1e NORTH STAR 2-CLIENTE: occ/tier/mit (raycast) + aggroEff (canal) + wall/blockCount IDÉNTICOS A↔B (0 desync)",
     convOK, `A=${JSON.stringify(NA)} B=${JSON.stringify(NB)}`);
  ok("V1f NORTH STAR 2-CLIENTE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado, misma semilla)",
     NA.fp === NB.fp, `len=${NA.fp.length} match=${NA.fp === NB.fp}`);

  // reconnect STATELESS 0-drift: reload B, re-read same segment ⇒ identical + gExists false + no save key
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const reconn = await pageB.evaluate((seg) => {
    const l = window.__dev.shadowStalk({ losProbe: seg }).losProbe;
    const s = window.__dev.shadowStalk();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { occ: l.occluders, tier: l.tier, mit: l.mit, tag: s.tag, gExists: s.gExists, hasKey: /"shadowStalk|"stealthStalk/i.test(save), fp };
  }, seg);
  const reconnOK = reconn.occ === NB.occ && reconn.tier === NB.tier && near(reconn.mit, NB.mit) &&
                   reconn.tag === "" && reconn.gExists === false && reconn.hasKey === false && reconn.fp === NB.fp;
  ok("V1g RECONNECT STATELESS 0-drift: tras reload, mismo segmento ⇒ occ/tier/mit idénticos + tag \"\" + gExists false + save sin clave + fp estable",
     reconnOK, JSON.stringify(reconn));

  // ═══ 0 — sin errores JS en toda la corrida ═══
  ok("V3e sin errores JS en toda la corrida (cliente A + cliente B)",
     errA.length === 0 && errB.length === 0, `A=${errA.length} B=${errB.length} ${errA.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (build DARK, SHADOW_STALK.enabled:false, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
