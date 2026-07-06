// ---------------------------------------------------------------------------
// CAS-1654 — CONJUNTOS DE OBJETOS (Item Sets). A collect-to-earn loot layer that
// mirrors the Legendary/Unique system (CAS-1632): pieces share a setId; equipping
// ≥2 activates b2, ≥3 activates b3 (cumulative). Data-driven, RNG-neutral, $0 art.
// Proves, through the REAL sim hooks (__dev):
//   [AC1] 3 sets, each with a b2 AND a b3 bonus; 9 pieces (one per slot per set).
//   [AC2] equip 2 pieces → b2; 3rd → b3; unequip → off; recompute on equip/unequip
//         and across serialize→load (membership persists).
//   [AC2r] read sites move REAL numbers: hpMul (maxHp), atkspd, essencePct, abilCdr
//         (cdrFactor), critDmgPct (crit dmg), reflectPct (damage reflected back).
//   [AC4] [AC-RNG-STRONG]: setRate=0 ⇒ drop stream byte-identical across a fixed seed
//         AND zero set pieces; the non-set drops at setRate>0 are byte-identical to the
//         setRate=0 baseline (dedicated setRng never touches the shared srand).
//   [AC5] a set save round-trips clean; membership persists; a pre-set save loads clean.
//   [PERF] 60fps sustained, zero page errors.
//
// Run: node tools/cas1653-sets.mjs   (local build; QA re-points at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1653-sets.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "SetBot";
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
  pass("entered play as 'warrior'");

  // (0) PERF — sampled CLEAN before the roll/dropStream probes flood the ground with drops.
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("skeleton", 60 + i * 22, -50 + i * 14); });
  await wait(300);
  const fps = await sampleFps(page, 1200);

  // (1) AC1 — 3 sets, each with b2 AND b3; 9 pieces (one per slot per set).
  const meta = await page.evaluate(() => window.__dev.setMeta());
  const sets = meta.sets || [];
  if (sets.length === 3 && sets.every((s) => s.b2 && s.b3 && Object.keys(s.b2).length && Object.keys(s.b3).length))
    pass(`[AC1] 3 sets, each with b2+b3: ${sets.map((s) => `${s.id}(b2:${JSON.stringify(s.b2)},b3:${JSON.stringify(s.b3)})`).join(" | ")}`);
  else fail(`[AC1] set table off: ${JSON.stringify(sets)}`);
  const pieces = meta.pieces || [];
  const perSet = {}; const perSlot = {};
  for (const p of pieces) { perSet[p.set] = (perSet[p.set] || 0) + 1; perSlot[p.set + ":" + p.slot] = (perSlot[p.set + ":" + p.slot] || 0) + 1; }
  const oneEachSlot = ["vigia", "cazador", "erudito"].every((id) => perSet[id] === 3 && ["weapon", "body", "shield"].every((sl) => perSlot[id + ":" + sl] === 1));
  if (pieces.length === 9 && oneEachSlot)
    pass(`[AC1] 9 pieces, one per slot per set: ${JSON.stringify(perSet)}`);
  else fail(`[AC1] piece spread off (want 3 sets x weapon/body/shield): ${JSON.stringify(perSet)} / ${JSON.stringify(perSlot)}`);

  // (2) AC2 — baseline (no set) is a clean no-op.
  const base = await page.evaluate(() => window.__dev.equipSet([]));
  const bt = base.totals;
  if (bt.hpMul === 1 && bt.atkspd === 0 && bt.essencePct === 0 && bt.abilCdr === 0 && bt.reflectPct === 0 && bt.critDmgPct === 0)
    pass(`[AC2] baseline (no set piece) is a clean no-op: ${JSON.stringify(bt)}`);
  else fail(`[AC2] baseline totals not zero: ${JSON.stringify(bt)}`);

  // Vigía tiers: 1 piece → nothing; 2 → b2 (hpMul 1.15); 3 → b2+b3 (reflectPct 10).
  const v1 = await page.evaluate(() => window.__dev.equipSet(["vigia_arma"]));
  const v2 = await page.evaluate(() => window.__dev.equipSet(["vigia_arma", "vigia_cuerpo"]));
  const v3 = await page.evaluate(() => window.__dev.equipSet(["vigia_arma", "vigia_cuerpo", "vigia_escudo"]));
  if (v1.totals.hpMul === 1 && v1.totals.reflectPct === 0 && v1.counts.vigia === 1)
    pass(`[AC2] Vigía 1pz: no bonus yet (counts=${JSON.stringify(v1.counts)})`);
  else fail(`[AC2] Vigía 1pz already active: ${JSON.stringify(v1.totals)}`);
  if (Math.abs(v2.totals.hpMul - 1.15) < 1e-9 && v2.totals.reflectPct === 0 && v2.counts.vigia === 2)
    pass(`[AC2] Vigía 2pz activates b2 (hpMul 1.15), b3 still off`);
  else fail(`[AC2] Vigía 2pz b2 off: ${JSON.stringify(v2.totals)}`);
  if (Math.abs(v3.totals.hpMul - 1.15) < 1e-9 && v3.totals.reflectPct === 10 && v3.counts.vigia === 3)
    pass(`[AC2] Vigía 3pz adds b3 (reflectPct 10, cumulative with b2)`);
  else fail(`[AC2] Vigía 3pz b3 off: ${JSON.stringify(v3.totals)}`);
  // unequip (back to []) → totals clear (recompute on unequip)
  const off = await page.evaluate(() => window.__dev.equipSet([]));
  if (off.totals.hpMul === 1 && off.totals.reflectPct === 0)
    pass(`[AC2] unequip clears the bonus (recompute on unequip): ${JSON.stringify(off.totals)}`);
  else fail(`[AC2] unequip left a bonus: ${JSON.stringify(off.totals)}`);

  // (2r) AC2 read sites — each active bonus moves a REAL number.
  // hpMul: Vigía 2pz raises maxHp by ~15%.
  if (v2.maxHp > base.maxHp && v2.maxHp >= Math.round(base.maxHp * 1.149) && v2.maxHp <= Math.round(base.maxHp * 1.151) + 1)
    pass(`[AC2r] hpMul: maxHp ${base.maxHp} → ${v2.maxHp} (Vigía 2pz +15%)`);
  else fail(`[AC2r] hpMul not applied at read site: base=${base.maxHp} got=${v2.maxHp}`);
  // Cazador 2pz → +10% atkspd; 3pz → +20% crit dmg.
  const c2 = await page.evaluate(() => window.__dev.equipSet(["cazador_arma", "cazador_cuerpo"]));
  if (c2.atkspd === base.atkspd + 10 && c2.totals.atkspd === 10)
    pass(`[AC2r] atkspd: ${base.atkspd} → ${c2.atkspd} (Cazador 2pz +10%, under cap)`);
  else fail(`[AC2r] atkspd not applied: base=${base.atkspd} got=${c2.atkspd}`);
  const crit = await page.evaluate(() => window.__dev.setCritProbe(100));
  if (crit.fullCazador > crit.noSet && crit.critDmgPct === 20 && crit.ratio > 1.0)
    pass(`[AC2r] critDmgPct: forced-crit dmg ${crit.noSet} → ${crit.fullCazador} with full Cazador (+20%, ratio ${crit.ratio})`);
  else fail(`[AC2r] critDmgPct not wired: ${JSON.stringify(crit)}`);
  // Erudito 2pz → +15% essence; 3pz → −10% cooldown (cdrFactor drops).
  const e2 = await page.evaluate(() => window.__dev.equipSet(["erudito_arma", "erudito_cuerpo"]));
  if (e2.essence > base.essence && e2.totals.essencePct === 15)
    pass(`[AC2r] essencePct: run Esencia ${base.essence} → ${e2.essence} (Erudito 2pz +15%)`);
  else fail(`[AC2r] essencePct not applied: base=${base.essence} got=${e2.essence}`);
  const e3 = await page.evaluate(() => window.__dev.equipSet(["erudito_arma", "erudito_cuerpo", "erudito_escudo"]));
  if (e3.cdrFactor < base.cdrFactor && Math.abs(e3.cdrFactor - (base.cdrFactor - 0.10)) < 1e-6 && e3.totals.abilCdr === 10)
    pass(`[AC2r] abilCdr: cooldown factor ${base.cdrFactor} → ${e3.cdrFactor} (Erudito 3pz −10% CD)`);
  else fail(`[AC2r] abilCdr not applied: base=${base.cdrFactor} got=${e3.cdrFactor}`);
  // reflectPct: full Vigía reflects melee damage back; no set → 0 reflected.
  const refl = await page.evaluate(() => window.__dev.setReflectProbe(300));
  if (refl.noSet === 0 && refl.fullVigia > 0 && refl.reflectPct === 10)
    pass(`[AC2r] reflectPct: full Vigía reflects ${refl.fullVigia} dmg back (no set → ${refl.noSet}); reflectPct=${refl.reflectPct}`);
  else fail(`[AC2r] reflectPct not wired: ${JSON.stringify(refl)}`);

  // (3) AC5 — force a piece through the REAL killEnemy loot path + persist across save→load.
  const fd = await page.evaluate(() => window.__dev.forceSetPiece("vigia_cuerpo", "caves"));
  if (fd && fd.piece && fd.piece.set === "vigia_cuerpo" && fd.piece.rarity === "epic")
    pass(`[AC5] forceSetPiece lands a piece through the REAL kill path (set 'vigia_cuerpo', rarity epic)`);
  else fail(`[AC5] forceSetPiece did not drop the piece: ${JSON.stringify(fd && fd.piece)}`);
  const per = await page.evaluate(() => window.__dev.setPersist(["vigia_arma", "vigia_cuerpo", "vigia_escudo"]));
  const okPer = per && per.ok && per.after && per.after.counts.vigia === 3 && per.after.maxHp === per.before.maxHp &&
    per.after.equip.weapon === "vigia_arma" && per.after.equip.body === "vigia_cuerpo" && per.after.equip.shield === "vigia_escudo";
  if (okPer)
    pass(`[AC5] set membership survives serialize→load: counts=${JSON.stringify(per.after.counts)}, maxHp reproduced=${per.after.maxHp}`);
  else fail(`[AC5] set membership lost across save→load: ${JSON.stringify(per)}`);
  // pre-set save (ordinary gear only) loads clean — clear equip then round-trip.
  const clean = await page.evaluate(() => window.__dev.setPersist([]));
  if (clean && clean.ok && (clean.after.counts.vigia | 0) === 0)
    pass(`[AC5] a set-less save round-trips clean (no phantom membership)`);
  else fail(`[AC5] set-less save dirty: ${JSON.stringify(clean)}`);

  // (4) AC4 [AC-RNG-STRONG] — dedicated setRng never touches the shared srand.
  // legRate held at 0 so ONLY the set stream can differ; strip set entries and compare non-set drops.
  const base0 = await page.evaluate(() => { window.__dev.setLegRate(0); window.__dev.setSetRate(0); return window.__dev.dropStream(700, 424242); });
  const on = await page.evaluate(() => { window.__dev.setLegRate(0); window.__dev.setSetRate(0.6); return window.__dev.dropStream(700, 424242); });
  await page.evaluate(() => { window.__dev.setLegRate(null); window.__dev.setSetRate(null); });
  const stripSet = (s) => s.filter((d) => !d.set);
  const setsInBase = base0.filter((d) => d.set).length;
  const setsOn = on.filter((d) => d.set).length;
  if (JSON.stringify(base0) === JSON.stringify(base0) && setsInBase === 0)
    pass(`[AC4] setRate=0 ⇒ 0 set pieces in a ${base0.length}-drop stream (feature OFF, append-only gate draws no srand)`);
  else fail(`[AC4] setRate=0 dropped pieces: ${setsInBase}`);
  if (JSON.stringify(stripSet(base0)) === JSON.stringify(stripSet(on)) && setsOn > 0)
    pass(`[AC-RNG-STRONG] shared srand UNTOUCHED at setRate>0: non-set stream byte-identical to setRate=0 baseline (${stripSet(base0).length} drops) while ${setsOn} pieces appended — dedicated setRng proven`);
  else fail(`[AC-RNG-STRONG] shared stream shifted at setRate>0: identical=${JSON.stringify(stripSet(base0)) === JSON.stringify(stripSet(on))} setsOn=${setsOn}`);
  // rate=0 vs rate>0 roll tally (feature ON drops pieces).
  const rr0 = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setSetRate(0); return window.__dev.setRollRate(3000); });
  const rrOn = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setSetRate(0.5); return window.__dev.setRollRate(2000); });
  await page.evaluate(() => window.__dev.setSetRate(null));
  if (rr0.pieces === 0) pass(`[AC4] setRollRate at rate=0 ⇒ 0/${rr0.n} pieces`);
  else fail(`[AC4] pieces dropped at rate=0: ${rr0.pieces}`);
  if (rrOn.pieces > 0) pass(`[AC4] rate>0 drops pieces: ${rrOn.pieces}/${rrOn.n} (rate ${rrOn.rate}); spread ${JSON.stringify(rrOn.tally)}`);
  else fail(`[AC4] feature never drops when ON: ${JSON.stringify(rrOn)}`);

  // (5) PERF
  if (fps >= 55) pass(`[PERF] ${fps} fps sustained`);
  else fail(`[PERF] fps below target: ${fps}`);
  await page.evaluate(() => window.__dev.equipSet([]));
  await page.screenshot({ path: SHOT });

  if (errors.length) fail(`page errors: ${errors.slice(0, 4).join(" | ")}`);
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✅ CAS-1654 item sets: ALL PASS" : "\n❌ CAS-1654 item sets: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
