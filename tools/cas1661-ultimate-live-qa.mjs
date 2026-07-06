// ===========================================================================
// CAS-1661 — LIVE QA: Habilidad Definitiva (Ultimate) + medidor de carga.
// Verifies CAS-1659 on the canonical gh-pages build. Runs PASS x2 (desktop + mobile).
//
//   node tools/cas1661-ultimate-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1659 (sim/config.js + sim/sim.js + render/render.js + input.js + settings.js
// + game.js, additive + RNG-neutral): a high-impact combat payoff in its OWN slot
// (separate from the 2 drafted abilities). The Ultimate CHARGES from combat (damage
// dealt + kills, NO mana / NO time-CD) and unleashes when the meter is full, consuming
// it. Each of the 4 ultimates REUSES an existing resolveSpell type:
//   torbellino nova   (AoE damage)          meteoro    field (damage + burning zone)
//   bastion    buff   (def buff + self-heal) tormenta   chain (bouncing damage)
// The run-start draft offers 1-of-3 (3 distinct ids of the 4-pool) drawn from a
// DEDICATED ultRng stream (createRNG(0x117a1a7e)); the charge math is gated `if(h.ultId)`
// pure arithmetic → the shared srand is byte-identical at ANY ult rate (AC4 [AC-RNG-STRONG]).
//
// window/dev hooks used (all route to the SAME served sim module via game.js:192 wrapper):
//   __dev.ultimateState / ultMeta / ultOffer / setUltId / fillUltimate / castUltimate
//   __dev.ultCastProbe / ultChargeStream / ultDraftNeutral / ultPersist / ultLoadLegacy
//   __dev.setUltRate / setLegRate / setSetRate / spawn / scene
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD  version.json served (reported); served 6 touched files md5 == HEAD  [AC7]
//  AC1    Slot Ultimate + medidor present: run enters with a drafted ult (HUD meter has
//         data); 4 ultimates, offer 3-of-4, each maps to a known resolveSpell type; charge rates.
//  AC2    meter fills on REAL damage/kills; fillUltimate → ready; castUltimate consumes to 0
//         (empty cast is a no-op); each ult applies the correct effect via resolveSpell.
//  AC3    run-start 1-of-3 offer (3 distinct ids of the 4-pool); the drafted choice persists.
//  AC4    [AC-RNG-STRONG] a drafted-ult run is byte-identical srand loot to a no-ult run
//         (setUltRate 0, silence legRng+setRng confound); ultRng draws never shift srand.
//  AC5    additive save — a drafted ult + charge round-trip clean; a pre-ult save loads → null.
//  AC6/PERF 0 JS errors (favicon 404 ignored); >=55 fps sampled EARLY on clean state; mobile clean.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js", "input.js", "settings.js", "game.js"];
const OUT = "shots/cas1661"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const KNOWN_TYPES = ["nova", "field", "buff", "chain", "proj", "cone", "dash", "heal", "hot", "blink"];

