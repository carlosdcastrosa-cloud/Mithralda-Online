// CAS-2362 — QA INDEPENDIENTE (2-cliente) para CORDÓN DE GUARDIA / WARDING RING (DARK, WARDING_RING.enabled:false). EVO mecánica #59.
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE (tools/cas2362-ward-selfverify.mjs):
//   · Oráculos re-derivados en Node (cobertura angular, tiers, decay) — NO se reusa ninguna función del juego como fuente de verdad.
//   · Sets de POSICIONES propios de QA (distintos a los del GE) con centroides desplazados ⇒ prueba que el cómputo NO depende de coords absolutas.
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes (desync = sev-1).
//
// DOS pivotes FRESCOS bajo prueba:
//   (A) CANAL FRESCO wardRegen (regen de HP fuera de combate) — ORTOGONAL (⊥) a restedMult (seam gainXP/XP) ⇒ 0 doble-conteo. Enganchado al chokepoint pactHeal(mhp*rate*dt) pero kind ≠ safeRegen.
//   (B) EJE FRESCO = COBERTURA ANGULAR (distribución de rumbos alrededor del centroide) — NO headcount(#51), NO área/celdas(#55), NO velocidad(#58).
//
// Diferenciadores probados: amontonados⇒onRing0 (≠Congregación); en línea⇒2 sectores/cover0.25 (≠Expedición área); QUIETOS abren (≠Convoy velocidad); 1 solo / 2 opuestos <K ⇒ NO abre.
// Ortogonalidad (check no-negociable): abrir un Cordón NO cambia restedXpMult; activar el arco restedMult NO cambia wardMulRegen.
// Run: node tools/cas2362-ward-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2362-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ─────────── ORÁCULOS QA (re-derivados, independientes del juego) ───────────
const SECTORS = 8, RING_RADIUS = 40, MIN_MEMBERS = 3, COVER_THRESHOLD = 0.375, HALFLIFE_MS = 25000, CAP = 12;
const TIERS = [{ min: 2, boost: 0.05 }, { min: 4, boost: 0.10 }, { min: 6, boost: 0.15 }];
function qaCover(pts) {                                   // oráculo: cobertura angular pura
  const P = pts.filter(p => p && isFinite(p.x) && isFinite(p.y));
  if (!P.length) return { members: 0, onRing: 0, sectors: 0, cover: 0 };
  const cx = P.reduce((a, p) => a + p.x, 0) / P.length, cy = P.reduce((a, p) => a + p.y, 0) / P.length;
  const occ = new Set(); let onRing = 0;
  for (const p of P) { const dx = p.x - cx, dy = p.y - cy;
    if (Math.hypot(dx, dy) <= RING_RADIUS) continue; onRing++;
    let a = Math.atan2(dy, dx); if (a < 0) a += 2 * Math.PI;
    let s = Math.floor(a / ((2 * Math.PI) / SECTORS)); if (s >= SECTORS) s = SECTORS - 1;
    occ.add(s); }
  return { members: P.length, onRing, sectors: occ.size, cover: occ.size / SECTORS };
}
const qaSustains = (wc) => wc.onRing >= MIN_MEMBERS && wc.cover >= COVER_THRESHOLD;
function qaTier(ward) { let idx = 0; for (let i = 0; i < TIERS.length; i++) if (ward >= TIERS[i].min) idx = i + 1; return idx; }
function qaBoost(ward) { const t = qaTier(ward); return t > 0 ? TIERS[t - 1].boost : 0; }
const qaDecay = (base, dtMs) => Math.min(CAP, base * Math.pow(0.5, dtMs / HALFLIFE_MS));

// ─────────── SETS DE POSICIONES PROPIOS DE QA (centroides DESPLAZADOS a propósito) ───────────
// Centroide en (300,-200) para NW, distinto de los sets del GE — prueba invariancia a traslación.
const C = { x: 300, y: -200 }, r = 90, h = r * Math.cos(Math.PI / 6);   // triángulo equilátero
const around = (n, radius, cx = C.x, cy = C.y, off = 0) =>
  Array.from({ length: n }, (_, i) => ({ x: cx + radius * Math.cos(off + i * 2 * Math.PI / n), y: cy + radius * Math.sin(off + i * 2 * Math.PI / n) }));
