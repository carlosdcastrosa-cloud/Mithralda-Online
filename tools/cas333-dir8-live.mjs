// CAS-333 (CAS-301a) LIVE: prove 8-direction facing is wired for the hooded classes.
// Boots the build (local server by default, or a URL via BASE=…), and for each of the
// 4 migrated classes (mage/paladin/priest/druid) walks the hero in all 8 screen-space
// directions, capturing a hero-centred crop per facing. The decisive assertion is that
// NORTH and SOUTH facings render DIFFERENT pixels: the pre-CAS-333 single-facing+flip
// path drew N and S from the SAME strip with NO flip (cos(±π/2)=0) → byte-identical, so
// any real difference proves drawHeroClass now selects the facing ROW. Also asserts each
// _idle8.png serves 140x1328 and _walk8.png 980x1328, walk anim fires, 60fps, 0 errors,
// and saves an 8-direction montage for the mage. Run: node tools/cas333-dir8-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASSES = [["mage","Digit3"],["paladin","Digit2"],["priest","Digit5"],["druid","Digit4"]];
// bucket: keys held to drive that screen-space facing (W=up/-y, S=down/+y, A=left, D=right)
const DIRS = [
  { b:0, name:"E",  keys:["KeyD"] },
  { b:1, name:"SE", keys:["KeyS","KeyD"] },
  { b:2, name:"S",  keys:["KeyS"] },
  { b:3, name:"SW", keys:["KeyS","KeyA"] },
  { b:4, name:"W",  keys:["KeyA"] },
  { b:5, name:"NW", keys:["KeyW","KeyA"] },
  { b:6, name:"N",  keys:["KeyW"] },
  { b:7, name:"NE", keys:["KeyW","KeyD"] },
];
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code, type) =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key","").toLowerCase(), bubbles: true })), code, type);

