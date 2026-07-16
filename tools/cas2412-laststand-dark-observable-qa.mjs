// CAS-2412 — INDEPENDENT DARK QA for ÚLTIMA RESISTENCIA / AGUANTE (LAST_STAND.enabled:false). EVO mecánica #69, 2-cliente DARK.
// QA-OWNED harness (b5c10283). NOT a copy of the GE self-verify (cas2409): oráculos RE-DERIVADOS del config, drivers de enganche
// re-etiquetados obsA/obsB, foco en las 5 aceptaciones DARK del ticket CAS-2412:
//   (1) BOOT/LOAD/MOVEMENT/COMBAT verdes: arranca a play, se mueve (delta pos real), ataca, 0 JS err / 0 crash.
//   (2) EJE FORCE-RATIO / SUPERADO EN NÚMERO: ≥3 enemigos ENGANCHADOS {chase,windup,strike,recover,shield} dentro de
//       engageRadius:220 ⇒ T1 wardRegen +6%; ≥5 ⇒ T2 +12%. Conteo INSTANTÁNEO (sin decay, clearEngage⇒0 al instante),
//       server-auth función PURA de G.enemies+héroe. Neutrales pacíficos + fuera-de-radio EXCLUIDOS. [oráculo QA re-derivado]
//   (3) SHARE-CAP de-stack vs Warding Ring #59: boost combinado = min(lastStandWardCap 0.15, wardBoost + lastStandBoost)
//       ⇒ 0 doble-dip. Con Warding a tope (0.15) LAST_STAND no añade. [oráculo QA min(0.15, w+ls)]
//   (4) NORTH STAR 2-CLIENTE: el conteo es shard-consistente (fn PURA, 0-RNG, 0-timer) ⇒ ambos clientes ven el MISMO
//       count/tier/boost/combinedBoost/tag para el MISMO estado del mundo. 0 desync. Reconexión mantiene estado (STATELESS).
//   (5) OFF BYTE-NEUTRAL: con enabled:false el regen del canal wardRegen es IDÉNTICO al LIVE de Warding Ring (delta 0);
//       wardRegenBoost() DELEGA a wardMul() ⇒ byte-id. G.lastStand nunca se crea, save sin clave, worldFingerprint estable.
// Los mecanismos runtime (conteo/tiers/share-cap/seam) se OBSERVAN vía flip IN-MEMORY (__dev.lastStand({enabled:true})) — el
// disco sigue false; prueba que la ruta ON es correcta CUANDO se flipe, sin tocar el build DARK. Post-flip QA revalida LIVE.
//
// Oráculos independientes (re-derivados de sim/config.js LAST_STAND): engageRadius=220, lastStandWardCap=0.15,
//   tiers min→boost {3→0.06, 5→0.12}. ENGAGED states=[chase,windup,strike,recover,shield]; NO-engaged=[idle,patrol,flee].
//   oTier(count)=mayor i con count≥min[i]; oBoost(count)=tier>0?tiers[tier-1].boost:0; oCombined(w,ls)=min(0.15, w+ls).
// Run: node tools/cas2412-laststand-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2412-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

// ---- oráculos independientes (QA re-deriva, NO lee del snapshot) ----
const CFG = { radius: 220, cap: 0.15, tiers: [{ min: 3, boost: 0.06 }, { min: 5, boost: 0.12 }] };
const oTier = (count) => { let t = 0; for (let i = 0; i < CFG.tiers.length; i++) if (count >= CFG.tiers[i].min) t = i + 1; return t; };
const oBoost = (count) => { const t = oTier(count); return t > 0 ? CFG.tiers[t - 1].boost : 0; };
const oCombined = (ward, ls) => Math.min(CFG.cap, ward + ls);

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function waitMenu(page) {
  // pause-on-blur: la página debe estar al frente para que su rAF (y la transición a 'menu') corra. Re-afirmar foco en cada intento.
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.bringToFront(); } catch (e) {}
    try { await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 }); return; }
    catch (e) { if (attempt < 2) { try { await page.reload({ waitUntil: "domcontentloaded" }); } catch (e2) {} } else throw e; }
  }
}
async function toPlay(page) {
  await waitMenu(page);
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
let browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];

