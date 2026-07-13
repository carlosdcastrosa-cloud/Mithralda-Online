// CAS-2325 — GE self-verify for VESTIGIO DEL CAÍDO / FALLEN WAYFARER'S VESTIGE (DARK, SOUL_RECOVERY.enabled:false).
// EVO #49, el PIVOTE de arco: abre la lane del LOOP DE MUERTE Y RECUPERACIÓN del mundo COMPARTIDO (tras el arco social Órdenes+Vínculos #43–48).
// El reloj de pared COMPARTIDO registra un VESTIGIO de un CAÍDO del roster fijo (hash de Knuth, 0 RNG) en una tile determinista ⇒ convergencia
// N-clientes (mismo vestigio id/caído/tile). El ROL (recoverer/fallen) lo decide la IDENTIDAD del héroe LOCAL vs el caído del period. Recuperación
// por PROXIMIDAD + DWELL (SIN hotkey): un RECUPERADOR en radio ≥ dwellSec auto-recupera (server-auth first-come). BENEFICIO RECUPERADOR: boost
// pasivo (reusa restedMult de RESTED_XP) mientras porta el vestigio. BENEFICIO CAÍDO: buff de recuperación en su próximo respawn (restedMult, fade
// por kills). El caído NO puede recuperar su PROPIO vestigio. CADUCIDAD determinista (liveFrac). PRECEDENCIA anti-stacking: SOUL cede a
// STANDINGS(restedMult) y a MENTOR(restedMult) ⇒ 0 doble-conteo; coexiste con FELLOWSHIP(xpGain)/TERRITORY(safeRegen). 0 hotkey, SIN input.js.
//
// Observado vía __dev.soul (flip enabled IN-MEMORY + nowMs para el reloj + heroIdx para el rol + toVestige/leave para proximidad + recover/die
// para los chokepoints + kill para el fade) + __dev.mentor/standings/territory/fellowship/oath/contest/ledger/bounty/sanctuary/warhorn/emissary/
// recall/safeZone/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.soul + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: enabled false AND vestige null AND role 'none' AND soulMulRested 0 AND gExists false (inerte/observable OFF).
//   3  byte-id save OFF: saveBlob() SIN 'soulGot'/'soulFell'/'soulAt' (0 clave con la feature OFF).
//   4  byte-id OFF: hasAt/hasGot/hasFell false (nunca se crean) AND gExists false (G.soul NUNCA se crea).
//   5  worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo).
//   6  VESTIGIO determinista + convergencia: mismo nowMs ⇒ MISMO vestigio (id+caído+zona+x+y) en 2 lecturas (0 desync).
//   7  VESTIGIO ROTA por period: ≥2 vestigios/caídos DISTINTOS al barrer periods (elección determinista del reloj).
//   8  ROL por IDENTIDAD: heroIdx==fallenIdx ⇒ 'fallen'; heroIdx≠fallenIdx ⇒ 'recoverer' (asimetría determinista).
//   9  CADUCIDAD determinista (convergencia aparecer/desaparecer): frac<liveFrac ⇒ VIVO; frac≥liveFrac ⇒ vestige null (caducó, limpieza).
//  10  RECUPERACIÓN por proximidad+dwell (SIN hotkey): toVestige + avanzar nowMs ≥ dwellSec ⇒ auto-recupera; recovered true (dwell 0 → recuperado).
//  11  PASIVO RECUPERADOR en gainXP: served sim.js aplica soulMul(h,'restedMult') en gainXP AND restedXpMult del recuperador ≈ base+0.10.
//  12  CAÍDO NO recupera su PROPIO vestigio: rol 'fallen' ⇒ tryRecoverVestige reason 'own' AND recovered false (deny server-auth).
//  13  BUFF del CAÍDO en respawn: die ⇒ soulMulRested == respawnBoost(0.15); +respawnKills kills ⇒ 0 (fade determinista por contador monótono).
//  14  byte-id pasivo OFF: enabled false (aun con soulGot/soulFell) ⇒ soulMulRested 0 AND tag "" (gate ⇒ seam restedMult byte-id a HEAD).
//  15  PRECEDENCIA: SOUL (buff activo) CEDE a STANDINGS (mismo canal restedMult) ⇒ 0; CEDE a MENTOR (mismo canal) ⇒ 0; COEXISTE con TERRITORY (safeRegen ⊥) ⇒ knob>0.
//  16  CONVERGENCIA 2-cliente: mismo nowMs ⇒ vestigio IDÉNTICO pese a rol OPUESTO por héroe (A fallen / B recoverer ⇒ 0 desync).
//  17  render + glifo mundo + panel: render.js servido dibuja soulVestige() (⚱ gated) + fallenVestige() ('Vestigio del Caído') + soulTag; "" OFF / ⚱ vivo.
//  18  arco regr: MENTOR + FELLOWSHIP + CONTEST + TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con SOUL ON.
//  19  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2325-soul-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2325");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 300 * 1000;                                    // ciclo del VESTIGIO (5 min — reloj propio de SOUL_RECOVERY)
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

  const build = await page.evaluate(() => window.__BUILD || null);

  // page-side helper: escanea periods desde startP y devuelve el 1º cuyo vestigio no es null (zona con spawner) @ frac 0.10 (VIVO).
  await page.evaluate((PM) => {
    window.__spick = (startP) => { window.__dev.soul({ enabled: true });
      for (let p = startP; p < startP + 400; p++) { const nm = p * PM + Math.floor(PM * 0.10);
        const s = window.__dev.soul({ nowMs: nm }); if (s.vestige) return { nm, p, id: s.vestige.id, fallenIdx: s.vestige.fallen.idx, fid: s.vestige.fallen.id, zone: s.vestige.zone, x: s.vestige.x, y: s.vestige.y }; }
      return null; };
  }, PERIOD_MS);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.soul && window.__dev.mentor && window.__dev.fellowship && window.__dev.standings && window.__dev.territory && window.__dev.oath && window.__dev.contest && window.__dev.ledger && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.soul + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.soul());
  ok("2 DARK default: enabled false AND vestige null AND role 'none' AND soulMulRested 0 AND gExists false (inerte OFF)",
     dark.enabled === false && dark.vestige === null && dark.role === "none" && dark.soulMulRested === 0 && dark.gExists === false,
     `enabled=${dark.enabled} vestige=${JSON.stringify(dark.vestige)} role=${dark.role} mul=${dark.soulMulRested} gExists=${dark.gExists}`);

  // 3 save OFF has no new keys
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'soulGot'/'soulFell'/'soulAt' key in save blob (0 clave con la feature OFF)",
     !/"soulGot"/.test(saveOff) && !/"soulFell"/.test(saveOff) && !/"soulAt"/.test(saveOff), `len=${saveOff.length}`);

  // 4 byte-id OFF: no fields / no transient state
  const off4 = await page.evaluate(() => { const s = window.__dev.soul(); return { hasAt: s.hasAt, hasGot: s.hasGot, hasFell: s.hasFell, gExists: s.gExists }; });
  ok("4 byte-id OFF: hasAt/hasGot/hasFell false (los campos NUNCA se crean) AND gExists false (G.soul NUNCA se crea)",
     off4.hasAt === false && off4.hasGot === false && off4.hasFell === false && off4.gExists === false, JSON.stringify(off4));

  // 5 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.soul({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.soul({ enabled: false }));
  ok("5 worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 6 VESTIGIO determinista + convergencia
  const det = await page.evaluate(() => {
    window.__dev.soul({ enabled: true });
    const w = window.__spick(1000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const a = window.__dev.soul({ nowMs: w.nm }).vestige;
    const b = window.__dev.soul({ nowMs: w.nm }).vestige;
    return { a, b, ja: JSON.stringify(a), jb: JSON.stringify(b) };
  });
  ok("6 VESTIGIO determinista + convergencia: mismo nowMs ⇒ MISMO vestigio (id+caído+zona+x+y) en 2 lecturas (0 desync)",
     !det.bad && det.a && det.a.id && det.a.fallen && det.a.zone && det.ja === det.jb, `vestige=${det.ja}`);

  // 7 VESTIGIO ROTA por period
  const rot = await page.evaluate((PM) => {
    window.__dev.soul({ enabled: true });
    const ids = new Set(), fids = new Set();
    for (let p = 1000; p < 1120; p++) { const nm = p * PM + Math.floor(PM * 0.10);
      const s = window.__dev.soul({ nowMs: nm }); if (s.vestige) { ids.add(s.vestige.id); fids.add(s.vestige.fallen.id); } }
    return { distinctId: ids.size, distinctFallen: fids.size };
  }, PERIOD_MS);
  ok("7 VESTIGIO ROTA por period: ≥2 vestigios/caídos DISTINTOS al barrer periods (elección determinista del reloj)",
     rot.distinctId >= 2 && rot.distinctFallen >= 2, JSON.stringify(rot));

  // 8 ROL por IDENTIDAD
  const role = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(2000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: w.fallenIdx }); const rf = window.__dev.soul({ nowMs: w.nm }).role;         // fallen (mapea al caído)
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 }); const rr = window.__dev.soul({ nowMs: w.nm }).role; // recoverer
    return { rf, rr };
  });
  ok("8 ROL por IDENTIDAD: heroIdx==fallenIdx ⇒ 'fallen'; heroIdx≠fallenIdx ⇒ 'recoverer' (asimetría determinista)",
     !role.bad && role.rf === "fallen" && role.rr === "recoverer", JSON.stringify(role));

  // 9 CADUCIDAD determinista (convergencia aparecer/desaparecer)
  const exp = await page.evaluate((PM) => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(3000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    const live = window.__dev.soul({ nowMs: w.p * PM + Math.floor(PM * 0.30) });                              // dentro de liveFrac ⇒ VIVO
    const dead = window.__dev.soul({ nowMs: w.p * PM + Math.floor(PM * 0.70) });                              // pasado liveFrac ⇒ caducó
    return { liveV: !!live.vestige, liveFlag: live.live, deadV: dead.vestige, deadFlag: dead.live };
  }, PERIOD_MS);
  ok("9 CADUCIDAD determinista: frac<liveFrac ⇒ VIVO (vestige no-null); frac≥liveFrac ⇒ vestige null (caducó, limpieza, convergencia desaparecer)",
     !exp.bad && exp.liveV === true && exp.liveFlag === true && exp.deadV === null && exp.deadFlag === false, JSON.stringify(exp));

  // 10 + 11 RECUPERACIÓN por proximidad+dwell (SIN hotkey) + PASIVO en gainXP
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /soulMul\(h,\s*"restedMult"\)/.test(simSrc);
  const rec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spick(4000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });                                                    // recoverer
    const before = window.__dev.soul({ toVestige: true, nowMs: w.nm });                                       // en radio, dwell 0
    const after = window.__dev.soul({ nowMs: w.nm + 3 * 1000 + 300 });                                        // dwell ≥ dwellSec ⇒ auto-recupera
    return { role: before.role, beforeDwell: before.dwellMs, beforeRec: before.recovered, beforeMul: before.soulMulRested, beforeXp: before.restedXpMult,
             afterRec: after.recovered, afterMul: after.soulMulRested, afterXp: after.restedXpMult };
  });
  ok("10 RECUPERACIÓN por proximidad+dwell (SIN hotkey): dwell 0 en radio → tras ≥dwellSec ⇒ auto-recupera (recovered false→true)",
     !rec.bad && rec.role === "recoverer" && rec.beforeDwell === 0 && rec.beforeRec === false && rec.afterRec === true, JSON.stringify(rec));
  ok("11 PASIVO RECUPERADOR en gainXP: served sim.js aplica soulMul(h,'restedMult') en gainXP AND recovered ⇒ knob 0.10 AND restedXpMult ≈ off+0.10",
     seamWired && !rec.bad && rec.beforeMul === 0 && near(rec.afterMul, 0.10) && near(rec.afterXp, rec.beforeXp + 0.10),
     `wired=${seamWired} ${JSON.stringify(rec)}`);

  // 12 CAÍDO NO recupera su PROPIO vestigio
  const own = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(4200); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: w.fallenIdx });                                                              // fallen (su propio vestigio)
    const r = window.__dev.soul({ toVestige: true, nowMs: w.nm });
    const rr = window.__dev.soul({ recover: true, nowMs: w.nm + 3 * 1000 + 300 });                            // dwell suficiente, pero rol fallen ⇒ deny
    return { role: r.role, resOk: rr.result ? rr.result.ok : null, reason: rr.result ? rr.result.reason : null, recovered: rr.recovered };
  });
  ok("12 CAÍDO NO recupera su PROPIO vestigio: rol 'fallen' ⇒ tryRecoverVestige {ok:false, reason:'own'} AND recovered false",
     !own.bad && own.role === "fallen" && own.resOk === false && own.reason === "own" && own.recovered === false, JSON.stringify(own));

  // 13 BUFF del CAÍDO en respawn + fade por kills
  const resp = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spick(4400); if (!w) return { bad: true };
    window.__dev.soul({ nowMs: w.nm });                                                                       // G.soul set (period del vestigio)
    window.__dev.soul({ die: true });                                                                         // muere + respawn ⇒ soulFell (buff activo)
    const on = window.__dev.soul({ nowMs: w.nm }).soulMulRested;                                              // buff de recuperación
    window.__dev.soul({ kill: { n: 20 } });                                                                   // +respawnKills kills ⇒ fade
    const off = window.__dev.soul({ nowMs: w.nm }).soulMulRested;
    return { on, off };
  });
  ok("13 BUFF del CAÍDO en respawn: die ⇒ soulMulRested == respawnBoost(0.15); +respawnKills kills ⇒ 0 (fade determinista por contador monótono)",
     !resp.bad && near(resp.on, 0.15) && resp.off === 0, JSON.stringify(resp));

  // 14 byte-id pasivo OFF (aun con estado)
  const passiveOff = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(4600); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 }); window.__dev.soul({ toVestige: true, nowMs: w.nm }); window.__dev.soul({ nowMs: w.nm + 4000 }); // recuperado
    window.__dev.soul({ enabled: false });                                                                    // gate OFF (soulGot persiste)
    const s = window.__dev.soul();
    return { enabled: s.enabled, mul: s.soulMulRested, tag: s.tag };
  });
  ok("14 byte-id pasivo OFF: enabled false (aun con soulGot) ⇒ soulMulRested 0 AND tag \"\" (gate ⇒ seam restedMult byte-id a HEAD)",
     !passiveOff.bad && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "", JSON.stringify(passiveOff));

  // 15 PRECEDENCIA: SOUL cede a STANDINGS + MENTOR (mismo canal); coexiste con TERRITORY (⊥)
  const prec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.territory({ enabled: false });
    window.__dev.soul({ enabled: true }); const w = window.__spick(5000); if (!w) return { bad: true };
    const T = w.nm; window.__dev.soul({ nowMs: T }); window.__dev.soul({ die: true });                        // buff del caído activo (0.15)
    const base = window.__dev.soul({ nowMs: T }).soulMulRested;                                               // sin standings/mentor/territory ⇒ 0.15
    // (a) vs STANDINGS (MISMO canal restedMult): jura la orden LÍDER ⇒ standingsMul>0 ⇒ soulMul CEDE
    window.__dev.standings({ enabled: true, nowMs: T }); const leader = window.__dev.standings({ nowMs: T }).leader;
    window.__dev.oath({ grantRep: 99999 }); window.__dev.oath({ pledge: leader });
    const sMul = window.__dev.standings({ nowMs: T }).standingsMulRestedMult;
    const standingsCeded = window.__dev.soul({ nowMs: T }).soulMulRested;                                     // esperado 0
    window.__dev.standings({ enabled: false });
    // (b) vs MENTOR (MISMO canal restedMult): protégé ligado ⇒ mentorMul>0 ⇒ soulMul CEDE
    window.__dev.mentor({ enabled: true }); const mp = window.__dev.mentor({ nowMs: T });
    window.__dev.mentor({ lvl: Math.max(1, (mp.partner ? mp.partner.lvl : 20) - 12) }); window.__dev.mentor({ kill: { n: 8 } });
    const mMul = window.__dev.mentor({ nowMs: T }).mentorMulRested;
    const mentorCeded = window.__dev.soul({ nowMs: T }).soulMulRested;                                        // esperado 0
    window.__dev.mentor({ enabled: false });
    // (c) vs TERRITORY (canal ⊥ safeRegen): coexisten ⇒ soul sigue 0.15
    window.__dev.territory({ enabled: true, nowMs: T });
    const tMul = window.__dev.territory().territoryMulSafeRegen != null ? window.__dev.territory().territoryMulSafeRegen : window.__dev.territory().safeRegenMul;
    const territoryCoexist = window.__dev.soul({ nowMs: T }).soulMulRested;                                   // esperado 0.15
    window.__dev.territory({ enabled: false });
    return { base, sMul, standingsCeded, mMul, mentorCeded, tMul, territoryCoexist };
  });
  ok("15 PRECEDENCIA: SOUL(buff 0.15) CEDE a STANDINGS mismo-canal ⇒ 0 AND CEDE a MENTOR mismo-canal ⇒ 0 AND COEXISTE con TERRITORY(⊥) ⇒ knob>0 (0 doble-conteo)",
     !prec.bad && near(prec.base, 0.15) && prec.sMul > 0 && prec.standingsCeded === 0 && prec.mMul > 0 && prec.mentorCeded === 0 && prec.territoryCoexist > 0, JSON.stringify(prec));

  // 16 CONVERGENCIA 2-cliente: vestigio idéntico pese a rol OPUESTO
  const conv = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(5500); if (!w) return { bad: true };
    const T = w.nm;
    window.__dev.soul({ heroIdx: w.fallenIdx });        const a = window.__dev.soul({ nowMs: T });           // cliente A: fallen
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 }); const b = window.__dev.soul({ nowMs: T });         // cliente B: recoverer
    return { vA: JSON.stringify(a.vestige), vB: JSON.stringify(b.vestige), same: JSON.stringify(a.vestige) === JSON.stringify(b.vestige), roleA: a.role, roleB: b.role };
  });
  ok("16 CONVERGENCIA 2-cliente: vestigio IDÉNTICO (puro del reloj) pese a rol OPUESTO por héroe (A fallen / B recoverer ⇒ 0 desync)",
     !conv.bad && conv.same === true && conv.roleA === "fallen" && conv.roleB === "recoverer", JSON.stringify(conv));

  // 17 render + world glyph + panel
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /SOUL_RECOVERY\.enabled/.test(rsrc) && /sim\.soulVestige\(/.test(rsrc) && /⚱/.test(rsrc) && /sim\.fallenVestige\(/.test(rsrc) && /Vestigio del Caído/.test(rsrc);
  const tagAuth = await page.evaluate(() => {
    window.__dev.soul({ enabled: true }); const w = window.__spick(6000); if (!w) return { bad: true };
    window.__dev.soul({ heroIdx: (w.fallenIdx + 1) % 6 });
    window.__dev.soul({ enabled: false }); const off = window.__dev.soul().tag;                               // OFF ⇒ ""
    window.__dev.soul({ enabled: true }); const on = window.__dev.soul({ nowMs: w.nm }).tag;                  // vivo ⇒ ⚱
    return { off, on, nm: w.nm, x: w.x, y: w.y };
  });
  // pin Date.now para que el game-loop tickSoul no re-derive al render ⇒ el vestigio vivo persiste ⇒ glifo se dibuja; teleporta el héroe a la tile
  await page.evaluate((nm, x, y) => {
    window.__t17 = Date.now; Date.now = () => nm;
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: nm });
    window.__dev.tp(x / 32, y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
  }, tagAuth.nm, tagAuth.x, tagAuth.y);
  await sleep(220);
  const liveNow = await page.evaluate(() => window.__dev.soul().live);
  try { await page.screenshot({ path: join(OUT, "vestige-world.png") }); } catch (e) {}
  await page.evaluate(() => { if (window.__t17) { Date.now = window.__t17; delete window.__t17; } if (window.__dev.daynight) window.__dev.daynight(null); window.__dev.soul({ enabled: false }); });
  ok("17 render + world glyph + panel: render.js servido dibuja soulVestige() (⚱ gated) + fallenVestige() ('Vestigio del Caído') + soulTag; \"\" OFF / ⚱ vivo",
     !tagAuth.bad && gatedDraw && tagAuth.off === "" && tagAuth.on === "⚱" && liveNow === true,
     `gatedDraw=${gatedDraw} off="${tagAuth.off}" on="${tagAuth.on}" liveNow=${liveNow}`);

  // 18 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.soul({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const so = window.__dev.soul(); const m = window.__dev.mentor(); const f = window.__dev.fellowship(); const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { soulOk: so.enabled, mentorOk: m.enabled, fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("18 arco regr: MENTOR + FELLOWSHIP + CONTEST + TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con SOUL ON",
     arc.soulOk && arc.mentorOk && arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 19 fps NO-REGRESSION (mediana-de-5 + warmup)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.soul({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const off = await sample(false); const onA = await sample(true);
    return { off, on: onA };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("19 fps NO-REGRESIÓN: SOUL ON no degrada el frame budget vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9)",
     onM >= offM * 0.9, `on≈${Math.round(onM)} off≈${Math.round(offM)}`);

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
