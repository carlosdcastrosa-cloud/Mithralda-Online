// CAS-369 (board CAS-368) — warrior sprite BEFORE/AFTER + animation-set montage.
// BEFORE = the brown-haired Clarice that was wrongly deployed live (CAS-371).
// AFTER  = the restored straw-hat "Clarice noctural creature hunter" the board
// asked for ("this is the sprite i want animated"), shown across its full
// animated set: idle / walk / attack / dash / hurt / special / death.
// Pure read of the committed PNGs — no game, no sim. $0.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const pngWidth = (b) => b.readUInt32BE(16);
const CELL_H = 166, SCALE = 2;

// AFTER: straw-hat warrior animated states (frame counts match the bakes).
const STATES = [
  { file: "warrior.png",        label: "idle",    fc: 6, frac: 0 },
  { file: "warrior_walk.png",   label: "walk",    fc: 8, frac: 0.5 },
  { file: "warrior_attack.png", label: "attack",  fc: 8, frac: 0.5 },
  { file: "warrior_dash.png",   label: "dash",    fc: 8, frac: 0.5 },
  { file: "warrior_hurt.png",   label: "hurt",    fc: 6, frac: 0.5 },
  { file: "warrior_special.png",label: "special", fc: 8, frac: 0.7 },
  { file: "warrior_death.png",  label: "death",   fc: 6, frac: 0.5 },
];

const cellFrom = (path, fc, frac) => {
  const buf = readFileSync(path);
  const w = pngWidth(buf);
  const cellW = Math.round(w / fc);
  const frame = Math.min(fc - 1, Math.floor(fc * frac));
  return { url: "data:image/png;base64," + buf.toString("base64"), sx: frame * cellW, cellW, w, cellH: 166 };
};

const after = STATES.map(s => ({ ...s, ...cellFrom(join(DIR, s.file), s.fc, s.frac) }));
// BEFORE: the brown-haired idle frame that was live (downloaded to /tmp).
const beforeBuf = readFileSync("/tmp/live_warrior.png");
const beforeW = pngWidth(beforeBuf);
const before = { url: "data:image/png;base64," + beforeBuf.toString("base64"), cellW: Math.round(beforeW / 6), sx: 0 };

const OUT_W = 140;
const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: Math.max(7, 2) * (OUT_W * SCALE + 16) + 180, height: 2 * (CELL_H * SCALE + 48) + 80, deviceScaleFactor: 1 });

await page.setContent(`<!doctype html><html><head><style>
  body{margin:0;background:#15131a;font-family:monospace;color:#d8cfe0;padding:18px}
  h2{color:#e8b84b;margin:2px 0 14px}
  .row{display:flex;align-items:center;margin-bottom:18px}
  .tag{width:150px;font-size:15px;font-weight:bold;text-transform:uppercase}
  .bad{color:#ff7a7a}.good{color:#8fe08f}
  .cell{margin-right:16px;text-align:center}
  .cell canvas{image-rendering:pixelated;background:#0d0b12;border:1px solid #3a3346}
  .lab{font-size:12px;margin-top:4px;color:#bfb4d0}
</style></head><body>
  <h2>CAS-369 — warrior sprite: BEFORE (wrong) vs AFTER (restored) + full animated set</h2>
  <div class="row"><div class="tag bad">BEFORE · live (wrong)</div>
    <div class="cell"><canvas id="b0" width="${OUT_W*SCALE}" height="${CELL_H*SCALE}"></canvas><div class="lab">brown-haired Clarice (idle)</div></div>
  </div>
  <div class="row"><div class="tag good">AFTER · now live</div>
    ${after.map((c,i)=>`<div class="cell"><canvas id="a${i}" width="${OUT_W*SCALE}" height="${CELL_H*SCALE}"></canvas><div class="lab">${c.label}</div></div>`).join("")}
  </div>
</body></html>`);

await page.evaluate(async ({ after, before, OUT_W, CELL_H, SCALE }) => {
  const draw = async (id, c) => {
    const img = new Image(); img.src = c.url;
    await img.decode();
    const cv = document.getElementById(id); const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, c.sx, 0, c.cellW, c.cellH || img.height, 0, 0, OUT_W*SCALE, CELL_H*SCALE);
  };
  await draw("b0", before);
  for (let i=0;i<after.length;i++) await draw("a"+i, after[i]);
}, { after, before, OUT_W, CELL_H, SCALE });

const out = join(ROOT, "assets/erw/hero/gen/cas369-strawhat-montage.png");
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
