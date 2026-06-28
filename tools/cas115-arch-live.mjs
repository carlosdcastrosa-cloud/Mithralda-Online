// ---------------------------------------------------------------------------
// CAS-115 QA — LIVE probe for read-and-react combat (3 telegraphed archetypes)
// on the DEPLOYED build (inside the Higgsfield iframe). Drives the SAME __dev
// hooks the game runs (archMeta/archArena/archSnap/archMoveHero) to prove the
// new combat shipped (not a stale cache) and behaves on the live URL:
//   - arch __dev API present on live → proves the new build
//   - AC1 DATA: >=3 distinct archetypes (rusher/caster/brute) with distinct fields
//   - AC1/AC2 CASTER KITES: closes inside kite → retreats; parked in band → fires
//   - AC1/AC2 RUSHER LUNGES: closes a big gap from range, the hit connects
//   - AC2 BRUTE GROUND-SLAM: in-radius hero eats it; stepping OUT during the
//     telegraph windup AVOIDS the slam (dodgeable by positioning)
//   - AC3 reward scales with danger (brute out-rewards the chump)
//   - AC4 60fps with a full mixed archetype pack live
//   - AC5 0 JS errors
//   - captures a screenshot during a brute ground-slam telegraph (visual evidence)
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas115-arch-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterAs(fr) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "ArchQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
// poll archSnap() until pred or timeout; returns the last snapshot seen.
async function until(fr, pred, ms = 4000) {
  const t0 = Date.now(); let snap = null;
  while (Date.now() - t0 < ms) {
    snap = await fr.evaluate(() => window.__dev.archSnap());
    if (snap && pred(snap)) return snap;
    await sleep(50);
  }
  return snap;
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  for (const f of page.frames()) { try { await f.evaluate(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} }); } catch {} }
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await enterAs(fr);
  check("entered play on live build", true);

  // arch __dev API present on live (proves the new build, not a stale cache)
  const api = await fr.evaluate(() => ["archMeta", "archArena", "archSnap", "archMoveHero"]
    .reduce((o, k) => (o[k] = typeof window.__dev[k] === "function", o), {}));
  const apiOk = api.archMeta && api.archArena && api.archSnap && api.archMoveHero;
  check("arch __dev API present on live build", apiOk, api);
  if (!apiOk) throw new Error("live build missing arch hooks: " + JSON.stringify(api));

  // (AC1) DATA — three distinct archetypes with distinct behaviour fields + danger reward.
  const meta = await fr.evaluate(() => ({
    wolf: window.__dev.archMeta("wolf"), bat: window.__dev.archMeta("bat"), bandit: window.__dev.archMeta("bandit"),
    spearman: window.__dev.archMeta("spearman"), mage: window.__dev.archMeta("mage"), wraith: window.__dev.archMeta("wraith"),
    orc: window.__dev.archMeta("orc"), moose: window.__dev.archMeta("moose"),
    skeleton: window.__dev.archMeta("skeleton"),
  }));
  const archset = new Set([meta.wolf.arch, meta.mage.arch, meta.orc.arch].filter(Boolean));
  check("AC1 ≥3 distinct archetypes (rusher/caster/brute)",
    archset.size >= 3 && archset.has("rusher") && archset.has("caster") && archset.has("brute"), [...archset]);
  check("AC1 rushers carry a lunge",
    meta.wolf.arch === "rusher" && meta.wolf.lunge > 0 && meta.bandit.lunge > 0 && meta.bat.lunge > 0,
    { wolf: meta.wolf.lunge, bandit: meta.bandit.lunge, bat: meta.bat.lunge });
  check("AC1 casters carry a kite distance + ranged",
    meta.mage.arch === "caster" && meta.mage.kite > 0 && meta.mage.ranged && meta.wraith.kite > 0 && meta.spearman.kite > 0,
    { mage: meta.mage.kite, wraith: meta.wraith.kite, spearman: meta.spearman.kite });
  check("AC1 brutes carry an aoe radius",
    meta.orc.arch === "brute" && meta.orc.aoe > 0 && meta.moose.aoe > 0, { orc: meta.orc.aoe, moose: meta.moose.aoe });
  check("AC3 danger scales reward (brute > chump)",
    meta.orc.xp > meta.skeleton.xp && meta.orc.gold[1] > meta.skeleton.gold[1] && meta.orc.dmg >= meta.skeleton.dmg && meta.moose.xp > meta.bandit.xp,
    { orcXp: meta.orc.xp, skelXp: meta.skeleton.xp, orcGold: meta.orc.gold, skelGold: meta.skeleton.gold });

  // (AC1/AC2) CASTER KITES — drop a caster inside its kite radius; the real AI must back away.
  await fr.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(11); });
  await fr.evaluate(() => window.__dev.archArena("wraith", 70, 0)); // 70 < kite → retreat
  const kStart = await until(fr, (s) => s && s.dist > 0, 1500);
  await sleep(1400);
  const kEnd = await fr.evaluate(() => window.__dev.archSnap());
  check("AC1/AC2 caster KITES away from crowding hero",
    kStart && kEnd && kEnd.dist > kStart.dist + 20, { start: kStart && kStart.dist, end: kEnd && kEnd.dist });
  await fr.evaluate(() => window.__dev.archMoveHero(195, 0)); // park in firing band
  const fired = await until(fr, (s) => s && s.enemyProj > 0, 2500);
  check("AC2 caster fires a telegraphed projectile from the band", fired && fired.enemyProj > 0, fired);

  // (AC1/AC2) RUSHER LUNGES — drop a rusher beyond melee range; it closes + the hit lands.
  await fr.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(7); });
  await fr.evaluate(() => window.__dev.archArena("wolf", 120, 0)); // 120 >> melee range
  const rHit = await until(fr, (s) => s && s.heroDmgTaken > 0, 4000);
  check("AC1/AC2 rusher LUNGES in from range and connects",
    rHit && rHit.heroDmgTaken > 0 && rHit.dist <= meta.wolf.lunge, rHit);

  // (AC2) BRUTE GROUND-SLAM HITS an in-radius hero — and capture the telegraph screenshot.
  await fr.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(3); });
  await fr.evaluate(() => window.__dev.archArena("orc", 28, 0)); // inside aoe → it slams
  const bWind = await until(fr, (s) => s && s.state === "windup", 4000);
  try { await page.screenshot({ path: "tools/cas115-live-brute-telegraph.png" }); } catch {}
  const bHit = await until(fr, (s) => s && s.heroDmgTaken > 0, 4000);
  check("AC2 brute ground-slam hit an in-radius hero", bHit && bHit.heroDmgTaken > 0, bHit);

  // (AC2) DODGEABLE — step OUT of the radius during the windup → that slam misses.
  await fr.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(3); });
  await fr.evaluate(() => window.__dev.archArena("orc", 28, 0));
  const wind = await until(fr, (s) => s && s.state === "windup", 4000);
  const dmgAtWindup = await fr.evaluate(() => { window.__dev.archMoveHero(150, 0); return window.__dev.archSnap().heroDmgTaken; });
  await until(fr, (s) => s && (s.state === "recover" || s.state === "chase"), 2000);
  await sleep(250);
  const dodged = await fr.evaluate(() => window.__dev.archSnap());
  check("AC2 stepping OUT of the telegraphed radius AVOIDS the slam (dodgeable)",
    wind && wind.state === "windup" && dodged && dodged.heroDmgTaken === dmgAtWindup,
    { windup: wind && wind.state, before: dmgAtWindup, after: dodged && dodged.heroDmgTaken });

  // (AC4) 60fps with a full mixed-archetype pack live around the hero.
  await fr.evaluate(() => {
    window.__dev.tpZone("abyss");
    window.__dev.archArena("orc", 60, 40);
    ["wraith", "mage", "wolf", "bandit", "moose", "bat"].forEach((t, i) =>
      window.__dev.spawn(t, 80 * Math.cos(i), 80 * Math.sin(i)));
  });
  const fps = await fr.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  check("AC4 ≥58 fps with a full mixed archetype pack live", fps >= 58, { fps });
  try { await page.screenshot({ path: "tools/cas115-live-mixed-pack.png" }); } catch {}

  // (AC5) zero JS errors
  report.errors = report.errors.filter((e) => !/favicon/i.test(e));
  check("AC5 0 JS errors across the run", report.errors.length === 0, report.errors);

  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.errors.push(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
for (const c of report.checks) console.log(`${c.ok ? "✔" : "✖"} ${c.name}`);
console.log(report.pass ? "\nCAS-115 ARCH LIVE: PASS" : "\nCAS-115 ARCH LIVE: FAIL");
process.exit(report.pass ? 0 : 1);
