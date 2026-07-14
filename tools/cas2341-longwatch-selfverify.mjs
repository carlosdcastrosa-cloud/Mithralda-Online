// CAS-2341 — GE self-verify for VIGILIA / LONG WATCH (DARK, LONG_WATCH.enabled:false). EVO mecánica #54.
// Eje FRESCO (NO repite #47-53): NO headcount instantáneo (Congregación #51), NO footfall por celda (Sendero #52), NO variedad de clases (Confluencia #53), NO zona por
// reloj (World Pulse #50). Es CONTINUIDAD TEMPORAL: cuánto tiempo una zona lleva OCUPADA SIN INTERRUPCIÓN por ≥1 jugador. El server mantiene por zona un `streak`
// (segundos-ocupados-continuos) que SUBE con presencia y DECAE determinista al vaciarse (ROMPE si el hueco supera gapBreakSec); empuja { zona → { streak, atMs, present } };
// el cliente lo REFLEJA y lo PROYECTA al `now` compartido. Al cruzar umbrales (30/90/180s) la zona entra en Vigilia por tiers y da a TODOS los presentes el MISMO passive (RESTED_XP).
//
// ★ DIFERENCIADOR (checks 6b/6c/7, no-negociable): el streak es función del TIEMPO CONTINUO ocupado, no del headcount. Presencia sostenida lo SUBE; vaciar la zona lo
// DECAE por vida-media; un hueco > umbral lo ROMPE (→0). 1 jugador que entra y SALE NO abre la Vigilia (streak breve < T1); mantenerla "caliente" vía RELEVO (hand-off entre
// jugadores) preserva el streak dentro del hueco y lo reconstruye. ABANDONO (hueco > gap) la pierde. Prueba que el eje es CONTINUIDAD, no densidad/composición/traversal.
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {streak,atMs,present} + MISMO reloj (nowMs)
// ⇒ ven streak + tier + buff IDÉNTICOS byte-a-byte (0 desync). Subir con presencia y decaer CONVERGEN en ambos. Cualquier desync de streak/tier/buff = sev-1. El passive es
// COMPARTIDO (no per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO el streak/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): LONG_WATCH es la MÁS BAJA del canal restedMult (9ª fuente) ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE > CONGREGATION >
// WAYFARER > DIVERSE_COMPANY — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco del canal está LIVE, para OBSERVAR
// el passive de Vigilia en AISLAMIENTO hay que desactivar esos peers in-memory ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.longWatch (flip LONG_WATCH.enabled IN-MEMORY + inyección del snapshot {zona→{streak,atMs,present}} + nowMs/toZone/leave drivers) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/confluence/territory/oath/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.longWatch + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): LONG_WATCH.enabled false AND G.longWatch NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'longWatch'/'longWatchServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  TABLA de tiers = función PURA del STREAK (segundos-continuos): streak→tier (29→T0,30→T1,89→T1,90→T2,179→T2,180→T3) + boost (0/0.05/0.10/0.15) determinista.
//   6a SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; streak negativo ⇒ clamped a 0/descartado.
//   6b ★ EJE FRESCO — SUBIDA: presencia CONTINUA (present=1) sube el streak con el tiempo transcurrido cruzando tiers 0→1→2→3 (+0/+30/+90/+180s); visita breve (+10s) NO abre (T0).
//   6c ★ EJE FRESCO — DECAY + RUPTURA: zona vacía (present=0) DECAE por vida-media (+45s ⇒ ×0.5, +90s ⇒ ×0.25) y ROMPE tras hueco > gapBreakSec (+61s ⇒ 0).
//   7  ★ RELEVO vs ABANDONO: hueco > gap (61s) ⇒ streak ROTO (0, vigilia perdida); hueco < gap (30s) ⇒ streak PRESERVADO (decae, >0) y el RELEVO (present=1) lo reconstruye ≥T1.
//   8  PASSIVE compartido (aislado): peers OFF + streak≥umbral + héroe EN la zona ⇒ longWatchMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//   9  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica longWatchMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  10  PRECEDENCIA MÁXIMO ÚNICO: LONG_WATCH(0.05) CEDE a STANDINGS ⇒ 0 AND a CONGREGATION ⇒ 0 AND a WAYFARER ⇒ 0 AND a CONFLUENCIA ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥).
//  11  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ streak/tier/buff IDÉNTICOS byte-a-byte; subir/decaer CONVERGE;
//      A sale ⇒ Δ_A=0 PERO streak/tier compartidos + Δ_B INTACTOS (0 desync).
//  12  render badge "Vigilia" se DIBUJA con la feature ON (Δ px vs OFF-control) + arco regr + fps.
//  13  ★ 0-REGRESIÓN: los 5 flags del arco ya LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY) siguen served enabled:true en config.js.
//  14  ★ COBERTURA 6 zonas: las 6 zonas de LONG_WATCH.zones hospedan una Vigilia observable (streak≥180 ⇒ T3) broken=[].
//   0  no JS errors during run.
// Run: node tools/cas2341-longwatch-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2341");
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

