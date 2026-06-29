// ---------------------------------------------------------------------------
// CAS-203 — visual proof that procedural mobs are no longer frozen.
// Boots the real game, spawns a row of mob types next to the hero, then grabs
// several frames a few hundred ms apart. Across the frames each mob's feet-anchored
// breathing / walk-bob shifts, so flipping the PNGs shows live motion.
// Run: node tools/cas203-anim-capture.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const errors = [];
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 540, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "AnimBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });

  // spawn a spread of procedural mob types around the hero (idle), plus drive one to walk
  const spawned = await page.evaluate(() => {
    const h = window.__dev.hero();
    const types = ["wolf","skeleton","orc","bandit","wraith","bat"];
    types.forEach((t,i)=> window.__dev.spawn(t, h.x + (i-2.5)*70, h.y - 90));
    return types;
  });
  console.log("spawned:", spawned.join(", "));
  await new Promise(r=>setTimeout(r,300));

  // tight crop around the hero + nearby mobs; space frames across the idle-breath
  // period (~2.7s) so the feet-anchored squash/stretch is plainly visible when flipped.
  const clip = { x: 300, y: 230, width: 340, height: 230 };
  const shots = [];
  for (let i=0;i<4;i++){
    const p = join(ROOT, "tools", `cas203-frame${i}.png`);
    await page.screenshot({ path: p, clip });
    shots.push(p);
    await new Promise(r=>setTimeout(r,650));
  }
  // report the animState mix so we know walk + idle are both exercised
  const states = await page.evaluate(() => (window.__dev.enemies? window.__dev.enemies(): []).map(e=>e.animState));
  console.log("enemy animStates:", JSON.stringify(states));
  console.log("frames:", shots.map(s=>s.split("/").pop()).join(", "));
  if (errors.length){ ok=false; console.error("✖ page errors:\n"+errors.join("\n")); }
  else console.log("✔ zero page errors");
} catch(e){ ok=false; console.error("✖", e.message); }
finally { await browser.close(); await srv.stop?.(); }
process.exit(ok?0:1);
