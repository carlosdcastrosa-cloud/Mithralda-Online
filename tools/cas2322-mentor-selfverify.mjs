// CAS-2322 — GE self-verify for VÍNCULO DE MENTOR / MENTORSHIP BOND (DARK, MENTOR_BOND.enabled:false).
// Capa social ASIMÉTRICA (veterano↔novato) — el siguiente pilar de retención MMORPG tras FELLOWSHIP_BOND (pares simétricos, LIVE). El reloj de
// pared COMPARTIDO asigna al héroe UN compañero del roster fijo (hash de Knuth, 0 RNG) ⇒ convergencia N-clientes (mismo compañero). El ROL
// (mentor/protégé) lo decide el GAP de nivel del héroe LOCAL vs el compañero (≥gapThreshold). El DWELL de co-presencia = kills monótonos desde que
// se asignó el par (h.mentorAt). Al alcanzar bindTier el par queda LIGADO ⇒ BENEFICIO PROTÉGÉ: boost de XP escalonado (reusa el canal restedMult de
// RESTED_XP); BENEFICIO MENTOR: título ⚜ en el nameplate (capa TITLES), sin ventaja de poder. PRECEDENCIA anti-stacking: MENTOR cede a
// STANDINGS(restedMult,colectivo) y a FELLOWSHIP(xpGain,forjada) ⇒ 0 doble-conteo. 0 hotkey, 0 clave de save nueva, SIN input.js.
//
// Observado vía __dev.mentor (flip enabled IN-MEMORY + nowMs para el reloj semanal + lvl para el rol + kill para el dwell) + __dev.fellowship/
// standings/oath/contest/territory/ledger/bounty/sanctuary/warhorn/emissary/recall/safeZone/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.mentor + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: enabled false AND role 'none' AND bound false AND mentorMulRested 0 AND partner null AND gExists false (inerte/observable OFF).
//   3  byte-id save OFF: saveBlob() SIN clave 'mentorAt' (dwell = snapshot per-semana, 0 clave con la feature OFF).
//   4  byte-id OFF: hasField false (h.mentorAt NUNCA se crea) AND gExists false (G.mentor NUNCA se crea).
//   5  worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo).
//   6  COMPAÑERO determinista + convergencia: mismo nowMs ⇒ MISMO compañero (id+lvl) en 2 lecturas (0 desync).
//   7  COMPAÑERO ROTA por semana: ≥2 compañeros DISTINTOS al barrer semanas (rotación determinista del roster).
//   8  ROL por GAP de nivel: lvl bajo ⇒ protégé; lvl alto ⇒ mentor; lvl dentro del umbral ⇒ 'none' (asimetría determinista).
//   9  DWELL deriva de kills: snapshot @nowMs (dwell 0) + kill 5 ⇒ dwell 5 (contador monótono, 0 tracking nuevo).
//  10  BIND gate + boost ESCALONADO del protégé: dwell<bind ⇒ bound false/boost 0; dwell≥4 ⇒ bound true/boost 0.10; dwell≥12 ⇒ boost 0.15.
//  11  PASIVO efectivo en gainXP: served sim.js aplica mentorMul(h,'restedMult') en gainXP AND restedXpMult del protégé ligado ≈ base+0.10.
//  12  MENTOR sin boost (asimetría): rol mentor ligado ⇒ tag ⚜ AND mentorMulRested 0 (el veterano recibe el TÍTULO, no el boost de XP).
//  13  byte-id pasivo OFF: enabled false (aun con dwell alto + rol) ⇒ bound false AND mentorMulRested 0 (gate ⇒ seam restedMult byte-id a HEAD).
//  14  PRECEDENCIA (mirror territory→standings): protégé ligado + STANDINGS liderando ⇒ mentorMulRested 0 (cede, MISMO canal); + FELLOWSHIP forjada ⇒ sigue 0.10 (canal ⊥, coexisten).
//  15  CONVERGENCIA 2-cliente: mismo nowMs ⇒ compañero IDÉNTICO pese a rol OPUESTO por héroe (A protégé lvl bajo, B mentor lvl alto ⇒ 0 desync).
//  16  render + nameplate: render.js servido dibuja mentorshipBond() ('Vínculo de Mentor') gated + glifo via mentorBondTag; "" OFF / ⚜ mentor / ✦ protégé.
//  17  arco regr: FELLOWSHIP + CONTEST + TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con MENTOR ON.
//  18  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2322-mentor-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2322");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (reloj propio del Vínculo)
const wk = (w, frac) => w * PERIOD_MS + Math.floor(PERIOD_MS * frac);
const T_A = wk(5000, 0.40);                                       // una semana cualquiera

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
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

  // page-side helper: escanea semanas desde startW y devuelve la 1ª cuyo compañero asignado tiene lvl≥minP (+ re-snapshotea el dwell a 0 en ESA
  // semana). Necesario porque el compañero ROTA por semana ⇒ el lvl del héroe debe fijarse relativo al compañero de LA semana observada (no otra).
  await page.evaluate(() => {
    window.__mpick = (startW, minP) => { const PM = 604800 * 1000; window.__dev.mentor({ enabled: true });
      for (let w = startW; w < startW + 400; w++) { const nm = w * PM + Math.floor(PM * 0.40);
        const m = window.__dev.mentor({ nowMs: nm }); if (m.partner && m.partner.lvl >= minP) return { nm, plvl: m.partner.lvl }; }
      return null; };
  });

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.mentor && window.__dev.fellowship && window.__dev.standings && window.__dev.oath && window.__dev.contest && window.__dev.territory && window.__dev.ledger && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.mentor + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.mentor());
  ok("2 DARK default: enabled false AND role 'none' AND bound false AND mentorMulRested 0 AND partner null AND gExists false (inerte OFF)",
     dark.enabled === false && dark.role === "none" && dark.bound === false && dark.mentorMulRested === 0 && dark.partner === null && dark.gExists === false,
     `enabled=${dark.enabled} role=${dark.role} bound=${dark.bound} mul=${dark.mentorMulRested} partner=${JSON.stringify(dark.partner)} gExists=${dark.gExists}`);

  // 3 save OFF has no new key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'mentorAt' key in save blob (dwell = snapshot per-semana, 0 clave con la feature OFF)", !/"mentorAt"/.test(saveOff), `len=${saveOff.length}`);

  // 4 byte-id OFF: no field / no transient state
  const off4 = await page.evaluate(() => { const m = window.__dev.mentor(); return { hasField: m.hasField, gExists: m.gExists }; });
  ok("4 byte-id OFF: hasField false (h.mentorAt NUNCA se crea) AND gExists false (G.mentor NUNCA se crea)",
     off4.hasField === false && off4.gExists === false, JSON.stringify(off4));

  // 5 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.mentor({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.mentor({ enabled: false }));
  ok("5 worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 6 COMPAÑERO determinista + convergencia: same nowMs ⇒ mismo partner en 2 lecturas
  const part = await page.evaluate((T) => {
    window.__dev.mentor({ enabled: true });
    const a = window.__dev.mentor({ nowMs: T });
    const b = window.__dev.mentor({ nowMs: T });
    return { a: a.partner, b: b.partner, ja: JSON.stringify(a.partner), jb: JSON.stringify(b.partner) };
  }, T_A);
  ok("6 COMPAÑERO determinista + convergencia: mismo nowMs ⇒ MISMO compañero (id+lvl) en 2 lecturas (0 desync)",
     part.a && part.a.id && typeof part.a.lvl === "number" && part.ja === part.jb, `partner=${part.ja}`);

  // 7 COMPAÑERO ROTA por semana
  const rot = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    const ids = new Set();
    for (let w = 5000; w < 5060; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const m = window.__dev.mentor({ nowMs: nm }); ids.add(m.partner ? m.partner.id : ""); }
    return { distinct: ids.size, sample: [...ids].slice(0, 5) };
  }, PERIOD_MS);
  ok("7 COMPAÑERO ROTA por semana: ≥2 compañeros DISTINTOS al barrer semanas (rotación determinista del roster)",
     rot.distinct >= 2, `distinct=${rot.distinct} sample=${JSON.stringify(rot.sample)}`);

  // helper page-side: find a week whose partner.lvl is mid/high so ambos roles caben (protégé lvl≥1 con gap≤−thr)
  const findWeek = `(function(PM){ window.__dev.mentor({enabled:true});
    for(let w=6000; w<6200; w++){ const nm=w*PM+Math.floor(PM*0.40); const m=window.__dev.mentor({nowMs:nm});
      if(m.partner && m.partner.lvl>=22) return {nm, plvl:m.partner.lvl, thr:m.gapThreshold, pid:m.partner.id}; }
    return null; })(${PERIOD_MS})`;
  const wsel = await page.evaluate(findWeek);

  // 8 ROL por GAP
  const role = await page.evaluate((w) => {
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: w.nm });
    window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) }); const lo = window.__dev.mentor({ nowMs: w.nm }).role;   // protégé (gap ≤ −thr)
    window.__dev.mentor({ lvl: w.plvl + 12 });               const hi = window.__dev.mentor({ nowMs: w.nm }).role;   // mentor  (gap ≥ +thr)
    window.__dev.mentor({ lvl: w.plvl + 2 });                const eq = window.__dev.mentor({ nowMs: w.nm }).role;   // none    (|gap| < thr)
    return { lo, hi, eq, plvl: w.plvl, thr: w.thr };
  }, wsel);
  ok("8 ROL por GAP de nivel: lvl bajo ⇒ 'protege', lvl alto ⇒ 'mentor', lvl dentro del umbral ⇒ 'none' (asimetría determinista)",
     role.lo === "protege" && role.hi === "mentor" && role.eq === "none", JSON.stringify(role));

  // 9 DWELL deriva de kills (semana fresca ⇒ killBase = kills actuales ⇒ dwell arranca en 0)
  const dwell = await page.evaluate((PM) => {
    const T = 6300 * PM + Math.floor(PM * 0.40);
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: T });
    const before = window.__dev.mentor().dwell;
    window.__dev.mentor({ kill: { n: 5 } });
    const after5 = window.__dev.mentor().dwell;
    return { before, after5 };
  }, PERIOD_MS);
  ok("9 DWELL deriva de kills: snapshot @nowMs (dwell 0) + kill 5 ⇒ dwell == 5 (contador monótono, 0 tracking nuevo)",
     dwell.before === 0 && dwell.after5 === 5, JSON.stringify(dwell));

  // 10 BIND gate + boost escalonado del protégé
  const bind = await page.evaluate(() => {
    const w = window.__mpick(6100, 17); window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) });   // protégé de la semana observada
    window.__dev.mentor({ kill: { n: 3 } }); const b3 = window.__dev.mentor();   // dwell 3 < bind(4)
    window.__dev.mentor({ kill: { n: 1 } }); const b4 = window.__dev.mentor();   // dwell 4 == bind ⇒ Aprendiz 0.10
    window.__dev.mentor({ kill: { n: 8 } }); const b12 = window.__dev.mentor();  // dwell 12 ⇒ Discípulo 0.15
    return { role: b4.role, b3B: b3.bound, b3Boost: b3.boost, b4B: b4.bound, b4Boost: b4.boost, b12Boost: b12.boost, b12Tier: b12.tierName };
  });
  ok("10 BIND gate + boost ESCALONADO: dwell 3 ⇒ bound false/boost 0; dwell 4 ⇒ bound true/boost 0.10; dwell 12 ⇒ boost 0.15 (Discípulo)",
     bind.role === "protege" && bind.b3B === false && bind.b3Boost === 0 && bind.b4B === true && near(bind.b4Boost, 0.10) && near(bind.b12Boost, 0.15) && bind.b12Tier === "Discípulo",
     JSON.stringify(bind));

  // 11 PASIVO efectivo en gainXP + served-source wiring
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /mentorMul\(h,\s*"restedMult"\)/.test(simSrc);
  const xp = await page.evaluate(() => {
    const w = window.__mpick(6200, 17); window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) });   // protégé
    const off = window.__dev.mentor().restedXpMult;              // dwell 0 ⇒ sin boost
    window.__dev.mentor({ kill: { n: 4 } });
    const on = window.__dev.mentor();                            // ligado ⇒ +0.10
    return { role: on.role, off, onMult: on.restedXpMult, onKnob: on.mentorMulRested };
  });
  ok("11 PASIVO efectivo en gainXP: served sim.js aplica mentorMul(h,'restedMult') en gainXP AND restedXpMult ligado ≈ off+0.10",
     seamWired && xp.role === "protege" && near(xp.onKnob, 0.10) && near(xp.onMult, xp.off + 0.10, 1e-4), `wired=${seamWired} ${JSON.stringify(xp)}`);

  // 12 MENTOR sin boost (asimetría)
  const mentorRole = await page.evaluate(() => {
    const w = window.__mpick(6250, 1); window.__dev.mentor({ lvl: w.plvl + 12 });   // mentor (gap ≥ +thr para cualquier compañero)
    window.__dev.mentor({ kill: { n: 8 } });                     // ligado
    const m = window.__dev.mentor();
    return { role: m.role, bound: m.bound, tag: m.tag, knob: m.mentorMulRested, boost: m.boost };
  });
  ok("12 MENTOR sin boost (asimetría): rol mentor LIGADO ⇒ tag ⚜ AND mentorMulRested 0 AND boost 0 (el veterano recibe el TÍTULO, no el XP)",
     mentorRole.role === "mentor" && mentorRole.bound === true && mentorRole.tag === "⚜" && mentorRole.knob === 0 && mentorRole.boost === 0, JSON.stringify(mentorRole));

  // 13 byte-id pasivo OFF con dwell/rol altos
  const passiveOff = await page.evaluate(() => {
    const w = window.__mpick(6280, 17); window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) }); window.__dev.mentor({ kill: { n: 20 } });   // protégé ligado, dwell alto
    window.__dev.mentor({ enabled: false });                    // gate OFF (dwell/lvl persisten)
    const m = window.__dev.mentor();
    return { enabled: m.enabled, bound: m.bound, knob: m.mentorMulRested, tag: m.tag };
  });
  ok("13 byte-id pasivo OFF: enabled false (aun con dwell alto + rol) ⇒ bound false AND mentorMulRested 0 AND tag \"\" (gate ⇒ seam byte-id)",
     passiveOff.enabled === false && passiveOff.bound === false && passiveOff.knob === 0 && passiveOff.tag === "", JSON.stringify(passiveOff));

  // 14 PRECEDENCIA (mirror territory→standings): MENTOR cede a STANDINGS en el MISMO canal (restedMult); COEXISTE con FELLOWSHIP (xpGain, canal ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.fellowship({ enabled: false });
    const w = window.__mpick(6320, 17); const T = w.nm;
    window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) }); window.__dev.mentor({ kill: { n: 6 } });   // protégé ligado (boost 0.10 base)
    const base = window.__dev.mentor(); const baseKnob = base.mentorMulRested, baseRole = base.role;   // sin standings/fellowship ⇒ 0.10
    // (a) vs STANDINGS (MISMO canal restedMult): enable standings, jura la orden LÍDER ⇒ standingsMul>0 ⇒ mentorMul CEDE
    window.__dev.standings({ enabled: true, nowMs: T });
    const leader = window.__dev.standings({ nowMs: T }).leader;
    window.__dev.oath({ grantRep: 99999 }); window.__dev.oath({ pledge: leader });                     // rep para pasar el gate de rango + jura la orden líder
    const sMul = window.__dev.standings({ nowMs: T }).standingsMulRestedMult;
    const standingsCeded = window.__dev.mentor({ nowMs: T }).mentorMulRested;                          // esperado 0 (cede a standings)
    // (b) vs FELLOWSHIP (canal ⊥ xpGain): apaga standings, forja la hermandad ⇒ mentorMul COEXISTE (sigue 0.10)
    window.__dev.standings({ enabled: false });
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 20 } });
    const fForged = window.__dev.fellowship().forged, fMulXp = window.__dev.fellowship().fellowMulXp;
    const fellowCoexist = window.__dev.mentor({ nowMs: T }).mentorMulRested;                           // esperado 0.10 (canal ⊥, coexisten)
    window.__dev.fellowship({ enabled: false });
    return { baseRole, baseKnob, sMul, standingsCeded, fForged, fMulXp, fellowCoexist };
  });
  ok("14 PRECEDENCIA (mirror territory→standings): protégé (knob 0.10) CEDE a STANDINGS mismo-canal ⇒ 0; COEXISTE con FELLOWSHIP canal ⊥ ⇒ knob>0 (0 doble-conteo en restedMult)",
     prec.baseRole === "protege" && near(prec.baseKnob, 0.10) && prec.sMul > 0 && prec.standingsCeded === 0 && prec.fForged === true && prec.fMulXp > 0 && prec.fellowCoexist > 0, JSON.stringify(prec));

  // 15 CONVERGENCIA 2-cliente: mismo nowMs ⇒ compañero idéntico pese a rol OPUESTO
  const conv = await page.evaluate(() => {
    window.__dev.fellowship({ enabled: false });
    const w = window.__mpick(6400, 17); const T = w.nm;
    // "cliente A": lvl bajo ⇒ protégé
    window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) });
    const a = window.__dev.mentor({ nowMs: T }); const pA = JSON.stringify(a.partner), roleA = a.role;
    // "cliente B": mismo reloj, lvl alto ⇒ mentor
    window.__dev.mentor({ lvl: w.plvl + 12 });
    const b = window.__dev.mentor({ nowMs: T }); const pB = JSON.stringify(b.partner), roleB = b.role;
    return { pA, pB, sameP: pA === pB, roleA, roleB };
  });
  ok("15 CONVERGENCIA 2-cliente: compañero IDÉNTICO (puro del reloj) pese a rol OPUESTO por héroe (A protégé / B mentor ⇒ 0 desync)",
     conv.sameP === true && conv.roleA === "protege" && conv.roleB === "mentor", JSON.stringify(conv));

  // 16 render + nameplate: served render.js gated draw + mentorBondTag authority + screenshot
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /MENTOR_BOND\.enabled/.test(rsrc) && /sim\.mentorshipBond\(/.test(rsrc) && /Vínculo de Mentor/.test(rsrc) && /sim\.mentorBondTag\(/.test(rsrc) && /⚜/.test(rsrc);
  const tagAuth = await page.evaluate(() => {
    const w = window.__mpick(6440, 17); const T = w.nm;
    window.__dev.mentor({ lvl: Math.max(1, w.plvl - 12) }); window.__dev.mentor({ kill: { n: 8 } });
    window.__dev.mentor({ enabled: false });
    const off = window.__dev.mentor().tag;                       // OFF ⇒ ""
    window.__dev.mentor({ enabled: true });
    const onProt = window.__dev.mentor({ nowMs: T }).tag;        // protégé ligado ⇒ ✦
    window.__dev.mentor({ lvl: w.plvl + 12 });
    const onMentor = window.__dev.mentor({ nowMs: T }).tag;      // mentor ligado ⇒ ⚜
    return { off, onProt, onMentor, nm: T, plvl: w.plvl };
  });
  // pin Date.now para que tickMentor no re-snapshotee al render ⇒ el rol ligado persiste ⇒ glifo se dibuja
  await page.evaluate((nm, plvl) => {
    window.__t16 = Date.now; Date.now = () => nm;
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: nm });
    window.__dev.mentor({ lvl: plvl + 12 }); window.__dev.mentor({ kill: { n: 8 } });   // mentor ligado ⇒ ⚜
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
  }, tagAuth.nm, tagAuth.plvl);
  await sleep(200);
  const boundNow = await page.evaluate(() => window.__dev.mentor().bound);
  try { await page.screenshot({ path: join(OUT, "nameplate-mentor.png"), clip: { x: 520, y: 210, width: 260, height: 210 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t16) { Date.now = window.__t16; delete window.__t16; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("16 render + nameplate: render.js servido dibuja mentorshipBond() ('Vínculo de Mentor') gated + glifo via mentorBondTag; \"\" OFF / ✦ protégé / ⚜ mentor",
     gatedDraw && tagAuth.off === "" && tagAuth.onProt === "✦" && tagAuth.onMentor === "⚜" && boundNow === true,
     `gatedDraw=${gatedDraw} off="${tagAuth.off}" prot="${tagAuth.onProt}" mentor="${tagAuth.onMentor}" boundNow=${boundNow}`);

  // 17 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.mentor({ enabled: true }); window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const m = window.__dev.mentor(); const f = window.__dev.fellowship(); const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { mentorOk: m.enabled, fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("17 arco regr: FELLOWSHIP + CONTEST + TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con MENTOR ON",
     arc.mentorOk && arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 18 fps NO-REGRESSION (mediana-de-5 + warmup)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.mentor({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const off = await sample(false); const onA = await sample(true);
    return { off, on: onA };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("18 fps NO-REGRESIÓN: MENTOR ON no degrada el frame budget vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9)",
     onM >= offM * 0.9, `on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  await page.evaluate(() => window.__dev.mentor({ enabled: false }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