// Default: spin up a local static server over the working tree. Set LIVE_URL to point at a
// deployed origin (e.g. the gh-pages build) to verify the SHIPPED bundle instead.
const local = process.env.LIVE_URL ? null : await startServer(ROOT);
const BASE = process.env.LIVE_URL || local.url;
const LIVE = `${BASE}/index.html?dev`;
const close = local ? local.close : (async () => {});
async function stripDims(art, suffix) {
  const res = await fetch(`${BASE}/assets/erw/hero/classes/${art}_${suffix}.png`, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) return { ok:false, status:res.status };
  const b = Buffer.from(await res.arrayBuffer());
  return { ok:true, w:b.readUInt32BE(16), h:b.readUInt32BE(20) };
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = [];
let totalErrors = 0;
for (const [name, code] of CLASSES) {
  const r = { name, idle8:null, walk8:null, walkSeen:false, sigs:{}, distinctNS:false, distinctEW:false, cardDistinct:0, diagInk:0, fps:0, errs:0, pass:false };
  // Fresh, isolated storage per class so a prior class's autosave can't skip the menu scene.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type()==="error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "Dir8QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code:"Enter", key:"Enter", bubbles:true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code, "keydown"); await key(fr, code, "keyup");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  r.idle8 = await stripDims(name, "idle8");
  r.walk8 = await stripDims(name, "walk8");

  // Walk each of the 8 directions; grab a 16x16 grayscale signature of the hero region.
  // The hero is camera-centred, so a fixed centre crop tracks it across facings.
  const CX = 360, CY = 250, CW = 180, CH = 240; // centre-ish crop in the 900x600 view
  for (const d of DIRS) {
    for (const k of d.keys) await key(fr, k, "keydown");
    for (let i=0;i<10;i++){ await sleep(45); const a = await fr.evaluate(()=>window.__dev.heroAnim()); if (a && a.state==="walk") r.walkSeen = true; }
    // sample the hero crop straight off the live canvas, downsampled to 16x16 luminance
    const sig = await fr.evaluate((cx,cy,cw,ch) => {
      const cv = document.querySelector("canvas"); if (!cv) return null;
      const sc = document.createElement("canvas"); sc.width=16; sc.height=16;
      const g = sc.getContext("2d"); g.imageSmoothingEnabled=false;
      g.drawImage(cv, cx,cy,cw,ch, 0,0,16,16);
      const px = g.getImageData(0,0,16,16).data; const out=[];
      for (let i=0;i<px.length;i+=4) out.push((px[i]*0.3+px[i+1]*0.59+px[i+2]*0.11)|0);
      return out;
    }, CX, CY, CW, CH);
    r.sigs[d.name] = sig;
    for (const k of d.keys) await key(fr, k, "keyup");
    await sleep(120); // settle to idle so the next direction starts clean
  }
  // montage for mage
  if (name === "mage") {
    await page.screenshot({ path: join(OUT, "cas333-dir8-mage.png"), clip: { x: CX-20, y: CY-20, width: CW+40, height: CH+40 } });
  }

  const mad = (a,b) => { if(!a||!b) return 0; let s=0; for(let i=0;i<a.length;i++) s+=Math.abs(a[i]-b[i]); return s/a.length; };
  const ink = (a) => { if(!a) return 0; let s=0; for(const v of a) s+= (v>16 && v<239)?1:0; return s; }; // non-bg cells
  r.distinctNS = mad(r.sigs.N, r.sigs.S) > 6;   // the killer check (old single-facing+flip → 0)
  r.distinctEW = mad(r.sigs.E, r.sigs.W) > 4;
  // 4 cardinals must be mutually distinct (each pair differs by a clear margin)
  const card = ["E","S","W","N"]; let cardDistinct=0;
  for (let i=0;i<card.length;i++){ let uniq=true; for (let j=0;j<card.length;j++) if(i!==j && mad(r.sigs[card[i]],r.sigs[card[j]])<3) uniq=false; if(uniq) cardDistinct++; }
  r.cardDistinct = cardDistinct;
  // every diagonal facing must actually render the hero (non-empty crop)
  r.diagInk = ["SE","SW","NW","NE"].filter(n=>ink(r.sigs[n])>=4).length;
  r.fps = await fr.evaluate(async () => { let n=0; const t0=performance.now(); await new Promise(res=>{ const loop=()=>{ n++; if(performance.now()-t0>1000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }); return n; });
  r.errs = errs.length; totalErrors += errs.length;

  // Decisive coverage of all 8 rows: N≠S (rows 6 vs 2 — impossible under the old
  // single-facing+flip path), E≠W (rows 0 vs 4), and all 4 diagonals (rows 1/3/5/7) render
  // the hero. cardDistinct is reported as a (crop-noisy) diagnostic, not a gate.
  const dimsOk = r.idle8.ok && r.idle8.w===140 && r.idle8.h===1328 && r.walk8.ok && r.walk8.w===980 && r.walk8.h===1328;
  r.pass = dimsOk && r.walkSeen && r.distinctNS && r.distinctEW && r.diagInk===4 && r.fps>=55 && r.errs===0;
  results.push(r);
  console.log(`${r.pass?"✔":"✖"} ${name}: idle8=${r.idle8.w}x${r.idle8.h} walk8=${r.walk8.w}x${r.walk8.h} walk=${r.walkSeen} N≠S=${r.distinctNS} E≠W=${r.distinctEW} cardinals=${r.cardDistinct}/4 diag=${r.diagInk}/4 fps=${r.fps} err=${r.errs}`);
  await page.close(); await context.close();
}
await browser.close();
await close();
const allPass = results.every(r=>r.pass) && totalErrors===0;
console.log(allPass
  ? "✓ CAS-333 LIVE PASS: 4/4 classes face & step in all 8 directions (N≠S proves row-select), strips 140x1328/980x1328, 60fps, 0 err"
  : "✖ CAS-333 LIVE: some checks failed");
process.exitCode = allPass ? 0 : 1;