// helper: desactiva los 7 peers DEFAULT-ON del mismo canal restedMult (todo el arco LIVE) para medir Vigilia en AISLAMIENTO; y drivers de snapshot/proyección con reloj FIJO.
const NOW = 5000000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__LWNOW = NOW;
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); };
    // empuja el snapshot crudo de UNA zona (atMs = NOW ⇒ dtMs=0 al proyectar a NOW ⇒ streak == base exacto)
    window.__lwsnap = (zone, streak, present) => { window.__dev.longWatch({ nowMs: window.__LWNOW, push: { [zone]: { streak, atMs: window.__LWNOW, present } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000)
    window.__lwat = (zone, elapsedSec) => window.__dev.longWatch({ nowMs: window.__LWNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un streak `streak` (present=1, atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (watchable + zona coincide).
    window.__lwpick = (streak) => {
      window.__dev.longWatch({ enabled: true });
      const zones = window.__dev.longWatch().zones || [];
      for (const z of zones) {
        const s = window.__dev.longWatch({ nowMs: window.__LWNOW, push: { [z]: { streak, atMs: window.__LWNOW, present: 1 } }, toZone: z });
        if (s.zone === z && s.watchable) return { zone: z, streak: s.streak, tier: s.tier, boost: s.longWatchMulRested };
      }
      return null;
    };
  }, NOW);
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.longWatch && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.longWatch + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.longWatch never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.longWatch());
  ok("2 byte-id OFF (fresh boot): LONG_WATCH.enabled false AND G.longWatch NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.streak === 0 && dark.boost === 0 && dark.tag === "" && dark.streaks === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} streak=${dark.streak} boost=${dark.boost} tag="${dark.tag}" streaks=${JSON.stringify(dark.streaks)}`);

  // 3 save OFF has no 'longWatch'/'longWatchServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'longWatch'/'longWatchServer' key in save blob (estado 100% derivado/transitorio)", !/"longWatch(Server)?"/.test(saveOff) && !/longWatchServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.longWatch({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.longWatch({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 tier table = pure fn of STREAK: streak→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__lwpick(200); if (!w) return { bad: true };   // land in a watchable zone at max tier
    const zone = w.zone; const out = [];
    for (const s of [0, 29, 30, 89, 90, 179, 180, 300]) {
      window.__lwsnap(zone, s, 1);
      const vm = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone });
      out.push({ s, streak: vm.streak, tier: vm.tier, boost: vm.longWatchMulRested });
    }
    return { zone, out };
  });
  const expTier = { 0: 0, 29: 0, 30: 1, 89: 1, 90: 2, 179: 2, 180: 3, 300: 3 };
  const expBoost = { 0: 0, 29: 0, 30: 0.05, 89: 0.05, 90: 0.10, 179: 0.10, 180: 0.15, 300: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.streak, r.s) && r.tier === expTier[r.s] && near(r.boost, expBoost[r.s]));
  ok("5 TABLA de tiers = función PURA del STREAK: streak→tier (29→T0,30→T1,89→T1,90→T2,179→T2,180→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 6a server-authoritative reflect + validate (drop out-of-zone + negative streak)
  const refl = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const zones = window.__dev.longWatch().zones; const z0 = zones[0];
    window.__dev.longWatch({ nowMs: window.__LWNOW, push: { [z0]: { streak: 120, atMs: window.__LWNOW, present: 1 }, town: { streak: 300, atMs: window.__LWNOW, present: 1 } } });
    const s = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: z0 });
    // negative streak ⇒ clamped ⇒ dropped from projected map
    window.__dev.longWatch({ nowMs: window.__LWNOW, push: { [z0]: { streak: -50, atMs: window.__LWNOW, present: 1 } } });
    const neg = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: z0 });
    return { z0, valid: s.streak, streaks: s.streaks, negStreak: neg.streak, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 120) && !("town" in (refl.streaks || {})) && refl.negStreak === 0 && refl.negTier === 0;
  ok("6a SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona válida refleja streak; zona fuera de `zones` DESCARTADA; streak negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 6b ★ FRESH AXIS — RISE with continuous presence over elapsed time (present=1); brief visit does NOT open
  const rise = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__lwpick(0); if (!w) return { bad: true };
    const zone = w.zone; window.__lwsnap(zone, 0, 1);   // base 0, present ⇒ streak = elapsed seconds
    const brief = window.__lwat(zone, 10);              // 10s ⇒ streak 10 < 30 ⇒ T0 (enter+brief NO abre)
    const t1 = window.__lwat(zone, 30);                 // 30s ⇒ T1
    const t2 = window.__lwat(zone, 90);                 // 90s ⇒ T2
    const t3 = window.__lwat(zone, 180);               // 180s ⇒ T3
    return { zone, briefS: brief.streak, briefT: brief.tier, t1: { s: t1.streak, t: t1.tier }, t2: { s: t2.streak, t: t2.tier }, t3: { s: t3.streak, t: t3.tier } };
  });
  ok("6b ★ EJE FRESCO SUBIDA: presencia continua sube el streak con el tiempo (10s⇒T0 visita breve NO abre; 30s⇒T1; 90s⇒T2; 180s⇒T3)",
     !rise.bad && near(rise.briefS, 10) && rise.briefT === 0 && near(rise.t1.s, 30) && rise.t1.t === 1 && near(rise.t2.s, 90) && rise.t2.t === 2 && near(rise.t3.s, 180) && rise.t3.t === 3,
     JSON.stringify(rise));

  // 6c ★ FRESH AXIS — DECAY by half-life + BREAK after gap
  const decay = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__lwpick(0); if (!w) return { bad: true };
    const zone = w.zone; window.__lwsnap(zone, 100, 0);   // base 100, empty ⇒ decays (dentro de la ventana gapBreakSec 60s)
    const hl1 = window.__lwat(zone, 45);                  // +45s (1 vida-media) ⇒ 50
    window.__lwsnap(zone, 100, 0);
    const mid = window.__lwat(zone, 59);                  // +59s (< gap) ⇒ 100·0.5^(59/45) ≈ 40.30 (sigue decayendo, >0)
    window.__lwsnap(zone, 100, 0);
    const brk = window.__lwat(zone, 61);                  // +61s (> gapBreakSec 60) ⇒ 0 (roto) — la ruptura tiene precedencia sobre el decay
    return { zone, hl1: hl1.streak, mid: mid.streak, brk: brk.streak, brkTier: brk.tier };
  });
  ok("6c ★ EJE FRESCO DECAY+RUPTURA: zona vacía decae por vida-media (+45s⇒50, +59s⇒~40.3 aún decayendo <gap) y ROMPE tras hueco > gap (+61s⇒0/T0)",
     !decay.bad && near(decay.hl1, 50) && near(decay.mid, 40.30, 0.1) && decay.mid < 50 && decay.mid > 0 && decay.brk === 0 && decay.brkTier === 0, JSON.stringify(decay));

  // 7 ★ RELAY vs ABANDON — social hand-off differentiator
  const relay = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__lwpick(0); if (!w) return { bad: true };
    const zone = w.zone;
    // ABANDON: T1 streak (40), empty gap 61s (> gapBreakSec) ⇒ broken (0)
    window.__lwsnap(zone, 40, 0);
    const abandon = window.__lwat(zone, 61);
    // RELAY: T1 streak (40), empty 30s (< gap) ⇒ preserved (decays, >0); then relieved (present=1) rebuilds ≥T1
    window.__lwsnap(zone, 40, 0);
    const gap = window.__lwat(zone, 30);                                  // decayed but not broken
    window.__lwsnap(zone, gap.streak, 1);                                 // relief arrives with the preserved streak
    const relieved = window.__lwat(zone, 30);                             // +30s of continued presence
    return { zone, abandonS: abandon.streak, abandonT: abandon.tier, gapS: gap.streak, reliefS: relieved.streak, reliefT: relieved.tier };
  });
  ok("7 ★ RELEVO vs ABANDONO: hueco > gap (61s) ⇒ streak ROTO (0); hueco < gap (30s) ⇒ PRESERVADO (>0) y el RELEVO (present) lo reconstruye ≥T1 (mantener caliente)",
     !relay.bad && relay.abandonS === 0 && relay.abandonT === 0 && relay.gapS > 0 && relay.reliefT >= 1, JSON.stringify(relay));

  // 8 passive isolated: in-zone ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__lwpick(90); if (!w) return { bad: true };          // streak 90 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: w.zone });
    const out = window.__dev.longWatch({ leave: true });
    return { zone: w.zone, inMul: inz.longWatchMulRested, inTier: inz.tier, inStreak: inz.streak, outMul: out.longWatchMulRested, outTier: out.tier };
  });
  ok("8 PASSIVE compartido (aislado): héroe EN la zona con streak≥umbral ⇒ longWatchMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inStreak, 90) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 9 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /longWatchMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__lwpick(30); if (!w) return { bad: true };          // streak 30 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: w.zone }).longWatchMulRested;
    window.__dev.longWatch({ enabled: false });
    const s = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.longWatchMulRested, tag: s.tag };
  });
  ok("9 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma longWatchMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 10 precedence: LONG_WATCH cedes to STANDINGS + CONGREGATION + WAYFARER + CONFLUENCE (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__lwpick(30); if (!w) return { bad: true };          // base sin peers ⇒ 0.05
    const zone = w.zone; const setStreak = () => window.__lwsnap(zone, 30, 1);
    setStreak(); const base = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone }).longWatchMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ longWatchMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    setStreak(); const s1 = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.longWatchMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs CONGREGATION: headcount≥umbral en la MISMA zona ⇒ congMul>0 ⇒ longWatchMul CEDE
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    setStreak(); const s2 = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone }); const congPeer = s2.congMulRested, congCeded = s2.longWatchMulRested;
    window.__dev.congregation({ enabled: false });
    // (c) vs WAYFARER: celda trillada en la MISMA posición ⇒ wayfarerMul>0 ⇒ longWatchMul CEDE
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    setStreak(); const s3 = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone }); const wayPeer = s3.wayfarerMulRested, wayCeded = s3.longWatchMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (d) vs CONFLUENCIA: composición diversa en la MISMA zona ⇒ confMul>0 ⇒ longWatchMul CEDE
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    setStreak(); const s4 = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone }); const confPeer = s4.confMulRested, confCeded = s4.longWatchMulRested;
    window.__dev.confluence({ enabled: false });
    // (e) vs TERRITORY (⊥ safeRegen): NO afecta longWatchMul ⇒ intacto
    setStreak(); window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: zone }).longWatchMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, congPeer, congCeded, wayPeer, wayCeded, confPeer, confCeded, terrCoexist };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: VIGILIA(0.05) CEDE a STANDINGS ⇒ 0 AND CONGREGATION ⇒ 0 AND WAYFARER ⇒ 0 AND CONFLUENCIA ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ 0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 &&
     prec.wayPeer > 0 && prec.wayCeded === 0 && prec.confPeer > 0 && prec.confCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 13 0-regression: the 5 LIVE arc flags still served enabled:true in config.js
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const liveFlag = (name) => new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const darkFlag = new RegExp("export const LONG_WATCH\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lwDark: darkFlag };
  ok("13 ★ 0-REGRESIÓN: los 5 flags del arco LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY) served enabled:true; LONG_WATCH served false (DARK)",
     reg.cong && reg.way && reg.pulse && reg.soul && reg.div && reg.lwDark, JSON.stringify(reg));

  // 14 ★ 6-zone coverage: every LONG_WATCH.zones hosts an observable Vigilia (streak≥180 ⇒ T3)
  const cov = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const zones = window.__dev.longWatch().zones || []; const broken = [];
    for (const z of zones) {
      const s = window.__dev.longWatch({ nowMs: window.__LWNOW, push: { [z]: { streak: 200, atMs: window.__LWNOW, present: 1 } }, toZone: z });
      if (!(s.zone === z && s.watchable && s.tier === 3 && s.longWatchMulRested > 0)) broken.push({ z, zone: s.zone, watchable: s.watchable, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("14 ★ COBERTURA 6 zonas: cada zona de LONG_WATCH.zones hospeda una Vigilia observable (streak≥180 ⇒ T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 12 render badge draws with feature ON (Δ px vs OFF-control) — measured on THIS page before opening page2
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); });
  await page.evaluate(() => window.__dev.longWatch({ enabled: false }));
  await sleep(200);
  const sumOff = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 380).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.evaluate(() => { window.__dev.longWatch({ enabled: true }); const w = window.__lwpick(200); if (w) window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: w.zone }); });
  await sleep(260);
  const sumOn = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 380).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, cong: !!window.__dev.congregation, way: !!window.__dev.wayfarer, conf: !!window.__dev.confluence, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("12 render badge 'Vigilia' se DIBUJA con feature ON (Δ px vs OFF) + arco hooks presentes + fps",
     sumOn !== sumOff && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.cong && arc.way && arc.conf && arc.ledger && fps >= 55,
     `sumOff=${sumOff} sumOn=${sumOn} arc=${JSON.stringify(arc)} fps=${fps}`);

  // 11 ★ NORTH STAR — 2-client convergence (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  await installPick(page2);

  // page2 picks a watchable zone (streak 90 ⇒ T2); page1 applies the SAME snapshot+clock on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.longWatch({ enabled: true }); window.__iso(); return window.__lwpick(90); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    // baseline: both set streak 90, present=1, atMs=NOW, project at NOW ⇒ streak 90 ⇒ T2 identical
    const a = await page.evaluate((z) => { window.__dev.longWatch({ enabled: true }); window.__iso();
      window.__lwsnap(z, 90, 1); return window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { window.__lwsnap(z, 90, 1); return window.__dev.longWatch({ nowMs: window.__LWNOW, toZone: z }); }, zone);
    // RISE +90s of continued presence ⇒ 180 ⇒ T3 on both
    const aUp = await page.evaluate((z) => window.__lwat(z, 90), zone);
    const bUp = await page2.evaluate((z) => window.__lwat(z, 90), zone);
    // DECAY: re-snap streak 90 empty, +45s ⇒ 45 ⇒ T1 on both (converges)
    const aDn = await page.evaluate((z) => { window.__lwsnap(z, 90, 0); return window.__lwat(z, 45); }, zone);
    const bDn = await page2.evaluate((z) => { window.__lwsnap(z, 90, 0); return window.__lwat(z, 45); }, zone);
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared streak/tier + B's Δ must stay intact
    const aOut = await page.evaluate(() => window.__dev.longWatch({ leave: true }));
    const bAfter = await page2.evaluate((z) => window.__dev.longWatch({ nowMs: window.__LWNOW + 45000, toZone: z }), zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aS: a.streak, bS: b.streak, aM: a.longWatchMulRested, bM: b.longWatchMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpS: aUp.streak, bUpS: bUp.streak, aUpM: aUp.longWatchMulRested, bUpM: bUp.longWatchMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnS: aDn.streak, bDnS: bDn.streak, aDnM: aDn.longWatchMulRested, bDnM: bDn.longWatchMulRested,
      aOutM: aOut.longWatchMulRested, aOutT: aOut.tier, bAfterS: bAfter.streak, bAfterT: bAfter.tier, bAfterM: bAfter.longWatchMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 2 && near(north.aS, north.bS) && near(north.aS, 90) && near(north.aM, north.bM) && near(north.aM, 0.10) &&   // baseline T2 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpS, north.bUpS) && near(north.aUpS, 180) && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&  // RISE converges T3
    north.aDnT === north.bDnT && north.aDnT === 1 && near(north.aDnS, north.bDnS) && near(north.aDnS, 45) && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.05) &&   // DECAY converges T1
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                                            // A leaves ⇒ Δ_A 0
    near(north.bAfterS, 45) && north.bAfterT === 1 && near(north.bAfterM, 0.05);                                                                                          // B + shared streak/tier intact
  ok("11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO snapshot+reloj ⇒ streak/tier/buff IDÉNTICOS; subir(T3)/decaer(T1) CONVERGE; A sale ⇒ Δ_A=0 pero streak/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2341 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  ok("0 no JS errors during run", errors.length === 0, `errors=${errors.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close && server.close();
}
if (FAIL > 0) process.exitCode = 1;