// Re-poll version.json to absorb GitHub-Pages publish / CDN lag; report the served build.
// We gate on md5 live==HEAD (not a hardcoded hash) so this passes the moment the CTO deploys.
async function pollBuild(headHashes, tries = 10, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  // ---- BUILD gate: served version + md5 parity vs HEAD (poll for CDN/Pages lag) [AC7] ----
  const vb = await pollBuild(headHashes);
  gate("BUILD.deployed", vb.ok, `served build=${vb.build} (polled ${vb.tries}) md5-parity=${vb.ok ? "ALL MATCH" : "DRIFT"}`);
  for (const f of FILES) {
    const live = vb.md5[f] || "?"; const head = headHashes[f];
    gate(`AC7.md5 ${f}`, live === head, `live=${String(live).slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }
  if (!vb.ok) { console.log("  → ultimate build NOT live on gh-pages yet; aborting live ACs (CTO deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  // ---- boot: menu -> classsel -> abilitysel (single-Enter, ult folded in) -> play ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try {
      await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => { try { localStorage.clear(); } catch {} });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.ultimateState", { timeout: 20000 });
      booted = true;
    } catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.ultimateState never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS1661";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 15000 });
    await key("Digit1"); // warrior
  }
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") { await wait(200); await key("Enter"); }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 15000 });
  await wait(300);

  // ---- PERF (sampled EARLY, clean-ish state, before probe flooding) ----
  await page.evaluate(() => { try { for (let i = 0; i < 8; i++) window.__dev.spawn("skeleton", 60 + i * 22, -50 + i * 14); } catch {} });
  await wait(300);
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  gate("PERF.fps", fps >= 55, `~${fps} fps (>=55; 2-core box = noise, gate is determinism/byte-id)`);

  // ======================= AC1: slot + meter present, table ================
  const entered = await page.evaluate(() => window.__dev.ultimateState());
  gate("AC1.slotDrafted", !!(entered && entered.id), `run entered with drafted ultimate '${entered && entered.id}' → HUD meter has data (charge=${entered && entered.charge})`);
  const meta = await page.evaluate(() => window.__dev.ultMeta());
  const ults = (meta && meta.ults) || [];
  const typesOk = ults.length === 4 && ults.every((u) => KNOWN_TYPES.includes(u.type)) && meta.offerN === 3;
  gate("AC1.table", typesOk, `4 ultimates (offer ${meta && meta.offerN}-of-4), each → resolveSpell type: ${ults.map((u) => `${u.id}:${u.type}`).join(", ")}`);
  gate("AC1.chargeRates", meta && meta.perDmg > 0 && meta.perKill > 0, `charge rates data-driven: +${meta && meta.perDmg}/dmg, +${meta && meta.perKill}/kill`);

  // ======================= AC2: fills, ready, consume, effects =============
  const filled = await page.evaluate(() => window.__dev.ultChargeStream(30, 424242, "torbellino"));
  const baseline = await page.evaluate(() => window.__dev.ultChargeStream(30, 424242, null));
  gate("AC2.fills", filled.charge > 0, `meter fills through REAL hitEnemy/killEnemy (charge ${filled.charge} after 30 kills)`);
  gate("AC2.gated", baseline.charge === 0, `no-ultimate run accrues ZERO charge (gated behind h.ultId): ${baseline.charge}`);

  // fill → ready → cast consumes to 0. Bastión (buff+heal) hits NO enemies → can't self-recharge mid-cast.
  await page.evaluate(() => window.__dev.setUltId("bastion"));
  const ready = await page.evaluate(() => window.__dev.fillUltimate());
  gate("AC2.ready", ready && ready.ready && ready.charge === 1, `fillUltimate → ready (charge ${ready && ready.charge}, id ${ready && ready.id})`);
  const casted = await page.evaluate(() => window.__dev.castUltimate());
  const afterCast = await page.evaluate(() => window.__dev.ultimateState());
  gate("AC2.consume", casted && afterCast && afterCast.charge === 0 && !afterCast.ready, `castUltimate consumes FULL meter (charge→0, refill=cooldown): after=${JSON.stringify(afterCast)}`);
  const denied = await page.evaluate(() => window.__dev.castUltimate());
  gate("AC2.emptyNoop", denied === false || denied === undefined || denied === null, `empty-meter cast is a no-op (charge-gated deny): ${JSON.stringify(denied)}`);

  // each ultimate applies the CORRECT effect through resolveSpell
  const eff = {};
  for (const id of ["torbellino", "meteoro", "bastion", "tormenta"]) eff[id] = await page.evaluate((i) => window.__dev.ultCastProbe(i), id);
  gate("AC2.torbellino", eff.torbellino && eff.torbellino.type === "nova" && eff.torbellino.enemyDamage > 0, `Torbellino (nova) AoE dmg=${eff.torbellino && eff.torbellino.enemyDamage}`);
  gate("AC2.meteoro", eff.meteoro && eff.meteoro.type === "field" && eff.meteoro.enemyDamage > 0 && eff.meteoro.fields >= 1, `Meteoro (field) dmg=${eff.meteoro && eff.meteoro.enemyDamage} fields=${eff.meteoro && eff.meteoro.fields}`);
  gate("AC2.bastion", eff.bastion && eff.bastion.type === "buff" && eff.bastion.heroHeal > 0 && eff.bastion.defBuff > 0, `Bastión (buff+heal) heal=${eff.bastion && eff.bastion.heroHeal} defBuff=+${eff.bastion && eff.bastion.defBuff}`);
  gate("AC2.tormenta", eff.tormenta && eff.tormenta.type === "chain" && eff.tormenta.enemyDamage > 0, `Tormenta (chain) dmg=${eff.tormenta && eff.tormenta.enemyDamage}`);

  // ======================= AC3: 1-of-3 offer, persists ====================
  const offer = await page.evaluate(() => window.__dev.ultOffer());
  const uniqOffer = Array.isArray(offer) && offer.length === 3 && new Set(offer).size === 3 && offer.every((id) => ults.some((u) => u.id === id));
  gate("AC3.offer", uniqOffer, `run-start offer = 3 distinct ultimates of the 4-pool: ${JSON.stringify(offer)}`);
  const setId = await page.evaluate(() => { window.__dev.setUltId("bastion"); return window.__dev.ultimateState(); });
  gate("AC3.persist", setId && setId.id === "bastion", `drafting a choice persists (ultId='${setId && setId.id}')`);

  // ======================= AC4: [AC-RNG-STRONG] byte-identical =============
  // Silence the OTHER dedicated streams (legRng/setRng) so their seed()-immune carryover can't
  // masquerade as a shift (cas1655/cas1650 confound). Then only the main srand can differ, and the
  // ultimate's charge math (pure arithmetic, gated by h.ultId) must leave it byte-identical.
  await page.evaluate(() => { window.__dev.setUltRate(0); window.__dev.setLegRate(0); window.__dev.setSetRate(0); });
  const sNull = await page.evaluate(() => window.__dev.ultChargeStream(700, 987654, null));
  const sUlt = await page.evaluate(() => window.__dev.ultChargeStream(700, 987654, "tormenta"));
  const streamId = JSON.stringify(sNull.stream) === JSON.stringify(sUlt.stream);
  gate("AC4.streamByteId", streamId && sUlt.charge > 0, `drafted-ult run byte-identical to no-ult run (${sNull.stream.length} drops) while meter charged to ${sUlt.charge} — gated arithmetic + dedicated ultRng never touch srand`);
  const dNone = await page.evaluate(() => window.__dev.ultDraftNeutral(0, 500, 246810));
  const dMany = await page.evaluate(() => window.__dev.ultDraftNeutral(6, 500, 246810));
  await page.evaluate(() => { window.__dev.setUltRate(null); window.__dev.setLegRate(null); window.__dev.setSetRate(null); });
  gate("AC4.draftAppendOnly", JSON.stringify(dNone) === JSON.stringify(dMany), `drawing 6 offers from ultRng leaves srand loot byte-identical (${dNone.length} drops) — offer roll is append-only`);

  // ======================= AC5: additive save =============================
  const per = await page.evaluate(() => window.__dev.ultPersist("meteoro", 0.5));
  const okPer = per && per.ok && per.after && per.after.id === "meteoro" && near(per.after.charge, 0.5);
  gate("AC5.persist", okPer, `drafted ult + charge survive serialize→load: ${JSON.stringify(per && per.after)}`);
  const legacy = await page.evaluate(() => window.__dev.ultLoadLegacy());
  gate("AC5.legacyClean", legacy && legacy.ok && legacy.id === null && (legacy.charge | 0) === 0, `pre-ultimate save (no 'ult' key) loads clean → id null, no SAVE_VERSION bump: ${JSON.stringify(legacy)}`);

  await page.screenshot({ path: `${OUT}/${label}-ultimate.png` });

  // ---- AC6 errors ----
  gate("AC6.noErrors", errs.length === 0, errs.length ? errs.slice(0, 4).join(" | ") : "0 JS errors (favicon 404 filtered)");

  await browser.close();
  return { pass, fail };
}

(async () => {
  const headHashes = {}; for (const f of FILES) headHashes[f] = headMd5(f);
  console.log(`HEAD md5: ${FILES.map(f => `${f}=${headHashes[f].slice(0,8)}`).join("  ")}`);
  const runs = [
    ["desktop", { width: 1280, height: 720 }],
    ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ];
  let tp = 0, tf = 0, notDeployed = false;
  for (const [label, vp] of runs) {
    const r = await runOnce(label, vp, headHashes);
    tp += r.pass; tf += r.fail; if (r.notDeployed) notDeployed = true;
  }
  console.log(`\n=========== TOTAL ${tp} PASS / ${tf} FAIL ===========`);
  if (notDeployed) console.log("NOTE: ultimate build NOT live on gh-pages — CTO deploy of CAS-1659 pending. Re-run after deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
