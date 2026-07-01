// ---------------------------------------------------------------------------
// CAS-388 — BOON DEPTH engineer live-verify (rarity tiers + synergies + legendary
// keystones). Builds on the CAS-383 draft. Drives the REAL sim through window.__dev
// (openDraft/grantBoon/boons/statusArena + a real Space-roll) — no shortcuts.
//
// Gates (all must pass for done):
//   [1] LIVE      — URL 200 + boot to play (warrior).
//   [2] DATA      — pool = 12 boons, every boon rarity-tagged, exactly 2 legendary,
//                   rare+common present, 3 synergies defined.
//   [3] WEIGHT    — draft draw skews RARER with run depth: rare+legendary card rate at
//                   depth 9 > at depth 0, and legendaries surface only/mostly deep.
//   [4] SYNERGY   — each of the 3 pairs, once both owned, MULTIPLIES its field (burn/
//                   lifesteal/reflect) over the lone-boon value AND lights bb.syn.
//   [5] KEYSTONE  — 'wake' sets bb.trail, 'nova' sets bb.onKillNova; both take the MAX
//                   (a re-draft can't runaway-stack a legendary).
//   [6] TRAIL     — Estela Ardiente: a real Space-roll through a mob lays a burn DoT.
//   [7] GUARDRAIL — stacking past a cap is clamped (crit ≤60); a boonless baseline bb is
//                   the zero bundle incl. the NEW fields (byte-identical no-boon path).
//   [8] SOAK      — legendaries + a synergy live in a real caves fight: ≥59fps, 0 errors
//                   (proves the nova re-entrancy guard is crash-safe under real kills).
//
// Run (local, pre-deploy):  node tools/cas388-boon-depth-live.mjs --local
// Run (live gh-pages):      node tools/cas388-boon-depth-live.mjs
// Run (explicit URL):       node tools/cas388-boon-depth-live.mjs https://host/path
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { BOONS, BOON_MAP, BOON_RARITY, SYNERGIES } from "../sim/config.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(m);
let ok = true;
const errors = [];
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… VERIFY LOCAL ${BASE}` : `… VERIFY LIVE ${BASE}`);

// [2] DATA — assert the shipped pool from source (imported above).
(() => {
  const rarTagged = BOONS.every((b) => BOON_RARITY[b.rarity]);
  const legs = BOONS.filter((b) => b.rarity === "legendary");
  const rares = BOONS.filter((b) => b.rarity === "rare");
  const commons = BOONS.filter((b) => b.rarity === "common");
  if (BOONS.length === 12 && rarTagged && legs.length === 2 && rares.length && commons.length && SYNERGIES.length === 3)
    pass(`DATA: 12 boons (c:${commons.length} r:${rares.length} L:${legs.length}), legendaries=[${legs.map((b) => b.id).join(",")}], ${SYNERGIES.length} synergies`);
  else fail(`DATA bad: n=${BOONS.length} tagged=${rarTagged} legs=${legs.length} rares=${rares.length} syn=${SYNERGIES.length}`);
})();

const RARITY = {}; for (const b of BOONS) RARITY[b.id] = b.rarity;

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const SHOTS = [];
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon/.test(r.url())) errors.push(`http ${s}: ${r.url()}`); });
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  const sampleFps = async () => {
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await sleep(550);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    return Math.round(((f1 - f0) * 1000) / (t1 - t0));
  };
  const shot = async (name) => { const p = join(__dir, name); await page.screenshot({ path: p }); SHOTS.push(name); };
  const reset = async () => { await page.evaluate(() => window.__dev.retryRun()); await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {}); };

  // [1] LIVE + boot
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  log(`… build id: ${buildId || "(none)"}`);
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas388"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // [3] WEIGHT — statistical draw distribution at depth 0 vs depth 9. openDraft() advances
  // the sim RNG each call, so N calls yield N independent draws at a FIXED depth (owned count).
  const sampleDraws = async (n) => page.evaluate((N) => {
    const out = [];
    for (let i = 0; i < N; i++) { const c = window.__dev.openDraft(); if (c) out.push(c); }
    return out;
  }, n);
  const rarityFrac = (draws) => {
    let rareplus = 0, leg = 0, total = 0;
    for (const d of draws) for (const id of d) { total++; const r = RARITY[id]; if (r === "rare" || r === "legendary") rareplus++; if (r === "legendary") leg++; }
    return { rp: rareplus / total, legRate: leg / total, total, leg };
  };
  await reset();
  const d0 = rarityFrac(await sampleDraws(260));
  await reset();
  await page.evaluate(() => { for (let i = 0; i < 9; i++) window.__dev.grantBoon("greed"); });
  const depthNow = (await page.evaluate(() => window.__dev.boons())).list.length;
  const d9 = rarityFrac(await sampleDraws(260));
  await page.evaluate(() => { window.__dev.openDraft(); }); await shot("cas388-draft-deep.png");
  log(`… depth0 rare+=${(d0.rp * 100).toFixed(1)}% legRate=${(d0.legRate * 100).toFixed(1)}% | depth${depthNow} rare+=${(d9.rp * 100).toFixed(1)}% legRate=${(d9.legRate * 100).toFixed(1)}% (leg cards ${d9.leg})`);
  if (d9.rp > d0.rp + 0.05 && d9.legRate > d0.legRate && d9.leg > 0)
    pass(`WEIGHT: rare+ rises with depth ${(d0.rp * 100).toFixed(0)}%→${(d9.rp * 100).toFixed(0)}%, legendaries surface deep`);
  else fail(`WEIGHT bad: d0.rp=${d0.rp.toFixed(3)} d9.rp=${d9.rp.toFixed(3)} d0.leg=${d0.legRate.toFixed(3)} d9.leg=${d9.legRate.toFixed(3)}`);

  // [4] SYNERGY — accumulate the three pairs on ONE run, each pairing must multiply + light up.
  await reset();
  const S = {};
  S.ember = await page.evaluate(() => window.__dev.grantBoon("ember"));   // burn 0.35, no synergy yet
  S.glass = await page.evaluate(() => window.__dev.grantBoon("glass"));   // glass+ember → ignite
  S.vamp  = await page.evaluate(() => window.__dev.grantBoon("vamp"));    // lifesteal 0.14
  S.swift = await page.evaluate(() => window.__dev.grantBoon("swift"));   // vamp+swift → vdance
  S.thorn = await page.evaluate(() => window.__dev.grantBoon("thorns"));  // reflect 0.40
  S.stone = await page.evaluate(() => window.__dev.grantBoon("stone"));   // thorns+stone → aegis
  const synOK =
    near(S.ember.bb.burn, 0.35, 1e-3) && !S.ember.bb.syn.includes("ignite") &&
    near(S.glass.bb.burn, 0.35 * 1.6, 1e-3) && S.glass.bb.syn.includes("ignite") &&
    near(S.vamp.bb.lifesteal, 0.14, 1e-3) && !S.vamp.bb.syn.includes("vdance") &&
    near(S.swift.bb.lifesteal, 0.14 * 1.7, 1e-3) && S.swift.bb.syn.includes("vdance") &&
    near(S.thorn.bb.reflect, 0.40, 1e-3) && !S.thorn.bb.syn.includes("aegis") &&
    near(S.stone.bb.reflect, 0.40 * 1.6, 1e-3) && S.stone.bb.syn.includes("aegis");
  if (synOK) pass(`SYNERGY: ignite burn 0.35→${S.glass.bb.burn.toFixed(3)}, vdance lifesteal 0.14→${S.swift.bb.lifesteal.toFixed(3)}, aegis reflect 0.40→${S.stone.bb.reflect.toFixed(3)}; bb.syn=[${S.stone.bb.syn.join(",")}]`);
  else fail(`SYNERGY bad: burn ${S.ember.bb.burn}/${S.glass.bb.burn} syn=${JSON.stringify(S.glass.bb.syn)} | lifesteal ${S.vamp.bb.lifesteal}/${S.swift.bb.lifesteal} | reflect ${S.thorn.bb.reflect}/${S.stone.bb.reflect} syn=${JSON.stringify(S.stone.bb.syn)}`);

  // [5] KEYSTONE — legendaries set their bb field and take the MAX (no runaway stacking).
  await reset();
  const k1 = await page.evaluate(() => window.__dev.grantBoon("wake"));
  const k2 = await page.evaluate(() => window.__dev.grantBoon("nova"));
  const k3 = await page.evaluate(() => { window.__dev.grantBoon("nova"); return window.__dev.grantBoon("wake"); }); // re-draft both
  const keyOK = k1.bb.trail > 0 && near(k1.bb.onKillNova, 0) &&
    k2.bb.onKillNova > 0 &&
    near(k3.bb.trail, k1.bb.trail, 1e-6) && near(k3.bb.onKillNova, k2.bb.onKillNova, 1e-6);
  if (keyOK) pass(`KEYSTONE: wake→trail=${k1.bb.trail}, nova→onKillNova=${k2.bb.onKillNova}; re-draft holds MAX (trail=${k3.bb.trail} nova=${k3.bb.onKillNova})`);
  else fail(`KEYSTONE bad: ${JSON.stringify({ t1: k1.bb.trail, n1: k1.bb.onKillNova, n2: k2.bb.onKillNova, t3: k3.bb.trail, n3: k3.bb.onKillNova })}`);

  // [6] TRAIL — real behaviour: grant Estela Ardiente, place a mob in the dash path, roll
  // (Space) and confirm the mob picks up a burn DoT laid by the wake.
  await reset();
  await page.evaluate(() => { window.__dev.statusArena("skeleton", 26, 0); window.__dev.grantBoon("wake"); });
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })); });
  await sleep(120);
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true })); });
  await sleep(120);
  const trailSt = await page.evaluate(() => window.__dev.statusOf("enemy"));
  const trailBurn = trailSt && trailSt.dots && trailSt.dots.burn;
  if (trailBurn) pass(`TRAIL: Space-roll through mob laid a burn DoT (dmg ${trailBurn.dmg}) — dash leaves fire`);
  else fail(`TRAIL bad: mob status=${JSON.stringify(trailSt)}`);

  // [7] GUARDRAIL — crit stack clamped ≤60; a boonless baseline is the zero bundle incl. new fields.
  await reset();
  const zero = await page.evaluate(() => window.__dev.boons());
  const zeroOK = zero.list.length === 0 && zero.bb.crit === 0 && zero.bb.burn === 0 && zero.bb.trail === 0 &&
    zero.bb.onKillNova === 0 && zero.bb.hpMul === 1 && zero.bb.moveMul === 1 && Array.isArray(zero.bb.syn) && zero.bb.syn.length === 0;
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__dev.grantBoon("glass"); });
  const clamp = await page.evaluate(() => window.__dev.boons());
  if (zeroOK && clamp.bb.crit <= 60) pass(`GUARDRAIL: no-boon baseline = zero bundle; 5×glass crit clamped to ${clamp.bb.crit} (≤60)`);
  else fail(`GUARDRAIL bad: zeroOK=${zeroOK} bb=${JSON.stringify(zero.bb)} clampCrit=${clamp.bb.crit}`);

  // [8] SOAK — legendaries + a synergy in a real caves fight; watch fps + errors (nova guard).
  await reset();
  await page.evaluate(() => { ["nova", "wake", "glass", "ember", "vamp", "swift", "greed"].forEach((b) => window.__dev.grantBoon(b)); });
  await page.evaluate(() => window.__dev.tpZone("caves"));
  await page.evaluate(() => window.__dev.setUpg(60, 400, 40));
  const fps = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { if (window.__dev.enemyCount() < 4) { window.__dev.archArena("skeleton", 70, (i => (i * 17) % 60 - 30)(Date.now() % 7)); window.__dev.archArena("skeleton", 60, (i => (i * 23) % 50 - 25)(Date.now() % 5)); } });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true })));
    fps.push(await sampleFps());
  }
  await shot("cas388-soak-fight.png");
  const minFps = fps.length ? Math.min(...fps) : 0, avgFps = Math.round(fps.reduce((a, b) => a + b, 0) / fps.length);
  if (minFps >= 59) pass(`SOAK: fps held min=${minFps} avg=${avgFps} over ${fps.length} samples (nova+trail+synergy live)`); else fail(`SOAK fps low: min=${minFps} avg=${avgFps}`);

  if (errors.length === 0) pass("0 page errors / http failures over the run");
  else { fail(`${errors.length} page errors`); errors.slice(0, 8).forEach((e) => log(`    · ${e}`)); }

  log(`… shots: ${SHOTS.join(", ")}`);
} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}
console.log(ok ? "\n✅ CAS-388 boon-depth verify PASS" : "\n❌ CAS-388 boon-depth verify FAIL");
process.exit(ok ? 0 : 1);
