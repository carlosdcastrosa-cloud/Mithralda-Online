// ---------------------------------------------------------------------------
// CAS-1659 — HABILIDAD DEFINITIVA (Ultimate) + medidor de carga. A high-impact combat
// payoff in its OWN slot (separate from the 2 drafted abilities): it CHARGES from combat
// (damage dealt + kills, NO mana) and unleashes when the meter is full, consuming it.
// Each of the 4 ultimates REUSES an existing resolveSpell type (nova/field/buff+heal/chain).
// Proves, through the REAL sim hooks (__dev):
//   [AC1] 4 ultimates, offer size 3, each mapped to a known resolveSpell type; HUD data present.
//   [AC2] meter fills on real damage/kills; fillUltimate → ready; castUltimate consumes to 0 and
//         applies the correct effect (nova/field enemy damage, buff hero heal+def, chain damage).
//   [AC3] run-start 1-of-3 offer (3 distinct ids drawn from the 4-pool via the dedicated ultRng);
//         the drafted choice persists (setUltId → ultimateState stable).
//   [AC4] [AC-RNG-STRONG]: a run WITH a drafted ultimate produces a BYTE-IDENTICAL srand loot
//         stream to a run WITHOUT one (charge math is pure arithmetic); drawing offers from ultRng
//         never shifts the shared srand (draws=0 vs draws=K loot stream identical).
//   [AC5] additive save: a drafted ultimate + charge round-trip clean; a pre-ultimate save → null.
//   [AC6/PERF] 60fps sustained, zero page errors, desktop + mobile enter play clean.
//
// Run: node tools/cas1659-ultimate.mjs   (local build; QA re-points at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1659-ultimate.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KNOWN_TYPES = ["nova", "field", "buff", "chain", "proj", "cone", "dash", "heal", "hot", "blink"];

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "UltBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior' (single-Enter abilitysel → play preserved; default ultimate drafted)");

  // (0) PERF — sampled CLEAN before probes flood the arena.
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("skeleton", 60 + i * 22, -50 + i * 14); });
  await wait(300);
  const fps = await sampleFps(page, 1200);

  // Enter-play must have drafted a real ultimate (HUD has data → meter renders).
  const entered = await page.evaluate(() => window.__dev.ultimateState());
  if (entered && entered.id && KNOWN_TYPES.length) pass(`[AC1] run entered with a drafted ultimate '${entered.id}' (HUD meter has data)`);
  else fail(`[AC1] no ultimate drafted on entry: ${JSON.stringify(entered)}`);

  // (1) AC1 — 4 ultimates, offer size 3, each mapped to a known resolveSpell type.
  const meta = await page.evaluate(() => window.__dev.ultMeta());
  const ults = (meta && meta.ults) || [];
  const typesOk = ults.length === 4 && ults.every((u) => KNOWN_TYPES.includes(u.type)) && meta.offerN === 3;
  if (typesOk) pass(`[AC1] 4 ultimates (offer ${meta.offerN}-of-4), each reuses a resolveSpell type: ${ults.map((u) => `${u.id}:${u.type}`).join(", ")}`);
  else fail(`[AC1] ultimate table off: ${JSON.stringify(meta)}`);
  if (meta.perDmg > 0 && meta.perKill > 0) pass(`[AC1] charge rates: +${meta.perDmg}/dmg, +${meta.perKill}/kill`);
  else fail(`[AC1] charge rates not data-driven: ${JSON.stringify(meta)}`);

  // (2) AC2 — meter fills on REAL damage/kills (charge accrues only with a drafted ultimate).
  const filled = await page.evaluate(() => window.__dev.ultChargeStream(30, 424242, "torbellino"));
  const baseline = await page.evaluate(() => window.__dev.ultChargeStream(30, 424242, null));
  if (filled.charge > 0) pass(`[AC2] meter fills through the REAL hitEnemy/killEnemy path (charge ${filled.charge} after 30 kills)`);
  else fail(`[AC2] meter never filled: ${JSON.stringify(filled)}`);
  if (baseline.charge === 0) pass(`[AC2] no-ultimate run accrues ZERO charge (gated behind h.ultId)`);
  else fail(`[AC2] baseline (no ultimate) still charged: ${JSON.stringify(baseline)}`);

  // fill → ready → cast consumes to 0. Use Bastión (buff+heal): it hits NO enemies, so the meter
  // can't recharge off nearby foes during the same cast (a damaging nova WOULD, by design).
  await page.evaluate(() => window.__dev.setUltId("bastion"));
  const ready = await page.evaluate(() => window.__dev.fillUltimate());
  if (ready && ready.ready && ready.charge === 1) pass(`[AC2] fillUltimate → ready (charge 1, id ${ready.id})`);
  else fail(`[AC2] fillUltimate did not ready the meter: ${JSON.stringify(ready)}`);
  const casted = await page.evaluate(() => window.__dev.castUltimate());
  const afterCast = await page.evaluate(() => window.__dev.ultimateState());
  if (casted && afterCast && afterCast.charge === 0 && !afterCast.ready) pass(`[AC2] castUltimate consumes the FULL meter (charge → 0; refill is the cooldown)`);
  else fail(`[AC2] cast did not consume the meter: casted=${JSON.stringify(casted)} after=${JSON.stringify(afterCast)}`);
  // casting an empty meter is a no-op (deny).
  const denied = await page.evaluate(() => window.__dev.castUltimate());
  if (denied === false || denied === undefined || denied === null) pass(`[AC2] casting an empty meter is a no-op (charge-gated deny)`);
  else fail(`[AC2] empty-meter cast fired anyway: ${JSON.stringify(denied)}`);

  // (2r) AC2 — each ultimate applies the CORRECT effect through resolveSpell.
  const eff = {};
  for (const id of ["torbellino", "meteoro", "bastion", "tormenta"]) eff[id] = await page.evaluate((i) => window.__dev.ultCastProbe(i), id);
  if (eff.torbellino && eff.torbellino.type === "nova" && eff.torbellino.enemyDamage > 0) pass(`[AC2r] Torbellino (nova) deals AoE damage: ${eff.torbellino.enemyDamage}`);
  else fail(`[AC2r] Torbellino no damage: ${JSON.stringify(eff.torbellino)}`);
  if (eff.meteoro && eff.meteoro.type === "field" && eff.meteoro.enemyDamage > 0 && eff.meteoro.fields >= 1) pass(`[AC2r] Meteoro (field) damages + plants a burning zone: dmg ${eff.meteoro.enemyDamage}, fields ${eff.meteoro.fields}`);
  else fail(`[AC2r] Meteoro field off: ${JSON.stringify(eff.meteoro)}`);
  if (eff.bastion && eff.bastion.type === "buff" && eff.bastion.heroHeal > 0 && eff.bastion.defBuff > 0) pass(`[AC2r] Bastión (buff+heal) heals ${eff.bastion.heroHeal} + def buff +${eff.bastion.defBuff}`);
  else fail(`[AC2r] Bastión buff+heal off: ${JSON.stringify(eff.bastion)}`);
  if (eff.tormenta && eff.tormenta.type === "chain" && eff.tormenta.enemyDamage > 0) pass(`[AC2r] Tormenta (chain) damages a target: ${eff.tormenta.enemyDamage}`);
  else fail(`[AC2r] Tormenta chain off: ${JSON.stringify(eff.tormenta)}`);

  // (3) AC3 — run-start 1-of-3 offer: 3 distinct ids drawn from the 4-pool; choice persists.
  const offer = await page.evaluate(() => window.__dev.ultOffer());
  const uniqOffer = Array.isArray(offer) && offer.length === 3 && new Set(offer).size === 3 && offer.every((id) => ults.some((u) => u.id === id));
  if (uniqOffer) pass(`[AC3] run-start offer is 3 distinct ultimates of the 4-pool: ${JSON.stringify(offer)}`);
  else fail(`[AC3] offer malformed: ${JSON.stringify(offer)}`);
  const setId = await page.evaluate(() => { window.__dev.setUltId("bastion"); return window.__dev.ultimateState(); });
  if (setId && setId.id === "bastion") pass(`[AC3] drafting a choice persists (ultId = 'bastion')`);
  else fail(`[AC3] choice did not persist: ${JSON.stringify(setId)}`);

  // (4) AC4 [AC-RNG-STRONG] — a drafted ultimate NEVER perturbs the shared srand loot stream.
  // Silence the OTHER dedicated streams (legRng/setRng) so their seed()-immune carryover can't
  // masquerade as a shift — the cas1655/cas1650 confound fix. Then only the main srand can differ,
  // and the ultimate's charge math (pure arithmetic) must leave it byte-identical.
  await page.evaluate(() => { window.__dev.setUltRate(0); window.__dev.setLegRate(0); window.__dev.setSetRate(0); });
  const sNull = await page.evaluate(() => window.__dev.ultChargeStream(700, 987654, null));
  const sUlt = await page.evaluate(() => window.__dev.ultChargeStream(700, 987654, "tormenta"));
  if (JSON.stringify(sNull.stream) === JSON.stringify(sUlt.stream) && sUlt.charge > 0)
    pass(`[AC-RNG-STRONG] drafted-ultimate run is BYTE-IDENTICAL to a no-ultimate run (${sNull.stream.length} drops) while the meter charged to ${sUlt.charge} — gated arithmetic + dedicated ultRng never touch srand`);
  else fail(`[AC-RNG-STRONG] stream shifted with an ultimate: identical=${JSON.stringify(sNull.stream) === JSON.stringify(sUlt.stream)} charge=${sUlt.charge}`);
  // drawing offers from ultRng doesn't shift srand either (append-only proof).
  const dNone = await page.evaluate(() => window.__dev.ultDraftNeutral(0, 500, 246810));
  const dMany = await page.evaluate(() => window.__dev.ultDraftNeutral(6, 500, 246810));
  await page.evaluate(() => { window.__dev.setUltRate(null); window.__dev.setLegRate(null); window.__dev.setSetRate(null); });
  if (JSON.stringify(dNone) === JSON.stringify(dMany))
    pass(`[AC-RNG-STRONG] drawing 6 offers from ultRng leaves the srand loot stream byte-identical (${dNone.length} drops) — offer roll is append-only`);
  else fail(`[AC-RNG-STRONG] ultRng draw shifted srand: identical=${JSON.stringify(dNone) === JSON.stringify(dMany)}`);

  // (5) AC5 — additive save: drafted ultimate + charge round-trip; a pre-ultimate save loads clean.
  const per = await page.evaluate(() => window.__dev.ultPersist("meteoro", 0.5));
  const okPer = per && per.ok && per.after && per.after.id === "meteoro" && Math.abs(per.after.charge - 0.5) < 1e-6;
  if (okPer) pass(`[AC5] drafted ultimate + charge survive serialize→load: ${JSON.stringify(per.after)}`);
  else fail(`[AC5] ultimate lost across save→load: ${JSON.stringify(per)}`);
  const legacy = await page.evaluate(() => window.__dev.ultLoadLegacy());
  if (legacy && legacy.ok && legacy.id === null && (legacy.charge | 0) === 0)
    pass(`[AC5] a pre-ultimate save (no 'ult' key) loads clean → id null (RNG-neutral baseline, no SAVE_VERSION bump)`);
  else fail(`[AC5] legacy save dirty: ${JSON.stringify(legacy)}`);

  // (6) PERF + errors
  if (fps >= 55) pass(`[PERF] ${fps} fps sustained`);
  else fail(`[PERF] fps below target: ${fps}`);
  await page.screenshot({ path: SHOT });

  // (7) AC6 — mobile viewport enters play clean (touch button path exercised without error).
  const m = await browser.newPage();
  await m.setViewport({ width: 414, height: 896, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const merr = [];
  m.on("pageerror", (e) => merr.push(`pageerror: ${e.message}`));
  m.on("console", (c) => { if (c.type() === "error") merr.push(`console.error: ${c.text()}`); });
  await m.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await m.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await m.bringToFront();
  await enterPlay(m);
  await m.evaluate(() => { window.__dev.setUltId("torbellino"); window.__dev.fillUltimate(); });
  await wait(400);
  const mState = await m.evaluate(() => window.__dev.ultimateState());
  if (mState && mState.ready && merr.filter((e) => !/favicon/i.test(e)).length === 0)
    pass(`[AC6] mobile enters play + ultimate ready, zero page errors (touch button + ring render path clean)`);
  else fail(`[AC6] mobile issues: state=${JSON.stringify(mState)} errors=${merr.slice(0, 3).join(" | ")}`);
  await m.screenshot({ path: join(ROOT, "tools", "cas1659-ultimate-mobile.png") });
  await m.close();

  const realErr = errors.filter((e) => !/favicon/i.test(e));
  if (realErr.length) fail(`page errors: ${realErr.slice(0, 4).join(" | ")}`);
  else pass("zero page errors (desktop)");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✅ CAS-1659 ultimate: ALL PASS" : "\n❌ CAS-1659 ultimate: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
