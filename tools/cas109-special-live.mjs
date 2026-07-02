// CAS-109 QA: LIVE proof the telegraphed radial-slam SPECIAL fires for every
// regular hunt Champion (forest/ruins/caves) on the DEPLOYED build (inside the
// Higgsfield iframe). For each zone: cull the quota to summon the Champion,
// arm forceSpecial, park the hero in range with poke(), run REAL frames, and
// assert (a) the telegraph (specialNow during windup) and (b) the radial slam
// (rune shards emitted) — then screenshot the caves slam. Run:
//   node tools/cas109-special-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// forest/ruins/caves: base mob to cull, quota, expected shard count
const ZONES = [
  { zone: "forest", base: "wolf",     need: 10, slam: 8,  name: "Lobo Alfa" },
  { zone: "ruins",  base: "bandit",   need: 12, slam: 10, name: "Capitán Bandido" },
  { zone: "caves",  base: "skeleton", need: 13, slam: 12, name: "Rey Esquelético" },
];

let pass = 0, fail = 0;
const ok = (m) => { console.log("✔ " + m); pass++; };
const no = (m) => { console.log("✖ " + m); fail++; };

const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code, type = "keydown") =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit", ""), bubbles: true })), code, type);

for (const z of ZONES) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "SpecialQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit1"); // warrior
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // summon the Champion via the REAL cull quota
  const champ = await fr.evaluate((z) => {
    window.__dev.tpZone(z.zone); window.__dev.seed(7);
    for (let i = 0; i < z.need; i++) window.__dev.spawnKill(z.base);
    return window.__dev.huntState(z.zone).champ;
  }, z);
  if (champ && champ.hasSpecial && champ.specialSlam === z.slam)
    ok(`[${z.zone.toUpperCase()}] LIVE Champion '${champ.name}' carries ${champ.specialSlam}-shard special`);
  else no(`[${z.zone.toUpperCase()}] special not configured live: ${JSON.stringify(champ)}`);

  // arm once, then run real frames; poll the telegraph + count shards
  await fr.evaluate((zone) => window.__dev.forceSpecial(zone), z.zone);
  let sawTelegraph = false, sawWindup = false, peakRune = 0, aliveAfter = false;
  for (let i = 0; i < 24; i++) {
    const obs = await fr.evaluate((zone) => {
      window.__dev.poke(zone);
      const c = window.__dev.huntState(zone).champ;
      const p = window.__dev.enemyProj();
      return { specialNow: c && c.specialNow, state: c && c.state, rune: p.rune, alive: !!c };
    }, z.zone);
    if (obs.specialNow) { sawTelegraph = true; if (obs.state === "windup") sawWindup = true; }
    if (obs.rune > peakRune) peakRune = obs.rune;
    aliveAfter = obs.alive;
    // capture the caves slam at its peak
    if (z.zone === "caves" && obs.rune >= Math.ceil(z.slam * 0.4)) {
      await page.screenshot({ path: join(OUT, "cas109-special-live.png") });
    }
    await sleep(90);
  }
  if (sawWindup) ok(`[${z.zone.toUpperCase()}] telegraph observed live (specialNow during windup)`);
  else no(`[${z.zone.toUpperCase()}] no telegraphed windup observed live`);
  if (peakRune >= Math.ceil(z.slam * 0.4)) ok(`[${z.zone.toUpperCase()}] radial slam fired live (${peakRune} live shards, ~${z.slam})`);
  else no(`[${z.zone.toUpperCase()}] slam did not fire live (${peakRune} shards)`);
  if (aliveAfter) ok(`[${z.zone.toUpperCase()}] boss survives slam window (no soft-lock)`);
  else no(`[${z.zone.toUpperCase()}] boss vanished mid-fight`);
  if (errs.length === 0) ok(`[${z.zone.toUpperCase()}] zero page errors`);
  else no(`[${z.zone.toUpperCase()}] page errors: ${errs.slice(0, 2).join(" | ")}`);
  await page.close();
}
await browser.close();
console.log(`\n${fail === 0 ? "✓ LIVE CAS-109" : "✖ LIVE CAS-109"}: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
