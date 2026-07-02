// ---------------------------------------------------------------------------
// CAS-398 — LIVE QA for "EDICION DE MAPA": map tripled (110->330) + the black
// field turned to Bosque Salvaje across the whole enlarged world.
//
// Gates:
//   1. boot to play, 0 console errors (favicon 404 ignored)
//   2. MAP_W === MAP_H === 330 (world 10560px) via a live module import
//   3. buildWorld (live world.js) — zones CENTERED (bbox mid-map), hero spawn
//      mid-map, forest (prop_f_*) fills the far NEW quadrants (black->forest),
//      0 deco out-of-bounds
//   4. ~60 fps sampled over 1s in the live play scene
//   5. visual: screenshot at spawn (centered town) + panned into the far
//      wilderness (forest, not black void)
//
// Run: LIVE_URL=https://carlosdcastrosa-cloud.github.io/Mithralda-Online node tools/cas398-live-qa.mjs
// ---------------------------------------------------------------------------
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const url = (process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
console.log(`target: ${url} (LIVE)`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
const isFavicon = (s) => /favicon\.ico/.test(s || "");
page.on("pageerror", (e) => { if (!isFavicon(e.message)) errors.push(`pageerror: ${e.message}`); });
page.on("console", (m) => { if (m.type() !== "error") return;
  const loc = (m.location && m.location()) || {}; if (isFavicon(m.text()) || isFavicon(loc.url)) return;
  errors.push(`console.error: ${m.text()} @ ${loc.url || "?"}`); });

const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };

try {
  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas398"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  ok("boot to play scene", await page.evaluate(() => window.__dev.scene()) === "play");

  // 2. live MAP dims via module import
  const dims = await page.evaluate(async (base) => {
    const c = await import(`${base}/sim/config.js`);
    return { W: c.MAP_W, H: c.MAP_H, TS: c.TS };
  }, url);
  ok("MAP tripled to 330x330", dims.W === 330 && dims.H === 330, `${dims.W}x${dims.H}, world ${dims.W*dims.TS}px`);

  // 3. build the LIVE world and inspect structure
  const wstat = await page.evaluate(async (base) => {
    const c = await import(`${base}/sim/config.js`);
    const w = await import(`${base}/sim/world.js`);
    let s = 1; const seed = v => { s = v>>>0||1; };
    const srand = () => { s = (s*1664525+1013904223)>>>0; return s/4294967296; };
    const rr = (a,b) => a + Math.floor(srand()*(b-a+1)); const ri = rr;
    const W = w.buildWorld({ srand, seed, rr, ri });
    const TS = c.TS, MW = c.MAP_W;
    let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
    for (const z of [W.town,W.forest,W.caves,W.arena,W.ruins,W.abyss,W.frost,W.trial]) { minx=Math.min(minx,z.x);miny=Math.min(miny,z.y);maxx=Math.max(maxx,z.x+z.w);maxy=Math.max(maxy,z.y+z.h); }
    let forest=0, farForest=0, oob=0;
    const px = MW*TS;
    for (const d of W.deco) {
      if (d.x<0||d.y<0||d.x>px||d.y>px) oob++;
      if (d.kind && d.kind.startsWith("prop_f_")) { forest++; if (d.x>220*TS || d.y>220*TS || d.x<110*TS || d.y<110*TS) farForest++; }
    }
    return { deco: W.deco.length, solids: W.solids.length, forest, farForest, oob,
      town: W.town, tcx: W.tcx, tcy: W.tcy, bbox: {minx,miny,maxx,maxy}, px };
  }, url);
  const c = wstat.bbox, mid = 165;
  ok("zone cluster CENTERED mid-map", c.minx>90 && c.maxx<240 && c.miny>90 && c.maxy<240, `bbox x${c.minx}-${c.maxx} y${c.miny}-${c.maxy} (map 330, mid 165)`);
  ok("town near map center", Math.abs(wstat.town.x+9-mid)<20 && Math.abs(wstat.town.y+9-mid)<20, `town @ ${wstat.town.x},${wstat.town.y}`);
  ok("forest fills the NEW outer wilderness (black->forest)", wstat.farForest>3000, `${wstat.forest} forest props, ${wstat.farForest} in the outer ring`);
  ok("no deco out-of-bounds", wstat.oob===0, `oob=${wstat.oob}, deco=${wstat.deco}, solids=${wstat.solids}`);

  // hero spawn mid-map
  const hero = await page.evaluate(() => window.__dev.hero());
  ok("hero spawns mid-map", Math.abs(hero.x-wstat.tcx)<200 && Math.abs(hero.y-wstat.tcy)<200 && hero.x>4000 && hero.x<6600, `hero @ ${hero.x|0},${hero.y|0} (tc ${wstat.tcx},${wstat.tcy})`);

  // 4. fps over ~1s
  const fps = await page.evaluate(() => new Promise(res => {
    let n=0; const t0=performance.now();
    function tick(){ n++; if(performance.now()-t0<1000) requestAnimationFrame(tick); else res(Math.round(n*1000/(performance.now()-t0))); }
    requestAnimationFrame(tick);
  }));
  ok("~60 fps in play", fps>=50, `${fps} fps`);

  // 5. screenshots — spawn (centered town) then far wilderness
  await new Promise(r=>setTimeout(r,400));
  await page.screenshot({ path: "/tmp/cas398-spawn.png" });
  // teleport into the far SE wilderness (tile ~300,300) and the far NW (~20,20) to prove forest, not void
  await page.evaluate(() => window.__dev.tp(300*32, 300*32));
  await new Promise(r=>setTimeout(r,700));
  await page.screenshot({ path: "/tmp/cas398-wild-se.png" });
  await page.evaluate(() => window.__dev.tp(22*32, 22*32));
  await new Promise(r=>setTimeout(r,700));
  await page.screenshot({ path: "/tmp/cas398-wild-nw.png" });
  ok("screenshots captured (spawn + far SE + far NW wilderness)", true);

  ok("0 console/page errors", errors.length===0, errors.slice(0,3).join(" | "));
} catch (e) {
  ok(`harness error: ${e.message}`, false);
} finally {
  const pass = results.filter(r=>r.pass).length, tot = results.length;
  console.log(`\n${pass}/${tot} PASS${errors.length?`  (${errors.length} errors)`:""}`);
  writeFileSync("/tmp/cas398-qa-result.json", JSON.stringify({ url, pass, tot, results, errors }, null, 2));
  await browser.close();
  process.exit(pass===tot ? 0 : 1);
}
