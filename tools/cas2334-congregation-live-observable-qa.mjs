// CAS-2334 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — CONGREGACIÓN / GATHERING DENSITY (CONGREGATION.enabled:true LIVE). EVO mecánica #51.
// Gemelo LIVE de la DARK observable `tools/cas2332-congregation-observable-qa.mjs` (18/18 ×2 PASS): MISMOS hechos, contra el build SERVIDO en gh-pages
// tras el flip CTO/CEO CAS-2333 (CONGREGATION.enabled false→true, commit 0409e7c+f220a16). Pre-check: version.json servido debe AVANZAR de la base
// pre-flip `e989d92e4ca9` (World Pulse LIVE) y el config servido debe mostrar CONGREGATION.enabled:true (si aún DARK ⇒ FAIL check 1, NO self-heal
// destructivo — sólo señala; el HB re-checkout si el flip no había propagado a gh-pages).
//
// EVO#51 = la mecánica MÁS multiplayer-native del arco: la dirige el HEADCOUNT REAL de jugadores LIVE por zona (presencia SERVER-AUTHORITATIVE), NO un
// reloj (World Pulse #50) NI un vínculo/proximidad (Fellowship/Mentor/Soul #47–49). Al cruzar umbrales de headcount la zona entra en Congregación por
// tiers y otorga a TODOS los presentes el MISMO passive escalable (canal RESTED_XP). Hubs orgánicos: el mundo COMPARTIDO recompensa que se llene.
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes contra gh-pages, MISMO snapshot de
// presencia server-authoritative { zona → cuenta } ⇒ ven tier + cuenta + buff IDÉNTICOS byte-a-byte (0 desync). Cruzar umbral ARRIBA (entra jugador) y
// ABAJO (logout) CONVERGE en ambos. El passive es COMPARTIDO (no per-hero): A SALE físicamente ⇒ su Δ cae a 0 PERO la cuenta/tier server-authoritative +
// el Δ de B quedan INTACTOS. Cualquier desync de cuenta/tier/buff = sev-1.
//
// ★ DIFERENCIADOR QA (check 6b) = COBERTURA de las 6 ZONAS (re-test CLASE de footgun soulPos CAS-2326): cada zona de CONGREGATION.zones hospeda una
// Congregación observable (toZone aterriza DENTRO + snapshot reflejado + tier vivo con count 8) contra el sim SERVIDO. broken=[] obligatorio.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): CONGREGATION es la MÁS BAJA del canal restedMult ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE.
// FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Todo el arco del canal está LIVE ⇒ para medir Congregación AISLADA hay que flippar
// esos peers OFF in-memory antes de medir (footgun heredado CAS-2326/2329/2331) ⇒ __iso().
//
// Patrón DEFAULT-ON (mirror pulse-live CAS-2331 / soul-live CAS-2328): el flip ya cargó ⇒ congregation().enabled===true en boot fresco SIN __dev flip.
// byte-id OFF se re-verifica INDEP vía TOGGLE enabled:false (Congregación es byte-id OFF por CONSTRUCCIÓN: 0 estado nuevo, 0 clave serializada ⇒ save
// nunca contiene 'congregation'/'congServer' aun con enabled ON).
//
// LIVE wiring (mirror CAS-2331): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded) y != base pre-flip; favicon-404 filtrado.
// Run: node tools/cas2334-congregation-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2334-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PREFLIP = "e989d92e4ca9";          // build servido ANTES del flip CAS-2333 (World Pulse LIVE) — el LIVE debe AVANZAR de este
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 25000 });
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

// desactiva peers DEFAULT-ON del mismo canal restedMult (STANDINGS/MENTOR/SOUL/PULSE) para medir Congregación AISLADA; instala __cput(zone,count).
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

