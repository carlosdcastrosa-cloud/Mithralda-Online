// CAS-2325 — QA OBSERVABLE verify for VESTIGIO DEL CAÍDO / FALLEN WAYFARER'S VESTIGE (DARK, SOUL_RECOVERY.enabled:false).
// QA pass sobre el DARK build del GE (commit ffaf71d, self-verify 20/20). Re-verifica byte-id OFF de forma INDEPENDIENTE y AÑADE el
// diferenciador que el issue exige como MMORPG: EVO#49 es el PIVOTE de arco — abre la lane del LOOP DE MUERTE Y RECUPERACIÓN del mundo
// COMPARTIDO (tras el arco social Órdenes+Vínculos #43–48). Tu muerte deja un ARTEFACTO persistente y VISIBLE que OTROS jugadores recuperan.
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO reloj
// lógico (nowMs) ⇒ el VESTIGIO ambiental (elección PURA del reloj: caído+zona+tile+id) es IDÉNTICO byte-a-byte en ambos (0 desync), PERO el ROL
// es ASIMÉTRICO y PERSONAL por IDENTIDAD: A (identidad == caído) es el CAÍDO (NO puede recuperar su propio vestigio; recibe buff de respawn),
// B (identidad ≠ caído) es RECUPERADOR (entra en radio + dwell ≥ umbral ⇒ auto-recupera SIN hotkey ⇒ +boost pasivo). B recupera ⇒ su estado
// personal cambia (recovered+boost) mientras el VESTIGIO compartido (puro del reloj) y el rol/buff de A quedan INTACTOS (per-hero aislado,
// server-auth-ready). Corre AL FINAL porque abrir la 2ª página blurea la 1ª ⇒ index.html pausa el game-loop de la 1ª (footgun heredado).
//
// Checks:
//   1  boots to play, __dev.soul + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (re-verify GE INDEP): FRESH boot ⇒ enabled false + vestige null + role none + soulMulRested 0 + tag "" + save SIN
//      'soulGot'/'soulFell'/'soulAt' + hasAt/hasGot/hasFell false + gExists false (tick jamás corrió) + fingerprint byte-estable a través del toggle.
//   3  VESTIGIO determinista + convergencia 1-página: mismo nowMs ⇒ 1 vestigio (id+caído+zona+tile), IDÉNTICO en 2 lecturas (0 desync).
//   4  VESTIGIO ROTA por period: barriendo periods surgen ≥2 vestigios/caídos DISTINTOS (elección determinista del reloj, mundo vivo).
//   5  ROL por IDENTIDAD: heroIdx==fallenIdx ⇒ 'fallen' (es SU vestigio); heroIdx≠fallenIdx ⇒ 'recoverer' (asimetría determinista).
//   6  CADUCIDAD determinista (convergencia aparecer/desaparecer): frac<liveFrac ⇒ VIVO; frac≥liveFrac ⇒ vestige null (caducó, limpieza).
//   7  RECUPERACIÓN por proximidad+dwell (SIN hotkey): recoverer en radio dwell 0 → tras ≥dwellSec ⇒ auto-recupera (recovered false→true) + boost 0.10.
//   8  CAÍDO NO recupera su PROPIO vestigio: rol 'fallen' ⇒ tryRecoverVestige {ok:false,reason:'own'} AND recovered false (deny server-auth).
//   9  BUFF del CAÍDO en respawn + fade: die ⇒ soulMulRested == respawnBoost(0.15); +respawnKills kills ⇒ 0 (fade determinista por contador monótono).
//  10  PASIVO efectivo en gainXP + byte-id pasivo OFF: served sim aplica soulMul(h,'restedMult') en gainXP; enabled false (aun con soulGot) ⇒ mul 0 + tag "".
//  11  PRECEDENCIA MISMO-CANAL cede + canal ⊥ coexiste: SOUL(buff 0.15) CEDE a STANDINGS ⇒ 0 AND CEDE a MENTOR ⇒ 0 (aplica el MAYOR, 0 doble-conteo);
//      COEXISTE con TERRITORY(safeRegen ⊥) ⇒ knob>0.
//  12  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO nowMs ⇒ VESTIGIO IDÉNTICO byte-a-byte; A(id==caído)=FALLEN (no recupera su
//      propio, reason 'own', recibe buff respawn) + B(id≠caído)=RECOVERER (proximidad+dwell ⇒ auto-recupera + boost). B recupera ⇒ VESTIGIO
//      compartido (puro del reloj) + rol/buff de A INTACTOS (per-hero aislado, 0 desync).
//  13  render + world glyph ⚱ + panel + arco regr (MENTOR+FELLOWSHIP+CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REWARDS+WARHORN+EMISSARY+RECALL) + fps.
//   0  no JS errors during run.
// Run: node tools/cas2325-soul-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2325-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 300 * 1000;                                    // ciclo del VESTIGIO (5 min — reloj PROPIO de SOUL_RECOVERY, INDEPENDIENTE de Órdenes/Vínculos)
const N = 6;                                                     // roster de caídos

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }
// page-side helper: escanea periods desde startP y devuelve el 1º cuyo vestigio es RECUPERABLE @ frac 0.10 (VIVO + tile zone-consistente:
// zoneOf(tile)==v.zone ⇒ soulInRadius pasa ⇒ la recuperación por proximidad+dwell es POSIBLE). Un vestigio "live pero zoneOf(tile)≠zone" NO es
// recuperable (zone-gate de soulInRadius) — la cobertura por-zona de eso se mide aparte (check 6b, DEFECTO conocido de soulPos). __spickLive
// devuelve el 1º VIVO sin importar zona (para probar caducidad/convergencia puras del reloj, independientes de la recuperabilidad).
async function installPick(page) {
  await page.evaluate((PM) => {
    window.__spickLive = (startP) => { window.__dev.soul({ enabled: true });
      for (let p = startP; p < startP + 600; p++) { const nm = p * PM + Math.floor(PM * 0.10);
        const s = window.__dev.soul({ nowMs: nm }); if (s.vestige) return { nm, p, id: s.vestige.id, fallenIdx: s.vestige.fallen.idx, fid: s.vestige.fallen.id, zone: s.vestige.zone, x: s.vestige.x, y: s.vestige.y }; }
      return null; };
    window.__spick = (startP) => { window.__dev.soul({ enabled: true });
      for (let p = startP; p < startP + 600; p++) { const nm = p * PM + Math.floor(PM * 0.10);
        const s = window.__dev.soul({ nowMs: nm }); if (!s.vestige) continue;
        window.__dev.soul({ heroIdx: (s.vestige.fallen.idx + 1) % 6 }); window.__dev.soul({ toVestige: true, nowMs: nm });
        const z = window.__dev.soul().hero.zone;                              // tras teleport a la tile: la zona real del héroe
        if (z === s.vestige.zone) return { nm, p, id: s.vestige.id, fallenIdx: s.vestige.fallen.idx, fid: s.vestige.fallen.id, zone: s.vestige.zone, x: s.vestige.x, y: s.vestige.y }; }
      return null; };
  }, PERIOD_MS);
}
async function freshPage(browser, base, errSink) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  if (errSink) { p.on("pageerror", (e) => errSink.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errSink.push(m.text()); }); }
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} }); // localStorage por-origen (compartido) ⇒ limpia el save de la 1ª página para bootear a 'menu'
  await p.bringToFront();                                                       // foreground ⇒ rAF no-throttle ⇒ boot fiable (la 2ª página abre backgrounded)
  await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(p); await toHub(p); await installPick(p);
  return p;
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
  await toHub(page);
  await installPick(page);

  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.soul && window.__dev.mentor && window.__dev.fellowship && window.__dev.standings && window.__dev.territory && window.__dev.oath && window.__dev.contest && window.__dev.ledger && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.soul + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (re-verify GE INDEP): FRESH-BOOT snapshot (SIN nowMs) ⇒ gExists false (tickSoul jamás corrió en DARK boot) + hasAt/hasGot/hasFell
  //   false + save sin claves + fingerprint byte-estable a través del toggle. (Inyectar nowMs por el hook crea G.soul TRANSITORIO aun OFF —
  //   artefacto del hook, NO estado de boot; por eso gExists/save se leen ANTES de inyectar reloj — mirror CAS-2322/2316/2309.)
  const off = await page.evaluate(() => {
    const d = window.__dev.soul();                                              // FRESH boot, SIN nowMs ⇒ estado DARK real
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpA = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.soul({ enabled: true }); const fpOn = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.soul({ enabled: false }); const fpB = JSON.stringify(window.__dev.worldFingerprint(777));
    return { enabled: d.enabled, vestige: d.vestige, role: d.role, mul: d.soulMulRested, tag: d.tag,
      hasAt: d.hasAt, hasGot: d.hasGot, hasFell: d.hasFell, gExists: d.gExists,
      hasKey: /"soulGot"|"soulFell"|"soulAt"/.test(save), fpStable: fpA === fpB && fpA === fpOn };
  });
  ok("2 byte-id OFF: FRESH boot ⇒ enabled false + vestige null + role none + soulMulRested 0 + tag \"\" + save SIN soulGot/soulFell/soulAt + hasAt/hasGot/hasFell false + gExists false (tick jamás corrió) + fingerprint byte-estable a través del toggle",
     off.enabled === false && off.vestige === null && off.role === "none" && off.mul === 0 && off.tag === "" &&
     off.hasAt === false && off.hasGot === false && off.hasFell === false && off.gExists === false &&
     off.hasKey === false && off.fpStable === true,
     `enabled=${off.enabled} vestige=${JSON.stringify(off.vestige)} role=${off.role} mul=${off.mul} tag="${off.tag}" hasAt=${off.hasAt} hasGot=${off.hasGot} hasFell=${off.hasFell} gExists=${off.gExists} hasKey=${off.hasKey} fpStable=${off.fpStable}`);

  // 3 VESTIGIO determinista + convergencia 1-página
  const det = await page.evaluate(() => {
    window.__dev.soul({ enabled: true });
    const w = window.__spickLive(1000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const a = window.__dev.soul({ nowMs: w.nm }).vestige;
    const b = window.__dev.soul({ nowMs: w.nm }).vestige;
    return { ja: JSON.stringify(a), jb: JSON.stringify(b), named: !!(a && a.id && a.fallen && a.fallen.name && a.zone) };
  });
  ok("3 VESTIGIO determinista + convergencia: mismo nowMs ⇒ 1 vestigio (id+caído+zona+tile), IDÉNTICO en 2 lecturas (0 desync)",
     !det.bad && det.ja === det.jb && det.named, `vestige=${det.ja}`);

  // 4 VESTIGIO ROTA por period
  const rot = await page.evaluate((PM) => {
    window.__dev.soul({ enabled: true });
    const ids = new Set(), fids = new Set();
    for (let p = 1000; p < 1120; p++) { const nm = p * PM + Math.floor(PM * 0.10);
      const s = window.__dev.soul({ nowMs: nm }); if (s.vestige) { ids.add(s.vestige.id); fids.add(s.vestige.fallen.id); } }
    return { distinctId: ids.size, distinctFallen: fids.size };
  }, PERIOD_MS);
  ok("4 VESTIGIO ROTA por period: ≥2 vestigios/caídos DISTINTOS al barrer periods (elección determinista del reloj, mundo vivo)",
     rot.distinctId >= 2 && rot.distinctFallen >= 2, JSON.stringify(rot));

  // 5 ROL por IDENTIDAD
  const role = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(2000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: w.fallenIdx }); const rf = window.__dev.soul({ nowMs: w.nm }).role;         // fallen (mapea al caído)
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 }); const rr = window.__dev.soul({ nowMs: w.nm }).role; // recoverer
    return { rf, rr };
  });
  ok("5 ROL por IDENTIDAD: heroIdx==fallenIdx ⇒ 'fallen' (es SU vestigio); heroIdx≠fallenIdx ⇒ 'recoverer' (asimetría determinista)",
     !role.bad && role.rf === "fallen" && role.rr === "recoverer", JSON.stringify(role));

  // 6 CADUCIDAD determinista (convergencia aparecer/desaparecer)
  const exp = await page.evaluate((PM) => {
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(3000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const live = window.__dev.soul({ nowMs: w.p * PM + Math.floor(PM * 0.30) });                              // dentro de liveFrac ⇒ VIVO
    const dead = window.__dev.soul({ nowMs: w.p * PM + Math.floor(PM * 0.70) });                              // pasado liveFrac ⇒ caducó
    return { liveV: !!live.vestige, liveFlag: live.live, deadV: dead.vestige, deadFlag: dead.live };
  }, PERIOD_MS);
  ok("6 CADUCIDAD determinista: frac<liveFrac ⇒ VIVO (vestige no-null); frac≥liveFrac ⇒ vestige null (caducó, limpieza, convergencia desaparecer)",
     !exp.bad && exp.liveV === true && exp.liveFlag === true && exp.deadV === null && exp.deadFlag === false, JSON.stringify(exp));

  // 6b COBERTURA DE RECUPERABILIDAD por ZONA (DEFECTO — CAS-2325): un vestigio VIVO sólo es RECUPERABLE si zoneOf(tile)==v.zone (soulInRadius
  //    zone-gate). soulPos() deriva la tile del PRIMER spawner con s.zone==zone SIN el guard zoneOf(site)==zone que usa bonfireSites (footgun
  //    CAS-1886: spawners de huntZones del continente viven en `field`). ⇒ para las zonas cuyo 1º spawner cae fuera de zona, la tile del vestigio
  //    queda en OTRA zona (p.ej. `field`) y el vestigio es PERMANENTEMENTE IRRECUPERABLE (soulInRadius nunca pasa). Barre periods y mide, por zona,
  //    cuántos vestigios VIVOS tienen la tile zone-consistente. GATE: TODAS las zonas configuradas deben tener ≥1 vestigio recuperable (>0%).
  const cover = await page.evaluate((PM) => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: true });
    const byzone = {}; const ZONES = [];
    for (let p = 8000; p < 8600; p++) { const nm = p * PM + Math.floor(PM * 0.10);
      const s = window.__dev.soul({ nowMs: nm }); if (!s.vestige) continue;
      const zn = s.vestige.zone; if (!byzone[zn]) { byzone[zn] = { live: 0, recoverable: 0 }; ZONES.push(zn); }
      byzone[zn].live++;
      window.__dev.soul({ heroIdx: (s.vestige.fallen.idx + 1) % 6 }); window.__dev.soul({ toVestige: true, nowMs: nm });
      if (window.__dev.soul().hero.zone === zn) byzone[zn].recoverable++;
    }
    const broken = ZONES.filter((z) => byzone[z].recoverable === 0);
    const okZones = ZONES.filter((z) => byzone[z].recoverable > 0);
    return { byzone, broken, okZones, nZones: ZONES.length };
  }, PERIOD_MS);
  ok("6b COBERTURA RECUPERABILIDAD por ZONA: TODA zona configurada debe producir ≥1 vestigio RECUPERABLE (zoneOf(tile)==zone). soulPos sin el guard zoneOf(site)==zone (bonfireSites CAS-1886) ⇒ zonas cuyo 1º spawner cae en `field` dan vestigios IRRECUPERABLES",
     cover.broken.length === 0,
     `broken(0%%-recuperable)=${JSON.stringify(cover.broken)} ok=${JSON.stringify(cover.okZones)} byzone=${JSON.stringify(cover.byzone)}`);

  // 7 RECUPERACIÓN por proximidad+dwell (SIN hotkey) + boost recuperador
  const rec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spick(4000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });                                                    // recoverer
    const before = window.__dev.soul({ toVestige: true, nowMs: w.nm });                                       // en radio, dwell 0
    const after = window.__dev.soul({ nowMs: w.nm + 3 * 1000 + 300 });                                        // dwell ≥ dwellSec ⇒ auto-recupera
    return { role: before.role, beforeDwell: before.dwellMs, beforeRec: before.recovered, beforeMul: before.soulMulRested,
             afterRec: after.recovered, afterMul: after.soulMulRested, afterXp: after.restedXpMult, beforeXp: before.restedXpMult };
  });
  ok("7 RECUPERACIÓN por proximidad+dwell (SIN hotkey): recoverer en radio dwell 0 → tras ≥dwellSec ⇒ auto-recupera (recovered false→true) + boost 0.10 (restedXpMult sube)",
     !rec.bad && rec.role === "recoverer" && rec.beforeDwell === 0 && rec.beforeRec === false && rec.beforeMul === 0 && rec.afterRec === true && near(rec.afterMul, 0.10) && near(rec.afterXp, rec.beforeXp + 0.10), JSON.stringify(rec));

  // 8 CAÍDO NO recupera su PROPIO vestigio
  const own = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(4200); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: w.fallenIdx });                                                              // fallen (su propio vestigio)
    const r = window.__dev.soul({ toVestige: true, nowMs: w.nm });
    const rr = window.__dev.soul({ recover: true, nowMs: w.nm + 3 * 1000 + 300 });                            // dwell suficiente, pero rol fallen ⇒ deny
    return { role: r.role, resOk: rr.result ? rr.result.ok : null, reason: rr.result ? rr.result.reason : null, recovered: rr.recovered };
  });
  ok("8 CAÍDO NO recupera su PROPIO vestigio: rol 'fallen' ⇒ tryRecoverVestige {ok:false, reason:'own'} AND recovered false (deny server-auth)",
     !own.bad && own.role === "fallen" && own.resOk === false && own.reason === "own" && own.recovered === false, JSON.stringify(own));

  // 9 BUFF del CAÍDO en respawn + fade por kills
  const resp = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(4400); if (!w) return { bad: true };
    window.__dev.soul({ nowMs: w.nm });                                                                       // G.soul set (period del vestigio)
    window.__dev.soul({ die: true });                                                                         // muere + respawn ⇒ soulFell (buff activo)
    const on = window.__dev.soul({ nowMs: w.nm }).soulMulRested;                                              // buff de recuperación
    window.__dev.soul({ kill: { n: 20 } });                                                                   // +respawnKills kills ⇒ fade
    const off = window.__dev.soul({ nowMs: w.nm }).soulMulRested;
    return { on, off };
  });
  ok("9 BUFF del CAÍDO en respawn: die ⇒ soulMulRested == respawnBoost(0.15); +respawnKills kills ⇒ 0 (fade determinista por contador monótono)",
     !resp.bad && near(resp.on, 0.15) && resp.off === 0, JSON.stringify(resp));

  // 10 PASIVO efectivo en gainXP (seam servido) + byte-id pasivo OFF (aun con estado)
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /soulMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(4600); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 }); window.__dev.soul({ toVestige: true, nowMs: w.nm }); window.__dev.soul({ nowMs: w.nm + 4000 }); // recuperado (soulGot persiste)
    const onMul = window.__dev.soul({ nowMs: w.nm }).soulMulRested;
    window.__dev.soul({ enabled: false });                                                                    // gate OFF (soulGot persiste)
    const s = window.__dev.soul();
    return { onMul, enabled: s.enabled, mul: s.soulMulRested, tag: s.tag };
  });
  ok("10 PASIVO efectivo en gainXP + byte-id pasivo OFF: served sim aplica soulMul(h,'restedMult') en gainXP (recuperado ⇒ mul 0.10); enabled false (aun con soulGot) ⇒ soulMulRested 0 AND tag \"\" (gate ⇒ seam restedMult byte-id a HEAD)",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.10) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 11 PRECEDENCIA: SOUL cede a STANDINGS + MENTOR (mismo canal restedMult); coexiste con TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.territory({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(5000); if (!w) return { bad: true };
    const T = w.nm; window.__dev.soul({ nowMs: T }); window.__dev.soul({ die: true });                        // buff del caído activo (0.15)
    const base = window.__dev.soul({ nowMs: T }).soulMulRested;                                               // sin standings/mentor/territory ⇒ 0.15
    // (a) vs STANDINGS (MISMO canal restedMult): jura la orden LÍDER ⇒ standingsMul>0 ⇒ soulMul CEDE
    window.__dev.standings({ enabled: true, nowMs: T }); const leader = window.__dev.standings({ nowMs: T }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const standMul = window.__dev.soul({ nowMs: T }).standingsMulRested;
    const standingsCeded = window.__dev.soul({ nowMs: T }).soulMulRested;                                     // esperado 0
    window.__dev.standings({ enabled: false });
    // (b) vs MENTOR (MISMO canal restedMult): protégé ligado ⇒ mentorMul>0 ⇒ soulMul CEDE
    window.__dev.mentor({ enabled: true }); const mp = window.__dev.mentor({ nowMs: T });
    window.__dev.mentor({ lvl: Math.max(1, (mp.partner ? mp.partner.lvl : 20) - 12) }); window.__dev.mentor({ kill: { n: 8 } });
    const mentorMul = window.__dev.soul({ nowMs: T }).mentorMulRested;
    const mentorCeded = window.__dev.soul({ nowMs: T }).soulMulRested;                                        // esperado 0
    window.__dev.mentor({ enabled: false });
    // (c) vs TERRITORY (canal ⊥ safeRegen): coexisten ⇒ soul sigue 0.15
    window.__dev.territory({ enabled: true, nowMs: T });
    const territoryCoexist = window.__dev.soul({ nowMs: T }).soulMulRested;                                   // esperado 0.15
    window.__dev.territory({ enabled: false });
    return { base, standMul, standingsCeded, mentorMul, mentorCeded, territoryCoexist };
  });
  ok("11 PRECEDENCIA: SOUL(buff 0.15) CEDE a STANDINGS mismo-canal ⇒ 0 AND CEDE a MENTOR mismo-canal ⇒ 0 (aplica el MAYOR, 0 doble-conteo) AND COEXISTE con TERRITORY(safeRegen ⊥) ⇒ knob 0.15",
     !prec.bad && near(prec.base, 0.15) && prec.standMul > 0 && prec.standingsCeded === 0 && prec.mentorMul > 0 && prec.mentorCeded === 0 && near(prec.territoryCoexist, 0.15), JSON.stringify(prec));

  // 13 render + world glyph + panel + arc regression + fps (corre antes del North Star 2-cliente)
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /SOUL_RECOVERY\.enabled/.test(rsrc) && /sim\.soulVestige\(/.test(rsrc) && /⚱/.test(rsrc) && /sim\.fallenVestige\(/.test(rsrc) && /Vestigio del Caído/.test(rsrc);
  const tagAuth = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spickLive(6000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    window.__dev.soul({ enabled: false }); const off = window.__dev.soul().tag;                               // OFF ⇒ ""
    window.__dev.soul({ enabled: true }); const on = window.__dev.soul({ nowMs: w.nm }).tag;                  // vivo ⇒ ⚱
    return { off, on, nm: w.nm, x: w.x, y: w.y };
  });
  await page.evaluate((nm, x, y) => {                                            // pin Date.now ⇒ game-loop tickSoul no re-deriva al render ⇒ ⚱ persiste; teleporta a la tile
    window.__t13 = Date.now; Date.now = () => nm;
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: nm });
    window.__dev.tp(x / 32, y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
  }, tagAuth.nm, tagAuth.x, tagAuth.y);
  await sleep(220);
  const liveNow = await page.evaluate(() => window.__dev.soul().live);
  try { await page.screenshot({ path: join(OUT, "vestige-world.png") }); } catch (e) {}
  await page.evaluate(() => { if (window.__t13) { Date.now = window.__t13; delete window.__t13; } if (window.__dev.daynight) window.__dev.daynight(null); });
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.soul({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const so = window.__dev.soul(); const m = window.__dev.mentor(); const f = window.__dev.fellowship(); const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { soulOk: so.enabled, mentorOk: m.enabled, fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.soul({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const o = await sample(false); const n = await sample(true);
    return { off: o, on: n };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("13 render + world glyph ⚱ + panel + arco regr + fps: render.js servido dibuja soulVestige() (⚱ gated) + fallenVestige() ('Vestigio del Caído'); arco SOUL+MENTOR+FELLOWSHIP+CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REWARDS+WARHORN+EMISSARY+RECALL sanos + fps no-regr (mediana-de-5, ON ≥ OFF*0.9)",
     !tagAuth.bad && gatedDraw && tagAuth.off === "" && tagAuth.on === "⚱" && liveNow === true &&
     arc.soulOk && arc.mentorOk && arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk && onM >= offM * 0.9,
     `gatedDraw=${gatedDraw} off="${tagAuth.off}" on="${tagAuth.on}" liveNow=${liveNow} arc=${JSON.stringify(arc)} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  // 12 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur).
  // Elige un period con vestigio VIVO (zona con spawner) en la página A ⇒ el mismo T_NS lo comparten ambas páginas.
  await page.bringToFront();
  const NS = await page.evaluate(() => { window.__dev.soul({ enabled: true }); return window.__spick(7000); });
  const T_NS = NS.nm, FID = NS.fallenIdx, RID = (NS.fallenIdx + 1) % 6;
  const pageA = page;                                                           // cliente A ya en play
  const errB = [];
  const pageB = await freshPage(browser, base, errB);                          // 2ª página foreground (bringToFront) ⇒ boot fiable
  // PIN Date.now al reloj compartido en AMBAS páginas ⇒ el tickSoul del game-loop usa el MISMO period inyectado y NO re-deriva/clobbea el dwell
  // entre frames (si corriera con el reloj REAL, cuyo period ≠ T_NS, cambiaría G.soul/h.soulAt). Restaurado tras el check.
  await pageA.evaluate((nm) => { window.__nsA = Date.now; Date.now = () => nm; }, T_NS);
  await pageB.evaluate((nm) => { window.__nsB = Date.now; Date.now = () => nm; }, T_NS);
  // A = el CAÍDO (identidad == fallenIdx ⇒ fallen); B = RECUPERADOR (identidad ≠ fallenIdx ⇒ recoverer); mismo vestigio (puro del reloj)
  const a0 = await pageA.evaluate((o) => {
    window.__dev.soul({ enabled: true }); window.__dev.soul({ heroIdx: o.FID }); const s = window.__dev.soul({ nowMs: o.T });
    return { vestige: JSON.stringify(s.vestige), role: s.role, recovered: s.recovered, mul: s.soulMulRested };
  }, { T: T_NS, FID });
  const b0 = await pageB.evaluate((o) => {
    window.__dev.soul({ enabled: true }); window.__dev.soul({ heroIdx: o.RID }); const s = window.__dev.soul({ nowMs: o.T });
    return { vestige: JSON.stringify(s.vestige), role: s.role, recovered: s.recovered, mul: s.soulMulRested };
  }, { T: T_NS, RID });
  const vestigeShared = a0.vestige === b0.vestige && a0.vestige.length > 2;      // VESTIGIO COMPARTIDO idéntico byte-a-byte
  const rolesAsym = a0.role === "fallen" && b0.role === "recoverer";            // roles OPUESTOS por identidad, mismo vestigio
  // B RECUPERA por proximidad+dwell (SIN hotkey) ⇒ su estado personal cambia
  const b1 = await pageB.evaluate((o) => {
    window.__dev.soul({ toVestige: true, nowMs: o.T }); const s = window.__dev.soul({ nowMs: o.T + 3 * 1000 + 300 });
    return { recovered: s.recovered, mul: s.soulMulRested, vestige: JSON.stringify(window.__dev.soul({ nowMs: o.T }).vestige) };
  }, { T: T_NS });
  // A (el CAÍDO) intenta recuperar su PROPIO vestigio ⇒ deny; luego muere ⇒ buff de respawn AISLADO en A. El VESTIGIO compartido y el rol de A INTACTOS.
  const a1 = await pageA.evaluate((o) => {
    const den = window.__dev.soul({ toVestige: true, nowMs: o.T }); const dr = window.__dev.soul({ recover: true, nowMs: o.T + 3 * 1000 + 300 });
    window.__dev.tp(o.hx, o.hy); window.__dev.soul({ die: true });               // muere ⇒ soulFell (buff respawn)
    const s = window.__dev.soul({ nowMs: o.T });
    return { denyReason: dr.result ? dr.result.reason : null, denyRec: dr.recovered, role: s.role, respawnMul: s.soulMulRested, vestige: JSON.stringify(s.vestige) };
  }, { T: T_NS, hx: 1, hy: 1 });
  // Re-lee B: A morir/recuperar NO tocó el VESTIGIO compartido ni el estado de B (per-hero aislado)
  const b2 = await pageB.evaluate((o) => { const s = window.__dev.soul({ nowMs: o.T }); return { recovered: s.recovered, mul: s.soulMulRested, vestige: JSON.stringify(s.vestige) }; }, { T: T_NS });
  const bRecovered = b1.recovered === true && near(b1.mul, 0.10);                // B auto-recuperó por proximidad+dwell
  const aDeny = a1.denyReason === "own" && a1.denyRec === false;                 // A no puede recuperar su propio vestigio
  const aRespawnIso = a1.role === "fallen" && near(a1.respawnMul, 0.15);         // buff de respawn AISLADO en A
  const vestigeIntact = b1.vestige === a0.vestige && a1.vestige === a0.vestige && b2.vestige === a0.vestige; // VESTIGIO compartido (puro del reloj) INTACTO en ambos, pese a recuperación/muerte
  const bIntact = b2.recovered === true && near(b2.mul, 0.10);                   // el estado de B intacto tras las acciones de A
  try { await pageB.screenshot({ path: join(OUT, "client-b-recoverer.png") }); } catch (e) {}
  await pageA.evaluate(() => { if (window.__nsA) { Date.now = window.__nsA; delete window.__nsA; } });   // restaura el reloj real
  await pageB.close();
  ok("12 ★ NORTH STAR CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO nowMs ⇒ VESTIGIO IDÉNTICO byte-a-byte; A(id==caído)=FALLEN (deny 'own' su propio + buff respawn 0.15) + B(id≠caído)=RECOVERER (proximidad+dwell ⇒ auto-recupera + boost 0.10); B recupera + A muere ⇒ VESTIGIO compartido (puro del reloj) + rol/buff de A + estado de B INTACTOS (per-hero aislado, 0 desync)",
     vestigeShared && rolesAsym && bRecovered && aDeny && aRespawnIso && vestigeIntact && bIntact && errB.length === 0,
     `vestigeShared=${vestigeShared} rolesAsym=${rolesAsym} bRecovered=${bRecovered} aDeny=${aDeny} aRespawnIso=${aRespawnIso} vestigeIntact=${vestigeIntact} bIntact=${bIntact} A0=${a0.role}/${a0.recovered} B0=${b0.role}/${b0.recovered} B1=${JSON.stringify(b1).slice(0,80)} A1role=${a1.role} A1mul=${a1.respawnMul} errB=${errB.length}`);

  await page.bringToFront();
  await page.evaluate(() => window.__dev.soul({ enabled: false }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
