// CAS-2328 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — VESTIGIO DEL CAÍDO / FALLEN WAYFARER'S VESTIGE (SOUL_RECOVERY.enabled:true LIVE).
// Gemelo LIVE de la DARK observable `tools/cas2325-soul-observable-qa.mjs` (15/15 ×2 PASS): MISMOS hechos, contra el build SERVIDO en gh-pages
// tras el flip del CTO (CAS-2327: SOUL_RECOVERY false→true + deploy overlay 4-file consistente-HEAD, SIN input.js). Incluye el fix CAS-2326
// (soulPos guard zoneOf(site)==zone) ⇒ check 6b (cobertura recuperabilidad por zona) DEBE dar broken=[] LIVE. Patrón DEFAULT-ON (el flip ya
// cargó: enabled:true SERVIDO; tickSoul corre con el reloj REAL ⇒ G.soul transitorio existe — la OFF-safety NO es gExists false sino que NADA
// del canal restedMult/save/fingerprint cambie al togglear OFF; footgun Fellowship CAS-2320 / Mentor CAS-2324).
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes contra gh-pages, MISMO reloj
// lógico (nowMs) ⇒ VESTIGIO ambiental IDÉNTICO byte-a-byte; A(id==caído)=FALLEN (deny 'own' + buff respawn 0.15) + B(id≠caído)=RECOVERER
// (proximidad+dwell ⇒ auto-recupera + boost 0.10); B recupera + A muere ⇒ vestigio compartido + rol/buff de A + estado de B INTACTOS (0 desync).
//
// LIVE wiring (mirror CAS-2324): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded); favicon-404 filtrado; ambas páginas
// COMPARTEN origen localStorage ⇒ limpiar mithralda.* por página (bootea a 'menu' no 'resume'); 2ª página bringToFront; PIN Date.now al reloj
// compartido en AMBAS páginas del North Star (el tickSoul del game-loop usa Date.now REAL ⇒ re-derivaría G.soul entre frames).
// Run: node tools/cas2328-soul-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2328-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 300 * 1000;                                    // ciclo del VESTIGIO (5 min — reloj PROPIO de SOUL_RECOVERY)
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
const isFaviconOnly = (u) => /favicon/i.test(u || "");

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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(140); }
// __spick = 1º period RECUPERABLE (vivo + zoneOf(tile)==zone); __spickLive = 1º VIVO (para caducidad/convergencia puras). Mirror DARK.
async function installPick(page) {
  await page.evaluate((PM) => {
    window.__spickLive = (startP) => { window.__dev.soul({ enabled: true });
      for (let p = startP; p < startP + 600; p++) { const nm = p * PM + Math.floor(PM * 0.10);
        const s = window.__dev.soul({ nowMs: nm }); if (s.vestige) return { nm, p, fallenIdx: s.vestige.fallen.idx, zone: s.vestige.zone, x: s.vestige.x, y: s.vestige.y }; }
      return null; };
    window.__spick = (startP) => { window.__dev.soul({ enabled: true });
      for (let p = startP; p < startP + 600; p++) { const nm = p * PM + Math.floor(PM * 0.10);
        const s = window.__dev.soul({ nowMs: nm }); if (!s.vestige) continue;
        window.__dev.soul({ heroIdx: (s.vestige.fallen.idx + 1) % 6 }); window.__dev.soul({ toVestige: true, nowMs: nm });
        if (window.__dev.soul().hero.zone === s.vestige.zone) return { nm, p, fallenIdx: s.vestige.fallen.idx, zone: s.vestige.zone, x: s.vestige.x, y: s.vestige.y }; }
      return null; };
  }, PERIOD_MS);
}
async function freshPage(browser, errors, net404) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.bringToFront();
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page); await installPick(page);
  return page;
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404);
  await toHub(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + served config SOUL_RECOVERY.enabled:true + arco 0-regr + DARK trío false
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.soul && window.__dev.mentor && window.__dev.fellowship && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { SOUL: en("SOUL_RECOVERY"), MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"),
      BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const arcTrue = ["MENTOR","FELLOWSHIP","CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.soul + arc hooks; served SOUL_RECOVERY.enabled:true + arco entero true (0 regr) + DARK trío (BOSS_RUSH/DOORS/SEEDED) false; 0 err/404",
     hooks && build === verBuild && !!build && cfg.SOUL === "true" && arcTrue && darksFalse && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} SOUL=${cfg.SOUL} arcTrue=${arcTrue} darksFalse=${darksFalse} err=${errors.length} 404=${net404.length} cfg=${JSON.stringify(cfg)}`);

  // 2 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ soul().enabled===true (el flip cargó del config servido) + tag "" a menos que un vestigio esté vivo AHORA.
  const dOn = await page.evaluate(() => { const s = window.__dev.soul(); return { enabled: s.enabled, recovered: s.recovered, mul: s.soulMulRested }; });
  ok("2 DEFAULT-ON desde config servido: soul().enabled===true (flip cargó) AND recovered false AND soulMulRested 0 (pasivo NO activo sin recuperar/caer en boot fresco)",
     dOn.enabled === true && dOn.recovered === false && dOn.mul === 0, JSON.stringify(dOn));

  // 3 byte-id when OFF (toggle): enabled:false ⇒ soulMulRested 0 + tag "" + save SIN soulGot/soulFell/soulAt + fingerprint byte-stable; restaura ON.
  //   FOOTGUN DEFAULT-ON: tickSoul ya corrió con el reloj real ⇒ G.soul transitorio existe; toggle-OFF NO lo limpia. OFF-safety = NADA del canal cambia.
  const byteId = await page.evaluate(() => {
    window.__dev.soul({ enabled: false });
    const s = window.__dev.soul();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.soul({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.soul({ enabled: true });                                        // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, role: s.role, mul: s.soulMulRested, tag: s.tag,
      noKey: !/"soulGot"|"soulFell"|"soulAt"/.test(saveOff), fpStable: fp1 === fp2 };
  });
  ok("3 byte-id when OFF (toggle): enabled:false ⇒ role none AND soulMulRested 0 AND tag \"\" AND saveBlob() sin soulGot/soulFell/soulAt AND worldFingerprint byte-stable (reversible sin drift; G.soul transitorio DEFAULT-ON NO es estado)",
     byteId.enabled === false && byteId.role === "none" && byteId.mul === 0 && byteId.tag === "" && byteId.noKey === true && byteId.fpStable === true, JSON.stringify(byteId));

  // 4 VESTIGIO determinista + convergencia 1-página
  const det = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(1000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const a = window.__dev.soul({ nowMs: w.nm }).vestige, b = window.__dev.soul({ nowMs: w.nm }).vestige;
    return { ja: JSON.stringify(a), jb: JSON.stringify(b), named: !!(a && a.id && a.fallen && a.fallen.name && a.zone) };
  });
  ok("4 VESTIGIO determinista + convergencia: mismo nowMs ⇒ 1 vestigio (id+caído+zona+tile), IDÉNTICO en 2 lecturas (0 desync)", !det.bad && det.ja === det.jb && det.named, `vestige=${det.ja}`);

  // 5 VESTIGIO rota por period
  const rot = await page.evaluate((PM) => {
    window.__dev.soul({ enabled: true }); const ids = new Set(), fids = new Set();
    for (let p = 1000; p < 1120; p++) { const s = window.__dev.soul({ nowMs: p * PM + Math.floor(PM * 0.10) }); if (s.vestige) { ids.add(s.vestige.id); fids.add(s.vestige.fallen.id); } }
    return { distinctId: ids.size, distinctFallen: fids.size };
  }, PERIOD_MS);
  ok("5 VESTIGIO ROTA por period: ≥2 vestigios/caídos DISTINTOS al barrer periods (elección determinista del reloj, mundo vivo)", rot.distinctId >= 2 && rot.distinctFallen >= 2, JSON.stringify(rot));

  // 6 COBERTURA RECUPERABILIDAD por ZONA (el fix CAS-2326 LIVE): TODA zona configurada produce ≥1 vestigio RECUPERABLE (zoneOf(tile)==zone).
  const cover = await page.evaluate((PM) => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: true });
    const byzone = {}, ZONES = [];
    for (let p = 8000; p < 8600; p++) { const s = window.__dev.soul({ nowMs: p * PM + Math.floor(PM * 0.10) }); if (!s.vestige) continue;
      const zn = s.vestige.zone; if (!byzone[zn]) { byzone[zn] = { live: 0, recoverable: 0 }; ZONES.push(zn); }
      byzone[zn].live++;
      window.__dev.soul({ heroIdx: (s.vestige.fallen.idx + 1) % 6 }); window.__dev.soul({ toVestige: true, nowMs: p * PM + Math.floor(PM * 0.10) });
      if (window.__dev.soul().hero.zone === zn) byzone[zn].recoverable++;
    }
    return { broken: ZONES.filter((z) => byzone[z].recoverable === 0), okZones: ZONES.filter((z) => byzone[z].recoverable > 0), byzone };
  }, PERIOD_MS);
  ok("6 COBERTURA RECUPERABILIDAD por ZONA (fix CAS-2326 LIVE): TODA zona configurada produce ≥1 vestigio RECUPERABLE (zoneOf(tile)==zone) ⇒ broken=[]",
     cover.broken.length === 0, `broken=${JSON.stringify(cover.broken)} ok=${JSON.stringify(cover.okZones)} byzone=${JSON.stringify(cover.byzone)}`);

  // 7 ROL por IDENTIDAD
  const role = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(2000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: w.fallenIdx }); const rf = window.__dev.soul({ nowMs: w.nm }).role;
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 }); const rr = window.__dev.soul({ nowMs: w.nm }).role;
    return { rf, rr };
  });
  ok("7 ROL por IDENTIDAD: heroIdx==fallenIdx ⇒ 'fallen'; heroIdx≠fallenIdx ⇒ 'recoverer' (asimetría determinista)", !role.bad && role.rf === "fallen" && role.rr === "recoverer", JSON.stringify(role));

  // 8 CADUCIDAD determinista
  const exp = await page.evaluate((PM) => {
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(3000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const live = window.__dev.soul({ nowMs: w.p * PM + Math.floor(PM * 0.30) }), dead = window.__dev.soul({ nowMs: w.p * PM + Math.floor(PM * 0.70) });
    return { liveV: !!live.vestige, liveFlag: live.live, deadV: dead.vestige, deadFlag: dead.live };
  }, PERIOD_MS);
  ok("8 CADUCIDAD determinista: frac<liveFrac ⇒ VIVO; frac≥liveFrac ⇒ vestige null (caducó, limpieza, convergencia desaparecer)",
     !exp.bad && exp.liveV === true && exp.liveFlag === true && exp.deadV === null && exp.deadFlag === false, JSON.stringify(exp));

  // 9 RECUPERACIÓN por proximidad+dwell (SIN hotkey) + boost recuperador
  const rec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spick(4000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const before = window.__dev.soul({ toVestige: true, nowMs: w.nm });
    const after = window.__dev.soul({ nowMs: w.nm + 3 * 1000 + 300 });
    return { role: before.role, beforeRec: before.recovered, beforeMul: before.soulMulRested, afterRec: after.recovered, afterMul: after.soulMulRested, afterXp: after.restedXpMult, beforeXp: before.restedXpMult };
  });
  ok("9 RECUPERACIÓN por proximidad+dwell (SIN hotkey): recoverer en radio dwell 0 → tras ≥dwellSec ⇒ auto-recupera (false→true) + boost 0.10 (restedXpMult sube)",
     !rec.bad && rec.role === "recoverer" && rec.beforeRec === false && rec.beforeMul === 0 && rec.afterRec === true && near(rec.afterMul, 0.10) && near(rec.afterXp, rec.beforeXp + 0.10), JSON.stringify(rec));

  // 10 CAÍDO NO recupera su PROPIO vestigio
  const own = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(4200); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: w.fallenIdx });
    const r = window.__dev.soul({ toVestige: true, nowMs: w.nm });
    const rr = window.__dev.soul({ recover: true, nowMs: w.nm + 3 * 1000 + 300 });
    return { role: r.role, resOk: rr.result ? rr.result.ok : null, reason: rr.result ? rr.result.reason : null, recovered: rr.recovered };
  });
  ok("10 CAÍDO NO recupera su PROPIO vestigio: rol 'fallen' ⇒ tryRecoverVestige {ok:false, reason:'own'} AND recovered false (deny server-auth)",
     !own.bad && own.role === "fallen" && own.resOk === false && own.reason === "own" && own.recovered === false, JSON.stringify(own));

  // 11 BUFF del CAÍDO en respawn + fade por kills
  const resp = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(4400); if (!w) return { bad: true };
    window.__dev.soul({ nowMs: w.nm }); window.__dev.soul({ die: true });
    const on = window.__dev.soul({ nowMs: w.nm }).soulMulRested;
    window.__dev.soul({ kill: { n: 20 } });
    const off = window.__dev.soul({ nowMs: w.nm }).soulMulRested;
    return { on, off };
  });
  ok("11 BUFF del CAÍDO en respawn: die ⇒ soulMulRested == respawnBoost(0.15); +respawnKills kills ⇒ 0 (fade determinista por contador monótono)",
     !resp.bad && near(resp.on, 0.15) && resp.off === 0, JSON.stringify(resp));

  // 13 PRECEDENCIA + render + arc regr + fps (corre antes del North Star 2-cliente)
  const prec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.territory({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(5000); if (!w) return { bad: true };
    const T = w.nm; window.__dev.soul({ nowMs: T }); window.__dev.soul({ die: true });
    const base = window.__dev.soul({ nowMs: T }).soulMulRested;
    window.__dev.standings({ enabled: true, nowMs: T }); const leader = window.__dev.standings({ nowMs: T }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const standMul = window.__dev.soul({ nowMs: T }).standingsMulRested, standingsCeded = window.__dev.soul({ nowMs: T }).soulMulRested;
    window.__dev.standings({ enabled: false });
    window.__dev.mentor({ enabled: true }); const mp = window.__dev.mentor({ nowMs: T });
    window.__dev.mentor({ lvl: Math.max(1, (mp.partner ? mp.partner.lvl : 20) - 12) }); window.__dev.mentor({ kill: { n: 8 } });
    const mentorMul = window.__dev.soul({ nowMs: T }).mentorMulRested, mentorCeded = window.__dev.soul({ nowMs: T }).soulMulRested;
    window.__dev.mentor({ enabled: false });
    window.__dev.territory({ enabled: true, nowMs: T }); const territoryCoexist = window.__dev.soul({ nowMs: T }).soulMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standMul, standingsCeded, mentorMul, mentorCeded, territoryCoexist };
  });
  const rsrc = await page.evaluate(async (live) => { const r = await fetch(live + "/render/render.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const gatedDraw = /SOUL_RECOVERY\.enabled/.test(rsrc) && /sim\.soulVestige\(/.test(rsrc) && /⚱/.test(rsrc) && /sim\.fallenVestige\(/.test(rsrc) && /Vestigio del Caído/.test(rsrc);
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.soul({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const so = window.__dev.soul(), m = window.__dev.mentor(), f = window.__dev.fellowship(), c = window.__dev.contest(), te = window.__dev.territory(), st = window.__dev.standings(), l = window.__dev.ledger(), o = window.__dev.oath(), b = window.__dev.bounty({ act: true }), s = window.__dev.sanctuary(), q = window.__dev.quartermaster(), w = window.__dev.warhorn(), em = window.__dev.emissary(), rc = window.__dev.recall();
    return { soulOk: so.enabled, mentorOk: m.enabled, fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.soul({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const o = await sample(false); const n = await sample(true); return { off: o, on: n };
  });
  const offM = median(fps.off), onM = median(fps.on);
  const arcOk = arc.soulOk && arc.mentorOk && arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk;
  ok("13 PRECEDENCIA + render + arco + fps: SOUL(buff 0.15) CEDE a STANDINGS ⇒ 0 AND CEDE a MENTOR ⇒ 0 AND COEXISTE con TERRITORY(⊥) ⇒ 0.15; render.js servido dibuja soulVestige()(⚱ gated)+fallenVestige()('Vestigio del Caído'); arco entero sano + fps no-regr (ON ≥ OFF*0.9)",
     !prec.bad && near(prec.base, 0.15) && prec.standMul > 0 && prec.standingsCeded === 0 && prec.mentorMul > 0 && prec.mentorCeded === 0 && near(prec.territoryCoexist, 0.15) && gatedDraw && arcOk && onM >= offM * 0.9,
     `prec=${JSON.stringify(prec)} gatedDraw=${gatedDraw} arcOk=${arcOk} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  // 12 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur).
  await page.bringToFront();
  const NS = await page.evaluate(() => { window.__dev.soul({ enabled: true }); return window.__spick(7000); });
  const T_NS = NS.nm, FID = NS.fallenIdx, RID = (NS.fallenIdx + 1) % 6;
  const pageA = page;
  const pageB = await freshPage(browser, errors, net404);
  await pageA.evaluate((nm) => { window.__nsA = Date.now; Date.now = () => nm; }, T_NS);
  await pageB.evaluate((nm) => { window.__nsB = Date.now; Date.now = () => nm; }, T_NS);
  const a0 = await pageA.evaluate((o) => { window.__dev.soul({ enabled: true }); window.__dev.soul({ heroIdx: o.FID }); const s = window.__dev.soul({ nowMs: o.T }); return { vestige: JSON.stringify(s.vestige), role: s.role }; }, { T: T_NS, FID });
  const b0 = await pageB.evaluate((o) => { window.__dev.soul({ enabled: true }); window.__dev.soul({ heroIdx: o.RID }); const s = window.__dev.soul({ nowMs: o.T }); return { vestige: JSON.stringify(s.vestige), role: s.role }; }, { T: T_NS, RID });
  const b1 = await pageB.evaluate((o) => { window.__dev.soul({ toVestige: true, nowMs: o.T }); const s = window.__dev.soul({ nowMs: o.T + 3 * 1000 + 300 }); return { recovered: s.recovered, mul: s.soulMulRested, vestige: JSON.stringify(window.__dev.soul({ nowMs: o.T }).vestige) }; }, { T: T_NS });
  const a1 = await pageA.evaluate((o) => { const dr = window.__dev.soul({ recover: true, nowMs: o.T + 3 * 1000 + 300 }); window.__dev.tp(1, 1); window.__dev.soul({ die: true }); const s = window.__dev.soul({ nowMs: o.T }); return { denyReason: dr.result ? dr.result.reason : null, role: s.role, respawnMul: s.soulMulRested, vestige: JSON.stringify(s.vestige) }; }, { T: T_NS });
  const b2 = await pageB.evaluate((o) => { const s = window.__dev.soul({ nowMs: o.T }); return { recovered: s.recovered, mul: s.soulMulRested, vestige: JSON.stringify(s.vestige) }; }, { T: T_NS });
  const vestigeShared = a0.vestige === b0.vestige && a0.vestige.length > 2;
  const rolesAsym = a0.role === "fallen" && b0.role === "recoverer";
  const bRecovered = b1.recovered === true && near(b1.mul, 0.10);
  const aDeny = a1.denyReason === "own";
  const aRespawnIso = a1.role === "fallen" && near(a1.respawnMul, 0.15);
  const vestigeIntact = b1.vestige === a0.vestige && a1.vestige === a0.vestige && b2.vestige === a0.vestige;
  const bIntact = b2.recovered === true && near(b2.mul, 0.10);
  try { await pageB.screenshot({ path: join(OUT, "client-b-recoverer.png") }); } catch (e) {}
  await pageA.evaluate(() => { if (window.__nsA) { Date.now = window.__nsA; delete window.__nsA; } });
  await pageB.close();
  ok("12 ★ NORTH STAR CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas gh-pages, MISMO nowMs ⇒ VESTIGIO IDÉNTICO byte-a-byte; A(id==caído)=FALLEN (deny 'own' + buff respawn 0.15) + B(id≠caído)=RECOVERER (proximidad+dwell ⇒ auto-recupera + boost 0.10); B recupera + A muere ⇒ VESTIGIO compartido + rol/buff de A + estado de B INTACTOS (0 desync)",
     vestigeShared && rolesAsym && bRecovered && aDeny && aRespawnIso && vestigeIntact && bIntact,
     `vestigeShared=${vestigeShared} rolesAsym=${rolesAsym} bRecovered=${bRecovered} aDeny=${aDeny} aRespawnIso=${aRespawnIso} vestigeIntact=${vestigeIntact} bIntact=${bIntact} A0=${a0.role} B0=${b0.role} A1=${a1.role}/${a1.respawnMul}`);

  await page.bringToFront();
  await page.evaluate(() => window.__dev.soul({ enabled: true }));               // deja el estado servido (DEFAULT-ON) intacto
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors / 0 non-favicon 404 during run", errors.length === 0 && net404.length === 0, `err=${errors.slice(0,2).join(" | ")} 404=${net404.slice(0,2).join(" | ")}`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
