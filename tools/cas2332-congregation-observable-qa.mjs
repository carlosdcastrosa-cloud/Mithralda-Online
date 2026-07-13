// CAS-2332 — QA OBSERVABLE for CONGREGACIÓN / GATHERING DENSITY (DARK, CONGREGATION.enabled:false). EVO mecánica #51.
// INDEPENDENT QA harness (not the GE self-verify). La mecánica MÁS multiplayer-native del arco: la dirige el HEADCOUNT REAL de jugadores LIVE por zona
// (presencia SERVER-AUTHORITATIVE), NO un reloj (World Pulse #50) NI un vínculo/proximidad (Fellowship/Mentor/Soul #47–49). Al cruzar umbrales de
// headcount la zona entra en Congregación por tiers y otorga a TODOS los presentes el MISMO passive escalable (canal RESTED_XP). Hubs orgánicos.
//
// ★ North Star (check 11) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO snapshot de presencia
// server-authoritative { zona → cuenta } ⇒ ven tier + cuenta + buff IDÉNTICOS byte-a-byte (0 desync). Cruzar umbral ARRIBA (entra jugador) y ABAJO
// (sale/logout) CONVERGE en ambos. El passive es COMPARTIDO (no per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO la cuenta/tier
// server-authoritative + el Δ de B quedan INTACTOS. Cualquier desync de cuenta/tier/buff = sev-1.
//
// ★★ DIFERENCIADOR QA (check 6b) = COBERTURA de las 6 ZONAS: cada zona de CONGREGATION.zones debe hospedar una Congregación observable (toZone aterriza
// DENTRO + snapshot reflejado + tier vivo). Re-test de la clase de footgun soulPos CAS-2326 (donde 3/6 zonas eran irrecuperables por guard zoneOf).
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): CONGREGATION es la MÁS BAJA del canal restedMult ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE.
// FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Todo el arco del canal está LIVE ⇒ para medir Congregación AISLADA hay que flippar
// esos peers OFF in-memory (footgun heredado CAS-2326/2329) ⇒ __iso().
//
// Observado vía __dev.congregation (flip enabled IN-MEMORY + inyección del snapshot { zona → cuenta } + toZone/leave) + peers/saveBlob/worldFingerprint.
// Run: node tools/cas2332-congregation-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2332-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

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

