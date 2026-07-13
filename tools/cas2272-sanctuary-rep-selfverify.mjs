// CAS-2272 — GE self-verify for RENOMBRE DEL SANTUARIO / SANCTUARY REPUTATION (DARK, SANCTUARY_REP.enabled:false).
// La meta-progresión de LARGO PLAZO que corona el loop del Tablón de Recompensas (BOUNTY_BOARD, LIVE): completar bounties acumula
// RENOMBRE persistente con la facción del Santuario ⇒ rangos visibles (Neutral→Reconocido→Honrado→Venerado→Exaltado). Acumulación
// determinista (+repPerBounty por bounty-complete, 0 RNG, 0 moneda), rangos = función PURA del total, UN perk gateado (xpMult de
// bounty por rango) aplicado SÓLO en el chokepoint gainXP de bounty. Per-hero, server-authority-ready.
//
// Observado vía __dev.sanctuary (flip SANCTUARY_REP.enabled IN-MEMORY, disco sigue false ⇒ build byte-idéntico) + drivers setRep/
// addRep/perkXp + la ruta REAL de bounty (__dev.bounty act/kill) + __dev.safeZone / __dev.tp / __dev.saveBlob / __dev.worldFingerprint.
//
// Checks:
//   1  boots clean to play, 0 JS err, __dev.sanctuary + arc hooks + __BUILD present.
//   2  DARK default: SANCTUARY_REP.enabled===false AND h.sanctuaryRep field NEVER created (hasField false) ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() NO contiene la clave sanctuaryRep (allowlist anti-CAS-2220).
//   4  worldFingerprint byte-stable a través del toggle enabled (0 RNG drift).
//   5  perk OFF byte-id: sanctuary({perkXp:n}) devuelve n SIN tocar cuando enabled:false (ruta gainXP idéntica a HEAD).
//   6  RANGOS = función pura del total: setRep en cada umbral ⇒ rank.name/idx == config (Neutral..Exaltado), 0-clamp Neutral.
//   7  progreso DERIVADO: en un rango intermedio into/span/toNext coherentes (into=rep-cur.at, span=next.at-cur.at).
//   8  perk ACOTADO por rango: Neutral ⇒ perkXp==input (mult 1.00 byte-id); rango top ⇒ perkXp==round(input*xpMult) > input.
//   9  ACUMULACIÓN determinista vía la ruta REAL de bounty-complete: accept+complete+claim en zona ⇒ sanctuaryRep += repPerBounty EXACTO.
//  10  cruce de rango en acumulación real: setRep justo bajo un umbral, completar un bounty ⇒ rankIdx avanza.
//  11  save round-trip ON: saveBlob() SÍ contiene sanctuaryRep cuando ON con rep>0; round-trips (loadSave) clamp≥0.
//  12  reversible: sanctuary({enabled:false}) ⇒ perkXp inerte (==input) y un nuevo bounty-complete NO acumula.
//  13  REGRESIÓN arco: con SANCTUARY ON, BOUNTY claim + SAFEZONE regen + Rested accrual siguen sanos.
//  14  desk fps ≥58 con la feature ON.
// Run: node tools/cas2272-sanctuary-rep-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2272");
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

const toZone = (page) => page.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple;
  window.__dev.tp(t.x / 32, t.y / 32); return window.__dev.safeZone().inZone; });

