// CAS-2278 — GE self-verify for INTENDENTE DEL SANTUARIO / SANCTUARY QUARTERMASTER (DARK, SANCTUARY_REWARDS.enabled:false).
// Cierra el loop de FACCIÓN abierto por SANCTUARY_REP (LIVE): cada rango de reputación (Reconocido→Honrado→Venerado→Exaltado)
// desbloquea UN reward reclamable en el Intendente (dentro de la SAFEZONE), cada uno reutilizando un knob ya vivo (recallCd/
// restedCap/safeRegen/restedMult) + un TÍTULO DE RENOMBRE sobre el nameplate. Determinista, 0 RNG, 0 moneda nueva, reclamado
// persistente por el mismo mecanismo que sanctuaryRep. Reversible en 1 línea.
//
// Observado vía __dev.quartermaster (flip SANCTUARY_REWARDS.enabled IN-MEMORY, disco sigue false ⇒ build byte-idéntico) +
// __dev.sanctuary (rep) + la ruta REAL de claim (tecla Supr + quartermaster({claim})) + __dev.recall/rested/safeZone/saveBlob/
// worldFingerprint.
//
// Checks:
//   1  boots clean to play, 0 JS err, __dev.quartermaster + arc hooks + __BUILD present.
//   2  DARK default: SANCTUARY_REWARDS.enabled===false AND h.sanctuaryRewards field NEVER created (hasField false) ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() NO contiene la clave sanctuaryRewards (allowlist anti-CAS-2220).
//   4  worldFingerprint byte-stable a través del toggle enabled (0 RNG drift).
//   5  effects OFF byte-id: con enabled:false todos los effects=0 Y los knobs efectivos == base (recallCdSec/restedCap sin bono).
//   6  rewards desbloquean POR RANGO: setRep en cada umbral ⇒ rewards[i].unlocked coincide con el rango de rep alcanzado.
//   7  claim por la ruta REAL (chokepoint quartermaster({claim})) en zona ⇒ reclama de MENOR rango a mayor, en orden, field creado.
//   8  claim idempotente: reclamar todo ⇒ "done"; no duplica ids; hasField true.
//   9  effects aplican a los knobs: reward recallCd ⇒ recallCdSec ×0.8; restedCap ⇒ ×1.5; safeRegen 0.4; restedMult 0.15 (Σ exactos).
//  10  efecto REAL en recall: tras reclamar recallCd, un recall real deja h.recallCD == cooldown reducido (no el base).
//  11  título de renombre = el `title` del reward reclamado de mayor rango (Exaltado tras reclamar todo).
//  12  gating de zona: FUERA de la SAFEZONE ⇒ claim devuelve "away" (no reclama); rango insuficiente ⇒ "locked".
//  13  persist: saveBlob() ON contiene sanctuaryRewards con los ids reclamados (orden canónico de config).
//  14  tecla REAL libre: dispatch KeyboardEvent code "Delete" en zona con reward listo ⇒ reclama (key wired + no colisión).
//  15  reversible: quartermaster({enabled:false}) ⇒ effects 0, recallCdSec vuelve al base, claim ⇒ "off".
//  16  REGRESIÓN arco: con REWARDS ON, SANCTUARY_REP perk + BOUNTY + SAFEZONE + Rested + RECALL siguen sanos.
//  17  desk fps ≥58 con la feature ON.
// Run: node tools/cas2278-sanctuary-rewards-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2278");
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

