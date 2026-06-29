// CAS-215: render the FOUNTAINS roster regen (remaining mobs/NPCs/deco) using the REAL
// render/sprites.js + render/palette.js so the preview is exactly what the game draws.
// Blits every reskinned sprite at game pixel-scale onto the locked gloom background, then
// screenshots a contact sheet for the issue thread. No game-sim boot needed — this proves
// the per-sprite palettes read on-style against the FOUNTAINS environment.
import puppeteer from "puppeteer-core";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const PREVIEW = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#06070a}canvas{image-rendering:pixelated}</style></head>
<body><canvas id="c" width="900" height="560"></canvas>
<script type="module">
  import { SP, blit } from "/render/sprites.js";
  import { COL } from "/render/palette.js";
  const ctx = document.getElementById("c").getContext("2d");
  // FOUNTAINS gloom ground: dark cobble field + a single warm torch pool, per the formula.
  ctx.fillStyle = COL.bg; ctx.fillRect(0,0,900,560);
  for(let y=0;y<560;y+=16)for(let x=0;x<900;x+=16){
    ctx.fillStyle = ((x+y)/16)%2 ? COL.cobble : COL.cobbleD; ctx.fillRect(x,y,16,16);
    ctx.fillStyle = COL.cobbleL; ctx.fillRect(x,y,1,1);
  }
  const g = ctx.createRadialGradient(450,250,20,450,250,260);
  g.addColorStop(0,"rgba(239,138,46,0.18)"); g.addColorStop(1,"rgba(6,7,10,0)");
  ctx.fillStyle=g; ctx.fillRect(0,0,900,560);
  // The roster reskinned in CAS-215 (B = mobs/NPCs, deco) — drawn at in-game px scale.
  const ROW = [
    ["wolf",4],["skel",4],["bat",4],["npcBram",4],["npcRolf",4],["npcLina",4],["adv",4],
    ["tree",3],["rock",4],["crate",4],["stall",4],
    // reference: already-on-style CAS-209 mobs for side-by-side coherence
    ["rat",4],["orc",4],["golem",4],["bandit",4],["wraith",4],["chest",4],["lantern",4],
  ];
  ctx.font="11px monospace"; ctx.textAlign="center";
  let i=0;
  for(const [key,px] of ROW){
    const col=i%7, r=Math.floor(i/7);
    const cx=70+col*120, cy=70+r*170;
    const s=SP[key]; if(s){ blit(ctx, s.rows, s.pal, cx, cy, px, false); }
    ctx.fillStyle=COL.cream; ctx.fillText(key, cx, cy+70);
    i++;
  }
  ctx.textAlign="left"; ctx.fillStyle=COL.textGold;
  ctx.fillText("CAS-215 — FOUNTAINS roster regen (cold-gloom reskin) · top 11 = newly regenerated", 12, 548);
  window.__done = true;
</script></body></html>`;

// Serve the preview as a real same-origin file so ES-module imports resolve.
const htmlPath = join(ROOT, "tools", "_cas215_preview.html");
writeFileSync(htmlPath, PREVIEW);
const srv = await startServer(ROOT);
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(`${srv.url}/tools/_cas215_preview.html`, { waitUntil: "load", timeout: 20000 });
  await page.waitForFunction("window.__done === true", { timeout: 10000 });
  const out = join(ROOT, "tools", "cas215-roster-preview.png");
  writeFileSync(out, await page.screenshot());
  console.log("saved", out);
  if (errors.length) { console.error("ERRORS:\n" + errors.join("\n")); process.exitCode = 1; }
  else console.log("OK — roster rendered with 0 JS errors");
} finally {
  await browser.close(); await srv.close();
  try { unlinkSync(htmlPath); } catch {}
}
