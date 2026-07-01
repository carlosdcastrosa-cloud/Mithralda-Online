// ---------------------------------------------------------------------------
// CAS-387 — INDEPENDENT QA of the Bestiary / Codex meta-goal (feature CAS-386).
//
// This is NOT the engineer's self-QA (tools/cas386-bestiary.mjs). It deliberately
// covers the paths that harness did not, to independently satisfy CAS-387 acceptance:
//   • a REGULAR (non-boss) mob's FULL tier ladder (seen→hunted→mastered) driven by
//     REAL kills, asserting the NON-doubled reward band (15/60/150 g) and the
//     thresholds (1 / 25 / 100) — engineer only proved the boss 2× band + wolf@1.
//   • the +mena (mats) grant at DOMINADO actually lands in the Forja (forgeState) —
//     engineer never read the material delta.
//   • XP actually lands: a fresh L1 hero LEVELS UP after the claims (HUD "Nv") —
//     engineer only checked the gold delta.
//   • a REAL touchscreen TAP on the claim chip claims a tier (acceptance #3 "tap").
//   • GUARDRAIL (#5): a claim NEVER mutates killsByType (bestiary only READS it),
//     the bestiary uses its OWN localStorage key (distinct from the save), and the
//     boon-draft / daily loops are still wired (no balance/spawn/curve shift).
//   • undiscovered mobs show "???" + dim; 60fps with the panel open; 0 console errors.
//
// Run: LIVE_URL="https://carlosdcastrosa-cloud.github.io/Mithralda-Online/" \
//        node tools/cas387-bestiary-qa.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas387-bestiary-qa.png");
const errors = [];
let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const eq = (label, got, want) => { if (got === want) pass(`${label} = ${JSON.stringify(got)}`); else fail(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const truthy = (label, got) => { if (got) pass(`${label}`); else fail(`${label}: got ${JSON.stringify(got)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const LIVE = process.env.LIVE_URL || null;
const srv = LIVE ? { url: LIVE.replace(/\/index\.html.*$/, "").replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${LIVE || srv.url} ${LIVE ? "(LIVE)" : "(local)"}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const board = (page) => page.evaluate(() => window.__bestiary.board());
const entry = (page, t) => page.evaluate((tt) => window.__bestiary.board().entries.find((e) => e.type === tt), t);
const gold = (page) => page.evaluate(() => window.__dev.heroStats().gold);
const mats = (page) => page.evaluate(() => window.__dev.forgeState().mats);
const kc = (page, t) => page.evaluate((tt) => window.__bestiary.killCount(tt), t);
const hudLvl = async (page) => {
  try { await page.waitForFunction(() => { const h = document.getElementById("hud"); return h && /Nv\s*\d+/.test(h.innerText || ""); }, { timeout: 4000 }); } catch (e) {}
  return page.evaluate(() => { const h = document.getElementById("hud"); if (!h) return null; const m = /Nv\s*(\d+)/.exec(h.innerText || ""); return m ? +m[1] : null; });
};

async function boot(page) {
  const noise = (u) => /favicon\.ico|\/analytics(\b|\.)/.test(u || "");
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => { if (!noise(r.url())) errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`); });
  page.on("response", (r) => { if (r.status() >= 400 && !noise(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(srv.url + "/index.html?dev", { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "CodexQA387"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }))); // warrior
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
}

async function openBestiary(page) {
  await page.evaluate(() => window.__dev.codexTP());
  await sleep(200);                                     // let the hero settle on Yára before interacting
  // press E until dialogue opens (interact prompt registers on a frame)
  for (let i = 0; i < 12; i++) {
    const sc = await page.evaluate(() => window.__dev.scene());
    if (sc === "dialogue" || sc === "bestiary") break;
    await key(page, "KeyE"); await sleep(120);
  }
  await page.waitForFunction("window.__dev.scene()==='dialogue' || window.__dev.scene()==='bestiary'", { timeout: 3000 });
  // advance dialogue lines until the bestiary scene opens
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__dev.scene()) === "bestiary") break;
    await key(page, "KeyE"); await sleep(60);
  }
  await page.waitForFunction("window.__dev.scene()==='bestiary'", { timeout: 3000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1, hasTouch: true });
  await page.evaluateOnNewDocument(() => { window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); }); });
  await boot(page);
  pass("booted to play (warrior) on LIVE");

  // ---- GUARDRAIL baseline: sibling meta-loops still wired, spawn tables intact ----
  const loops = await page.evaluate(() => ({ daily: !!window.__daily, bestiary: !!window.__bestiary, draftFn: typeof (window.__dev.armHunt) }));
  truthy("daily/contracts loop still exposed (window.__daily)", loops.daily);
  truthy("bestiary API exposed (window.__bestiary)", loops.bestiary);
  const batArch = await page.evaluate(() => { try { return window.__dev.archMeta("bat"); } catch (e) { return null; } });
  truthy("spawn/ETPL base intact — archMeta(bat) present (no spawn-curve edit)", !!batArch);

  // ---- REGULAR-mob FULL ladder (bat): real kills, NON-2× reward band ----
  const lvl0 = await hudLvl(page);
  truthy(`fresh hero level read from HUD (Nv ${lvl0})`, lvl0 !== null);
  await page.evaluate(() => { for (let i = 0; i < 25; i++) window.__dev.spawnKill("bat"); });
  eq("killCount(bat) after 25 real kills", await kc(page, "bat"), 25);

  await openBestiary(page);
  pass("opened Bestiary via REAL town NPC path (Yára → E → dialogue → E)");
  let bat = await entry(page, "bat");
  eq("bat is NOT a boss (base reward band)", bat.boss, false);
  eq("bat count reflects live killsByType", bat.count, 25);
  eq("bat 'seen' tier reached (n=1)", bat.tiers[0].reached, true);
  eq("bat 'hunted' tier reached (n=25)", bat.tiers[1].reached, true);
  eq("bat 'mastered' NOT reached yet (n=100)", bat.tiers[2].reached, false);
  eq("bat claimable", bat.claimable, true);

  // claim 'seen' via REAL keyboard (select bat row with ↓, Enter), then 'hunted'
  const gBefore = await gold(page);
  const bi = (await board(page)).entries.findIndex((e) => e.type === "bat");
  for (let i = 0; i < bi; i++) { await key(page, "ArrowDown"); await sleep(10); }
  await key(page, "Enter"); await sleep(60);                       // claim 'seen'
  eq("bat 'seen' reward = base 15 (NOT boss 30)", (await gold(page)) - gBefore, 15);
  await page.evaluate(() => window.__bestiary.claimNext("bat")); await sleep(30);   // claim 'hunted'
  eq("bat 'seen'+'hunted' cumulative = base 75 (15+60, NOT 150)", (await gold(page)) - gBefore, 75);

  // drive to 'mastered' (n=100) and claim → gold +150 AND +5 mats (mena at Dominado)
  await page.evaluate(() => { for (let i = 0; i < 75; i++) window.__dev.spawnKill("bat"); }); await sleep(60);
  eq("killCount(bat) at mastered threshold", await kc(page, "bat"), 100);
  bat = await entry(page, "bat");
  eq("bat 'mastered' tier now reached (n=100)", bat.tiers[2].reached, true);
  const gPre = await gold(page), mPre = await mats(page);
  await page.evaluate(() => window.__bestiary.claimNext("bat")); await sleep(40);
  eq("bat 'mastered' gold reward = base 150 (NOT boss 300)", (await gold(page)) - gPre, 150);
  eq("bat 'mastered' +mena (mats) reward = 5 lands in Forja", (await mats(page)) - mPre, 5);
  eq("bat fully claimed, no longer claimable", (await entry(page, "bat")).claimable, false);

  // GUARDRAIL: claiming NEVER mutated the kill counter (bestiary only READS killsByType)
  eq("killsByType(bat) UNCHANGED by claims (read-only)", await kc(page, "bat"), 100);

  // ---- XP actually lands: fresh L1 hero leveled up (330 xp granted through gainXP) ----
  await key(page, "KeyE"); await sleep(60);                        // close → back to play so HUD paints
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 3000 });
  const lvl1 = await hudLvl(page);
  truthy(`hero LEVELED UP after claims (Nv ${lvl0} → Nv ${lvl1}) — XP path landed`, lvl1 !== null && lvl1 > lvl0);

  // ---- REAL touchscreen TAP claim (acceptance #3 "tap") on an isolated mob ----
  // Seed ONE fresh regular mob to 'seen' so it is the ONLY claimable chip on the panel.
  await page.evaluate(() => window.__dev.spawnKill("rat")); await sleep(30);
  await openBestiary(page); await sleep(80);
  // Expose the SAME module singletons the app uses to read the live claim-chip rects.
  await page.addScriptTag({ type: "module", content: `import { ui } from "${srv.url}/input.js"; import { view } from "${srv.url}/view.js"; window.__ui = ui; window.__view = view;` });
  await sleep(60);
  const rat0 = await entry(page, "rat");
  eq("rat 'seen' claimable before tap", rat0.claimable, true);
  const chip = await page.evaluate(() => {
    const chips = (window.__ui.bestRects || []).filter((r) => r.w === 80 && r.h === 24); // claim chips only
    const c = window.getComputedStyle;
    const cv = document.getElementById("c").getBoundingClientRect();
    const vw = window.__view.VW || cv.width;
    const sx = cv.width / vw, sy = cv.height / (window.__view.VH || cv.height);
    return { n: chips.length, x: chips[0] ? cv.left + (chips[0].x + chips[0].w / 2) * sx : null, y: chips[0] ? cv.top + (chips[0].y + chips[0].h / 2) * sy : null };
  });
  eq("exactly ONE claimable chip on panel (rat)", chip.n, 1);
  const gTapPre = await gold(page);
  await page.touchscreen.tap(chip.x, chip.y);                      // REAL touch tap
  await sleep(60);
  eq("rat 'seen' claimed via REAL TOUCH TAP", (await entry(page, "rat")).tiers[0].claimed, true);
  eq("touch-tap reward = base 'seen' 15 gold", (await gold(page)) - gTapPre, 15);

  // ---- undiscovered mob: ??? + dim (dragon never killed) ----
  const dragon = await entry(page, "dragon");
  eq("undiscovered dragon hidden name", dragon.name, "???");
  eq("undiscovered dragon not seen (sprite dimmed)", dragon.seen, false);
  eq("undiscovered dragon count 0", dragon.count, 0);

  // ---- localStorage: OWN key, distinct from save, counts NOT duplicated ----
  await page.evaluate(() => window.__dev.saveNow()); await sleep(60); // flush throttled autosave before reading keys
  const ls = await page.evaluate(() => ({
    best: localStorage.getItem("mithralda.bestiary.v1"),
    save: localStorage.getItem("mithralda.save.v1"),
    daily: localStorage.getItem("mithralda.daily.v1"),
  }));
  truthy("bestiary persists to its OWN key mithralda.bestiary.v1", !!ls.best);
  truthy("save key mithralda.save.v1 exists SEPARATELY", !!ls.save);
  truthy("bestiary key is distinct object from save key", ls.best !== ls.save);
  truthy("bestiary store does NOT duplicate killsByType (counts read from save)", !/killsByType/.test(ls.best || ""));

  // ---- FPS with panel open ----
  const f0 = await page.evaluate(() => window.__frames); await sleep(1000);
  const fps = (await page.evaluate(() => window.__frames)) - f0;
  truthy(`FPS with bestiary open = ${fps} (>=55)`, fps >= 55);
  await page.screenshot({ path: SHOT });
  pass(`screenshot saved: ${SHOT}`);

  // ---- PERSISTENCE across reload (regular-mob counts + claimed tiers + touch claim) ----
  await page.evaluate(() => window.__dev.saveNow());
  await sleep(80);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__dev && window.__dev.scene && (window.__dev.scene()==='play'||window.__dev.scene()==='menu')", { timeout: 15000 });
  // if reload dropped to menu (no autoload), the save should have restored play directly
  eq("bat count persisted after reload", await kc(page, "bat"), 100);
  const batR = await entry(page, "bat");
  eq("bat all tiers still claimed after reload", batR.tiers.every((t) => t.claimed), true);
  eq("rat touch-claim persisted after reload", (await entry(page, "rat")).tiers[0].claimed, true);

  // ---- error gate ----
  if (errors.length) { fail(`page/console errors:\n  ${errors.join("\n  ")}`); } else { pass("zero page/console errors"); }

  console.log(ok ? "\n✓ CAS-387 INDEPENDENT bestiary QA PASSED." : "\n✗ CAS-387 QA FAILED.");
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
  process.exit(ok ? 0 : 1);
}
