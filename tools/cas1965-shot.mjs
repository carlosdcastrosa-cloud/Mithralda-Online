// ---------------------------------------------------------------------------
// CAS-1965 — VISUAL evidence capture for the Spirit Summon (SUMMON) live observable QA.
// Loads the CANONICAL served build, enters play as a warrior, then via the served module (import sim.js)
// arms SUMMON, stages a genuine spirit + a genuine boss adjacent to the hero (camera-centered), suppresses
// the first-run tutorial overlay, and lets the game's OWN rAF loop fight for ~1.6s. Captures desktop +
// mobile PNGs showing the CYAN spirit dueling the boss (aggro split — the boss faces/attacks the spirit).
//   node tools/cas1965-shot.mjs [URL]
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync("shots/cas1965", { recursive: true });

const exe = findChromium();
if (!exe) { console.error("✖ no chromium"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function shoot(label, isMobile) {
  const page = await browser.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));
  if (isMobile) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 800 });

  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 });
  // enter play directly via the served module (avoids flaky menu DOM), warrior class, hide name/dev overlays
  await page.waitForFunction(
    "(async()=>{try{const m=await import(new URL('sim/sim.js',location.href).href);return !!m.G;}catch{return false;}})()",
    { timeout: 45000 });
  await page.evaluate(async () => {
    const m = await import(new URL("sim/sim.js", location.href).href);
    if (!m.G.hero) m.createHero("BrasaQA", "warrior");
    m.G.scene = "play";
    for (const id of ["nameWrap", "dev"]) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
  });

  // stage the fight centered on the hero, tutorial suppressed
  const staged = await page.evaluate(async () => {
    const mod = await import(new URL("sim/sim.js", location.href).href);
    const cfg = await import(new URL("sim/config.js", location.href).href);
    const { G, dev } = mod;
    if (G.tut) G.tut.active = false;                       // kill the first-run overlay
    cfg.SUMMON.enabled = true; cfg.SIGNATURE_BOSS.enabled = true;
    // spawn the real boss next to the hero, then a spirit between them
    dev.spawn("calderatyrant", 70, 0);
    const boss = G.enemies.find((e) => e.isBoss);
    G.hero.summonCharges = 2; mod.spawnSpirit();
    const sp = G._spirit;
    if (!sp || !boss) return { err: "no spirit/boss" };
    sp.hp = sp.maxHp = 400; sp.life = 12;
    sp.x = boss.x - 16; sp.y = boss.y;                      // spirit hugs the boss (nearest threat)
    boss.state = "chase"; boss.stun = 0;
    G.scene = "play";
    return { bossHp0: Math.round(boss.hp), spHp0: sp.hp, ok: true };
  });
  if (staged.err) { console.log(`  ${label}: ${staged.err}`); await page.close(); return; }

  await wait(1600); // real rAF loop: spirit fights the boss, boss aggroed to spirit

  const obs = await page.evaluate(async () => {
    const mod = await import(new URL("sim/sim.js", location.href).href);
    const { G } = mod;
    const sp = G._spirit, b = G.enemies.find((e) => e.isBoss);
    return { spiritHp: sp ? Math.round(sp.hp) : null, bossHp: b ? Math.round(b.hp) : null,
      bossAggro: !!(b && b._sumAggro), heroHp: G.hero ? Math.round(G.hero.hp) : null, scene: G.scene };
  });

  const path = `shots/cas1965/${isMobile ? "mobile" : "desktop"}_spirit_vs_boss.png`;
  await page.screenshot({ path });
  console.log(`  ${label}: ${path} | spiritHp=${obs.spiritHp} bossHp=${obs.bossHp} bossAggro=${obs.bossAggro} heroHp=${obs.heroHp} jsErrors=${jsErrors.length}`);
  await page.close();
}

await shoot("desktop", false);
await shoot("mobile", true);
await browser.close();
console.log("done");
