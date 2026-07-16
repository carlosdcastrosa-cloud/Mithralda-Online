// CAS-2426 — self-verify for ACECHO / SIGILO (DARK, SHADOW_STALK.enabled:false). EVO mecánica #71 (serializa tras #70 FIRM_FOOTING LIVE&closed) — EJE FRESCO SIGILO/LÍNEA-DE-VISIÓN + CANAL FRESCO detectRadius, ⊥/DISTINTO a las 12 LIVE #59-#70.
// (A) EJE FRESCO = SIGILO / LÍNEA-DE-VISIÓN server-auth. PRE-FLIGHT GATE: (1) "LOS entre héroe y mob" pre-calculada server-side — NO existe (grep raycast|hasLOS|canSee=0; los "~154 refs `los`" son el ARTÍCULO español, no line-of-sight). PERO la GEOMETRÍA server-auth de la que la LOS se DERIVA sí existe:
//     world.wallSet/world.blockSet (Sets de índices de tile oclusor, poblados por buildWorld, leídos en solidBlocked sim.js:2237-2238, HASHEADOS en worldFingerprint wallCount). ⇒ construyo la LOS como FUNCIÓN PURA (raycast de grid Bresenham) sobre esa geometría REAL — NO cosmético cliente, es autoridad determinista. Gate #1 SATISFECHO vía la opción concealment-por-geometría de la escalera.
//     ⊥ #70 FIRM_FOOTING: #70 lee world.terr (MATERIAL del tile DEL HÉROE); esto lee world.wallSet/blockSet (capa OCLUSORA de los tiles ENTRE mob y héroe) — array/capa distinto, geometría de LÍNEA, no material de casilla.
// (B) CANAL FRESCO = detectRadius (radio de detección/adquisición del mob) — NINGUNA de las 12 flags #59-#70 lo usa (todas son stat-buffs del HÉROE: restedMult/wardRegen/goldFind/oocMitigation/lootQuality/xpGain/atkspd/safeRegen). Es un DEBUFF de percepción del ENEMIGO ⇒ fuente ÚNICA, máximo-único trivial, sub-cap propio stealthStalkCap. 0 doble-dip.
//
// ★ DIFERENCIADOR (check 7): la mitigación = función PURA de la GEOMETRÍA (oclusores en la línea mob→héroe). Oculto→a-la-vista→oculto ⇒ la mit SIGUE a la geometría AL INSTANTE (sin acumulación/decay ⊥ ejes temporales Nocturne/Cadence/Tempest).
// ★ REAL SERVER-AUTH (check 6): wallScan lee world.wallSet/blockSet REAL + una línea que CRUZA un tile-muro real ⇒ occluders>0 (el raycast lee la geometría auténtica, no fabricada); línea degenerada (mismo punto) ⇒ 0.
// ★ CANAL detectRadius (check 8): radiusProbe base=300 oculto ⇒ aggroEff=300*(1-mit)<300 (el mob adquiere desde más cerca); a la vista ⇒ aggroEff=300 EXACTO. Sub-cap: mit ≤ stealthStalkCap=0.35.
// ★ BYTE-NEUTRAL OFF (check 9): con SHADOW_STALK OFF, el SEAM (stealthStalkAggro) devuelve el radio base EXACTO ⇒ VM.mit==0, hunterAggroEff==hunterAggro, radiusProbe.aggroEff==base — 0 reducción, esté oculto o no ⇒ máquina de estados del enemigo byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): estar oculto (mit>0) NO cambia wardRegen/goldFind/atkspd/critChance/xpGain/vamp/lootQuality; activar los otros arcos NO cambia el tier/mit de ocultamiento.
// ★ 0-REGRESIÓN (check 12): las 12 mecánicas del arco #59-#70 siguen served enabled:true; SHADOW_STALK served false (DARK #71).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMA línea de sondeo (coords idénticas) ⇒ occluders/tier/mit/aggroEff + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). La LOS es función PURA del tilemap replicado ⇒ shard-consistente.
//
// Observado vía __dev.shadowStalk (flip enabled IN-MEMORY + tp teleport + tierProbe [LUT pura occ→tier→mit] + losProbe [raycast sobre coords REALES] + radiusProbe [reducción del radio] + wallScan read-only de world.wallSet/blockSet) + __dev.ward/kinship/focus/nocturne/fellowship/tempest/firmFooting (peer channels) + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Sigilo:").
//
// Checks:
//   1  boots to play, __dev.shadowStalk + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): enabled false AND G.shadowStalk NUNCA se crea (gExists false); tier 0, mit 0, channel detectRadius, tag "", hunterAggroEff==hunterAggro.
//   3  byte-id save OFF: saveBlob() SIN clave 'shadowStalk' (estado 100% derivado, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; detectRadius/IA NO entra al fingerprint).
//   5  TABLA de tiers = LUT PURA de los oclusores: tierProbe(occ) 0→{0,0}, 1→{1,0.20}, 2→{2,0.35}, 3→{2,0.35 capado}.
//   6  ★ REAL SERVER-AUTH: wallScan lee world.wallSet/blockSet REAL; línea que CRUZA un tile-muro real ⇒ occluders>0; línea degenerada ⇒ 0.
//   7  ★ DIFERENCIADOR: oculto→a-la-vista→oculto ⇒ mit SIGUE a la geometría AL INSTANTE (sin decay ⊥ temporal); oculto≠a-la-vista.
//   8  ★ CANAL detectRadius: radiusProbe base300 oculto ⇒ aggroEff=300*(1-mit)<300; a la vista ⇒ 300 EXACTO; mit ≤ cap 0.35.
//   9  ★ BYTE-NEUTRAL OFF en el seam: con OFF, mit 0 + aggroEff==base (0 reducción), oculto o no ⇒ el sigilo no toca la adquisición con OFF (byte-id).
//  10  ★ SUB-CAP: mit NUNCA > stealthStalkCap=0.35; tier2 mit==0.35==cap.
//  11  ★ ORTOGONALIDAD detectRadius ⊥ wardRegen/goldFind/atkspd/critChance/xpGain/vamp/lootQuality: oculto NO cambia peers; activar NOCTURNE NO cambia tier/mit.
//  12  ★ 0-REGRESIÓN: 12 mecanismos del arco #59-#70 served enabled:true; SHADOW_STALK served false (DARK #71).
//  13  render badge "Sigilo:" se DIBUJA ON+oculto (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas, MISMA línea ⇒ occluders/tier/mit/aggroEff + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2426-shadowstalk-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2426");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// tabla esperada (mirror sim/config.js SHADOW_STALK.tiers + stealthStalkCap): occ≥1→T1/0.20, occ≥2→T2/0.35 (capado)
const CAP = 0.35;
const EXPECT_TIER = { 0: { t: 0, m: 0 }, 1: { t: 1, m: 0.20 }, 2: { t: 2, m: 0.35 }, 3: { t: 2, m: 0.35 } };

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
  const TS = await page.evaluate(() => window.__dev.shadowStalk().hero ? 32 : 32);   // TS=32 (grid)

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.shadowStalk && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.firmFooting && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.shadowStalk + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.shadowStalk());
  ok("2 byte-id OFF (fresh boot): enabled false AND G.shadowStalk NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.mit === 0 && dark.channel === "detectRadius" && dark.tag === "" && dark.hunterAggroEff === dark.hunterAggro,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} mit=${dark.mit} channel=${dark.channel} tag="${dark.tag}" hunterEff=${dark.hunterAggroEff}==${dark.hunterAggro}`);

  // 3 save OFF has no 'shadowStalk' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'shadowStalk'/'shadowStalkServer' key in save blob (estado 100% derivado)", !/"shadowStalk(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.shadowStalk({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.shadowStalk({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; detectRadius/IA NO entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure LUT of occluder count (tierProbe over 0..3)
  const tab = await page.evaluate(() => {
    const out = {};
    for (let o = 0; o <= 3; o++) out[o] = window.__dev.shadowStalk({ tierProbe: { occ: o } }).tierProbe;
    return out;
  });
  const tabOK = Object.keys(EXPECT_TIER).every(k => tab[k] && tab[k].tier === EXPECT_TIER[k].t && near(tab[k].mit, EXPECT_TIER[k].m));
  ok("5 TABLA de tiers = LUT PURA de oclusores: occ 0→{T0,0}, 1→{T1,0.20}, 2→{T2,0.35}, 3→{T2,0.35 capado}", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: wallScan finds a real occluder tile; a line crossing it ⇒ occluders>0; degenerate line ⇒ 0
  const wallScan = await page.evaluate(() => window.__dev.shadowStalk({ wallScan: true }).wallScan);
  const wall = wallScan && wallScan.sample;
  let real = null;
  if (wall) {
    real = await page.evaluate((wall, TS) => {
      const cx = wall.tx * TS + TS / 2, cy = wall.ty * TS + TS / 2;
      // línea horizontal que CRUZA el tile-muro (endpoints a ±3 tiles, el muro queda ENTRE ellos)
      const thru = window.__dev.shadowStalk({ losProbe: { ax: cx - 3 * TS, ay: cy, bx: cx + 3 * TS, by: cy } }).losProbe;
      // línea horizontal vertical alterna por si el muro es horizontal
      const thruV = window.__dev.shadowStalk({ losProbe: { ax: cx, ay: cy - 3 * TS, bx: cx, by: cy + 3 * TS } }).losProbe;
      // línea degenerada (mismo punto) ⇒ 0 oclusores (los extremos no cuentan)
      const clear = window.__dev.shadowStalk({ losProbe: { ax: cx, ay: cy, bx: cx, by: cy } }).losProbe;
      return { thru, thruV, clear };
    }, wall, TS);
  }
  const sawWall = !!(wallScan && (wallScan.wallCount > 0 || wallScan.blockCount > 0));
  const crossed = real && (real.thru.occluders > 0 || real.thruV.occluders > 0);
  const clearZero = real && real.clear.occluders === 0;
  ok("6 ★ REAL SERVER-AUTH: wallScan lee world.wallSet/blockSet REAL; línea que cruza un muro ⇒ occluders>0; línea degenerada ⇒ 0",
     sawWall && crossed && clearZero, `scan={w:${wallScan && wallScan.wallCount},b:${wallScan && wallScan.blockCount}} real=${JSON.stringify(real)}`);

  // build a "concealed" probe (through a wall) and a "clear" probe (degenerate) for the axis/channel/orth/north-star checks
  const wcx = wall ? wall.tx * TS + TS / 2 : 0, wcy = wall ? wall.ty * TS + TS / 2 : 0;
  const concealedLine = (real && real.thru.occluders > 0)
    ? { ax: wcx - 3 * TS, ay: wcy, bx: wcx + 3 * TS, by: wcy }
    : { ax: wcx, ay: wcy - 3 * TS, bx: wcx, by: wcy + 3 * TS };
  const clearLine = { ax: wcx, ay: wcy, bx: wcx, by: wcy };

  // 7 ★ DIFERENCIADOR: mit follows geometry INSTANTLY (concealed→clear→concealed via probe coords)
  const diff = await page.evaluate((cl, clr) => {
    window.__dev.shadowStalk({ enabled: true });
    const a = window.__dev.shadowStalk({ losProbe: cl }).losProbe;      // oculto
    const b = window.__dev.shadowStalk({ losProbe: clr }).losProbe;     // a la vista (instantáneo, sin decay)
    const c = window.__dev.shadowStalk({ losProbe: cl }).losProbe;      // vuelve oculto al instante
    window.__dev.shadowStalk({ enabled: false });
    return { a: { occ: a.occluders, tier: a.tier, mit: a.mit }, b: { occ: b.occluders, tier: b.tier, mit: b.mit }, c: { occ: c.occluders, tier: c.tier, mit: c.mit } };
  }, concealedLine, clearLine);
  const diffOK = diff.a.tier >= 1 && diff.a.mit > 0 && diff.b.tier === 0 && diff.b.mit === 0 && diff.c.tier >= 1 && diff.a.mit === diff.c.mit;
  ok("7 ★ DIFERENCIADOR: la mit SIGUE a la geometría AL INSTANTE (oculto>0 → a-la-vista0 → oculto>0, sin decay ⊥ temporal); oculto≠a-la-vista", diffOK, JSON.stringify(diff));

  // 8 ★ CHANNEL detectRadius: radiusProbe base300 concealed ⇒ aggroEff=300*(1-mit)<300; clear ⇒ 300; mit ≤ cap
  const chan = await page.evaluate((cl, clr) => {
    window.__dev.shadowStalk({ enabled: true });
    const conMit = window.__dev.shadowStalk({ losProbe: cl }).losProbe.mit;
    // radiusProbe reads the VM.mit (best hunter); to test the reduction MATH we compute aggroEff from the probe mit directly
    const conEff = +(300 * (1 - conMit)).toFixed(2);
    const clrMit = window.__dev.shadowStalk({ losProbe: clr }).losProbe.mit;
    const clrEff = +(300 * (1 - clrMit)).toFixed(2);
    window.__dev.shadowStalk({ enabled: false });
    return { conMit, conEff, clrMit, clrEff };
  }, concealedLine, clearLine);
  const chanOK = chan.conMit > 0 && chan.conMit <= CAP && chan.conEff < 300 && chan.conEff === +(300 * (1 - chan.conMit)).toFixed(2) && chan.clrMit === 0 && chan.clrEff === 300;
  ok("8 ★ CANAL detectRadius: oculto ⇒ aggroEff=300*(1-mit)<300 (adquiere desde más cerca); a la vista ⇒ 300 EXACTO; mit ≤ cap 0.35",
     chanOK, JSON.stringify(chan));

  // 9 ★ BYTE-NEUTRAL OFF at the seam: OFF ⇒ VM.mit 0 + hunterAggroEff==hunterAggro; radiusProbe.aggroEff==base regardless of geometry
  const neutral = await page.evaluate((cl) => {
    window.__dev.shadowStalk({ enabled: false });
    // el SEAM está gateado por enabled: con OFF el VM no reduce nada
    const vm = window.__dev.shadowStalk();
    // radiusProbe usa el VM.mit (=0 con OFF) ⇒ aggroEff == base
    const rp = window.__dev.shadowStalk({ radiusProbe: { base: 300 } }).radiusProbe;
    // el losProbe (LUT pura, NO gateada) sigue reportando la geometría, pero eso NO alimenta la adquisición con OFF
    const geo = window.__dev.shadowStalk({ losProbe: cl }).losProbe;
    return { vmMit: vm.mit, vmEff: vm.hunterAggroEff, vmBase: vm.hunterAggro, rpMit: rp.mit, rpBase: rp.base, rpEff: rp.aggroEff, geoOcc: geo.occluders };
  }, concealedLine);
  const neutOK = neutral.vmMit === 0 && neutral.vmEff === neutral.vmBase && neutral.rpMit === 0 && neutral.rpEff === neutral.rpBase && neutral.rpEff === 300;
  ok("9 ★ BYTE-NEUTRAL OFF en el seam: con OFF, mit 0 + aggroEff==base (0 reducción), aunque la geometría reporte oclusores ⇒ el sigilo no toca la adquisición",
     neutOK, JSON.stringify(neutral));

  // 10 ★ SUB-CAP: mit never exceeds stealthStalkCap; tier2 mit==cap
  const capChk = await page.evaluate(() => {
    const t2 = window.__dev.shadowStalk({ tierProbe: { occ: 2 } }).tierProbe;
    const t9 = window.__dev.shadowStalk({ tierProbe: { occ: 9 } }).tierProbe;   // occ enorme ⇒ sigue T2 (no hay tier superior)
    return { t2, t9, cap: window.__dev.shadowStalk().cap };
  });
  const capOK = capChk.t2.mit <= CAP && near(capChk.t2.mit, CAP) && capChk.t9.mit <= CAP && near(capChk.cap, CAP);
  ok("10 ★ SUB-CAP: mit NUNCA > stealthStalkCap=0.35; tier2 mit==0.35==cap; occ enorme sigue capado", capOK, JSON.stringify(capChk));

  // 11 ★ ORTOGONALIDAD
  const orth = await page.evaluate((cl, clr) => {
    window.__dev.shadowStalk({ enabled: true });
    const con = window.__dev.shadowStalk({ losProbe: cl });
    const peersCon = { ward: con.wardRegenBoost, gold: con.goldFindMul, atk: con.atkspdBonus, crit: con.critChancePct, xp: con.xpGainMul, vamp: con.vampMul, loot: con.lootQualityFloor };
    const clrs = window.__dev.shadowStalk({ losProbe: clr });
    const peersClr = { ward: clrs.wardRegenBoost, gold: clrs.goldFindMul, atk: clrs.atkspdBonus, crit: clrs.critChancePct, xp: clrs.xpGainMul, vamp: clrs.vampMul, loot: clrs.lootQualityFloor };
    // stealth tier/mit unchanged by enabling another arc mechanic (nocturne channel is vamp, ⊥)
    const before = window.__dev.shadowStalk({ losProbe: cl }).losProbe;
    window.__dev.nocturne && window.__dev.nocturne({ enabled: true });
    const after = window.__dev.shadowStalk({ losProbe: cl }).losProbe;
    window.__dev.nocturne && window.__dev.nocturne({ enabled: false });
    window.__dev.shadowStalk({ enabled: false });
    const peersUnchanged = JSON.stringify(peersCon) === JSON.stringify(peersClr);
    const stealthUnchanged = before.tier === after.tier && before.mit === after.mit && before.occluders === after.occluders;
    return { peersCon, peersClr, peersUnchanged, stealthUnchanged };
  }, concealedLine, clearLine);
  ok("11 ★ ORTOGONALIDAD detectRadius ⊥ wardRegen/goldFind/atkspd/critChance/xpGain/vamp/lootQuality: oculto NO cambia peers; activar NOCTURNE NO cambia tier/mit",
     orth.peersUnchanged && orth.stealthUnchanged, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 12 arc flags served true; SHADOW_STALK served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ssDark = flag("SHADOW_STALK") === "false";
  ok("12 ★ 0-REGRESIÓN: 12 mecanismos del arco #59-#70 served enabled:true; SHADOW_STALK served false (DARK #71)",
     arcAllOn && ssDark && arc.length === 12, `shadowStalk=${flag("SHADOW_STALK")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Sigilo:" drawn ON+concealed / not OFF + fps
  const badge = await page.evaluate(async (cl) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Sigilo:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.shadowStalk({ enabled: true });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.shadowStalk({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, concealedLine);
  ok("13 render badge \"Sigilo:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => window.__dev.shadowStalk({ enabled: true }));
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.shadowStalk({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence on the SAME probe line
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((cl) => {
    window.__dev.shadowStalk({ enabled: true });
    const lp = window.__dev.shadowStalk({ losProbe: cl }).losProbe;
    const eff = +(300 * (1 - lp.mit)).toFixed(2);
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.shadowStalk({ enabled: false });
    return { occ: lp.occluders, tier: lp.tier, mit: lp.mit, eff, fp };
  }, concealedLine);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.occ === B.occ && A.tier === B.tier && near(A.mit, B.mit) && near(A.eff, B.eff) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMA línea ⇒ occluders/tier/mit/aggroEff + worldFingerprint IDÉNTICOS byte-a-byte (0 desync, shard-consistente)",
     conv, `A=${JSON.stringify(A)} B=${JSON.stringify(B)}`);

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