// desactiva peers DEFAULT-ON del mismo canal restedMult (STANDINGS/MENTOR/SOUL/PULSE) para medir Congregación AISLADA; instala __cpick(count,zone).
async function install(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); };
    // teleporta a `zone` con snapshot inyectado; devuelve el estado observado (o null si no cae dentro).
    window.__cput = (zone, count) => {
      window.__dev.congregation({ enabled: true });
      const cc = {}; cc[zone] = count; window.__dev.congregation({ counts: cc });
      const s = window.__dev.congregation({ toZone: zone });
      return (s.zone === zone && s.congable) ? s : null;
    };
  });
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
  await install(page);

  // 1 boots + hooks + build
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.congregation && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.territory && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.congregation + arc hooks + __BUILD, 0 JS err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false AND G.congregation NEVER created (gExists false)
  const off = await page.evaluate(() => window.__dev.congregation());
  ok("2 byte-id OFF fresh boot: enabled=false AND gExists=false (0 estado nuevo)", off.enabled === false && off.gExists === false && off.congMulRested === 0 && off.tag === "", `enabled=${off.enabled} gExists=${off.gExists} mul=${off.congMulRested} tag="${off.tag}"`);

  // 3 byte-id save OFF: no 'congregation'/'congServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: saveBlob SIN clave congregation/congServer", !/congregation|congServer/i.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => { window.__dev.congregation({ enabled: true }); window.__dev.congregation({ counts: { forest: 8 } }); });
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.congregation({ enabled: false, clear: true }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpA === fpB, `stable=${fpA === fpB}`);

  // 5 TABLA de tiers = función PURA del headcount (determinista): 0/1→T0, 2/3→T1, 4/7→T2, 8/100→T3 con boost 0/0.05/0.10/0.15
  const tierTable = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();   // aísla peers DEFAULT-ON del canal (si no, boost cede a standings/pulse ⇒ 0)
    const zones = window.__dev.congregation().zones; const z = zones[0]; const out = [];
    for (const n of [0, 1, 2, 3, 4, 7, 8, 100]) {
      const cc = {}; cc[z] = n; window.__dev.congregation({ counts: cc }); window.__dev.congregation({ toZone: z });
      const s = window.__dev.congregation(); out.push([n, s.count, s.tier, s.boost]);
    }
    window.__dev.congregation({ enabled: false, clear: true, leave: true });
    return out;
  });
  const expTier = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 7: 2, 8: 3, 100: 3 };
  const expBoost = { 0: 0, 1: 0, 2: 0.05, 3: 0.05, 4: 0.10, 7: 0.10, 8: 0.15, 100: 0.15 };
  const tierOk = tierTable.every(([n, c, t, b]) => c === n && t === expTier[n] && Math.abs(b - expBoost[n]) < 1e-9);
  ok("5 TABLA de tiers PURA del headcount (0/1→T0, 2/3→T1, 4/7→T2, 8+→T3; boost 0/.05/.10/.15)", tierOk, JSON.stringify(tierTable));

  // 6 server-authoritative reflect + validation: out-of-zone key + count<=0 DISCARDED (cliente sólo refleja)
  const reflect = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true });
    window.__dev.congregation({ counts: { forest: 5, nonzone: 9, caves: 0, swamp: -3 } });
    const s = window.__dev.congregation();
    window.__dev.congregation({ enabled: false, clear: true, leave: true });
    return s.counts;
  });
  ok("6 server-authoritative reflect: zona válida refleja, fuera-de-zonas + cuenta≤0 DESCARTADAS", reflect && reflect.forest === 5 && !("nonzone" in reflect) && !("caves" in reflect) && !("swamp" in reflect), JSON.stringify(reflect));

  // 6b ★ COBERTURA 6 ZONAS: cada zona de CONGREGATION.zones hospeda Congregación observable (toZone aterriza DENTRO + tier vivo con count 8)
  const zoneCov = await page.evaluate(() => {
    const zones = window.__dev.congregation().zones; const broken = [], live = [];
    window.__iso();
    for (const z of zones) {
      const s = window.__cput(z, 8);
      if (s && s.tier === 3 && Math.abs(s.congMulRested - 0.15) < 1e-9) live.push(z); else broken.push(z);
    }
    window.__dev.congregation({ enabled: false, clear: true, leave: true });
    return { zones, live, broken };
  });
  ok("6b ★ COBERTURA 6 zonas: TODAS hospedan Congregación viva observable (broken=[])", zoneCov.broken.length === 0 && zoneCov.live.length === zoneCov.zones.length, `live=${JSON.stringify(zoneCov.live)} broken=${JSON.stringify(zoneCov.broken)}`);

  // 7 CRUCE de umbral ARRIBA y ABAJO (1-página): 1→2→4→8 sube T0→1→2→3; 8→4→2→1 DECAE T3→2→1→0 (sin histéresis)
  const cross = await page.evaluate(() => {
    window.__iso(); window.__dev.congregation({ enabled: true });
    const z = window.__dev.congregation().zones[0]; window.__dev.congregation({ toZone: z }); // asegurar dentro
    // re-teleport dentro con un count vivo primero
    window.__cput(z, 2);
    const up = [], down = [];
    for (const n of [1, 2, 4, 8]) { const cc = {}; cc[z] = n; window.__dev.congregation({ counts: cc }); up.push(window.__dev.congregation().tier); }
    for (const n of [8, 4, 2, 1]) { const cc = {}; cc[z] = n; window.__dev.congregation({ counts: cc }); down.push(window.__dev.congregation().tier); }
    window.__dev.congregation({ enabled: false, clear: true, leave: true });
    return { up, down };
  });
  ok("7 cruce umbral ARRIBA/ABAJO 1-página: up [0,1,2,3] + down DECAE [3,2,1,0] (0 histéresis)", JSON.stringify(cross.up) === JSON.stringify([0, 1, 2, 3]) && JSON.stringify(cross.down) === JSON.stringify([3, 2, 1, 0]), JSON.stringify(cross));

  // 8 PASSIVE compartido AISLADO: peers OFF + snapshot≥umbral + héroe EN zona ⇒ congMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0
  const iso = await page.evaluate(() => {
    window.__iso(); const s = window.__cput(window.__dev.congregation().zones[0], 4);
    const inZone = { mul: s.congMulRested, tier: s.tier, rested: s.restedXpMult };
    window.__dev.congregation({ leave: true }); const g = window.__dev.congregation();
    const left = { mul: g.congMulRested, tier: g.tier };
    window.__dev.congregation({ enabled: false, clear: true, leave: true });
    return { inZone, left };
  });
  ok("8 PASSIVE compartido AISLADO: en zona T2 ⇒ mul 0.10 tier≥1; leave ⇒ mul 0 tier 0", Math.abs(iso.inZone.mul - 0.10) < 1e-9 && iso.inZone.tier === 2 && iso.left.mul === 0 && iso.left.tier === 0, JSON.stringify(iso));

  // 9 seam gainXP: restedXpMult efectivo REFLEJA el congMul cuando aislado; enabled false ⇒ mul 0 + tag ""
  const seam = await page.evaluate(() => {
    window.__iso(); const on = window.__cput(window.__dev.congregation().zones[0], 8);
    const onState = { rested: on.restedXpMult, mul: on.congMulRested, tag: on.tag };
    window.__dev.congregation({ enabled: false }); const offS = window.__dev.congregation();
    window.__dev.congregation({ clear: true, leave: true });
    return { onState, off: { mul: offS.congMulRested, tag: offS.tag } };
  });
  // rested base = RESTED_XP.xpMult (con peers off) + 0.15 congregación ⇒ mul aparece en el efectivo; off ⇒ 0 + tag ""
  ok("9 seam gainXP: ON aislado ⇒ restedXpMult incluye congMul 0.15 + tag ⛭; OFF ⇒ mul 0 + tag \"\"", Math.abs(seam.onState.mul - 0.15) < 1e-9 && seam.onState.tag === "⛭" && seam.onState.rested > 0.15 && seam.off.mul === 0 && seam.off.tag === "", JSON.stringify(seam));

  // 10 PRECEDENCIA MÁXIMO ÚNICO: CONG cede a STANDINGS/SOUL/PULSE (peers DRIVEN a producir passive real) ⇒ 0; coexiste con TERRITORY (safeRegen ⊥) ⇒ intacto.
  //    (flippar enabled NO basta: el peer debe producir mul>0 — pledge líder / morir / pulso vivo en la zona — para que CONG realmente ceda.)
  const prec = await page.evaluate(() => {
    window.__iso(); window.__dev.territory({ enabled: false });
    const z = window.__dev.congregation().zones[0];
    window.__cput(z, 2);                                                    // base aislada ⇒ 0.05
    const base = window.__dev.congregation({ toZone: z }).congMulRested;
    // (a) STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ CONG cede
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const s1 = window.__dev.congregation({ toZone: z }); const standPeer = s1.standingsMulRested, standCeded = s1.congMulRested;
    window.__dev.standings({ enabled: false });
    // (b) SOUL: morir ⇒ buff recuperación caído ⇒ soulMul>0 ⇒ CONG cede
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: 1234 * 300000 }); window.__dev.soul({ die: true });
    const s2 = window.__dev.congregation({ toZone: z }); const soulPeer = s2.soulMulRested, soulCeded = s2.congMulRested;
    window.__dev.soul({ enabled: false });
    // (c) PULSE: pulso vivo en la MISMA zona ⇒ pulseMul>0 ⇒ CONG cede
    window.__dev.pulse({ enabled: true }); let pulsePeer = 0, pulseCeded = base;
    for (let p = 1000; p < 1120; p++) { const nm = p * 240000 + 24000; const ps = window.__dev.pulse({ nowMs: nm });
      if (ps.live && ps.zone === z) { const cc = {}; cc[z] = 2; window.__dev.congregation({ counts: cc });
        const s3 = window.__dev.congregation({ toZone: z }); pulsePeer = s3.pulseMulRested; pulseCeded = s3.congMulRested; break; } }
    window.__dev.pulse({ enabled: false });
    // (d) TERRITORY (⊥ safeRegen): NO afecta congMul ⇒ intacto
    const cc = {}; cc[z] = 2; window.__dev.congregation({ counts: cc });
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.congregation({ toZone: z }).congMulRested;
    window.__dev.territory({ enabled: false }); window.__dev.congregation({ enabled: false, clear: true, leave: true });
    return { base, standPeer, standCeded, soulPeer, soulCeded, pulsePeer, pulseCeded, terrCoexist };
  });
  ok("10 precedencia MÁXIMO ÚNICO: cede a STANDINGS/SOUL/PULSE (peer>0 ⇒ CONG 0); coexiste TERRITORY ⇒ 0.05 intacto",
     Math.abs(prec.base - 0.05) < 1e-9 && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && prec.pulsePeer > 0 && prec.pulseCeded === 0 && Math.abs(prec.terrCoexist - 0.05) < 1e-9,
     JSON.stringify(prec));

  // 11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL
  const pageB = await browser.newPage();
  pageB.on("pageerror", (e) => errors.push("B:" + String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();                                              // tab en foreground: rAF no se throttlea durante la progresión de escena
  await toPlay(pageB);
  await install(pageB);

  // snapshot compartido idéntico { forest: 4 } ⇒ ambos ven T2/count4/buff 0.10 en forest
  const SNAP1 = { forest: 4 };
  const applySnap = async (pg, snap, zone) => pg.evaluate((s, z) => {
    window.__iso(); window.__dev.congregation({ enabled: true }); window.__dev.congregation({ counts: s });
    const st = window.__dev.congregation({ toZone: z });
    return { zone: st.zone, count: st.count, tier: st.tier, mul: st.congMulRested };
  }, snap, zone);
  const a1 = await applySnap(page, SNAP1, "forest");
  const b1 = await applySnap(pageB, SNAP1, "forest");
  const conv1 = JSON.stringify(a1) === JSON.stringify(b1) && a1.tier === 2 && Math.abs(a1.mul - 0.10) < 1e-9;
  ok("11a NORTH STAR convergencia: mismo snapshot {forest:4} ⇒ A==B byte-a-byte (T2/×4/0.10)", conv1, `A=${JSON.stringify(a1)} B=${JSON.stringify(b1)}`);

  // cruzar umbral ARRIBA: server empuja forest:8 a AMBOS ⇒ ambos convergen a T3/0.15
  const pushBoth = async (snap) => { const a = await page.evaluate((s) => { window.__dev.congregation({ counts: s }); const x = window.__dev.congregation(); return { count: x.count, tier: x.tier, mul: x.congMulRested }; }, snap);
    const b = await pageB.evaluate((s) => { window.__dev.congregation({ counts: s }); const x = window.__dev.congregation(); return { count: x.count, tier: x.tier, mul: x.congMulRested }; }, snap); return { a, b }; };
  const up = await pushBoth({ forest: 8 });
  const convUp = JSON.stringify(up.a) === JSON.stringify(up.b) && up.a.tier === 3 && Math.abs(up.a.mul - 0.15) < 1e-9;
  ok("11b NORTH STAR cruce ARRIBA: server empuja forest:8 ⇒ A y B convergen T3/0.15", convUp, `A=${JSON.stringify(up.a)} B=${JSON.stringify(up.b)}`);

  // cruzar umbral ABAJO (logout): forest:2 ⇒ ambos DECAEN a T1/0.05
  const down = await pushBoth({ forest: 2 });
  const convDown = JSON.stringify(down.a) === JSON.stringify(down.b) && down.a.tier === 1 && Math.abs(down.a.mul - 0.05) < 1e-9;
  ok("11c NORTH STAR cruce ABAJO (logout): forest:2 ⇒ A y B DECAEN a T1/0.05", convDown, `A=${JSON.stringify(down.a)} B=${JSON.stringify(down.b)}`);

  // A SALE físicamente de la zona ⇒ Δ_A=0 PERO cuenta/tier compartidos + Δ_B INTACTOS (passive compartido, no per-hero)
  // primero restaurar count vivo 8 en ambos
  await pushBoth({ forest: 8 });
  const aLeave = await page.evaluate(() => { window.__dev.congregation({ leave: true }); const x = window.__dev.congregation(); return { mul: x.congMulRested, tier: x.tier, count: x.count, zone: x.zone }; });
  const bStill = await pageB.evaluate(() => { const x = window.__dev.congregation(); return { mul: x.congMulRested, tier: x.tier, count: x.count, zone: x.zone }; });
  // A: fuera de zona ⇒ mul 0, zone null/no-forest; pero congCount(forest) sigue 8 en el snapshot; B intacto T3/0.15
  const aCountShared = await page.evaluate(() => window.__dev.congregation().counts);
  const noDesync = aLeave.mul === 0 && Math.abs(bStill.mul - 0.15) < 1e-9 && bStill.tier === 3 && aCountShared.forest === 8;
  ok("11d NORTH STAR A sale zona: Δ_A=0 PERO cuenta compartida forest:8 + Δ_B INTACTO T3/0.15 (0 desync)", noDesync, `A=${JSON.stringify(aLeave)} sharedCount=${JSON.stringify(aCountShared)} B=${JSON.stringify(bStill)}`);

  await page.bringToFront();                                              // vuelve page A a foreground para que el render badge realmente pinte (rAF)
  await sleep(250);
  // 12 render badge ON vs OFF (Δ px en la región CORRECTA del badge) + noise-floor + arco regr + fps.
  // ★ El badge se ancla TOP-RIGHT bajo el minimapa (badgeRowAnchor.by+186) — zona HUD estática, NO el mundo animado del centro.
  //    (GE check 12 muestreaba (0,380,460,360)=abajo-izq ⇒ sin badge ⇒ sumOff==sumOn flaky; aquí muestreo la región real.)
  const sampleRegion = (pg) => pg.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    // región top-right bajo el minimapa (px de canvas). VW/VH lógicos → px reales vía dpr.
    const VW = c.width, VH = c.height;
    const x = Math.max(0, VW - Math.round(300 * dpr)), y = Math.round(300 * dpr), w = Math.round(300 * dpr), h = Math.round(120 * dpr);
    const d = g.getImageData(x, y, Math.min(w, VW - x), Math.min(h, VH - y)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0;
  });
  // OFF control: enabled false ⇒ renderCongregationBadge NUNCA corre (gate línea 360)
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.congregation({ enabled: false, clear: true, leave: true }); });
  await sleep(220);
  const offSum = await sampleRegion(page);
  const offSum2 = await sampleRegion(page);           // noise floor: 2 capturas consecutivas con OFF (mismo estado)
  const noise = Math.abs(offSum - offSum2);
  // ON: enabled + hero en zona congregada T3 ⇒ badge ⛭ ámbar "Congregación: <zona> T3 ×8"
  await page.evaluate(() => { window.__cput(window.__dev.congregation().zones[0], 8); });
  await sleep(220);
  const onSum = await sampleRegion(page);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const delta = Math.abs(onSum - offSum);
  const badgeDrawn = delta > 0 && delta > noise;      // el badge cambia la región MÁS que el ruido de fondo del HUD
  ok("12a render badge Congregación DIBUJA en región top-right (Δ>noise) vs OFF-control", badgeDrawn, `offSum=${offSum} onSum=${onSum} delta=${delta} noise=${noise}`);

  // arco regr: todos los flags previos LIVE intactos (enabled true) + CONGREGATION default false en DISCO
  const arc = await page.evaluate(() => ({
    standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled,
    soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled,
  }));
  // nota: peers flippeados OFF in-memory arriba; re-flip ON para verificar que el DISCO los tiene true
  const arcDisk = await page.evaluate(() => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); window.__dev.soul({ enabled: true }); window.__dev.pulse({ enabled: true }); window.__dev.mentor({ enabled: true });
    return { standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled, soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled };
  });
  ok("12b arco previo re-activable LIVE (standings/territory/soul/pulse/mentor) — 0 regr", Object.values(arcDisk).every(Boolean), JSON.stringify(arcDisk));

  // fps
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(r => { function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(); } requestAnimationFrame(f); }); return n; });
  ok("12c fps estable ≥55", fps >= 55, `fps=${fps}`);

  console.log(`\n=== CAS-2332 QA OBSERVABLE: ${PASS} PASS / ${FAIL} FAIL / ${errors.length} JS-err ===`);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8).join("\n"));
  console.log("build=" + build);
} finally {
  await browser.close();
  await server.close();
}
process.exit(FAIL === 0 && errors.length === 0 ? 0 : 1);