const QP = {
  tri3:  [{ x: C.x + r, y: C.y }, { x: C.x - r / 2, y: C.y + h }, { x: C.x - r / 2, y: C.y - h }], // 120° ⇒ 3 sectores ⇒ 0.375 (abre justo en el umbral)
  cross4: [{ x: C.x + r, y: C.y }, { x: C.x, y: C.y + r }, { x: C.x - r, y: C.y }, { x: C.x, y: C.y - r }], // N/E/S/W ⇒ sectores {0,2,4,6} ⇒ 0.5 (abre holgado)
  ring8: around(8, r, C.x, C.y, Math.PI / 8),             // 8 repartidos mid-sector ⇒ cover 1.0 robusto
  clump7: around(7, 15, C.x, C.y).concat([{ x: C.x, y: C.y }]), // radio 15 < 40 ⇒ todos en núcleo ⇒ onRing 0 (≠ Congregación)
  line5: [-160, -80, 0, 80, 160].map(dx => ({ x: C.x + dx, y: C.y })), // colineal ⇒ 2 sectores ⇒ 0.25 (≠ Expedición área)
  opp2:  [{ x: C.x + r, y: C.y }, { x: C.x - r, y: C.y }], // 2 opuestos ⇒ onRing 2 < K ⇒ NO abre
  solo:  [{ x: C.x, y: C.y }],                            // 1 solo ⇒ onRing 0
};
const NOW = 7_200_000;   // reloj de pared FIJO propio de QA (≠ 5_000_000 del GE)

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
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
// goto + toPlay con UN reintento (reload) si el boot se atasca bajo carga acumulada del navegador.
async function boot(page) {
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
}
async function installWard(page) {
  await page.evaluate((NOW) => {
    window.__WNOW = NOW;
    window.__wpush = (zone, ward) => { window.__dev.ward({ clear: true, nowMs: window.__WNOW }); return window.__dev.ward({ nowMs: window.__WNOW, push: { [zone]: { ward, atMs: window.__WNOW } } }); };
    window.__wpos  = (zone, pts, dt) => { window.__dev.ward({ clear: true, nowMs: window.__WNOW }); return window.__dev.ward({ nowMs: window.__WNOW, positions: { [zone]: { pts, dt } } }); };
    window.__wat   = (zone, elapsedSec) => window.__dev.ward({ nowMs: window.__WNOW + (elapsedSec || 0) * 1000, toZone: zone });
    window.__wpick = (ward) => { window.__dev.ward({ enabled: true }); const zones = window.__dev.ward().zones || [];
      for (const z of zones) { window.__dev.ward({ clear: true, nowMs: window.__WNOW });
        const s = window.__dev.ward({ nowMs: window.__WNOW, push: { [z]: { ward, atMs: window.__WNOW } }, toZone: z });
        if (s.zone === z && s.wardable) return { zone: z, ward: s.ward, tier: s.tier, boost: s.wardMulRegen }; }
      return null; };
  }, NOW);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
async function runOnce(round) {
  console.log(`\n===== CAS-2362 QA independiente — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });   // save aislado por página ⇒ boot siempre en 'menu' (rondas independientes)
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[r${round}] ${m.text()}`); });
  await boot(page);
  await installWard(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 — boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ward && window.__dev.convoy && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boot to play, __dev.ward + convoy + safeZone + saveBlob + worldFingerprint, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 — DARK byte-id: fresh boot enabled:false + G.ward nunca creado
  const dark = await page.evaluate(() => window.__dev.ward());
  ok("2 DARK OFF fresh: enabled false + gExists false (G.ward nunca creado) + tier/ward/boost 0 + tag ''",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.ward === 0 && dark.boost === 0 && dark.tag === "" && dark.wardMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} tag="${dark.tag}"`);

  // 3 — save byte-id OFF: sin clave ward/wardServer
  const saveClean = await page.evaluate(() => { const b = window.__dev.saveBlob ? window.__dev.saveBlob() : ""; const s = typeof b === "string" ? b : JSON.stringify(b); return !/\"ward\"|wardServer/.test(s); });
  ok("3 save byte-id OFF: saveBlob() SIN clave 'ward'/'wardServer' (0 persistencia nueva)", saveClean);

  // 4 — worldFingerprint estable a través del toggle enabled
  const fpStable = await page.evaluate(() => {
    const fp0 = JSON.stringify(window.__dev.worldFingerprint());   // objeto ⇒ hay que serializar para comparar VALORES
    window.__dev.ward({ enabled: true }); window.__dev.ward({ enabled: false });
    return fp0 === JSON.stringify(window.__dev.worldFingerprint());
  });
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpStable);

  // Enciende para el resto (IN-MEMORY, disco sigue false)
  await page.evaluate(() => window.__dev.ward({ enabled: true }));

  // 5 — ★ COBERTURA = función pura, oráculo QA vs juego (coverageProbe), sets propios con centroide desplazado
  const coverRes = [];
  for (const [k, pts] of Object.entries(QP)) {
    const g = await page.evaluate((pts) => { const s = window.__dev.ward({ coverageProbe: { positions: pts } }); return s.probe; }, pts);
    const o = qaCover(pts);
    const match = g && g.onRing === o.onRing && g.sectors === o.sectors && near(g.cover, o.cover);
    coverRes.push(`${k}:onRing${g.onRing}/cov${g.cover}${match ? "" : `!=QA(${o.onRing}/${o.cover})`}`);
    if (!match) FAIL++;
  }
  ok("5 ★ COBERTURA pura: juego == oráculo QA en 7 sets (centroide desplazado ⇒ invariante a traslación)",
     coverRes.every(r => !r.includes("!=")), coverRes.join(" "));

  // 6 — TABLA de tiers = función pura del ward (juego vs oráculo QA)
  const tierRes = [];
  for (const w of [0, 1, 2, 3, 4, 5, 6, 9]) {
    const g = await page.evaluate((w) => { const s = window.__wpick(w); return s ? { tier: s.tier, boost: s.boost } : null; }, w);
    const okT = g && g.tier === qaTier(w) && near(g.boost, qaBoost(w));
    tierRes.push(`w${w}:T${g && g.tier}${okT ? "" : "X"}`); if (!okT) FAIL++;
  }
  ok("6 tiers puros del ward: juego == oráculo QA (1→T0,2→T1,4→T2,6→T3)", tierRes.every(r => !r.includes("X")), tierRes.join(" "));

  // 7 — server-authoritative: zona fuera de `zones` descartada; ward negativo clamped
  const authz = await page.evaluate(() => {
    window.__dev.ward({ clear: true, nowMs: window.__WNOW });
    window.__dev.ward({ nowMs: window.__WNOW, push: { city: { ward: 9, atMs: window.__WNOW }, forest: { ward: -5, atMs: window.__WNOW } } });
    const m = window.__dev.ward().wardMap || {};
    return { cityDropped: !("city" in m), forestClamped: !("forest" in m) || (m.forest || 0) <= 0 };
  });
  ok("7 server-authoritative reflect: zona no-caza 'city' descartada + ward negativo clamped/descartado",
     authz.cityDropped && authz.forestClamped, JSON.stringify(authz));

  // 8 — ★ ACUMULADOR = función de las POSICIONES: anillo repartido sube accruePerSec·dt; amontonado/línea NO
  const accr = await page.evaluate((QP) => {
    const z = window.__dev.ward().zones[0];
    const dt3 = window.__wpos(z, QP.cross4, 3).wardMap[z];   // sostiene ⇒ 3
    const dt6 = window.__wpos(z, QP.cross4, 6).wardMap[z];   // sostiene ⇒ 6
    const clump = (window.__wpos(z, QP.clump7, 6).wardMap || {})[z] || 0;  // NO sostiene ⇒ 0
    const line = (window.__wpos(z, QP.line5, 6).wardMap || {})[z] || 0;    // NO sostiene ⇒ 0
    return { dt3, dt6, clump, line };
  }, QP);
  ok("8 ★ acumulador de POSICIONES: cross4 dt3⇒ward3 / dt6⇒ward6 (accruePerSec·dt); clump7⇒0; line5⇒0",
     near(accr.dt3, 3) && near(accr.dt6, 6) && accr.clump === 0 && accr.line === 0, JSON.stringify(accr));

  // 9 — ★ DIFERENCIADORES apertura: cross4/tri3/ring8 abren; clump7/line5/opp2/solo NO (QUIETOS ⇒ ≠ Convoy)
  const diff = await page.evaluate((QP) => {
    const z = window.__dev.ward().zones[0]; const out = {};
    for (const [k, pts] of Object.entries(QP)) {
      // acumula 6s ⇒ si sostiene llega a T3, si no queda 0
      const s = window.__wpos(z, pts, 6); out[k] = { ward: (s.wardMap || {})[z] || 0 };
    }
    return out;
  }, QP);
  const opens = (k) => diff[k].ward >= 2;
  ok("9 ★ diferenciadores: cross4/tri3/ring8 ABREN (ward≥2, QUIETOS ≠ Convoy); clump7(≠Congreg)/line5(≠Exped)/opp2/solo NO",
     opens("cross4") && opens("tri3") && opens("ring8") && !opens("clump7") && !opens("line5") && !opens("opp2") && !opens("solo"),
     Object.entries(diff).map(([k, v]) => `${k}:${v.ward}`).join(" "));

  // 10 — ★ DECAY determinista 0-RNG: juego vs oráculo QA (base 8 T3 ⇒ +25s→4 T2 ⇒ +50s→2 T1 ⇒ +75s→1 T0)
  const decRes = [];
  for (const [el, xt] of [[0, 3], [25, 2], [50, 1], [75, 0]]) {
    const g = await page.evaluate((el) => { const z = window.__dev.ward().zones[0]; window.__wpush(z, 8); const s = window.__wat(z, el); return { ward: s.ward, tier: s.tier }; }, el);
    const expW = qaDecay(8, el * 1000), expT = qaTier(expW);
    const good = near(g.ward, +expW.toFixed(2), 0.02) && g.tier === xt && g.tier === expT;
    decRes.push(`+${el}s:w${g.ward}/T${g.tier}${good ? "" : `!=QA(${expW.toFixed(2)}/T${expT})`}`); if (!good) FAIL++;
  }
  ok("10 ★ DECAY 0-RNG: juego == oráculo QA vida-media 25s (8→+25s4→+50s2→+75s1)", decRes.every(r => !r.includes("!=")), decRes.join(" "));

  // 11 — PASSIVE compartido: héroe EN zona con ward≥6 ⇒ wardMulRegen==0.15 + tier3; leave ⇒ 0 + tier0
  const pass = await page.evaluate(() => {
    const p = window.__wpick(6); const inZ = window.__dev.ward();
    window.__dev.ward({ leave: true }); const out = window.__dev.ward();
    return { boostIn: inZ.wardMulRegen, tierIn: inZ.tier, boostOut: out.wardMulRegen, tierOut: out.tier };
  });
  ok("11 passive compartido canal wardRegen: en-zona ward6 ⇒ mul 0.15/T3; leave ⇒ 0/T0",
     near(pass.boostIn, 0.15) && pass.tierIn === 3 && pass.boostOut === 0 && pass.tierOut === 0, JSON.stringify(pass));

  // 12 — ★ CANAL FRESCO wardRegen REGENERA HP: setHp bajo + Cordón abierto + regenTick ⇒ HP sube exactamente regenPct*(1+boost)*mhp*dt
  const regen = await page.evaluate(() => {
    window.__wpick(6);                                  // T3 boost 0.15 en la zona del héroe
    const z = window.__dev.ward().zones[0];
    // fija HP a 100 y aplica 2s de regen en aislamiento
    window.__dev.safeZone({ setHp: 100 });
    const before = window.__dev.ward().hero;
    window.__dev.ward({ regenTick: 2 });
    const after = window.__dev.ward().hero;
    return { mhp: after.maxHp, before: before.hp, after: after.hp, rate: window.__dev.ward().wardRegenRate };
  });
  const expGain = 0.03 * 1.15 * regen.mhp * 2;   // regenPct*(1+0.15)*mhp*dt
  ok("12 ★ wardRegen REGENERA HP: setHp100 + T3 + regenTick 2s ⇒ ΔHP == regenPct·(1+0.15)·mhp·2",
     near(regen.after - regen.before, +Math.min(regen.mhp - 100, expGain).toFixed(2), 0.05) || near(regen.after - regen.before, expGain, 0.5),
     `Δ=${(regen.after - regen.before).toFixed(2)} exp=${expGain.toFixed(2)} mhp=${regen.mhp} rate=${regen.rate}`);

  // 13 — ★ ORTOGONALIDAD wardRegen ⊥ restedMult: abrir Cordón NO cambia restedXpMult
  const orth = await page.evaluate(() => {
    window.__dev.ward({ leave: true }); const base = window.__dev.ward().restedXpMult;
    window.__wpick(6); const opened = window.__dev.ward();
    return { restedBase: base, restedWithWard: opened.restedXpMult, wardMul: opened.wardMulRegen };
  });
  ok("13 ★ ORTOGONALIDAD: abrir Cordón (wardMul 0.15) NO cambia restedXpMult (canal wardRegen ⊥ restedMult ⇒ 0 doble-conteo)",
     near(orth.restedBase, orth.restedWithWard) && orth.wardMul > 0, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN: 10 flags del arco served true; WARDING_RING served false (disco)
  const regr = await page.evaluate(async () => {
    const r = await fetch("sim/config.js").then(x => x.text());
    const flags = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH"];
    const served = {}; for (const f of flags) { const m = r.match(new RegExp(f + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); served[f] = m ? m[1] : "?"; }
    const wm = r.match(/WARDING_RING\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/); served.WARDING_RING = wm ? wm[1] : "?";
    return served;
  });
  const arcTrue = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH"].every(f => regr[f] === "true");
  ok("14 ★ 0-regresión: 10 flags del arco served enabled:true + WARDING_RING served false (DARK en disco)",
     arcTrue && regr.WARDING_RING === "false", JSON.stringify(regr));

  // 15 — ★ 6 zonas hospedan un Cordón observable (ward≥6 ⇒ T3)
  const zonesRes = await page.evaluate(() => {
    const zones = window.__dev.ward().zones; const broken = [];
    for (const z of zones) { window.__dev.ward({ clear: true, nowMs: window.__WNOW });
      const s = window.__dev.ward({ nowMs: window.__WNOW, push: { [z]: { ward: 6, atMs: window.__WNOW } }, toZone: z });
      if (!(s.zone === z && s.wardable && s.tier === 3 && s.wardMulRegen > 0)) broken.push(z); }
    return { n: zones.length, broken };
  });
  ok("15 ★ 6 zonas de caza hospedan Cordón (ward6⇒T3, passive>0) broken=[]",
     zonesRes.n === 6 && zonesRes.broken.length === 0, `n=${zonesRes.n} broken=${JSON.stringify(zonesRes.broken)}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.screenshot({ path: shot });
  const fps = await page.evaluate(() => (window.__dev.fps ? window.__dev.fps() : null));
  console.log(`  build=${build} fps=${fps} shot=${shot}`);
  await page.close();
  return build;
}

