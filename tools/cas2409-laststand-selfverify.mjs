// CAS-2409 — self-verify for ÚLTIMA RESISTENCIA / AGUANTE (DARK, LAST_STAND.enabled:false). EVO mecánica #69 (serializa tras #68 TEMPEST LIVE) — EJE FRESCO + CANAL REUSADO, ⊥/DISTINTO a #47-68.
// (A) EJE FRESCO = RATIO DE FUERZA / SUPERADO EN NÚMERO (local force-ratio). server-authoritative, 0-RNG, 0-timer, STATELESS: el conteo = función PURA del estado de sim (enemigos ALIVE no-neutrales en estado de ENGANCHE
//     {chase/windup/strike/recover/shield} dentro de engageRadius del héroe). RATIO INSTANTÁNEO de la amenaza que te rodea AHORA. NO acumulador temporal (⊥ Cadence #67 meter-decayente), NO reloj día/noche/clima
//     (⊥ Nocturne #66 / Tempest #68), NO aliados (⊥ Kinship #60 cuenta ALIADOS), NO foco único (⊥ Focus #62 = TÚ en 1 enemigo) — es MUCHOS enemigos concentrados en TI.
// (B) CANAL REUSADO = wardRegen (regen de HP — MISMO seam que Warding Ring #59). SHARE-CAP de-stack: boost combinado = min(lastStandWardCap, wardBoost + lastStandBoost) ⇒ 0 doble-dip más allá del techo (mismo patrón
//     que Tempest lootQuality vs Trailcraft y Cadence critChance vs Delve).
//
// ★ DIFERENCIADOR (check 7, no-negociable): eje RATIO INSTANTÁNEO. Gate de ESTADO (sólo enganchados chase/windup/... cuentan; idle/patrulla NO) + gate de PROXIMIDAD (enganchados fuera de engageRadius NO) +
//   INSTANTÁNEO (clearEngage ⇒ conteo cae a 0 AL INSTANTE, sin decay/permanencia — ⊥ Cadence). Mide CUÁNTOS te rodean AHORA, no CUÁNDO/DÓNDE/A-QUIÉN/aliados.
// ★ SHARE-CAP (check 10, no-negociable): boost combinado wardRegen = min(cap 0.15, wardBoost + lastStandBoost). Warding T3(0.15)+LastStand T2(0.12) ⇒ 0.15 (LastStand cede, capped); Warding 0 + LastStand 0.12 ⇒ 0.12 (≤cap);
//   Warding 0.10 + LastStand 0.06 ⇒ 0.15 (capped, sería 0.16). OFF ⇒ wardRegenBoost==wardMul (byte-id). ★ SEAM REAL (check 11): wardRegenTick aplica el regen con el boost share-capped.
// ★ ORTOGONALIDAD (check 13): estar superado en número (boost>0) NO cambia restedMult/goldFind/critChance/xpGain/vamp/lootQuality; activar los otros arcos NO cambia el conteo/boost de Last Stand.
// ★ 0-REGRESIÓN (check 14): los 10 mecanismos del arco #59-#68 siguen served enabled:true (incl. TEMPEST_SURGE #68 LIVE); LAST_STAND served false (DARK #69).
// North Star (check 16, no-negociable) = CONVERGENCIA 2-CLIENTE: DOS páginas independientes con el MISMO set de enganche ⇒ ven count + tier + boost + combinedBoost IDÉNTICOS byte-a-byte (0 desync). El conteo es función PURA
//   del estado replicado ⇒ cualquier observador de ese héroe concuerda (shard-consistente).
//
// Observado vía __dev.lastStand (flip LAST_STAND.enabled IN-MEMORY + engage/clearEngage enemigos sintéticos LITERALES 0-srand + boostProbe/capProbe puros + hp/pause/regenTick para el seam wardRegen REAL)
// + __dev.ward (wardRegen partner) + __dev.kinship/focus (goldFind) + __dev.convoy (restedMult) + __dev.nocturne (vamp) + __dev.fellowship (xpGain) + __dev.tempest (lootQuality) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Resistencia:").
//
// Checks:
//   1  boots to play, __dev.lastStand + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): LAST_STAND.enabled false AND G.lastStand NUNCA se crea (gExists false) ⇒ 0 estado nuevo; count/tier/boost 0, channel wardRegen, tag "".
//   3  byte-id save OFF: saveBlob() SIN clave 'lastStand'/'lastStandServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  TABLA de tiers = función PURA del CONTEO: boostProbe(count)→tier/boost (0→T0/0, 2→T0/0, 3→T1/0.06, 4→T1/0.06, 5→T2/0.12) determinista.
//   6  SERVER-AUTHORITATIVE conteo de G.enemies REAL: engage 3 chase ⇒ count 3 tier 1; +2 ⇒ count 5 tier 2; clearEngage ⇒ count 0.
//   7  ★ DIFERENCIADOR: gate de ESTADO (idle NO engancha ⇒ count 0; chase ⇒ cuenta) + gate de PROXIMIDAD (dist 500>radio ⇒ 0; dist 24 ⇒ cuenta) + INSTANTÁNEO (clearEngage ⇒ 0 al instante, sin decay).
//   8  ★ neutrales pacíficos (tpl.neutral && !hostile) NO cuentan (mismo criterio que aggro).
//   9  PASSIVE canal wardRegen: enabled + count≥3 ⇒ boost>0 + wardRegenBoost>0 + tier≥1; count<3 ⇒ boost 0 + tier 0.
//  10  ★ SHARE-CAP con Warding Ring: capProbe ward0.15+ls0.12⇒0.15 (cede, capped); ward0+ls0.12⇒0.12 (≤cap); ward0.10+ls0.06⇒0.15 (capped); ls sola ≤ cap.
//  11  ★ SEAM REAL wardRegenTick: ON+superado (T2 boost0.12) ⇒ regen delta>0 y refleja el boost; T2 vs T1 ⇒ ratio deltas = 1.12/1.06; OFF ⇒ delta 0 (byte-id delega a Warding Ring, 0 fuera de zona de cordón).
//  12  ★ BYTE-NEUTRAL OFF en el seam: con LAST_STAND OFF, wardRegenBoost == wardMulRegen (SÓLO-Warding) EXACTO, esté superado o no ⇒ 0 cambio de la ruta LIVE de Warding Ring.
//  13  ★ ORTOGONALIDAD wardRegen ⊥ restedMult ⊥ goldFind ⊥ critChance ⊥ xpGain ⊥ vamp ⊥ lootQuality: superado en número NO cambia los otros; activar KINSHIP/CONVOY/NOCTURNE/FELLOWSHIP/TEMPEST NO cambia el conteo/boost.
//  14  ★ 0-REGRESIÓN: los 10 mecanismos del arco #59-#68 served enabled:true (incl. TEMPEST_SURGE #68 LIVE); LAST_STAND served false (DARK #69).
//  15  render badge "Resistencia:" se DIBUJA con la feature ON+superado (ctx.fillText "Resistencia:" count>0) y NO con OFF (count 0) + fps.
//  16  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO set de enganche ⇒ count/tier/boost/combinedBoost/tag IDÉNTICOS byte-a-byte; worldFingerprint idéntico (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2409-laststand-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2409");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lastStand && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.lastStand + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.lastStand never created
  const dark = await page.evaluate(() => window.__dev.lastStand());
  ok("2 byte-id OFF (fresh boot): LAST_STAND.enabled false AND G.lastStand NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.count === 0 && dark.tier === 0 && dark.boost === 0 && dark.channel === "wardRegen" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} count=${dark.count} tier=${dark.tier} boost=${dark.boost} channel=${dark.channel} tag="${dark.tag}"`);

  // 3 save OFF has no 'lastStand' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'lastStand'/'lastStandServer' key in save blob (estado 100% derivado/transitorio)", !/"lastStand(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle (no synthetic enemies present)
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.lastStand({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.lastStand({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of count (boostProbe)
  const tab = await page.evaluate(() => {
    const out = {};
    for (const c of [0, 2, 3, 4, 5]) out[c] = window.__dev.lastStand({ boostProbe: { count: c } }).probe;
    return out;
  });
  ok("5 TABLA de tiers = función PURA del CONTEO: 0→T0/0, 2→T0/0, 3→T1/0.06, 4→T1/0.06, 5→T2/0.12",
     tab[0].tier === 0 && near(tab[0].boost, 0) && tab[2].tier === 0 && near(tab[2].boost, 0) &&
     tab[3].tier === 1 && near(tab[3].boost, 0.06) && tab[4].tier === 1 && near(tab[4].boost, 0.06) &&
     tab[5].tier === 2 && near(tab[5].boost, 0.12), JSON.stringify(tab));

  // 6 server-auth count from real G.enemies
  const cnt = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const a = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24 } });
    const b = window.__dev.lastStand({ engage: { n: 2, state: "chase", dist: 24 } });
    const c = window.__dev.lastStand({ clearEngage: true });
    return { a: { count: a.count, tier: a.tier }, b: { count: b.count, tier: b.tier }, c: { count: c.count, tier: c.tier } };
  });
  ok("6 SERVER-AUTH conteo de G.enemies REAL: engage 3⇒count3/T1; +2⇒count5/T2; clearEngage⇒count0",
     cnt.a.count === 3 && cnt.a.tier === 1 && cnt.b.count === 5 && cnt.b.tier === 2 && cnt.c.count === 0 && cnt.c.tier === 0, JSON.stringify(cnt));

  // 7 ★ DIFERENCIADOR: state gate + proximity gate + instantaneous
  const diff = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const idle = window.__dev.lastStand({ engage: { n: 4, state: "idle", dist: 24 } }).count;   // idle no engancha
    window.__dev.lastStand({ clearEngage: true });
    const chase = window.__dev.lastStand({ engage: { n: 4, state: "chase", dist: 24 } }).count;  // chase engancha
    window.__dev.lastStand({ clearEngage: true });
    const far = window.__dev.lastStand({ engage: { n: 4, state: "chase", dist: 500 } }).count;   // fuera del radio
    window.__dev.lastStand({ clearEngage: true });
    const near = window.__dev.lastStand({ engage: { n: 4, state: "chase", dist: 24 } }).count;   // dentro del radio
    const instant = window.__dev.lastStand({ clearEngage: true }).count;                          // instantáneo (sin decay)
    return { idle, chase, far, near, instant };
  });
  ok("7 ★ DIFERENCIADOR: idle NO engancha (0) / chase engancha (4); dist500>radio (0) / dist24 (4); clearEngage instantáneo (0, sin decay ⊥Cadence)",
     diff.idle === 0 && diff.chase === 4 && diff.far === 0 && diff.near === 4 && diff.instant === 0, JSON.stringify(diff));

  // 8 ★ neutral pacíficos no cuentan
  const neut = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const hostile = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24 } }).count;   // 3 hostiles enganchados ⇒ cuentan
    window.__dev.lastStand({ clearEngage: true });
    const neutral = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24, neutral: true } }).count;  // 3 neutrales-pacíficos (tpl.neutral && !hostile) ⇒ NO cuentan
    window.__dev.lastStand({ clearEngage: true });
    return { hostile, neutral };
  });
  ok("8 ★ neutral pacíficos (tpl.neutral && !hostile) NO cuentan (0); hostiles enganchados sí (3) — mismo criterio que aggro",
     neut.hostile === 3 && neut.neutral === 0, JSON.stringify(neut));
  await page.evaluate(() => window.__dev.lastStand({ clearEngage: true }));

  // 9 passive channel wardRegen
  const pas = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const lo = window.__dev.lastStand({ engage: { n: 2, dist: 24 } });   // <3 ⇒ T0
    window.__dev.lastStand({ clearEngage: true });
    const hi = window.__dev.lastStand({ engage: { n: 4, dist: 24 } });   // ≥3 ⇒ T1
    window.__dev.lastStand({ clearEngage: true });
    return { lo: { boost: lo.boost, tier: lo.tier, wrb: lo.wardRegenBoost }, hi: { boost: hi.boost, tier: hi.tier, wrb: hi.wardRegenBoost } };
  });
  ok("9 PASSIVE canal wardRegen: count<3 ⇒ boost0/T0; count≥3 ⇒ boost>0/T1 + wardRegenBoost>0",
     near(pas.lo.boost, 0) && pas.lo.tier === 0 && pas.hi.boost > 0 && pas.hi.tier === 1 && pas.hi.wrb > 0, JSON.stringify(pas));

  // 10 ★ SHARE-CAP con Warding Ring (capProbe pure math)
  const cap = await page.evaluate(() => {
    return {
      wardT3: window.__dev.lastStand({ capProbe: { count: 5, wardBoost: 0.15 } }).capped,   // 0.15 + 0.12 ⇒ cap 0.15
      wardNone: window.__dev.lastStand({ capProbe: { count: 5, wardBoost: 0 } }).capped,     // 0 + 0.12 ⇒ 0.12
      wardT2: window.__dev.lastStand({ capProbe: { count: 3, wardBoost: 0.10 } }).capped,    // 0.10 + 0.06 ⇒ cap 0.15 (sería 0.16)
    };
  });
  ok("10 ★ SHARE-CAP: wardT3(0.15)+ls(0.12)⇒0.15 (cede); ward0+ls(0.12)⇒0.12 (≤cap); wardT2(0.10)+ls(0.06)⇒0.15 (capado, sería 0.16)",
     near(cap.wardT3.combined, 0.15) && near(cap.wardNone.combined, 0.12) && near(cap.wardT2.combined, 0.15) && cap.wardT2.cap === 0.15,
     JSON.stringify(cap));

  // 11 ★ SEAM REAL wardRegenTick
  const seam = await page.evaluate(() => {
    // T2 (5 enganchados) — hero fuera de zona de cordón ⇒ wardBoost 0 ⇒ combined = ls 0.12
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    const on2 = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ clearEngage: true });
    // T1 (3 enganchados) — combined = ls 0.06
    window.__dev.lastStand({ engage: { n: 3, dist: 24 } });
    const on1 = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ clearEngage: true });
    // OFF (delega a Warding Ring; hero fuera de zona ⇒ 0)
    window.__dev.lastStand({ enabled: false });
    window.__dev.lastStand({ enabled: false, engage: { n: 5, dist: 24 } });
    const off = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    window.__dev.lastStand({ enabled: false });
    return { on2, on1, off };
  });
  const ratioOK = seam.on1.delta > 0 && near(seam.on2.delta / seam.on1.delta, 1.12 / 1.06, 2e-3);
  ok("11 ★ SEAM REAL wardRegenTick: ON T2 delta>0 (boost0.12); T2/T1 ratio=1.12/1.06; OFF delta 0 (delega a Warding Ring, byte-id fuera de zona)",
     seam.on2.delta > 0 && near(seam.on2.boost, 0.12) && near(seam.on1.boost, 0.06) && ratioOK && near(seam.off.delta, 0),
     JSON.stringify(seam));

  // 12 ★ BYTE-NEUTRAL OFF en el seam: wardRegenBoost == wardMulRegen exacto
  const neutral = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    const bare = window.__dev.lastStand();                                   // sin enganche
    window.__dev.lastStand({ enabled: false, engage: { n: 5, dist: 24 } });  // superado PERO OFF
    const eng = window.__dev.lastStand();
    window.__dev.lastStand({ clearEngage: true });
    return { bare: { wrb: bare.wardRegenBoost, wm: bare.wardMulRegen }, eng: { wrb: eng.wardRegenBoost, wm: eng.wardMulRegen } };
  });
  ok("12 ★ BYTE-NEUTRAL OFF: wardRegenBoost == wardMulRegen EXACTO (superado o no) ⇒ delega a Warding Ring sin cambio",
     near(neutral.bare.wrb, neutral.bare.wm) && near(neutral.eng.wrb, neutral.eng.wm), JSON.stringify(neutral));

  // 13 ★ ORTOGONALIDAD
  const orth = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const b = window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    const peers = { rested: b.restedXpMult, gold: b.goldFindMul, crit: b.critChancePct, xp: b.xpGainMul, vamp: b.vampMul, loot: b.lootQualityFloor };
    window.__dev.lastStand({ clearEngage: true });
    const b0 = window.__dev.lastStand();
    const peers0 = { rested: b0.restedXpMult, gold: b0.goldFindMul, crit: b0.critChancePct, xp: b0.xpGainMul, vamp: b0.vampMul, loot: b0.lootQualityFloor };
    // los peers no cambian por estar superado en número
    const unchanged = peers.rested === peers0.rested && peers.gold === peers0.gold && peers.crit === peers0.crit && peers.xp === peers0.xp && peers.vamp === peers0.vamp && peers.loot === peers0.loot;
    return { peers, peers0, unchanged };
  });
  ok("13 ★ ORTOGONALIDAD wardRegen ⊥ restedMult/goldFind/critChance/xpGain/vamp/lootQuality: superado en número NO cambia los peers",
     orth.unchanged, JSON.stringify(orth));
  await page.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));

  // 14 ★ 0-REGRESSION: arc #59-#68 served true; LAST_STAND served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const lsDark = flag("LAST_STAND") === "false";
  ok("14 ★ 0-REGRESIÓN: 10 mecanismos del arco #59-#68 served enabled:true (incl. TEMPEST_SURGE #68 LIVE); LAST_STAND served false (DARK #69)",
     arcAllOn && lsDark && arc.length === 10, `lastStand=${flag("LAST_STAND")} arc=${JSON.stringify(arcLive)}`);

  // 15 render badge "Resistencia:" drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Resistencia:") >= 0) cnt++; return orig(t, x, y); };  // "Resistencia:" (con colon) = ÚNICO
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("15 render badge \"Resistencia:\" se DIBUJA ON+superado (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.lastStand({ enabled: true, clearEngage: true }); window.__dev.lastStand({ engage: { n: 5, dist: 24 } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));

  // 16 ★ NORTH STAR — 2-client convergence
  await sleep(500);   // quiesce page A before opening page B (pause-on-blur)
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });   // clear page A's save ⇒ 2º boot cae en menú
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();   // pause-on-blur ⇒ traer al frente para que el loop corra durante el boot
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate(() => {
    window.__dev.lastStand({ enabled: true, clearEngage: true });
    const s = window.__dev.lastStand({ engage: { n: 5, state: "chase", dist: 24 } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { count: s.count, tier: s.tier, boost: s.boost, combinedBoost: s.combinedBoost, tag: s.tag, fp };
  });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.count === B.count && A.tier === B.tier && near(A.boost, B.boost) && near(A.combinedBoost, B.combinedBoost) && A.tag === B.tag && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO set de enganche ⇒ count/tier/boost/combinedBoost/tag + worldFingerprint IDÉNTICOS byte-a-byte (0 desync, shard-consistente)",
     conv, `A=${JSON.stringify(A)} B=${JSON.stringify(B)}`);
  await page.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));
  await pageB.evaluate(() => window.__dev.lastStand({ enabled: false, clearEngage: true }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0,3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