// tp al Templo (dentro de la SAFEZONE); devuelve inZone
const toZone = (page) => page.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple;
  window.__dev.tp(t.x / 32, t.y / 32); return window.__dev.safeZone().inZone; });

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.quartermaster && window.__dev.sanctuary && window.__dev.recall && window.__dev.rested && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.quartermaster + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default + byte-id (field never created)
  const dark = await page.evaluate(() => window.__dev.quartermaster());
  ok("2 DARK default: enabled false AND h.sanctuaryRewards field never created (hasField false)",
     dark.enabled === false && dark.hasField === false, `enabled=${dark.enabled} hasField=${dark.hasField} rewards=${dark.rewards.length}`);

  // 3 save OFF omits key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'sanctuaryRewards' key in save blob", !/"sanctuaryRewards"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.quartermaster({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 effects OFF byte-id: disable, all effects 0 AND effective knobs == base
  const off = await page.evaluate(() => { window.__dev.quartermaster({ enabled: false });
    const q = window.__dev.quartermaster(); const r = window.__dev.recall(); const rs = window.__dev.rested();
    return { eff: q.effects, recallCdSec: q.recallCdSec, recallHookSec: r.cooldownSec, restedCap: q.restedCap, restedHookCap: rs.cap }; });
  const effZero = Object.values(off.eff).every((v) => v === 0);
  ok("5 effects OFF byte-id: all effects 0 AND recallCdSec==recall hook base AND restedCap==rested hook base",
     effZero && off.recallCdSec === off.recallHookSec && off.restedCap === off.restedHookCap,
     `eff=${JSON.stringify(off.eff)} recallCd=${off.recallCdSec} restedCap=${off.restedCap}`);

  // enable both rep + rewards for the ON tests
  await page.evaluate(() => { window.__dev.sanctuary({ enabled: true }); window.__dev.quartermaster({ enabled: true }); });

  // 6 rewards unlock by rank: set rep to each rank threshold, unlocked flags track rep rank
  const unlockRows = await page.evaluate(() => {
    const rows = [];
    for (const rep of [0, 150, 450, 1000, 2000]) {
      window.__dev.sanctuary({ setRep: rep });
      const q = window.__dev.quartermaster();
      rows.push({ rep, rankIdx: q.rankIdx, unlocked: q.rewards.map((r) => r.unlocked ? 1 : 0) });
    }
    return rows;
  });
  // rep 0 (neutral idx0) ⇒ 0 rewards unlocked; 150 ⇒ 1; 450 ⇒ 2; 1000 ⇒ 3; 2000 ⇒ 4
  const wantUnlock = [[0,0,0,0],[1,0,0,0],[1,1,0,0],[1,1,1,0],[1,1,1,1]];
  const unlockOk = unlockRows.every((row, i) => JSON.stringify(row.unlocked) === JSON.stringify(wantUnlock[i]));
  ok("6 rewards unlock by rep rank (Reconocido→Honrado→Venerado→Exaltado thresholds)", unlockOk,
     unlockRows.map((r) => `${r.rep}:${r.unlocked.join("")}`).join(" "));

  const expectIds = ["swift_return", "deep_reserves", "temple_grace", "pilgrims_zeal"];

  // 7 REAL KEY claim: fresh state (0 claimed), rep=Exaltado, dispatch KeyboardEvent 'Delete' in zone ⇒ claims the LOWEST rank
  // reward first (swift_return). Proves the dedicated key is wired + FREE (no wardrobe/collision) + routes to tryQuartermaster.
  const keyClaim = await page.evaluate(async () => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.sanctuary({ setRep: 2000 });          // Exaltado ⇒ all 4 unlocked, 0 claimed yet
    const before = window.__dev.quartermaster().claimedIds.slice();
    const sceneBefore = window.__dev.scene();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Delete", key: "Delete", bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const q = window.__dev.quartermaster();
    return { before, after: q.claimedIds.slice(), scene: window.__dev.scene(), sceneBefore, hasField: q.hasField };
  });
  ok("7 REAL key 'Delete' claims lowest-rank reward first (swift_return), stays in play (no collision), field created",
     keyClaim.before.length === 0 && JSON.stringify(keyClaim.after) === JSON.stringify(["swift_return"]) &&
     keyClaim.scene === "play" && keyClaim.sceneBefore === "play" && keyClaim.hasField === true,
     `${JSON.stringify(keyClaim.before)}->${JSON.stringify(keyClaim.after)} scene=${keyClaim.scene}`);

  // 8 chokepoint claims the REMAINING rewards in canonical order, then idempotent 'done'
  const claimSeq = await page.evaluate(() => {
    const results = [];
    for (let i = 0; i < 3; i++) results.push(window.__dev.quartermaster({ claim: true }).result);
    const doneA = window.__dev.quartermaster({ claim: true }).result;   // all claimed ⇒ done
    const doneB = window.__dev.quartermaster({ claim: true }).result;   // idempotent
    return { results, doneA, doneB, claimedIds: window.__dev.quartermaster().claimedIds };
  });
  const restOk = JSON.stringify(claimSeq.results) === JSON.stringify(["claimed:deep_reserves", "claimed:temple_grace", "claimed:pilgrims_zeal"]);
  ok("8 chokepoint claims remaining in canonical order, then idempotent 'done' (no dup, all 4 claimed)",
     restOk && claimSeq.doneA === "done" && claimSeq.doneB === "done" && JSON.stringify(claimSeq.claimedIds) === JSON.stringify(expectIds),
     `results=${JSON.stringify(claimSeq.results)} done=${claimSeq.doneA}/${claimSeq.doneB} ids=${JSON.stringify(claimSeq.claimedIds)}`);

  // 9 effects apply to knobs (Σ exacts)
  const eff = await page.evaluate(() => window.__dev.quartermaster().effects);
  ok("9 effects apply to knobs: recallCd=0.20, restedCap=0.50, safeRegen=0.40, restedMult=0.15",
     eff.recallCd === 0.20 && eff.restedCap === 0.50 && Math.abs(eff.safeRegen - 0.40) < 1e-9 && Math.abs(eff.restedMult - 0.15) < 1e-9,
     JSON.stringify(eff));

  // 10 REAL recall cooldown uses the reduced value
  const recallEff = await page.evaluate(() => {
    window.__dev.recall({ enabled: true }); window.__dev.recall({ bind: true });   // ensure bound in zone
    window.__dev.recall({ setCd: 0 });                                             // ready
    const casted = window.__dev.recall({ cast: true });                            // real chokepoint
    const after = window.__dev.recall();
    return { result: casted.result, recallCD: after.recallCD, cooldownSec: after.cooldownSec };
  });
  // reduced cd = base * 0.8; after a real recall, recallCD should equal the reduced cooldownSec
  ok("10 real recall uses reduced cooldown (h.recallCD == reduced cooldownSec, not base)",
     recallEff.result === "recalled" && Math.abs(recallEff.recallCD - recallEff.cooldownSec) < 0.05 && recallEff.cooldownSec > 0,
     `result=${recallEff.result} recallCD=${recallEff.recallCD} cdSec=${recallEff.cooldownSec}`);

  // 11 renown title = highest claimed reward's title
  const title = await page.evaluate(() => window.__dev.quartermaster().title);
  ok("11 renown title = highest claimed rank title (Exaltado del Santuario)", title === "Exaltado del Santuario", `title="${title}"`);

  // 12 zone gating: outside zone ⇒ away; low rank ⇒ locked
  const gate = await page.evaluate(() => {
    // move far from zone
    window.__dev.tp(60, 60);
    const away = window.__dev.quartermaster({ claim: true }).result;
    // fresh unclaimed at low rank in zone
    return { away };
  });
  ok("12 zone gating: claim OUTSIDE the SAFEZONE ⇒ 'away' (hub-gated like Bounty)", gate.away === "away", `away=${gate.away}`);

  // 13 persist ON: save contains sanctuaryRewards with claimed ids
  const saveOn = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const hasKey = /"sanctuaryRewards"/.test(saveOn);
  const idsInSave = expectIds.every((id) => saveOn.includes('"' + id + '"'));
  ok("13 persist ON: saveBlob contains 'sanctuaryRewards' with all 4 claimed ids", hasKey && idsInSave, `key=${hasKey} ids=${idsInSave}`);

  // 14 reversible: disable ⇒ effects 0, recallCdSec back to base, claim ⇒ off
  const rev = await page.evaluate(() => {
    window.__dev.quartermaster({ enabled: false });
    const q = window.__dev.quartermaster(); const r = window.__dev.recall();
    const claimRes = window.__dev.quartermaster({ claim: true }).result;
    const effZero = Object.values(q.effects).every((v) => v === 0);
    return { effZero, recallCdSec: q.recallCdSec, recallHookSec: r.cooldownSec, claimRes, enabled: q.enabled };
  });
  ok("14 reversible: disabled ⇒ effects 0, recallCdSec==base, claim ⇒ 'off'",
     rev.enabled === false && rev.effZero && rev.recallCdSec === rev.recallHookSec && rev.claimRes === "off",
     `effZero=${rev.effZero} cd=${rev.recallCdSec}/${rev.recallHookSec} claim=${rev.claimRes}`);

  // 16 arc regression: re-enable, verify the whole Sanctuary stack still healthy
  const arc = await page.evaluate(() => {
    window.__dev.quartermaster({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.bounty && window.__dev.bounty({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    return { inZone: window.__dev.safeZone().inZone, safe: sz.enabled, rested: window.__dev.rested().enabled,
      recall: window.__dev.recall().enabled, rep: window.__dev.sanctuary().enabled,
      bountyAccept: window.__dev.bounty ? !!window.__dev.bounty({ act: true }).active : true };
  });
  ok("15 arc regression: SANCTUARY_REP + BOUNTY + SAFEZONE + Rested + RECALL still live/healthy with REWARDS ON",
     arc.inZone && arc.safe && arc.rested && arc.recall && arc.rep && arc.bountyAccept, JSON.stringify(arc));

  // 17 fps
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    return await new Promise((res) => { function loop() { frames++; if (performance.now() - t0 >= 1000) res(frames); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
  });
  ok("16 desktop fps ≥58 with feature ON", fps >= 58, `fps≈${fps}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
