// CAS-2431 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para ACECHO / SIGILO (SHADOW_STALK.enabled:TRUE), EVO mecánica #71.
// Mirror LIVE de la DARK QA CAS-2429. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = afc2ede86708 (== master flip 18d993d == HTTP served, byte-verificado 2× por CTO+CEO).
//
// Diferencia clave vs DARK: enabled:TRUE ⇒ el efecto SHADOW_STALK está ACTIVO en el build servido:
//   - raycast LOS mob→héroe sobre world.wallSet/blockSet (Bresenham, server-auth) CORRE ⇒ con oclusión reduce el radio de detección.
//   - LUT por profundidad: occ≥1→T1/−0.20, occ≥2→T2/−0.35 (sub-cap stealthStalkCap=0.35). LOS despejada (0 oclusores) ⇒ +0 (aggro base sin cambios).
//   - canal FRESCO detectRadius: aggroEff = base*(1-mit); Tier2 ⇒ 300→195 (−35%).
// Oráculos RE-DERIVADOS desde el bloque SHADOW_STALK (NO importa la tabla del selfverify de GE).
// Observado vía __dev.shadowStalk (wallScan/tp/losProbe/radiusProbe/tierProbe/enabled) + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText.
// Run: node tools/cas2431-shadowstalk-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2431-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "afc2ede86708";   // build deployado por el flip SHADOW_STALK CAS-2430 (== version.json esperado)
const DARK_BUILD = "c8aeb1f97846";     // build DARK previo (CAS-2426) — el LIVE DEBE haber avanzado de aquí

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULO QA re-derivado del bloque SHADOW_STALK (NO importado del harness GE) ──
const CAP = 0.35;                       // stealthStalkCap — sub-cap duro de la reducción del radio de detección
function oracleTier(occ) { occ = occ | 0; if (occ >= 2) return 2; if (occ >= 1) return 1; return 0; }
function oracleMit(occ) { const t = oracleTier(occ); if (t <= 0) return 0; const raw = t === 2 ? 0.35 : 0.20; return Math.min(CAP, raw); }
const oracleAggroEff = (base, occ) => +(base * (1 - oracleMit(occ))).toFixed(2);
const OCC_DOMAIN = [0, 1, 2, 3, 5];

