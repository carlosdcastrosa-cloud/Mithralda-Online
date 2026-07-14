// CAS-2366 — QA INDEPENDIENTE POST-FLIP (2-cliente) para CORDÓN DE GUARDIA / WARDING RING **LIVE** (WARDING_RING.enabled:true, flip CAS-2365). EVO mecánica #59.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local.
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2362-ward-{selfverify,live-observable-qa}.mjs):
//   · Oráculos re-derivados en Node (cobertura angular, tiers, decay) — NO se reusa ninguna función del juego como fuente de verdad.
//   · Sets de POSICIONES propios de QA (distintos a los del GE) con centroides desplazados ⇒ prueba que el cómputo NO depende de coords absolutas.
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT ce3717254190 (flip CAS-2365) y AVANZÓ del pre-flip c3cac4d5d50a (EVO#58 CONVOY_MARCH flip).
//   (2) WARDING_RING served enabled:TRUE (ya no false) + 10 flags del arco served true (0-regresión) ⇒ 11 flags true LIVE.
//   (3) DEFAULT-ON: ward().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave + fingerprint estable).
//   (4) canal FRESCO wardRegen REGENERA HP en el build LIVE; ORTOGONALIDAD wardRegen ⊥ restedMult (0 doble-conteo) confirmada contra el served.
//
// DOS pivotes FRESCOS bajo prueba: (A) CANAL wardRegen (regen HP fuera de combate) ⊥ restedMult (seam gainXP/XP). (B) EJE COBERTURA ANGULAR (rumbos alrededor del centroide).
// Diferenciadores LIVE: amontonados⇒onRing0 (≠Congregación); en línea⇒cover 0.25 (≠Frontier área); QUIETOS repartidos⇒abren (≠Convoy velocidad); 1 solo / 2 mismo lado <K ⇒ NO abre.
// Run: node tools/cas2366-ward-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2366-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "ce3717254190";   // build deployado por el flip CAS-2365 (== version.json esperado)
const PREFLIP = "c3cac4d5d50a";        // build servido ANTES del flip (EVO#58 CONVOY_MARCH flip CAS-2359) — el LIVE debe AVANZAR de este

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
function qaTier(ward) { let idx = 0; for (let i = 0; i < TIERS.length; i++) if (ward >= TIERS[i].min) idx = i + 1; return idx; }
function qaBoost(ward) { const t = qaTier(ward); return t > 0 ? TIERS[t - 1].boost : 0; }
const qaDecay = (base, dtMs) => Math.min(CAP, base * Math.pow(0.5, dtMs / HALFLIFE_MS));

// ─────────── SETS DE POSICIONES PROPIOS DE QA (centroides DESPLAZADOS a propósito) ───────────
const C = { x: -420, y: 260 }, r = 90, h = r * Math.cos(Math.PI / 6);   // centroide SE, distinto de GE (5M) y DARK QA (300,-200)
const around = (n, radius, cx = C.x, cy = C.y, off = 0) =>
  Array.from({ length: n }, (_, i) => ({ x: cx + radius * Math.cos(off + i * 2 * Math.PI / n), y: cy + radius * Math.sin(off + i * 2 * Math.PI / n) }));
const QP = {
  tri3:  [{ x: C.x + r, y: C.y }, { x: C.x - r / 2, y: C.y + h }, { x: C.x - r / 2, y: C.y - h }], // 120° ⇒ 3 sectores ⇒ 0.375 (abre justo en el umbral)
  cross4: [{ x: C.x + r, y: C.y }, { x: C.x, y: C.y + r }, { x: C.x - r, y: C.y }, { x: C.x, y: C.y - r }], // N/E/S/W ⇒ sectores {0,2,4,6} ⇒ 0.5 (abre holgado)
  ring8: around(8, r, C.x, C.y, Math.PI / 8),             // 8 repartidos mid-sector ⇒ cover 1.0 robusto
  clump7: around(7, 15, C.x, C.y).concat([{ x: C.x, y: C.y }]), // radio 15 < 40 ⇒ todos en núcleo ⇒ onRing 0 (≠ Congregación)
  line5: [-160, -80, 0, 80, 160].map(dx => ({ x: C.x + dx, y: C.y })), // colineal ⇒ 2 sectores ⇒ 0.25 (≠ Frontier área)
  opp2:  [{ x: C.x + r, y: C.y }, { x: C.x - r, y: C.y }], // 2 mismo eje/opuestos ⇒ onRing 2 < K ⇒ NO abre
  solo:  [{ x: C.x, y: C.y }],                            // 1 solo ⇒ onRing 0
};
const NOW = 8_100_000;   // reloj de pared FIJO propio de QA (≠ 5M GE, ≠ 7.2M DARK QA)

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 40000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAWard";
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
async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installWard(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];
async function runOnce(round) {
  console.log(`\n===== CAS-2366 QA POST-FLIP LIVE — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[r${round}] ${m.text()}`); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(`[r${round}] ${rq.url()}`); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(`[r${round}] ${rp.url()}`); });
  await page.bringToFront();
  await boot(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // config servido (una vez) — 10 flags arco served true + WARDING_RING.enabled:true
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const wardServed = en("WARDING_RING");

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + WARDING_RING served true + 10 arco true + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ward && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.ward+arc hooks; served WARDING_RING.enabled:true + 10 flags arco true (0 regr); 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && wardServed === "true" && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} WARDING_RING=${wardServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: ward().enabled===true (el flip cargó) + passive 0 sin anillo; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.ward(); return { enabled: s.enabled, mul: s.wardMulRegen, tier: s.tier, ward: s.ward }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint());
    window.__dev.ward({ enabled: false, leave: true });
    const s = window.__dev.ward();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint());
    window.__dev.ward({ enabled: true });                                            // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.wardMulRegen, tag: s.tag, tier: s.tier, saveNoKey: !/["']ward["']|wardServer/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: ward().enabled===true (flip cargó) + passive 0 sin anillo; byte-id OFF (toggle): enabled false ⇒ mul 0 + tag \"\" + save SIN clave ward + fingerprint estable",
     dOn.enabled === true && dOn.mul === 0 && dOn.tier === 0 && dOn.ward === 0 &&
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installWard(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.ward({ enabled: true }));

  // 5 — ★ COBERTURA = función pura, oráculo QA vs juego (coverageProbe), sets propios con centroide desplazado
  const coverRes = [];
  for (const [k, pts] of Object.entries(QP)) {
    const g = await page.evaluate((pts) => { const s = window.__dev.ward({ coverageProbe: { positions: pts } }); return s.probe; }, pts);
    const o = qaCover(pts);
    const match = g && g.onRing === o.onRing && g.sectors === o.sectors && near(g.cover, o.cover);
    coverRes.push(`${k}:onRing${g && g.onRing}/cov${g && g.cover}${match ? "" : `!=QA(${o.onRing}/${o.cover})`}`);
    if (!match) FAIL++;
  }
  ok("5 ★ COBERTURA pura LIVE: juego == oráculo QA en 7 sets (centroide desplazado ⇒ invariante a traslación)",
     coverRes.every(r => !r.includes("!=")), coverRes.join(" "));

  // 6 — TABLA de tiers = función pura del ward (juego vs oráculo QA)
  const tierRes = [];
  for (const w of [0, 1, 2, 3, 4, 5, 6, 9]) {
    const g = await page.evaluate((w) => { const s = window.__wpick(w); return s ? { tier: s.tier, boost: s.boost } : null; }, w);
    const okT = g && g.tier === qaTier(w) && near(g.boost, qaBoost(w));
    tierRes.push(`w${w}:T${g && g.tier}${okT ? "" : "X"}`); if (!okT) FAIL++;
  }
  ok("6 tiers puros del ward LIVE: juego == oráculo QA (1→T0,2→T1,4→T2,6→T3)", tierRes.every(r => !r.includes("X")), tierRes.join(" "));

  // 7 — server-authoritative: zona fuera de `zones` descartada; ward negativo clamped
  const authz = await page.evaluate(() => {
    window.__dev.ward({ clear: true, nowMs: window.__WNOW });
    window.__dev.ward({ nowMs: window.__WNOW, push: { city: { ward: 9, atMs: window.__WNOW }, forest: { ward: -5, atMs: window.__WNOW } } });
    const m = window.__dev.ward().wardMap || {};
    return { cityDropped: !("city" in m), forestClamped: !("forest" in m) || (m.forest || 0) <= 0 };
  });
  ok("7 server-authoritative reflect LIVE: zona no-caza 'city' descartada + ward negativo clamped/descartado",
     authz.cityDropped && authz.forestClamped, JSON.stringify(authz));

  // 8 — ★ ACUMULADOR = función de las POSICIONES: anillo repartido sube accruePerSec·dt; amontonado/línea NO
  const accr = await page.evaluate((QP) => {
    const z = window.__dev.ward().zones[0];
    const dt3 = window.__wpos(z, QP.cross4, 3).wardMap[z];
    const dt6 = window.__wpos(z, QP.cross4, 6).wardMap[z];
    const clump = (window.__wpos(z, QP.clump7, 6).wardMap || {})[z] || 0;
    const line = (window.__wpos(z, QP.line5, 6).wardMap || {})[z] || 0;
    return { dt3, dt6, clump, line };
  }, QP);
  ok("8 ★ acumulador de POSICIONES LIVE: cross4 dt3⇒ward3 / dt6⇒ward6 (accruePerSec·dt); clump7⇒0; line5⇒0",
     near(accr.dt3, 3) && near(accr.dt6, 6) && accr.clump === 0 && accr.line === 0, JSON.stringify(accr));

  // 9 — ★ DIFERENCIADORES apertura: cross4/tri3/ring8 abren; clump7/line5/opp2/solo NO (QUIETOS ⇒ ≠ Convoy)
  const diff = await page.evaluate((QP) => {
    const z = window.__dev.ward().zones[0]; const out = {};
    for (const [k, pts] of Object.entries(QP)) { const s = window.__wpos(z, pts, 6); out[k] = { ward: (s.wardMap || {})[z] || 0 }; }
    return out;
  }, QP);
  const opens = (k) => diff[k].ward >= 2;
  ok("9 ★ diferenciadores LIVE: cross4/tri3/ring8 ABREN (ward≥2, QUIETOS ≠ Convoy); clump7(≠Congreg)/line5(≠Frontier)/opp2/solo NO",
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
  ok("10 ★ DECAY 0-RNG LIVE: juego == oráculo QA vida-media 25s (8→+25s4→+50s2→+75s1)", decRes.every(r => !r.includes("!=")), decRes.join(" "));

  // 11 — PASSIVE compartido: héroe EN zona con ward≥6 ⇒ wardMulRegen==0.15 + tier3; leave ⇒ 0 + tier0
  const pass = await page.evaluate(() => {
    const p = window.__wpick(6); const inZ = window.__dev.ward();
    window.__dev.ward({ leave: true }); const out = window.__dev.ward();
    return { boostIn: inZ.wardMulRegen, tierIn: inZ.tier, boostOut: out.wardMulRegen, tierOut: out.tier };
  });
  ok("11 passive compartido canal wardRegen LIVE: en-zona ward6 ⇒ mul 0.15/T3; leave ⇒ 0/T0",
     near(pass.boostIn, 0.15) && pass.tierIn === 3 && pass.boostOut === 0 && pass.tierOut === 0, JSON.stringify(pass));

  // 12 — ★ CANAL FRESCO wardRegen REGENERA HP: setHp bajo + Cordón abierto + regenTick ⇒ HP sube ~ regenPct*(1+boost)*mhp*dt
  const regen = await page.evaluate(() => {
    window.__wpick(6);                                  // T3 boost 0.15 en la zona del héroe
    window.__dev.safeZone({ setHp: 100 });
    const before = window.__dev.ward().hero;
    window.__dev.ward({ regenTick: 2 });
    const after = window.__dev.ward().hero;
    return { mhp: after.maxHp, before: before.hp, after: after.hp, rate: window.__dev.ward().wardRegenRate };
  });
  const expGain = 0.03 * 1.15 * regen.mhp * 2;   // regenPct*(1+0.15)*mhp*dt
  ok("12 ★ wardRegen REGENERA HP LIVE: setHp100 + T3 + regenTick 2s ⇒ ΔHP == regenPct·(1+0.15)·mhp·2",
     near(regen.after - regen.before, +Math.min(regen.mhp - 100, expGain).toFixed(2), 0.05) || near(regen.after - regen.before, expGain, 0.5),
     `Δ=${(regen.after - regen.before).toFixed(2)} exp=${expGain.toFixed(2)} mhp=${regen.mhp} rate=${regen.rate}`);

  // 13 — ★ ORTOGONALIDAD wardRegen ⊥ restedMult: abrir Cordón NO cambia restedXpMult
  const orth = await page.evaluate(() => {
    window.__dev.ward({ leave: true }); const base = window.__dev.ward().restedXpMult;
    window.__wpick(6); const opened = window.__dev.ward();
    return { restedBase: base, restedWithWard: opened.restedXpMult, wardMul: opened.wardMulRegen };
  });
  ok("13 ★ ORTOGONALIDAD LIVE: abrir Cordón (wardMul 0.15) NO cambia restedXpMult (wardRegen ⊥ restedMult ⇒ 0 doble-conteo)",
     near(orth.restedBase, orth.restedWithWard) && orth.wardMul > 0, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN LIVE: 10 flags del arco served true + WARDING_RING served TRUE (disco LIVE)
  ok("14 ★ 0-regresión LIVE: 10 flags del arco served enabled:true + WARDING_RING served TRUE (11 flags true LIVE)",
     arcTrue && wardServed === "true", JSON.stringify({ ...arc, WARDING_RING: wardServed }));

  // 15 — ★ 6 zonas hospedan un Cordón observable (ward≥6 ⇒ T3)
  const zonesRes = await page.evaluate(() => {
    const zones = window.__dev.ward().zones; const broken = [];
    for (const z of zones) { window.__dev.ward({ clear: true, nowMs: window.__WNOW });
      const s = window.__dev.ward({ nowMs: window.__WNOW, push: { [z]: { ward: 6, atMs: window.__WNOW } }, toZone: z });
      if (!(s.zone === z && s.wardable && s.tier === 3 && s.wardMulRegen > 0)) broken.push(z); }
    return { n: zones.length, broken };
  });
  ok("15 ★ 6 zonas de caza hospedan Cordón LIVE (ward6⇒T3, passive>0) broken=[]",
     zonesRes.n === 6 && zonesRes.broken.length === 0, `n=${zonesRes.n} broken=${JSON.stringify(zonesRes.broken)}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.screenshot({ path: shot });
  const fps = await page.evaluate(() => (window.__dev.fps ? window.__dev.fps() : null));
  console.log(`  build=${build} fps=${fps} shot=${shot}`);
  await page.close();
  return build;
}

// ─────────── 16 — ★ NORTH STAR: CONVERGENCIA 2-CLIENTE REAL LIVE (desync = sev-1) ───────────
async function northStar() {
  console.log(`\n===== 16 ★ NORTH STAR 2-cliente LIVE (desync = sev-1) =====`);
  const nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  async function mkPage(n) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[NS${n}] ${e}`));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[NS${n}] ${m.text()}`); });
    await p.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await p.bringToFront();
    await p.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
    try { await toPlay(p); } catch (e) { await p.reload({ waitUntil: "domcontentloaded" }); await toPlay(p); }
    await installWard(p);
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
  for (const [w, at, lbl] of [[2, NOW, "T1"], [6, NOW, "T3"], [6, NOW, "decay+50s"]]) {
    await clear(A); await clear(B);
    await push(A, z, w, at); await push(B, z, w, at);
    const el = lbl === "decay+50s" ? 50000 : 0;
    const va = await A.evaluate((z, now) => { const s = window.__dev.ward({ nowMs: now, toZone: z }); return { ward: s.ward, tier: s.tier, boost: s.wardMulRegen, rate: s.wardRegenRate }; }, z, at + el);
    const vb = await B.evaluate((z, now) => { const s = window.__dev.ward({ nowMs: now, toZone: z }); return { ward: s.ward, tier: s.tier, boost: s.wardMulRegen, rate: s.wardRegenRate }; }, z, at + el);
    const eq = JSON.stringify(va) === JSON.stringify(vb);
    if (!eq) allEq = false; log.push(`${lbl}:${eq ? "==" : "DESYNC " + JSON.stringify(va) + "/" + JSON.stringify(vb)}`);
  }
  await clear(A); await clear(B);
  await push(A, z, 6, NOW); await push(B, z, 6, NOW);
  const bBefore = await vm(B, z);
  await A.evaluate(() => window.__dev.ward({ leave: true }));
  const aAfter = await A.evaluate(() => window.__dev.ward());
  const bAfter = await vm(B, z);
  const shared = aAfter.wardMulRegen === 0 && aAfter.wardMap && near(aAfter.wardMap[z], 6) && JSON.stringify(bBefore) === JSON.stringify(bAfter);
  log.push(`A-leave:Δ_A=${aAfter.wardMulRegen} sharedWard=${aAfter.wardMap && aAfter.wardMap[z]} Δ_B_intact=${JSON.stringify(bBefore) === JSON.stringify(bAfter)}`);
  ok("16 ★ NORTH STAR 2-cliente LIVE: mismo ward+reloj ⇒ VM byte-idéntico (T1/T3/decay); A sale ⇒ Δ_A=0 + ward compartido + Δ_B intacto (0 desync)",
     allEq && shared, log.join("  "));
  await A.close(); await B.close(); await nsBrowser.close();
}

try {
  const b1 = await runOnce(1);
  const b2 = await runOnce(2);
  ok("17 determinismo ×2: mismo build servido en ambas rondas", b1 === b2, `${b1} / ${b2}`);
  await northStar();
  ok("0 no JS errors / 0 404 durante toda la corrida", errors.length === 0 && net404.length === 0, [...errors.slice(0, 4), ...net404.slice(0, 4)].join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n=====  CAS-2366 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  =====`);
process.exit(FAIL === 0 ? 0 : 1);