async function runOnce(tag) {
  console.log(`\n===== RUN ${tag} =====`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  page.on("pageerror", (e) => errors.push(`[${tag}] ` + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] ` + m.text()); });
  const errStart = errors.length;
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks + build
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lastStand && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 (1) boots to play, __dev.lastStand + ward + save/fp hooks + __BUILD, 0 JS err", hooks && errors.length === errStart && !!build, `build=${build} err=${errors.length - errStart}`);

  // 2 (1) MOVEMENT smoke: hero moves under ArrowRight (real position delta), scene stays 'play'
  const mov = await page.evaluate(async () => {
    const h0 = window.__dev.lastStand().hero; const p0 = { x: h0.x, y: h0.y };
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const h1 = window.__dev.lastStand().hero; const p1 = { x: h1.x, y: h1.y };
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    return { p0, p1, dist, scene: window.__dev.scene(), dead: h1.dead };
  });
  ok("2 (1) MOVEMENT: ArrowRight mueve al héroe (delta pos>0), sigue en 'play', vivo",
     mov.dist > 1 && mov.scene === "play" && mov.dead === false, `dist=${mov.dist.toFixed(1)} scene=${mov.scene}`);

  // 3 (1) COMBAT smoke: numeric attack (Digit1) fires without crash, still in play, 0 new err
  const errBeforeCombat = errors.length;
  const combat = await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
      await new Promise(r => setTimeout(r, 120)); window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })); await new Promise(r => setTimeout(r, 120)); }
    return { scene: window.__dev.scene(), dead: window.__dev.lastStand().hero.dead };
  });
  ok("3 (1) COMBAT: ataque numérico (Digit1) dispara sin crash, sigue en 'play', 0 err nuevo",
     combat.scene === "play" && errors.length === errBeforeCombat, `scene=${combat.scene} newErr=${errors.length - errBeforeCombat}`);

  // 4 (5) byte-neutral OFF fresh boot: read BEFORE any inject
  const dark = await page.evaluate(() => window.__dev.lastStand());
  ok("4 (5) byte-neutral OFF (fresh boot): enabled:false + gExists:false (STATELESS, G.lastStand jamás creado) + count/tier/boost 0 + channel wardRegen + tag''",
     dark.enabled === false && dark.gExists === false && dark.count === 0 && dark.tier === 0 && dark.boost === 0 && dark.channel === "wardRegen" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} count=${dark.count} tier=${dark.tier} boost=${dark.boost} channel=${dark.channel} tag="${dark.tag}"`);

  // 5 (5) save OFF: no new persisted key (estado 100% derivado/transitorio)
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("5 (5) save OFF: no 'lastStand'/'lastStandServer' key (estado 100% derivado, 0 persistencia nueva)", !/"lastStand(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 6 (5) worldFingerprint stable across enabled toggle (0 RNG drift) — my own seed 541
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(541)));
  await page.evaluate(() => window.__dev.lastStand({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(541)));
  await page.evaluate(() => window.__dev.lastStand({ enabled: false }));
  ok("6 (5) worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpB === fpA, `match=${fpB === fpA}`);

  // 7 (2) TABLA de tiers = fn PURA del CONTEO [oráculo QA]: boostProbe(count) → tier/boost
  const tab = await page.evaluate(() => {
    const out = {}; for (const c of [0, 2, 3, 4, 5, 7]) out[c] = window.__dev.lastStand({ boostProbe: { count: c } }).probe; return out;
  });
  const tabOk = [0, 2, 3, 4, 5, 7].every(c => tab[c].tier === oTier(c) && near(tab[c].boost, oBoost(c)));
  ok("7 (2) TABLA tiers = fn PURA del CONTEO [oráculo QA min{3→.06,5→.12}]: 0→T0/0, 2→T0/0, 3→T1/.06, 4→T1/.06, 5→T2/.12, 7→T2/.12",
     tabOk, JSON.stringify(tab));

  // 8 (2) SERVER-AUTH conteo de G.enemies REAL: engage 3 chase ⇒ count3/T1; +2 ⇒ count5/T2; clearEngage ⇒ 0
  const cnt = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const a = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24 } });
    const b = window.__dev.lastStand({ engage: { n: 2, state: "chase", dist: 24 } });
    const c = window.__dev.lastStand({ clearEngage: true });
    return { a: { count: a.count, tier: a.tier }, b: { count: b.count, tier: b.tier }, c: { count: c.count, tier: c.tier } };
  });
  ok("8 (2) SERVER-AUTH conteo G.enemies REAL: engage3⇒count3/T1; +2⇒count5/T2; clearEngage⇒count0 [oráculo QA]",
     cnt.a.count === 3 && cnt.a.tier === oTier(3) && cnt.b.count === 5 && cnt.b.tier === oTier(5) && cnt.c.count === 0 && cnt.c.tier === 0, JSON.stringify(cnt));

  // 9 (2) ★ DIFERENCIADOR force-ratio: state gate + proximity gate + INSTANTÁNEO (⊥ Cadence meter-decayente)
  const diff = await page.evaluate(() => {
    const one = (opts) => { window.__dev.lastStand({ clearEngage: true }); return window.__dev.lastStand({ engage: opts }).count; };
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const out = {};
    out.idle = one({ n: 4, state: "idle", dist: 24 });        // NO-engaged ⇒ no cuenta
    out.patrol = one({ n: 4, state: "patrol", dist: 24 });    // NO-engaged ⇒ no cuenta
    out.chase = one({ n: 4, state: "chase", dist: 24 });      // engaged ⇒ cuenta
    out.windup = one({ n: 4, state: "windup", dist: 24 });    // engaged ⇒ cuenta
    out.strike = one({ n: 4, state: "strike", dist: 24 });    // engaged ⇒ cuenta
    out.far = one({ n: 4, state: "chase", dist: 500 });       // fuera radio220 ⇒ no cuenta
    out.nearz = one({ n: 4, state: "chase", dist: 24 });      // dentro ⇒ cuenta
    out.instant = window.__dev.lastStand({ clearEngage: true }).count;   // clearEngage ⇒ 0 AL INSTANTE (sin decay)
    return out;
  });
  ok("9 (2) ★ DIFERENCIADOR: idle/patrol NO enganchan (0); chase/windup/strike enganchan (4); dist500>radio220 (0)/dist24 (4); clearEngage INSTANTÁNEO (0, sin decay ⊥Cadence)",
     diff.idle === 0 && diff.patrol === 0 && diff.chase === 4 && diff.windup === 4 && diff.strike === 4 && diff.far === 0 && diff.nearz === 4 && diff.instant === 0, JSON.stringify(diff));

  // 10 (2) ★ neutrales pacíficos (tpl.neutral && !hostile) EXCLUIDOS
  const neut = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const hostile = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24 } }).count;
    window.__dev.lastStand({ clearEngage: true });
    const neutral = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24, neutral: true } }).count;
    window.__dev.lastStand({ clearEngage: true });
    return { hostile, neutral };
  });
  ok("10 (2) ★ neutrales pacíficos (tpl.neutral && !hostile) EXCLUIDOS (0); hostiles enganchados sí (3) — mismo criterio que aggro",
     neut.hostile === 3 && neut.neutral === 0, JSON.stringify(neut));

  // 11 (2) PASSIVE canal wardRegen: count<3 ⇒ boost0/T0; count≥3 ⇒ boost>0/T1 + wardRegenBoost>0
  const pas = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const lo = window.__dev.lastStand({ engage: { n: 2, dist: 24 } });
    window.__dev.lastStand({ clearEngage: true });
    const hi = window.__dev.lastStand({ engage: { n: 4, dist: 24 } });
    window.__dev.lastStand({ clearEngage: true });
    return { lo: { boost: lo.boost, tier: lo.tier, wrb: lo.wardRegenBoost }, hi: { boost: hi.boost, tier: hi.tier, wrb: hi.wardRegenBoost } };
  });
  ok("11 (2) PASSIVE canal wardRegen: count<3 ⇒ boost0/T0; count≥3 ⇒ boost>0/T1 + wardRegenBoost>0",
     near(pas.lo.boost, 0) && pas.lo.tier === 0 && pas.hi.boost > 0 && pas.hi.tier === 1 && pas.hi.wrb > 0, JSON.stringify(pas));

  // 12 (3) ★ SHARE-CAP vs Warding Ring [oráculo QA min(0.15, ward+ls)]: capProbe pure math
  const cap = await page.evaluate(() => {
    return {
      wardT3: window.__dev.lastStand({ capProbe: { count: 5, wardBoost: 0.15 } }).capped,   // 0.15+0.12 ⇒ cap 0.15
      wardNone: window.__dev.lastStand({ capProbe: { count: 5, wardBoost: 0 } }).capped,     // 0+0.12 ⇒ 0.12
      wardT2: window.__dev.lastStand({ capProbe: { count: 3, wardBoost: 0.10 } }).capped,    // 0.10+0.06 ⇒ cap 0.15 (sería 0.16)
      lsSolo: window.__dev.lastStand({ capProbe: { count: 3, wardBoost: 0 } }).capped,       // 0+0.06 ⇒ 0.06 (≤cap)
    };
  });
  const capOk = near(cap.wardT3.combined, oCombined(0.15, 0.12)) && near(cap.wardT3.combined, 0.15) &&
    near(cap.wardNone.combined, oCombined(0, 0.12)) && near(cap.wardNone.combined, 0.12) &&
    near(cap.wardT2.combined, oCombined(0.10, 0.06)) && near(cap.wardT2.combined, 0.15) &&
    near(cap.lsSolo.combined, oCombined(0, 0.06)) && cap.wardT3.cap === 0.15;
  ok("12 (3) ★ SHARE-CAP vs Warding Ring [oráculo QA min(0.15,w+ls)]: ward.15+ls.12⇒.15 (LS cede, capped); ward0+ls.12⇒.12; ward.10+ls.06⇒.15 (capado, sería .16); ls sola⇒.06 (≤cap) — 0 doble-dip",
     capOk, JSON.stringify(cap));

  // 13 (3/5) ★ SEAM REAL wardRegenTick: ON T2 delta>0 y refleja boost; T2/T1 ratio=1.12/1.06; OFF delta 0 (delega Warding fuera de zona)
  const seam = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    const on2 = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ clearEngage: true });
    window.__dev.lastStand({ engage: { n: 3, dist: 24 } });
    const on1 = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ clearEngage: true });
    window.__dev.lastStand({ enabled: false });
    window.__dev.lastStand({ enabled: false, engage: { n: 5, dist: 24 } });
    const off = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    window.__dev.lastStand({ enabled: false });
    return { on2, on1, off };
  });
  const ratioOK = seam.on1.delta > 0 && near(seam.on2.delta / seam.on1.delta, 1.12 / 1.06, 2e-3);
  ok("13 (3/5) ★ SEAM REAL wardRegenTick: ON T2 delta>0 (boost.12); T2/T1 ratio=1.12/1.06; OFF delta 0 (delega a Warding Ring, byte-id fuera de zona de cordón)",
     seam.on2.delta > 0 && near(seam.on2.boost, 0.12) && near(seam.on1.boost, 0.06) && ratioOK && near(seam.off.delta, 0), JSON.stringify(seam));

  // 14 (5) ★ BYTE-NEUTRAL OFF en el seam: wardRegenBoost == wardMulRegen EXACTO (superado o no) ⇒ delega a Warding
  const neutral = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    const bare = window.__dev.lastStand();
    window.__dev.lastStand({ enabled: false, engage: { n: 5, dist: 24 } });   // superado PERO OFF
    const eng = window.__dev.lastStand();
    window.__dev.lastStand({ clearEngage: true });
    return { bare: { wrb: bare.wardRegenBoost, wm: bare.wardMulRegen }, eng: { wrb: eng.wardRegenBoost, wm: eng.wardMulRegen } };
  });
  ok("14 (5) ★ BYTE-NEUTRAL OFF: wardRegenBoost == wardMulRegen EXACTO (superado o no) ⇒ delega a Warding Ring sin cambio (0-regr)",
     near(neutral.bare.wrb, neutral.bare.wm) && near(neutral.eng.wrb, neutral.eng.wm), JSON.stringify(neutral));

  // 15 (2) ★ ORTOGONALIDAD wardRegen ⊥ restedMult/goldFind/critChance/xpGain/vamp/lootQuality: superado NO mueve los peers
  const orth = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const b = window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    const peers = { rested: b.restedXpMult, gold: b.goldFindMul, crit: b.critChancePct, xp: b.xpGainMul, vamp: b.vampMul, loot: b.lootQualityFloor };
    window.__dev.lastStand({ clearEngage: true });
    const b0 = window.__dev.lastStand();
    const peers0 = { rested: b0.restedXpMult, gold: b0.goldFindMul, crit: b0.critChancePct, xp: b0.xpGainMul, vamp: b0.vampMul, loot: b0.lootQualityFloor };
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    return { peers, peers0, unchanged: JSON.stringify(peers) === JSON.stringify(peers0) };
  });
  ok("15 (2) ★ ORTOGONALIDAD wardRegen ⊥ restedMult/goldFind/critChance/xpGain/vamp/lootQuality: superado en número NO cambia los peers",
     orth.unchanged, JSON.stringify(orth.peers));

  // 16 (5) 0-REGRESIÓN: arc #59-#68 served enabled:true; LAST_STAND served false (via config.js source)
  // fetch COMPLETO garantizado: reintenta hasta que el texto contenga el ÚLTIMO export del arco (LAST_STAND) ⇒ 0 falso-positivo por truncación
  const cfgSrc = await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) { const r = await fetch("sim/config.js", { cache: "no-store" }); const t = await r.text();
      if (t.includes("export const LAST_STAND") && t.length > 200000) return t; await new Promise(res => setTimeout(res, 200)); }
    const r = await fetch("sim/config.js", { cache: "no-store" }); return await r.text();
  });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const lsDark = flag("LAST_STAND") === "false";
  // CAS-2411 dedup (HEAD 40c7bd1): ZONE_DOMINANCE (dup #69) fue REVERTIDO ⇒ ausente del build. Verificamos que YA no exporta (dedup landed, no 2 flags #69).
  const zdAbsent = !cfgSrc.includes("export const ZONE_DOMINANCE");
  ok("16 (5) 0-REGRESIÓN: 10 flags arco #59-#68 served enabled:true (incl. TEMPEST_SURGE #68 LIVE); LAST_STAND false (único DARK #69); ZONE_DOMINANCE AUSENTE (dedup CAS-2411 revertido)",
     arcAllOn && lsDark && zdAbsent && arc.length === 10, `lastStand=${flag("LAST_STAND")} zoneDomAbsent=${zdAbsent} arc=${JSON.stringify(arcLive)}`);

  // 17 (1) render badge "Resistencia:" se DIBUJA ON+superado, NO OFF + fps (perf budget)
  const badge = await page.evaluate(async () => {
    const CanvasProto = CanvasRenderingContext2D.prototype;
    let onCount = 0, offCount = 0, mode = "off";
    const origFill = CanvasProto.fillText;
    CanvasProto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Resistencia:") >= 0) { if (mode === "on") onCount++; else offCount++; } return origFill.call(this, t, ...a); };
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    mode = "off"; await new Promise(r => setTimeout(r, 300));
    window.__dev.lastStand({ enabled: true, clearEngage: true }); window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    mode = "on"; const t0 = performance.now(); let frames = 0;
    await new Promise(res => { const loop = () => { frames++; if (performance.now() - t0 < 700) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    CanvasProto.fillText = origFill;
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    return { onCount, offCount, fps };
  });
  ok("17 (1) render badge 'Resistencia:' se DIBUJA ON+superado (count>0), NO OFF (count 0), fps≥55 (perf budget)",
     badge.onCount > 0 && badge.offCount === 0 && badge.fps >= 55, JSON.stringify(badge));

  await page.evaluate(() => { window.__dev.lastStand({ enabled: true, clearEngage: true }); window.__dev.lastStand({ engage: { n: 5, dist: 24 } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, `selfverify-${tag}.png`) });
  await page.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));
  return { page, build };
}

let build1 = null, buildInfo = null;
let nsBrowser = null;
try {
  const r1 = await runOnce("run1");
  buildInfo = r1.build;
  await r1.page.close();
  const r2 = await runOnce("run2");
  build1 = r2.build;
  await r2.page.close();
  ok("18 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- NORTH STAR: real 2-client convergence (force-ratio shard-consistent) ----
  console.log(`\n===== NORTH STAR 2-CLIENTE =====`);
  await browser.close(); browser = null;
  nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ cada página se crea, se trae al frente y se bootea EN SECUENCIA.
  async function mkNS(tg) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[${tg}] ` + String(e)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(`[${tg}] ` + m.text()); });
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
    await p.bringToFront();
    await toPlay(p);
    return p;
  }
  const pA = await mkNS("obsA");
  const pB = await mkNS("obsB");

  // MISMO set de enganche ⇒ el conteo (fn PURA de G.enemies+héroe) converge byte-a-byte. 0-RNG/0-timer ⇒ shard-consistente.
  const readVM = async (pg, n) => pg.evaluate((n) => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const s = window.__dev.lastStand({ engage: { n, state: "chase", dist: 24 } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(541));
    return { count: s.count, tier: s.tier, boost: s.boost, combinedBoost: s.combinedBoost, tag: s.tag, fp };
  }, n);

  // 19a T2 (5 enganchados): count/tier/boost/combinedBoost/tag + worldFingerprint IDÉNTICOS byte-a-byte
  const a2 = await readVM(pA, 5); const b2 = await readVM(pB, 5);
  const conv2 = a2.count === b2.count && a2.tier === b2.tier && near(a2.boost, b2.boost) && near(a2.combinedBoost, b2.combinedBoost) && a2.tag === b2.tag && a2.fp === b2.fp;
  ok("19a NORTH STAR: MISMO set de enganche (5) ⇒ count/tier/boost/combinedBoost/tag + worldFingerprint IDÉNTICOS byte-a-byte en obsA y obsB (0 desync, shard-consistente)",
     conv2 && a2.count === 5 && a2.tier === oTier(5) && near(a2.boost, oBoost(5)) && a2.tag === "⚔", `A=${JSON.stringify({ ...a2, fp: undefined })} B=${JSON.stringify({ ...b2, fp: undefined })}`);
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true })); await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));

  // 19b T1 (3 enganchados): converge en otro tier ⇒ misma fn PURA (determinista)
  const a1 = await readVM(pA, 3); const b1 = await readVM(pB, 3);
  const conv1 = a1.count === b1.count && a1.tier === b1.tier && near(a1.boost, b1.boost) && near(a1.combinedBoost, b1.combinedBoost) && a1.tag === b1.tag;
  ok("19b NORTH STAR: MISMO set (3) ⇒ count/tier/boost IDÉNTICOS entre clientes; oráculo QA T1/.06 (fn PURA determinista, 0 desync)",
     conv1 && a1.count === 3 && a1.tier === oTier(3) && near(a1.boost, oBoost(3)), `A=${JSON.stringify({ ...a1, fp: undefined })} B=${JSON.stringify({ ...b1, fp: undefined })}`);
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true })); await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));

  // 19c below-threshold (2 enganchados): AMBOS clientes ⇒ T0/boost0/tag'' (converge también en el caso vacío)
  const a0 = await readVM(pA, 2); const b0 = await readVM(pB, 2);
  const conv0 = a0.count === b0.count && a0.tier === b0.tier && near(a0.boost, b0.boost) && a0.tag === b0.tag;
  ok("19c NORTH STAR: MISMO set bajo-umbral (2) ⇒ ambos T0/boost0/tag'' IDÉNTICOS (converge también en el caso sin efecto)",
     conv0 && a0.count === 2 && a0.tier === 0 && near(a0.boost, 0) && a0.tag === "", `A=${JSON.stringify({ ...a0, fp: undefined })} B=${JSON.stringify({ ...b0, fp: undefined })}`);

  // 19d reconnect/persistence: obsB reloads (rejoin), re-boots, STATELESS ⇒ sigue convergiendo byte-id con obsA
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true })); await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));
  await pB.reload({ waitUntil: "domcontentloaded" });
  await pB.bringToFront();
  await toPlay(pB);
  const aRe = await readVM(pA, 5); const bRe = await readVM(pB, 5);
  const convRe = aRe.count === bRe.count && aRe.tier === bRe.tier && near(aRe.boost, bRe.boost) && near(aRe.combinedBoost, bRe.combinedBoost) && aRe.tag === bRe.tag;
  ok("19d NORTH STAR RECONNECT: obsB recarga (rejoin), re-bootea; STATELESS ⇒ conteo/tier/boost sigue byte-id con obsA (0 drift, no persiste estado)",
     convRe && bRe.tier === oTier(5), `A=${JSON.stringify({ ...aRe, fp: undefined })} B=${JSON.stringify({ ...bRe, fp: undefined })}`);

  await pA.screenshot({ path: join(OUT, "client-a-outnumbered.png") });
  await pB.screenshot({ path: join(OUT, "client-b-reconnect.png") });
  await pA.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));
  await pB.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));
  await pA.close(); await pB.close();

  // 0 no JS errors
  ok("0 no JS errors during full run", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("FATAL", e); FAIL++;
} finally {
  if (nsBrowser) { try { await nsBrowser.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
  await server.close();
}

console.log(`\n==== CAS-2412 DARK QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} ====`);
process.exit(FAIL === 0 ? 0 : 1);
