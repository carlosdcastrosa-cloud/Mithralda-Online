// ---------------------------------------------------------------------------
// CAS-383 — INTER-ZONE BOON DRAFT engineer live-verify (roguelite build variety).
// Drives the REAL sim paths through window.__dev (openDraft/pickBoon/grantBoon/boons)
// — never a shortcut. Build id + running behaviour are read from the page.
//
// Gates (all must pass for done):
//   [1] LIVE       — URL 200 + build id from the running page (window.__BUILD).
//   [2] POOL≥8/3   — BOONS pool has ≥8 distinct boons spanning offense/defense/utility.
//   [3] DRAFT      — openDraft() → scene 'draft' with 3 DISTINCT valid choices; the
//                    panel renders (screenshot for human sign-off).
//   [4] PICK       — pickBoon() applies the boon, list grows, bb changes, scene 'play'.
//   [5] STACK      — drafting/granting the same boon twice DEEPENS its bundle field.
//   [6] MAXHP      — Cristal Frágil lowers effective maxHp, Piel de Piedra raises it.
//   [7] GUARDRAIL  — stacking a boon past its cap is CLAMPED (crit ≤60, no trivialize).
//   [8] CONVERT    — Sangre de Brasa / Toque Ponzoñoso put a burn/poison DoT on a real
//                    hero hit (the "convert damage → fire/poison" boons).
//   [9] RESET      — death (respawn) wipes the run's boons → bundle back to zero.
//  [10] SOAK       — a live fight with boons active holds ≥59fps with 0 page errors.
//
// Run (local, pre-deploy):  node tools/cas383-boons-live.mjs --local
// Run (live gh-pages):      node tools/cas383-boons-live.mjs
// Run (explicit URL):       node tools/cas383-boons-live.mjs https://host/path
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { BOONS, BOON_MAP } from "../sim/config.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const BOON_MAP_KEYS = Object.keys(BOON_MAP);
const log = (m) => console.log(m);
let ok = true;
const errors = [];
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… VERIFY LOCAL ${BASE}` : `… VERIFY LIVE ${BASE}`);

// [2] POOL — assert the shipped data pool from source (imported above).
(() => {
  const cats = {};
  for (const b of BOONS) cats[b.cat] = (cats[b.cat] || 0) + 1;
  const nCats = Object.keys(cats).length;
  if (BOONS.length >= 8 && nCats >= 3 && cats.offense && cats.defense && cats.utility)
    pass(`POOL: ${BOONS.length} boons across ${nCats} cats (off:${cats.offense} def:${cats.defense} ut:${cats.utility})`);
  else fail(`POOL insufficient: ${BOONS.length} boons, cats=${JSON.stringify(cats)}`);
})();

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

  // [1] LIVE + build id
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  log(`… build id: ${buildId || "(none)"}`);

  // boot to play (warrior)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas383"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // baseline
  const base = await page.evaluate(() => window.__dev.boons());
  if (base && base.list.length === 0 && base.scene === "play") pass(`baseline clean: 0 boons, bb.crit=${base.bb.crit}`);
  else fail(`baseline not clean: ${JSON.stringify(base && base.list)}`);
  const baseMaxHp = base.maxHp;

  // [3] DRAFT — open the panel and inspect the choices
  const choices = await page.evaluate(() => window.__dev.openDraft());
  const draftState = await page.evaluate(() => window.__dev.boons());
  const validChoices = Array.isArray(choices) && choices.length === 3 && choices.every((c) => !!BOON_MAP_KEYS.includes(c));
  const distinct = choices && new Set(choices).size === choices.length;
  if (draftState.scene === "draft" && validChoices && distinct) pass(`DRAFT: scene='draft', 3 distinct valid cards [${choices.join(", ")}]`);
  else fail(`DRAFT bad: scene=${draftState.scene} choices=${JSON.stringify(choices)}`);
  await shot("cas383-draft-panel.png");
  // narrow (mobile) layout screenshot too
  await page.setViewport({ width: 420, height: 780, deviceScaleFactor: 1 });
  await sleep(200); await shot("cas383-draft-mobile.png");
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 }); await sleep(150);

  // [4] PICK — pick the first card
  const picked = await page.evaluate(() => window.__dev.pickBoon(0));
  if (picked.ok && picked.list.length === 1 && picked.scene === "play") pass(`PICK: applied '${picked.list[0]}' → 1 boon, back to play`);
  else fail(`PICK bad: ${JSON.stringify(picked)}`);

  // [5] STACK — from a CLEAN run, grant 'glass' twice; crit field must sum (25 → 50, both < cap)
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => window.__dev.grantBoon("glass"));
  const g1 = await page.evaluate(() => window.__dev.boons());
  await page.evaluate(() => window.__dev.grantBoon("glass"));
  const g2 = await page.evaluate(() => window.__dev.boons());
  if (g2.bb.crit === g1.bb.crit + 25 && g2.bb.hpMul < g1.bb.hpMul) pass(`STACK: glass×2 crit ${g1.bb.crit}→${g2.bb.crit}, hpMul ${g1.bb.hpMul.toFixed(3)}→${g2.bb.hpMul.toFixed(3)}`);
  else fail(`STACK bad: crit ${g1.bb.crit}→${g2.bb.crit}, hpMul ${g1.bb.hpMul}→${g2.bb.hpMul}`);

  // [6] MAXHP — reset, glass lowers maxHp, stone raises it
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  const rHp = (await page.evaluate(() => window.__dev.boons())).maxHp;
  const glassHp = (await page.evaluate(() => window.__dev.grantBoon("glass"))).maxHp;
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  const stoneHp = (await page.evaluate(() => window.__dev.grantBoon("stone"))).maxHp;
  const stoneBaseHp = (await page.evaluate(() => window.__dev.boons())).maxHp;
  if (glassHp < rHp && stoneHp > rHp) pass(`MAXHP: base=${rHp} glass=${glassHp}(↓) stone=${stoneHp}(↑)`);
  else fail(`MAXHP bad: base=${rHp} glass=${glassHp} stone=${stoneHp}`);

  // [7] GUARDRAIL — reset, stack glass 4× → crit clamped ≤60 (never 100 = guaranteed crit)
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__dev.grantBoon("glass"); });
  const clamp = await page.evaluate(() => window.__dev.boons());
  if (clamp.bb.crit <= 60 && clamp.list.length === 4) pass(`GUARDRAIL: 4×glass crit clamped to ${clamp.bb.crit} (≤60, not 100)`);
  else fail(`GUARDRAIL bad: crit=${clamp.bb.crit} list=${clamp.list.length}`);

  // [8] CONVERT — reset, ember → burn DoT on a real hero hit; venom → poison DoT
  const testDot = async (boon, dotKey) => {
    await page.evaluate(() => window.__dev.retryRun());
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
    await page.evaluate((b) => { window.__dev.statusArena("skeleton", 40, 0); window.__dev.grantBoon(b); }, boon);
    const st = await page.evaluate(() => window.__dev.heroHit());
    return st && st.dots && st.dots[dotKey];
  };
  const burn = await testDot("ember", "burn");
  const poison = await testDot("venom", "poison");
  if (burn && poison) pass(`CONVERT: ember→burn(dmg ${burn.dmg}), venom→poison(dmg ${poison.dmg}) on real hero hits`);
  else fail(`CONVERT bad: burn=${JSON.stringify(burn)} poison=${JSON.stringify(poison)}`);

  // [9] RESET — with boons active, death wipes them
  await page.evaluate(() => { window.__dev.grantBoon("thorns"); window.__dev.grantBoon("swift"); });
  const beforeDeath = await page.evaluate(() => window.__dev.boons());
  await page.evaluate(() => window.__dev.retryRun()); // respawn = new run
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  const afterDeath = await page.evaluate(() => window.__dev.boons());
  const zeroed = afterDeath.list.length === 0 && afterDeath.bb.reflect === 0 && afterDeath.bb.moveMul === 1 && afterDeath.bb.crit === 0;
  if (beforeDeath.list.length >= 2 && zeroed) pass(`RESET: ${beforeDeath.list.length} boons before death → 0 after (bundle zeroed)`);
  else fail(`RESET bad: before=${beforeDeath.list.length} after=${JSON.stringify(afterDeath.list)} bb.reflect=${afterDeath.bb.reflect}`);

  // [10] SOAK — grant a spread of boons, run a live fight, watch fps + errors
  await page.evaluate(() => { ["glass", "ember", "arc", "vamp", "swift", "reaper", "greed"].forEach((b) => window.__dev.grantBoon(b)); });
  await page.evaluate(() => window.__dev.tpZone("caves"));
  await page.evaluate(() => window.__dev.setUpg(60, 400, 40));
  const fps = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { if (window.__dev.enemyCount() < 3) window.__dev.archArena("skeleton", 70, (Math.random() * 60 - 30)); });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })));
    fps.push(await sampleFps());
  }
  await shot("cas383-soak-fight.png");
  const minFps = fps.length ? Math.min(...fps) : 0, avgFps = Math.round(fps.reduce((a, b) => a + b, 0) / fps.length);
  if (minFps >= 59) pass(`SOAK: fps held min=${minFps} avg=${avgFps} over ${fps.length} samples`); else fail(`SOAK fps low: min=${minFps} avg=${avgFps}`);

  if (errors.length === 0) pass("0 page errors / http failures over the run");
  else { fail(`${errors.length} page errors`); errors.slice(0, 8).forEach((e) => log(`    · ${e}`)); }

  log(`… shots: ${SHOTS.join(", ")}`);
} catch (e) {
  fail(`harness threw: ${e && e.message}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}
console.log(ok ? "\n✅ CAS-383 boon-draft verify PASS" : "\n❌ CAS-383 boon-draft verify FAIL");
process.exit(ok ? 0 : 1);