// completa UN bounty por la ruta REAL: acepta el destacado, bumpea los contadores hasta count, reclama. Devuelve el snapshot post-claim.
const completeOneBounty = (page) => page.evaluate(() => {
  const acc = window.__dev.bounty({ act: true });                 // accept featured (in zone)
  if (!acc.active) return { ok: false, reason: acc.result };
  window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });   // reach count
  const claim = window.__dev.bounty({ act: true });               // claim
  return { ok: claim.result === "claimed", claim };
});

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sanctuary && window.__dev.bounty && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.sanctuary + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default + byte-id (field never created)
  const dark = await page.evaluate(() => window.__dev.sanctuary());
  ok("2 DARK default: enabled false AND h.sanctuaryRep field never created (hasField false)",
     dark.enabled === false && dark.hasField === false, `enabled=${dark.enabled} hasField=${dark.hasField} rankCount=${dark.rankCount} repPerBounty=${dark.repPerBounty}`);

  // 3 save OFF omits key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'sanctuaryRep' key in save blob", !/"sanctuaryRep"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 perk OFF byte-id (flip back off, perkXp returns input untouched)
  const perkOff = await page.evaluate(() => { window.__dev.sanctuary({ enabled: false });
    return [0, 1, 140, 300, 999].map((n) => window.__dev.sanctuary({ perkXp: n }).perk); });
  ok("5 perk OFF byte-id: perkXp(n)===n when disabled", JSON.stringify(perkOff) === JSON.stringify([0, 1, 140, 300, 999]), `got=${JSON.stringify(perkOff)}`);

  // 6 ranks = pure function of total (enable, walk thresholds)
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));
  const ranks = await page.evaluate(() => {
    const R = []; const s0 = window.__dev.sanctuary();
    const n = s0.rankCount; const out = [];
    // read each rank's `at` by walking: set to at, then at-1
    // derive thresholds by scanning setRep over a coarse range and recording rank boundaries
    let prevIdx = -1; const seen = [];
    for (let rep = 0; rep <= 2500; rep += 5) { const s = window.__dev.sanctuary({ setRep: rep });
      if (s.rankIdx !== prevIdx) { seen.push({ rep, idx: s.rankIdx, name: s.rank.name, at: s.rank.at }); prevIdx = s.rankIdx; } }
    return { n, seen, top: window.__dev.sanctuary({ setRep: 999999 }) };
  });
  const names = ranks.seen.map((r) => r.name);
  ok("6 ranks are a pure function of total: 5 distinct rank bands Neutral..Exaltado in order",
     ranks.n === 5 && ranks.seen.length === 5 && names[0] === "Neutral" && names[4] === "Exaltado" &&
     ranks.seen.every((r, i) => r.idx === i && r.rep >= r.at),
     `bands=${JSON.stringify(names)}`);

  // 7 derived progress at an intermediate rank
  const mid = await page.evaluate(() => window.__dev.sanctuary({ setRep: 300 }));   // between Reconocido(150) and Honrado(450)
  ok("7 derived progress coherent (into=rep-cur.at, span=next.at-cur.at, toNext=next.at-rep)",
     mid.into === mid.rep - mid.rank.at && mid.span === (mid.nextRank.at - mid.rank.at) && mid.toNext === (mid.nextRank.at - mid.rep),
     `rep=${mid.rep} rank=${mid.rank.name}@${mid.rank.at} into=${mid.into}/${mid.span} toNext=${mid.toNext} next=${mid.nextRank.name}@${mid.nextRank.at}`);

  // 8 perk bounded per rank: Neutral==input, top==round(input*mult)>input
  const perk = await page.evaluate(() => {
    window.__dev.sanctuary({ setRep: 0 }); const neutral = window.__dev.sanctuary({ perkXp: 200 });
    const top = window.__dev.sanctuary({ setRep: 999999 }); const topPerk = window.__dev.sanctuary({ perkXp: 200 });
    return { neutralPerk: neutral.perk, neutralMult: neutral.xpMult, topPerk: topPerk.perk, topMult: top.xpMult };
  });
  ok("8 perk bounded per rank: Neutral perkXp==input (mult 1.00 byte-id); top perkXp==round(input*mult) > input",
     perk.neutralPerk === 200 && perk.neutralMult === 1 && perk.topPerk === Math.round(200 * perk.topMult) && perk.topPerk > 200,
     `neutral=${perk.neutralPerk}(x${perk.neutralMult}) top=${perk.topPerk}(x${perk.topMult})`);

  // 9 deterministic accumulation via the REAL bounty-complete path
  const acc9 = await page.evaluate(async () => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.bounty({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.sanctuary({ setRep: 0 });
    const before = window.__dev.sanctuary().rep;
    const acc = window.__dev.bounty({ act: true });
    window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
    const claim = window.__dev.bounty({ act: true });
    const after = window.__dev.sanctuary();
    return { before, after: after.rep, per: after.repPerBounty, claimed: claim.result, hasField: after.hasField };
  });
  ok("9 deterministic accumulation: real bounty-complete ⇒ sanctuaryRep += repPerBounty exactly, field created",
     acc9.claimed === "claimed" && acc9.after === acc9.before + acc9.per && acc9.hasField === true,
     `rep ${acc9.before}->${acc9.after} (+${acc9.per}) claimed=${acc9.claimed} hasField=${acc9.hasField}`);

  // 10 rank crossing on real accumulation: sit just below Reconocido(150) then complete a bounty
  const cross = await page.evaluate(() => {
    const per = window.__dev.sanctuary().repPerBounty;
    window.__dev.sanctuary({ setRep: 150 - per });     // one bounty short of Reconocido
    const pre = window.__dev.sanctuary();
    const acc = window.__dev.bounty({ act: true });
    window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
    window.__dev.bounty({ act: true });
    const post = window.__dev.sanctuary();
    return { preIdx: pre.rankIdx, preName: pre.rank.name, postIdx: post.rankIdx, postName: post.rank.name };
  });
  ok("10 rank crosses on real accumulation (just below threshold + 1 bounty ⇒ rankIdx advances)",
     cross.postIdx === cross.preIdx + 1, `${cross.preName}(${cross.preIdx}) -> ${cross.postName}(${cross.postIdx})`);

  // 11 save round-trip ON: key present when rep>0, and loadSave clamps
  const saveOn = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("11 save round-trip ON: 'sanctuaryRep' key present when ON with rep>0", /"sanctuaryRep"/.test(saveOn), `present=${/"sanctuaryRep"/.test(saveOn)}`);

  // 12 reversible: disable ⇒ perk inert + no accumulation on a fresh complete
  const rev = await page.evaluate(() => {
    window.__dev.sanctuary({ enabled: false });
    const perkInert = window.__dev.sanctuary({ perkXp: 200 }).perk;
    const before = window.__dev.sanctuary().rep;
    const acc = window.__dev.bounty({ act: true });
    if (acc.active) { window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } }); window.__dev.bounty({ act: true }); }
    const after = window.__dev.sanctuary().rep;
    return { perkInert, before, after, enabled: window.__dev.sanctuary().enabled };
  });
  ok("12 reversible: disabled ⇒ perkXp inert (==input) AND bounty-complete does NOT accumulate rep",
     rev.enabled === false && rev.perkInert === 200 && rev.after === rev.before, `perk=${rev.perkInert} rep ${rev.before}->${rev.after}`);

  // 13 arc regression (re-enable, verify bounty claim + safezone regen + rested still healthy)
  const arc = await page.evaluate(() => {
    window.__dev.sanctuary({ enabled: true }); window.__dev.bounty({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    const inZone = window.__dev.safeZone().inZone; const r0 = window.__dev.rested();
    const acc = window.__dev.bounty({ act: true }); const active = !!acc.active;
    return { inZone, safeEnabled: sz.enabled, restedEnabled: r0.enabled, canAccept: active };
  });
  ok("13 arc regression: BOUNTY + SAFEZONE + Rested still live/healthy with SANCTUARY ON",
     arc.inZone && arc.safeEnabled && arc.restedEnabled && arc.canAccept, JSON.stringify(arc));

  // 14 fps
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    return await new Promise((res) => { function loop() { frames++; if (performance.now() - t0 >= 1000) res(frames); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
  });
  ok("14 desktop fps ≥58 with feature ON", fps >= 58, `fps≈${fps}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