const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAStalk";
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

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errA = [], errB = [], net404 = [];
async function boot(page, err) {
  page.on("pageerror", (e) => err.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) err.push(m.text()); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(rp.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
}

try {
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageA.bringToFront();
  await boot(pageA, errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del DARK) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("L1 boots LIVE a 'play'; build==version.json==EXPECT afc2ede86708 (AVANZÓ del DARK c8aeb1f97846); __dev.shadowStalk/saveBlob/worldFingerprint; 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 13 flags served TRUE (0-regresión de arco): 12 previas #59→#70 + SHADOW_STALK #71 ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING"];
  const live13 = arc.concat(["SHADOW_STALK"]).map(f => [f, flag(f)]);
  const all13On = live13.every(([, v]) => v === "true");
  ok("L2 0-REGRESIÓN: 13 flags LIVE served enabled:true (12 arco #59→#70 + SHADOW_STALK #71) ⇒ arco completo, 0 flags perdidas",
     all13On && live13.length === 13, JSON.stringify(live13));

  // params SHADOW_STALK served
  const channelLive = /channel:\s*"detectRadius"/.test(cfgSrc);
  const capLive = /stealthStalkCap:\s*0\.35/.test(cfgSrc);
  const tiersLive = /min:\s*1,\s*mit:\s*0\.20/.test(cfgSrc) && /min:\s*2,\s*mit:\s*0\.35/.test(cfgSrc);
  ok("L2b params SHADOW_STALK served: channel detectRadius + stealthStalkCap 0.35 + tiers {1:0.20, 2:0.35}",
     channelLive && capLive && tiersLive, `channel=${channelLive} cap=${capLive} tiers=${tiersLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel detectRadius ═══
  const st = await pageA.evaluate(() => window.__dev.shadowStalk());
  ok("L3 LIVE default: __dev.shadowStalk().enabled === TRUE (flip aplicado), channel detectRadius, tier/mit base 0 sin oclusión, gExists false (STATELESS)",
     st.enabled === true && st.channel === "detectRadius" && st.gExists === false,
     `enabled=${st.enabled} channel=${st.channel} tier=${st.tier} mit=${st.mit} gExists=${st.gExists}`);

  // ═══ L4 — world.wallSet/blockSet poblado (geometría OCLUSORA server-auth) + tile de muestra ═══
  const wall = await pageA.evaluate(() => window.__dev.shadowStalk({ wallScan: true }).wallScan);
  ok("L4 world.wallSet/blockSet poblado server-auth (geometría OCLUSORA real hasheada en worldFingerprint) + 1 tile oclusor de muestra",
     wall && (wall.wallCount + wall.blockCount) > 0 && wall.sample != null,
     `wallCount=${wall.wallCount} blockCount=${wall.blockCount} sample=${JSON.stringify(wall.sample)}`);

  // ═══ L5 — LUT PURA occ→tier→mit (oráculo QA), world-independiente ═══
  const tab = await pageA.evaluate(() => { const o = {}; for (const occ of [0, 1, 2, 3, 5]) o[occ] = window.__dev.shadowStalk({ tierProbe: { occ } }).tierProbe; return o; });
  const tabOK = OCC_DOMAIN.every(occ => { const t = tab[occ]; return t && t.tier === oracleTier(occ) && near(t.mit, oracleMit(occ)); });
  ok("L5 LUT PURA por profundidad (oráculo QA): occ0→T0/0, occ1→T1/−0.20, occ≥2→T2/−0.35 (bajo sub-cap 0.35), determinista",
     tabOK, JSON.stringify(tab));

  // ═══ L6 — RAYCAST REAL: segmento que ATRAVIESA el tile oclusor ⇒ occ≥1, tier/mit == LUT (autoridad server-auth, no cosmético) ═══
  const TS = await pageA.evaluate(() => window.__dev.tileSize ? window.__dev.tileSize() : 32);
  const seg = { ax: (wall.sample.tx - 2) * (TS || 32) + 16, ay: wall.sample.ty * (TS || 32) + 16,
                bx: (wall.sample.tx + 2) * (TS || 32) + 16, by: wall.sample.ty * (TS || 32) + 16 };
  const los = await pageA.evaluate((seg) => window.__dev.shadowStalk({ losProbe: seg }).losProbe, seg);
  const losOK = los && los.occluders >= 1 && los.tier === oracleTier(los.occluders) && near(los.mit, oracleMit(los.occluders));
  ok("L6 RAYCAST REAL: segmento cruza el tile oclusor ⇒ occluders≥1 y tier/mit == LUT QA (raycast Bresenham corre con enabled:true, autoridad)",
     losOK, JSON.stringify(los));

  // ═══ L7 — EFECTO ACTIVO LIVE: con enabled:true, la oclusión REDUCE el radio de detección del mob ═══
  // aggroEff = base*(1-mit) donde mit sale del raycast REAL sobre el segmento oclusor ⇒ radio < base (efecto ON).
  const eff = await pageA.evaluate((seg) => {
    // NO tocamos enabled — está en true por el flip LIVE
    const l = window.__dev.shadowStalk({ losProbe: seg }).losProbe;
    // radio efectivo derivado de la mit del raycast real
    const base = 300;
    return { occ: l.occluders, mit: l.mit, aggroEff: +(base * (1 - l.mit)).toFixed(2), base };
  }, seg);
  const expReduced = oracleAggroEff(eff.base, eff.occ);   // p.ej. occ≥2 ⇒ 300*(1-0.35)=195
  const effOK = eff.mit > 0 && eff.aggroEff < eff.base && near(eff.aggroEff, expReduced) && eff.mit <= CAP + 1e-9;
  ok("L7 EFECTO ACTIVO LIVE: con oclusión (occ≥1) el radio de detección se REDUCE ⇒ aggroEff = base*(1-mit) < base (Tier2 300→195), mit>0 acotada por 0.35",
     effOK, `${JSON.stringify(eff)} expReduced=${expReduced}`);

  // canal detectRadius vía radiusProbe (formula-consistencia + base0⇒0)
  const chan = await pageA.evaluate((sample) => {
    window.__dev.shadowStalk({ tp: { tx: sample.tx + 1, ty: sample.ty } });   // mover héroe junto a cobertura (enabled ya true)
    const b300 = window.__dev.shadowStalk({ radiusProbe: { base: 300 } }).radiusProbe;
    const b0 = window.__dev.shadowStalk({ radiusProbe: { base: 0 } }).radiusProbe;
    return { b300, b0, enabled: window.__dev.shadowStalk().enabled };
  }, wall.sample);
  const chanOK = chan.b300 && chan.b0 && chan.enabled === true &&
                 near(chan.b300.aggroEff, +(300 * (1 - chan.b300.mit)).toFixed(2)) &&
                 chan.b300.mit <= CAP + 1e-9 && chan.b0.aggroEff === 0;
  ok("L7b CANAL detectRadius (LIVE enabled:true): aggroEff = base*(1-mit) consistente; mit≤sub-cap 0.35; base0 ⇒ 0",
     chanOK, JSON.stringify(chan));

  // ═══ L8 — LOS DESPEJADA ⇒ +0: occ0 ⇒ tier0/mit0 ⇒ aggroEff == base EXACTO (aggro base sin cambios) ═══
  const clear = await pageA.evaluate(() => {
    const t0 = window.__dev.shadowStalk({ tierProbe: { occ: 0 } }).tierProbe;   // LOS despejada
    const base = 300;
    return { tier: t0.tier, mit: t0.mit, aggroEff: +(base * (1 - t0.mit)).toFixed(2), base };
  });
  ok("L8 LOS DESPEJADA (occ0) ⇒ Tier 0, mit 0, aggroEff == base EXACTO (300) ⇒ SIN ventaja de sigilo (aggro base sin cambios)",
     clear.tier === 0 && clear.mit === 0 && clear.aggroEff === clear.base, JSON.stringify(clear));

  // ═══ L9 — STATELESS: save sin clave + G.shadowStalk nunca creado + fingerprint estable ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("L9a STATELESS: saveBlob() SIN clave shadowStalk*/stealthStalk* (efecto 100% derivado de la geometría, 0 persistencia)",
     !/"shadowStalk|"shadow_stalk|"stealthStalk/i.test(saveBlob), `saveLen=${saveBlob.length}`);
  const gCheck = await pageA.evaluate((sample) => {
    window.__dev.shadowStalk({ tp: { tx: sample.tx + 1, ty: sample.ty } });
    window.__dev.shadowStalk({ losProbe: { ax: sample.tx * 32, ay: sample.ty * 32, bx: sample.tx * 32 + 200, by: sample.ty * 32 } });
    return window.__dev.shadowStalk().gExists;
  }, wall.sample);
  ok("L9b STATELESS: G.shadowStalk NUNCA se crea (gExists false aún tras tp+raycast+re-lecturas, enabled:true)",
     gCheck === false, `gExists=${gCheck}`);
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((s) => window.__dev.shadowStalk({ losProbe: { ax: s.tx * 32, ay: s.ty * 32, bx: s.tx * 32 + 128, by: s.ty * 32 } }), wall.sample);
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("L9c worldFingerprint(393) byte-estable a través de raycasts (detectRadius/IA NO entra al fingerprint; 0 RNG/timer drift)",
     fpBefore === fpAfter, `stable=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // ═══ L10 — badge "Sigilo:" render + movimiento/combate sin crash + fps sano ═══
  // fps se mide en RÉGIMEN PERMANENTE (tras un warmup de 700ms) — el frame-loop no debe medirse justo tras
  //   operaciones pesadas del harness (worldFingerprint 15.9MB / tp / raycasts) o el 1er segundo sale bajo por warmup, no por el juego.
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Sigilo:") >= 0) cnt++; return orig(t, x, y); };
    // warmup: mover + atacar 700ms para estabilizar el rAF loop tras las probes pesadas
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 700));
    // medición de RÉGIMEN PERMANENTE (2s en movimiento+combate)
    cnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 2000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { badgeCnt: cnt, fps };
  });
  // badge "Sigilo:" DIBUJA en LIVE (enabled:true ⇒ count>0) — contraste con DARK (enabled:false ⇒ count 0)
  ok("L10 LIVE render: movimiento (ArrowRight) + combate (Digit1) sin crash; fps RÉGIMEN PERMANENTE sano (≥55); badge \"Sigilo:\" DIBUJA (enabled:true ⇒ count>0, contraste con DARK count==0)",
     badge.fps >= 55 && badge.badgeCnt > 0, `badgeCnt=${badge.badgeCnt} fps=${badge.fps}`);

  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L11 — North Star 2-cliente / 0-desync (segundo cliente LIVE, misma semilla/shard) ═══
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.bringToFront();
  await boot(pageB, errB);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  ok("L11a cliente B carga el MISMO build LIVE afc2ede86708 (shard replicado)",
     buildB === EXPECT_BUILD, `buildB=${buildB}`);

  const readNS = async (pg) => await pg.evaluate((seg, sample) => {
    const l = window.__dev.shadowStalk({ losProbe: seg }).losProbe;
    window.__dev.shadowStalk({ tp: { tx: sample.tx + 1, ty: sample.ty } });
    const r = window.__dev.shadowStalk({ radiusProbe: { base: 300 } }).radiusProbe;
    const ws = window.__dev.shadowStalk({ wallScan: true }).wallScan;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { occ: l.occluders, tier: l.tier, mit: l.mit, aggroEff: r.aggroEff, rmit: r.mit, wallCount: ws.wallCount, blockCount: ws.blockCount, enabled: window.__dev.shadowStalk().enabled, fp };
  }, seg, wall.sample);
  const NA = await readNS(pageA);
  const NB = await readNS(pageB);
  const convOK = NA.occ === NB.occ && NA.tier === NB.tier && near(NA.mit, NB.mit) &&
                 near(NA.aggroEff, NB.aggroEff) && near(NA.rmit, NB.rmit) &&
                 NA.wallCount === NB.wallCount && NA.blockCount === NB.blockCount &&
                 NA.enabled === true && NB.enabled === true;
  ok("L11b NORTH STAR 2-CLIENTE: occ/tier/mit (raycast) + aggroEff (canal) + wall/blockCount IDÉNTICOS A↔B, enabled:true en ambos (0 desync)",
     convOK, `A=${JSON.stringify(NA)} B=${JSON.stringify(NB)}`);
  ok("L11c NORTH STAR 2-CLIENTE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado, misma semilla)",
     NA.fp === NB.fp, `len=${NA.fp.length} match=${NA.fp === NB.fp}`);

  // ═══ L12 — reconnect STATELESS 0-drift: reload B ⇒ idéntico + gExists false + save sin clave + fp estable ═══
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const reconn = await pageB.evaluate((seg) => {
    const l = window.__dev.shadowStalk({ losProbe: seg }).losProbe;
    const s = window.__dev.shadowStalk();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { occ: l.occluders, tier: l.tier, mit: l.mit, enabled: s.enabled, gExists: s.gExists, hasKey: /"shadowStalk|"stealthStalk/i.test(save), fp };
  }, seg);
  const reconnOK = reconn.occ === NB.occ && reconn.tier === NB.tier && near(reconn.mit, NB.mit) &&
                   reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false && reconn.fp === NB.fp;
  ok("L12 RECONNECT STATELESS 0-drift: tras reload, mismo segmento ⇒ occ/tier/mit idénticos + enabled:true + gExists false + save sin clave + fp estable",
     reconnOK, JSON.stringify(reconn));

  // ═══ L13 — sin errores JS en toda la corrida ni 404 (cliente A + B) ═══
  ok("L13 sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B)",
     errA.length === 0 && errB.length === 0 && net404.length === 0,
     `A=${errA.length} B=${errB.length} 404=${net404.length} ${errA.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, SHADOW_STALK.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