async function freshPage(browser, errors, net404, tag) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${tag}:` + String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`${tag}:` + m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.bringToFront();
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page); await install(page);
  return page;
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404, "p1");
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + build AVANZÓ de pre-flip + served CONGREGATION.enabled:true + arco 0-regr + DARK trío false
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.congregation && window.__dev.pulse && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.territory && window.__dev.contest && window.__dev.fellowship && window.__dev.ledger && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { CONGREGATION: en("CONGREGATION"), PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"),
      BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const arcTrue = ["PULSE","SOUL","MENTOR","FELLOWSHIP","CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.congregation + arc hooks; served CONGREGATION.enabled:true + arco entero true (0 regr) + DARK trío false; 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && cfg.CONGREGATION === "true" && arcTrue && darksFalse && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} CONGREGATION=${cfg.CONGREGATION} arcTrue=${arcTrue} darksFalse=${darksFalse} err=${errors.length} 404=${net404.length} cfg=${JSON.stringify(cfg)}`);

  // 2 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ congregation().enabled===true (el flip cargó del config servido) + boost 0 sin estar en zona congregada
  const dOn = await page.evaluate(() => { const s = window.__dev.congregation(); return { enabled: s.enabled, boost: s.congMulRested, tag: s.tag }; });
  ok("2 DEFAULT-ON desde config servido: congregation().enabled===true (flip cargó) AND congMulRested 0 (passive NO activo sin estar en zona congregada)",
     dOn.enabled === true && dOn.boost === 0, JSON.stringify(dOn));

  // 3 byte-id OFF via TOGGLE (LIVE re-verify INDEP): enabled:false ⇒ congMulRested 0 + tag "" + save SIN 'congregation'/'congServer' + fingerprint byte-estable; restaura ON.
  //   Congregación es byte-id OFF por CONSTRUCCIÓN (0 estado nuevo, 0 clave serializada) ⇒ save nunca contiene esas claves aun con enabled ON.
  const byteId = await page.evaluate(() => {
    window.__dev.congregation({ enabled: false, clear: true, leave: true });
    const s = window.__dev.congregation();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.congregation({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.congregation({ enabled: true });                                        // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.congMulRested, tag: s.tag, saveNoKey: !/congregation|congServer/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("3 byte-id OFF (toggle LIVE): enabled false ⇒ congMulRested 0 + tag \"\" + save SIN clave congregation/congServer + fingerprint byte-estable toggle (0 estado/clave nueva)",
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.saveNoKey && byteId.fpMatch, JSON.stringify(byteId));

  // 4 TABLA de tiers = función PURA del headcount (determinista): 0/1→T0, 2/3→T1, 4/7→T2, 8/100→T3 con boost 0/0.05/0.10/0.15 (sim SERVIDO)
  const tierTable = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();   // aísla peers DEFAULT-ON del canal (si no, boost cede a standings/pulse ⇒ 0)
    const zones = window.__dev.congregation().zones; const z = zones[0]; const out = [];
    for (const n of [0, 1, 2, 3, 4, 7, 8, 100]) {
      const cc = {}; cc[z] = n; window.__dev.congregation({ counts: cc }); window.__dev.congregation({ toZone: z });
      const s = window.__dev.congregation(); out.push([n, s.count, s.tier, s.boost]);
    }
    window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return out;
  });
  const expTier = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 7: 2, 8: 3, 100: 3 };
  const expBoost = { 0: 0, 1: 0, 2: 0.05, 3: 0.05, 4: 0.10, 7: 0.10, 8: 0.15, 100: 0.15 };
  const tierOk = tierTable.every(([n, c, t, b]) => c === n && t === expTier[n] && near(b, expBoost[n]));
  ok("4 TABLA de tiers PURA del headcount SERVIDO (0/1→T0, 2/3→T1, 4/7→T2, 8+→T3; boost 0/.05/.10/.15)", tierOk, JSON.stringify(tierTable));

  // 5 server-authoritative reflect + validation: out-of-zone key + count<=0 DESCARTADAS (cliente sólo refleja)
  const reflect = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true });
    window.__dev.congregation({ counts: { forest: 5, nonzone: 9, caves: 0, swamp: -3 } });
    const s = window.__dev.congregation();
    window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return s.counts;
  });
  ok("5 server-authoritative reflect: zona válida refleja, fuera-de-zonas + cuenta≤0 DESCARTADAS (cliente sólo REFLEJA presencia)", reflect && reflect.forest === 5 && !("nonzone" in reflect) && !("caves" in reflect) && !("swamp" in reflect), JSON.stringify(reflect));

  // 6b ★ COBERTURA 6 ZONAS (re-test footgun CAS-2326, sim SERVIDO): cada zona de CONGREGATION.zones hospeda Congregación viva observable (toZone DENTRO + T3 con count 8)
  const zoneCov = await page.evaluate(() => {
    const zones = window.__dev.congregation().zones; const broken = [], live = [];
    window.__iso();
    for (const z of zones) {
      const s = window.__cput(z, 8);
      if (s && s.tier === 3 && Math.abs(s.congMulRested - 0.15) < 1e-9) live.push(z); else broken.push(z);
    }
    window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return { zones, live, broken };
  });
  ok("6b ★ COBERTURA LIVE 6 zonas: TODAS hospedan Congregación viva observable (broken=[])", zoneCov.broken.length === 0 && zoneCov.live.length === zoneCov.zones.length && zoneCov.zones.length === 6, `live=${JSON.stringify(zoneCov.live)} broken=${JSON.stringify(zoneCov.broken)}`);

  // 7 CRUCE de umbral ARRIBA y ABAJO (1-página): 1→2→4→8 sube T0→1→2→3; 8→4→2→1 DECAE T3→2→1→0 (sin histéresis)
  const cross = await page.evaluate(() => {
    window.__iso(); window.__dev.congregation({ enabled: true });
    const z = window.__dev.congregation().zones[0]; window.__cput(z, 2);
    const up = [], down = [];
    for (const n of [1, 2, 4, 8]) { const cc = {}; cc[z] = n; window.__dev.congregation({ counts: cc }); up.push(window.__dev.congregation().tier); }
    for (const n of [8, 4, 2, 1]) { const cc = {}; cc[z] = n; window.__dev.congregation({ counts: cc }); down.push(window.__dev.congregation().tier); }
    window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return { up, down };
  });
  ok("7 cruce umbral ARRIBA/ABAJO 1-página: up [0,1,2,3] + down DECAE [3,2,1,0] (0 histéresis)", JSON.stringify(cross.up) === JSON.stringify([0, 1, 2, 3]) && JSON.stringify(cross.down) === JSON.stringify([3, 2, 1, 0]), JSON.stringify(cross));

  // 8 PASSIVE compartido AISLADO: peers OFF + snapshot≥umbral + héroe EN zona ⇒ congMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0
  const iso = await page.evaluate(() => {
    window.__iso(); const s = window.__cput(window.__dev.congregation().zones[0], 4);
    const inZone = { mul: s.congMulRested, tier: s.tier, rested: s.restedXpMult };
    window.__dev.congregation({ leave: true }); const g = window.__dev.congregation();
    const left = { mul: g.congMulRested, tier: g.tier };
    window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return { inZone, left };
  });
  ok("8 PASSIVE compartido AISLADO: en zona T2 ⇒ mul 0.10 tier≥1; leave ⇒ mul 0 tier 0", near(iso.inZone.mul, 0.10) && iso.inZone.tier === 2 && iso.left.mul === 0 && iso.left.tier === 0, JSON.stringify(iso));

  // 9 seam gainXP SERVIDO: sim.js suma congMul(h,"restedMult"); ON aislado ⇒ restedXpMult incluye 0.15 + tag ⛭; OFF ⇒ mul 0 + tag ""
  const simSrc = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /congMul\(h,\s*"restedMult"\)/.test(simSrc);
  const seam = await page.evaluate(() => {
    window.__iso(); const on = window.__cput(window.__dev.congregation().zones[0], 8);
    const onState = { rested: on.restedXpMult, mul: on.congMulRested, tag: on.tag };
    window.__dev.congregation({ enabled: false }); const offS = window.__dev.congregation();
    window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return { onState, off: { mul: offS.congMulRested, tag: offS.tag } };
  });
  ok("9 seam gainXP SERVIDO wired congMul(h,'restedMult'): ON aislado ⇒ restedXpMult incluye 0.15 + tag ⛭; OFF ⇒ mul 0 + tag \"\"",
     seamWired && near(seam.onState.mul, 0.15) && seam.onState.tag === "⛭" && seam.onState.rested > 0.15 && seam.off.mul === 0 && seam.off.tag === "", `wired=${seamWired} ${JSON.stringify(seam)}`);

  // 10 PRECEDENCIA MÁXIMO ÚNICO: CONG cede a STANDINGS/SOUL/PULSE (peers DRIVEN a producir passive real) ⇒ 0; coexiste con TERRITORY (safeRegen ⊥) ⇒ intacto.
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
    window.__dev.territory({ enabled: false }); window.__dev.congregation({ enabled: true, clear: true, leave: true });
    return { base, standPeer, standCeded, soulPeer, soulCeded, pulsePeer, pulseCeded, terrCoexist };
  });
  ok("10 precedencia MÁXIMO ÚNICO LIVE: cede a STANDINGS/SOUL/PULSE (peer>0 ⇒ CONG 0); coexiste TERRITORY ⇒ 0.05 intacto",
     near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && prec.pulsePeer > 0 && prec.pulseCeded === 0 && near(prec.terrCoexist, 0.05),
     JSON.stringify(prec));

  // 11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await freshPage(browser, errors, net404, "p2");

  const SNAP1 = { forest: 4 };
  const applySnap = async (pg, snap, zone) => pg.evaluate((s, z) => {
    window.__iso(); window.__dev.congregation({ enabled: true }); window.__dev.congregation({ counts: s });
    const st = window.__dev.congregation({ toZone: z });
    return { zone: st.zone, count: st.count, tier: st.tier, mul: st.congMulRested };
  }, snap, zone);
  const a1 = await applySnap(page, SNAP1, "forest");
  const b1 = await applySnap(page2, SNAP1, "forest");
  const conv1 = JSON.stringify(a1) === JSON.stringify(b1) && a1.tier === 2 && near(a1.mul, 0.10);
  ok("11a NORTH STAR LIVE convergencia: mismo snapshot {forest:4} ⇒ A==B byte-a-byte (T2/×4/0.10)", conv1, `A=${JSON.stringify(a1)} B=${JSON.stringify(b1)}`);

  const pushBoth = async (snap) => { const a = await page.evaluate((s) => { window.__dev.congregation({ counts: s }); const x = window.__dev.congregation(); return { count: x.count, tier: x.tier, mul: x.congMulRested }; }, snap);
    const b = await page2.evaluate((s) => { window.__dev.congregation({ counts: s }); const x = window.__dev.congregation(); return { count: x.count, tier: x.tier, mul: x.congMulRested }; }, snap); return { a, b }; };
  const up = await pushBoth({ forest: 8 });
  const convUp = JSON.stringify(up.a) === JSON.stringify(up.b) && up.a.tier === 3 && near(up.a.mul, 0.15);
  ok("11b NORTH STAR LIVE cruce ARRIBA: server empuja forest:8 ⇒ A y B convergen T3/0.15", convUp, `A=${JSON.stringify(up.a)} B=${JSON.stringify(up.b)}`);

  const down = await pushBoth({ forest: 2 });
  const convDown = JSON.stringify(down.a) === JSON.stringify(down.b) && down.a.tier === 1 && near(down.a.mul, 0.05);
  ok("11c NORTH STAR LIVE cruce ABAJO (logout): forest:2 ⇒ A y B DECAEN a T1/0.05", convDown, `A=${JSON.stringify(down.a)} B=${JSON.stringify(down.b)}`);

  // A SALE físicamente de la zona ⇒ Δ_A=0 PERO cuenta/tier compartidos + Δ_B INTACTOS (passive compartido, no per-hero)
  await pushBoth({ forest: 8 });
  const aLeave = await page.evaluate(() => { window.__dev.congregation({ leave: true }); const x = window.__dev.congregation(); return { mul: x.congMulRested, tier: x.tier, count: x.count, zone: x.zone }; });
  const bStill = await page2.evaluate(() => { const x = window.__dev.congregation(); return { mul: x.congMulRested, tier: x.tier, count: x.count, zone: x.zone }; });
  const aCountShared = await page.evaluate(() => window.__dev.congregation().counts);
  const noDesync = aLeave.mul === 0 && near(bStill.mul, 0.15) && bStill.tier === 3 && aCountShared.forest === 8;
  ok("11d NORTH STAR LIVE A sale zona: Δ_A=0 PERO cuenta compartida forest:8 + Δ_B INTACTO T3/0.15 (0 desync)", noDesync, `A=${JSON.stringify(aLeave)} sharedCount=${JSON.stringify(aCountShared)} B=${JSON.stringify(bStill)}`);
  await page2.screenshot({ path: join(OUT, "client-b-congregation.png") });

  // 12 render badge ON vs OFF (Δ px en la región CORRECTA del badge, top-right bajo minimapa) + noise-floor + arco regr + fps.
  await page.bringToFront();
  await sleep(250);
  const sampleRegion = (pg) => pg.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const VW = c.width, VH = c.height;
    const x = Math.max(0, VW - Math.round(300 * dpr)), y = Math.round(300 * dpr), w = Math.round(300 * dpr), h = Math.round(120 * dpr);
    const d = g.getImageData(x, y, Math.min(w, VW - x), Math.min(h, VH - y)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0;
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.congregation({ enabled: false, clear: true, leave: true }); });
  await sleep(220);
  const offSum = await sampleRegion(page);
  const offSum2 = await sampleRegion(page);
  const noise = Math.abs(offSum - offSum2);
  await page.evaluate(() => { window.__dev.congregation({ enabled: true }); window.__cput(window.__dev.congregation().zones[0], 8); });
  await sleep(220);
  const onSum = await sampleRegion(page);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const delta = Math.abs(onSum - offSum);
  const badgeDrawn = delta > 0 && delta > noise;
  ok("12a render badge Congregación DIBUJA en región top-right (Δ>noise) vs OFF-control LIVE", badgeDrawn, `offSum=${offSum} onSum=${onSum} delta=${delta} noise=${noise}`);

  // 12b arco previo re-activable LIVE (peers flippeados OFF in-memory arriba; re-flip ON verifica DISCO true) — 0 regr
  const arcDisk = await page.evaluate(() => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); window.__dev.soul({ enabled: true }); window.__dev.pulse({ enabled: true }); window.__dev.mentor({ enabled: true });
    return { standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled, soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled };
  });
  ok("12b arco previo re-activable LIVE (standings/territory/soul/pulse/mentor) — 0 regr", Object.values(arcDisk).every(Boolean), JSON.stringify(arcDisk));

  // 12c fps
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("12c fps estable ≥55 LIVE", fps >= 55, `fps=${fps}`);

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2334 QA LIVE observable+2cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  if (net404.length) console.log("net404:\n" + net404.join("\n"));
  ok("0 no JS errors/404 during run", errors.length === 0 && net404.length === 0, `errors=${errors.length} net404=${net404.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
if (FAIL > 0) process.exitCode = 1;