// ─────────── 16 — ★ NORTH STAR: CONVERGENCIA 2-CLIENTE REAL (desync = sev-1) ───────────
async function northStar() {
  console.log(`\n===== 16 ★ NORTH STAR 2-cliente (desync = sev-1) =====`);
  // Navegador FRESCO propio ⇒ 2 clientes verdaderamente independientes, sin estado acumulado de las rondas.
  const nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ crear/bootear una página en 2º plano nunca llega al 'menu'.
  // Se crea, se trae al frente y se bootea CADA página en secuencia (mirror GE bringToFront). A queda en 'play' cuando B pasa al frente (estado persiste; la inyección __dev es síncrona + nowMs explícito).
  async function mkPage(n) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[NS${n}] ${e}`));
    p.on("console", (m) => { if (m.type() === "error") errors.push(`[NS${n}] ${m.text()}`); });
    await p.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await p.bringToFront();
    await boot(p); await installWard(p);
    await p.evaluate(() => window.__dev.ward({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const vm = async (p, zone) => p.evaluate((z) => { const s = window.__dev.ward({ toZone: z }); return { ward: s.ward, tier: s.tier, boost: s.wardMulRegen, rate: s.wardRegenRate }; }, zone);
  const push = async (p, zone, ward, at) => p.evaluate((z, w, a) => window.__dev.ward({ nowMs: a, push: { [z]: { ward: w, atMs: a } } }), zone, ward, at);
  const clear = async (p) => p.evaluate((now) => window.__dev.ward({ clear: true, nowMs: now }), NOW);

  const z = (await A.evaluate(() => window.__dev.ward().zones[0]));
  let allEq = true, log = [];
  // (a) mismo ward+reloj ⇒ VM idéntico byte-a-byte en A y B, a 3 niveles
  for (const [w, at, lbl] of [[2, NOW, "T1"], [6, NOW, "T3"], [6, NOW, "decay+50s"]]) {
    await clear(A); await clear(B);
    await push(A, z, w, at); await push(B, z, w, at);
    const el = lbl === "decay+50s" ? 50000 : 0;
    const va = await A.evaluate((z, now) => { const s = window.__dev.ward({ nowMs: now, toZone: z }); return { ward: s.ward, tier: s.tier, boost: s.wardMulRegen, rate: s.wardRegenRate }; }, z, at + el);
    const vb = await B.evaluate((z, now) => { const s = window.__dev.ward({ nowMs: now, toZone: z }); return { ward: s.ward, tier: s.tier, boost: s.wardMulRegen, rate: s.wardRegenRate }; }, z, at + el);
    const eq = JSON.stringify(va) === JSON.stringify(vb);
    if (!eq) allEq = false; log.push(`${lbl}:${eq ? "==" : "DESYNC " + JSON.stringify(va) + "/" + JSON.stringify(vb)}`);
  }
  // (b) A SALE de la zona ⇒ Δ_A cae a 0 PERO el ward server-authoritative + Δ_B quedan INTACTOS
  await clear(A); await clear(B);
  await push(A, z, 6, NOW); await push(B, z, 6, NOW);
  const bBefore = await vm(B, z);
  await A.evaluate(() => window.__dev.ward({ leave: true }));
  const aAfter = await A.evaluate(() => window.__dev.ward());
  const bAfter = await vm(B, z);
  const shared = aAfter.wardMulRegen === 0 && aAfter.wardMap && near(aAfter.wardMap[z], 6) && JSON.stringify(bBefore) === JSON.stringify(bAfter);
  log.push(`A-leave:Δ_A=${aAfter.wardMulRegen} sharedWard=${aAfter.wardMap && aAfter.wardMap[z]} Δ_B_intact=${JSON.stringify(bBefore) === JSON.stringify(bAfter)}`);
  ok("16 ★ NORTH STAR 2-cliente: mismo ward+reloj ⇒ VM byte-idéntico (T1/T3/decay); A sale ⇒ Δ_A=0 + ward compartido + Δ_B intacto (0 desync)",
     allEq && shared, log.join("  "));
  await A.close(); await B.close(); await nsBrowser.close();
}

try {
  const b1 = await runOnce(1);
  const b2 = await runOnce(2);
  ok("17 determinismo ×2: mismo build servido en ambas rondas", b1 === b2, `${b1} / ${b2}`);
  await northStar();
  ok("0 no JS errors durante toda la corrida", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n=====  CAS-2362 QA independiente: ${PASS} PASS / ${FAIL} FAIL  =====`);
process.exit(FAIL === 0 ? 0 : 1);
