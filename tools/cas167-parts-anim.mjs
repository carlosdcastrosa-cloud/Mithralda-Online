// ===========================================================================
// tools/cas167-parts-anim.mjs — CAS-167 phase2 art dep: turn the static part
// masks (tools/cas167-parts.mjs) into per-part ANIMATED value-mask strips so the
// engineer's bake produces a hero that WALKS while keeping every part separately
// recolorable. Reuses the EXACT CAS-167 animation offset model:
//   walk (8f): body footfall bob; legs split L/R swing+lift (opposite phase)
//   idle (6f): gentle breathing bob, feet planted
// Body parts (hood/cloak/sash/helmet/nocape/longcape) ride the body bob; legs
// swing. All in the shared 140x166 cell (anchorX 65, foot 163, figureH 160), so
// the parts composite frame-aligned. Output keeps the gray+alpha value (NO tint)
// — the runtime tints per the player's palette at bake time.
//
// Emits assets/erw/hero/parts/<part>_{idle,walk}.png + a verification montage
// tools/cas167-parts-anim-proof.png (tint+composite default palette across the
// walk cycle — must read as the same walking hooded figure as cas167-gamescale).
// Run: node tools/cas167-parts-anim.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "parts");
const PARTS = ["hood", "cloak", "sash", "legs", "helmet", "nocape", "longcape"];
const BODY = new Set(["hood", "cloak", "sash", "helmet", "nocape", "longcape"]); // bob; legs swing
const masks = {}; for (const p of PARTS) masks[p] = readFileSync(join(DIR, p + ".png")).toString("base64");
const defPal = JSON.parse(readFileSync(join(DIR, "parts.json"))).defaultPalettes.warrior;

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const result = await page.evaluate(async (masks, PARTS, BODY, defPal) => {
  const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160;
  const FW = 58, FH = 158, IDLE_FC = 6, WALK_FC = 8, R = Math.round, TAU = Math.PI * 2;
  const bodySet = new Set(BODY);
  async function im(b) { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); return i; }

  // scale a native mask into a 140x166 cell layer (figureH=160, feet on FOOT, centroid on ANCHOR_X)
  function toCell(img) {
    const scale = FIGURE_H / FH, dw = R(FW * scale), dh = FIGURE_H;
    const dx = R(ANCHOR_X - dw / 2), dy = FOOT - dh;
    const c = document.createElement("canvas"); c.width = CELL_W; c.height = CELL_H;
    const cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0, FW, FH, dx, dy, dw, dh);
    return c;
  }
  // split a cell layer into L/R halves at the opaque centroid
  function splitLR(cell) {
    const cx = cell.getContext("2d", { willReadFrequently: true }); const d = cx.getImageData(0, 0, CELL_W, CELL_H).data;
    let sum = 0, n = 0; for (let j = 0; j < CELL_H; j++) for (let i = 0; i < CELL_W; i++) if (d[(j * CELL_W + i) * 4 + 3] > 24) { sum += i; n++; }
    const sx = n ? R(sum / n) : ANCHOR_X;
    const mk = () => { const c = document.createElement("canvas"); c.width = CELL_W; c.height = CELL_H; return [c, c.getContext("2d").createImageData(CELL_W, CELL_H)]; };
    const [L, li] = mk(), [Rc, ri] = mk();
    for (let j = 0; j < CELL_H; j++) for (let i = 0; i < CELL_W; i++) { const o = (j * CELL_W + i) * 4; if (d[o + 3] < 8) continue; const t = (i < sx) ? li : ri; t.data[o] = d[o]; t.data[o + 1] = d[o + 1]; t.data[o + 2] = d[o + 2]; t.data[o + 3] = d[o + 3]; }
    L.getContext("2d").putImageData(li, 0, 0); Rc.getContext("2d").putImageData(ri, 0, 0);
    return { L, R: Rc };
  }
  function frameCanvas() { const c = document.createElement("canvas"); c.width = CELL_W; c.height = CELL_H; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; return [c, x]; }
  function stripURL(frames) { const c = document.createElement("canvas"); c.width = CELL_W * frames.length; c.height = CELL_H; const x = c.getContext("2d"); x.imageSmoothingEnabled = false; frames.forEach((f, k) => x.drawImage(f, k * CELL_W, 0)); return c.toDataURL("image/png"); }

  // offsets identical to cas167-build-classes.mjs
  function walkOff(f) { const p = f / WALK_FC * TAU; return { bodyDY: R(-Math.abs(Math.sin(p)) * 3), lDX: R(Math.sin(p) * 4), lDY: R(-Math.max(0, Math.sin(p)) * 3), rDX: R(Math.sin(p + Math.PI) * 4), rDY: R(-Math.max(0, Math.sin(p + Math.PI)) * 3) }; }
  function idleOff(f) { const p = f / IDLE_FC * TAU; return { bodyDY: R(-(Math.sin(p) * 0.5 + 0.5) * 1.2) }; }

  const cells = {}, out = {};
  for (const p of PARTS) cells[p] = toCell(await im(masks[p]));
  const legParts = splitLR(cells.legs);

  for (const p of PARTS) {
    const isBody = bodySet.has(p);
    // idle
    const idle = [];
    for (let f = 0; f < IDLE_FC; f++) {
      const [c, x] = frameCanvas(); const o = idleOff(f);
      if (isBody) x.drawImage(cells[p], 0, o.bodyDY);
      else x.drawImage(cells[p], 0, 0);          // legs: planted in idle
      idle.push(c);
    }
    out[p + "_idle"] = stripURL(idle);
    // walk
    const walk = [];
    for (let f = 0; f < WALK_FC; f++) {
      const [c, x] = frameCanvas(); const o = walkOff(f);
      if (p === "legs") { x.drawImage(legParts.L, o.lDX, o.lDY); x.drawImage(legParts.R, o.rDX, o.rDY); }
      else x.drawImage(cells[p], 0, o.bodyDY);
      walk.push(c);
    }
    out[p + "_walk"] = stripURL(walk);
  }

  // ---- verification montage: tint+composite default (hood+cloak+sash+legs) over the walk cycle ----
  function tint(maskCanvas, col) {
    const mx = maskCanvas.getContext("2d", { willReadFrequently: true }); const md = mx.getImageData(0, 0, CELL_W, CELL_H).data;
    const c = document.createElement("canvas"); c.width = CELL_W; c.height = CELL_H; const cx = c.getContext("2d"); const id = cx.createImageData(CELL_W, CELL_H); const od = id.data;
    for (let n = 0; n < CELL_W * CELL_H; n++) { const o = n * 4; const a = md[o + 3]; if (a < 8) continue; const fct = md[o] / 165; od[o] = Math.min(255, col[0] * fct); od[o + 1] = Math.min(255, col[1] * fct); od[o + 2] = Math.min(255, col[2] * fct); od[o + 3] = a; }
    cx.putImageData(id, 0, 0); return c;
  }
  async function partFrame(part, kind, f) { const img = new Image(); img.src = out[part + "_" + kind]; await img.decode(); const c = document.createElement("canvas"); c.width = CELL_W; c.height = CELL_H; c.getContext("2d").drawImage(img, f * CELL_W, 0, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H); return c; }
  const Z = 2.4, pad = 6;
  const mont = document.createElement("canvas"); mont.width = pad + WALK_FC * (CELL_W * Z * 0.5 + pad); mont.height = 40 + CELL_H * Z;
  const vx = mont.getContext("2d"); vx.imageSmoothingEnabled = false; vx.fillStyle = "#222a36"; vx.fillRect(0, 0, mont.width, mont.height); vx.font = "12px monospace"; vx.fillStyle = "#bdf"; vx.fillText("per-part strips → tint+composite, WALK cycle (warrior default)", 6, 16);
  for (let f = 0; f < WALK_FC; f++) {
    const [comp, ccx] = frameCanvas();
    ccx.drawImage(tint(await partFrame("legs", "walk", f), defPal.legs), 0, 0);
    ccx.drawImage(tint(await partFrame("cloak", "walk", f), defPal.cloak), 0, 0);
    ccx.drawImage(tint(await partFrame("sash", "walk", f), defPal.sash), 0, 0);
    ccx.drawImage(tint(await partFrame("hood", "walk", f), defPal.hood), 0, 0);
    const ox = pad + f * (CELL_W * Z * 0.5 + pad);
    vx.fillStyle = "#3a3f4a"; vx.fillRect(ox, 24, CELL_W * Z * 0.5, CELL_H * Z);
    vx.imageSmoothingEnabled = false; vx.drawImage(comp, 25, 30, 90, CELL_H - 30, ox, 24, CELL_W * Z * 0.5, CELL_H * Z);
  }

  return { out, montage: mont.toDataURL("image/png"), splitX: legParts ? "ok" : "no" };
}, masks, PARTS, [...BODY], defPal);

let n = 0;
for (const k in result.out) { writeFileSync(join(DIR, k + ".png"), Buffer.from(result.out[k].split(",")[1], "base64")); n++; }
writeFileSync(join(ROOT, "tools", "cas167-parts-anim-proof.png"), Buffer.from(result.montage.split(",")[1], "base64"));
console.log("wrote", n, "per-part animated strips (idle 6f + walk 8f) + verification montage");
await browser.close();
