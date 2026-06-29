// ===========================================================================
// tools/cas167-parts.mjs — CAS-167 (phase 2): split the canonical Main Character
// into independently RECOLORABLE part masks + derive the variation pieces
// (helmet / no-cape / long-cape), so the player can recolor each part and pick a
// silhouette variant — all from the SAME canonical design.
//
// PARTS (partition of every opaque pixel of art-reference/main-character.png):
//   hood  = cloak-colour crown + face cavity, local y < 34
//   cloak = torso/cape cloak-colour, 34 <= y < 110
//   sash  = the red diagonal (by colour)
//   legs  = dark lower body, y >= 110
// Each part is emitted as a VALUE-NORMALISED gray+alpha mask (luminance kept) so
// the runtime can tint it any colour by multiply and the shading ramp survives.
//
// VARIATIONS (derived, same silhouette family):
//   helmet   = hood footprint rebuilt as a metal dome + dark visor slit + crest
//   nocape   = cloak trimmed to the inner ~tunic columns (cape drape removed)
//   longcape = a cloak-colour drape extended behind the legs to the feet
//
// Emits assets/erw/hero/parts/{hood,cloak,sash,legs,helmet,nocape,longcape}.png
// (value masks) + parts.json (geom + default per-class palettes + slots), and a
// proof montage tools/cas167-parts-proof.png. The runtime bake (engineer) tints
// each part by the player's palette and composites into the existing 140x166
// clshero_/clswalk_ cells — reusing the whole CAS-167 render path.
// Run: node tools/cas167-parts.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(ROOT, "art-reference", "main-character.png");
const OUTDIR = join(ROOT, "assets", "erw", "hero", "parts");
mkdirSync(OUTDIR, { recursive: true });
const b64 = readFileSync(SRC).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const result = await page.evaluate(async (b64) => {
  // ---- decode + trim ----
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const sc = document.createElement("canvas"); sc.width = W; sc.height = H;
  const sx = sc.getContext("2d", { willReadFrequently: true }); sx.imageSmoothingEnabled = false; sx.drawImage(img, 0, 0);
  const sd = sx.getImageData(0, 0, W, H).data;
  let minx = W, miny = H, maxx = 0, maxy = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (sd[(j * W + i) * 4 + 3] > 10) { if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j; }
  const fw = maxx - minx + 1, fh = maxy - miny + 1;
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  const HEAD_BOTTOM = 34, LEG_TOP = 110;
  function part(x, y, r, g, b) {            // partition rule (local coords)
    if (y >= LEG_TOP) return "legs";
    if (r > 130 && r > g * 1.55 && r > b * 1.35) return "sash";
    if (y < HEAD_BOTTOM) return "hood";
    return "cloak";
  }

  // build a value-normalised gray+alpha mask (fw x fh) for one part name
  function maskOf(name) {
    const c = document.createElement("canvas"); c.width = fw; c.height = fh;
    const cx = c.getContext("2d"); const id = cx.createImageData(fw, fh); const od = id.data;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const so = ((j + miny) * W + (i + minx)) * 4, oo = (j * fw + i) * 4;
      const a = sd[so + 3]; if (a < 10) continue;
      const r = sd[so], g = sd[so + 1], b = sd[so + 2];
      if (part(i, j, r, g, b) !== name) continue;
      const L = Math.round(lum(r, g, b));
      od[oo] = od[oo + 1] = od[oo + 2] = L; od[oo + 3] = a;
    }
    cx.putImageData(id, 0, 0); return c;
  }

  const parts = {};
  for (const p of ["hood", "cloak", "sash", "legs"]) parts[p] = maskOf(p);

  // CAS-199: the hood's face-cavity was pitch black → reads as a HOLE. Lift the
  // INTERIOR dark pixels (those fully surrounded by opaque hood) to a coloured-dark
  // floor so the cowl tints to a dark hood SHADOW; keep the silhouette outline (dark
  // edge pixels touching transparency) crisp.
  (function liftCowlInterior() {
    const cx = parts.hood.getContext("2d"); const im = cx.getImageData(0, 0, fw, fh); const d = im.data;
    const A = (i, j) => (i < 0 || j < 0 || i >= fw || j >= fh) ? 0 : d[(j * fw + i) * 4 + 3];
    const out = new Uint8ClampedArray(d);
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const o = (j * fw + i) * 4; if (d[o + 3] < 10 || d[o] >= 60) continue;
      if (A(i - 1, j) > 10 && A(i + 1, j) > 10 && A(i, j - 1) > 10 && A(i, j + 1) > 10) { out[o] = out[o + 1] = out[o + 2] = 66; }
    }
    cx.putImageData(new ImageData(out, fw, fh), 0, 0);
  })();

  // ---- CAS-199: FACE ----------------------------------------------------------
  // The canonical hero reads as a HEADLESS cowl: the hood part is a crown over a
  // dark, empty face-cavity. Fill that cavity with a real face + glowing eyes so
  // every class (all derived from this one figure) has an unmistakable head.
  // Value-normalised gray+alpha like the other masks, but tinted at runtime by a
  // FIXED skin tone (never the class palette) → "same person, different role".
  function makeFace() {
    const hx = parts.hood.getContext("2d"); const hd = hx.getImageData(0, 0, fw, fh).data;
    // locate the dark face-cavity inside the head band (low luminance hood pixels)
    let minx = fw, miny = fh, maxx = 0, maxy = 0, found = false;
    for (let j = 0; j < HEAD_BOTTOM + 2; j++) for (let i = 0; i < fw; i++) {
      const o = (j * fw + i) * 4; if (hd[o + 3] < 20) continue;
      if (lum(hd[o], hd[o + 1], hd[o + 2]) < 78) { found = true; if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j; }
    }
    const c = document.createElement("canvas"); c.width = fw; c.height = fh; const cx = c.getContext("2d");
    const id = cx.createImageData(fw, fh); const od = id.data;
    if (!found) { cx.putImageData(id, 0, 0); return { canvas: c, box: null }; }
    const cw = maxx - minx + 1, ch = maxy - miny + 1, ccx = (minx + maxx) / 2;
    // INSET the face into the UPPER part of the cavity so the hood crown still frames
    // it (rim of cowl visible at the top + sides) and the lower cavity stays dark as a
    // neck/chest shadow. A face peering out of a hood, not a bald egg filling the cowl.
    const fcx = ccx;
    const faceTop = miny + Math.round(ch * 0.06);
    const faceH = Math.max(7, Math.round(ch * 0.60));
    const faceCy = faceTop + faceH / 2;
    const rx = Math.max(3, cw * 0.44);                    // fill most of the cavity (hood rim shows ~1px each side)
    const ry = faceH / 2;
    const px = (i, j, v) => { if (i < 0 || j < 0 || i >= fw || j >= fh) return; const o = (j * fw + i) * 4; od[o] = od[o + 1] = od[o + 2] = v; od[o + 3] = 255; };
    for (let j = faceTop; j <= faceTop + faceH; j++) for (let i = Math.round(fcx - rx) - 1; i <= Math.round(fcx + rx) + 1; i++) {
      const nx = (i - fcx) / rx, ny = (j - faceCy) / ry; if (nx * nx + ny * ny > 1) continue;
      const ty = (j - faceTop) / faceH;                   // 0 = brow … 1 = chin
      let v = 178;                                        // lit cheek
      if (ty < 0.26) v = 118;                             // brow in hood shadow
      else if (ty > 0.70) v = 132;                        // jaw shadow → roundness
      if (Math.abs(i - fcx) < 0.7 && ty > 0.34 && ty < 0.74) v = Math.min(214, v + 26); // nose-bridge highlight
      px(i, j, v);
    }
    // eyes — a dark socket with a bright glint just under it, one each side of the nose
    const eyeY = Math.round(faceTop + faceH * 0.40);
    const eyeDX = Math.max(1, Math.round(rx * 0.55));
    for (const ex of [Math.round(fcx - eyeDX), Math.round(fcx + eyeDX)]) {
      px(ex, eyeY, 74);          // socket / brow shadow
      px(ex, eyeY + 1, 250);     // glowing glint
    }
    cx.putImageData(id, 0, 0); return { canvas: c, box: { minx, miny, maxx, maxy } };
  }
  const faceR = makeFace(); parts.face = faceR.canvas;

  // ---- derived variation masks ----
  // helmet: hood footprint → solid dome (bright crown gray) + dark visor slit + crest
  function makeHelmet() {
    const hood = parts.hood; const hx = hood.getContext("2d"); const hd = hx.getImageData(0, 0, fw, fh).data;
    const c = document.createElement("canvas"); c.width = fw; c.height = fh; const cx = c.getContext("2d");
    const id = cx.createImageData(fw, fh); const od = id.data;
    // per row, find hood span; fill metal value (bright top → mid bottom)
    for (let j = 0; j < HEAD_BOTTOM + 4; j++) {
      let lo = 999, hi = -1; for (let i = 0; i < fw; i++) if (hd[(j * fw + i) * 4 + 3] > 10) { if (i < lo) lo = i; if (i > hi) hi = i; }
      if (hi < 0) continue;
      const t = j / (HEAD_BOTTOM + 4);
      let val = Math.round(210 - t * 70);                 // metal sheen top→mid
      const visor = (j >= 20 && j <= 27);                  // dark eye slit band
      for (let i = lo; i <= hi; i++) {
        const oo = (j * fw + i) * 4; let v = val;
        const cxn = (lo + hi) / 2;
        if (visor && Math.abs(i - cxn) > 2) v = 40;         // slit (leave nasal bar bright)
        if (i === lo || i === hi) v = 60;                   // rim
        od[oo] = od[oo + 1] = od[oo + 2] = v; od[oo + 3] = 255;
      }
    }
    // crest spike up the center top
    const midc = Math.round(fw / 2);
    for (let j = 0; j < 6; j++) { const oo = (j * fw + midc) * 4; od[oo] = od[oo + 1] = od[oo + 2] = 230; od[oo + 3] = 255; }
    cx.putImageData(id, 0, 0); return c;
  }
  // nocape: cloak trimmed to inner tunic columns (drop the wide cape drape)
  function makeNoCape() {
    const cl = parts.cloak; const lx = cl.getContext("2d"); const ld = lx.getImageData(0, 0, fw, fh).data;
    const c = document.createElement("canvas"); c.width = fw; c.height = fh; const cx = c.getContext("2d");
    const id = cx.createImageData(fw, fh); const od = id.data;
    for (let j = 0; j < fh; j++) {
      let lo = 999, hi = -1; for (let i = 0; i < fw; i++) if (ld[(j * fw + i) * 4 + 3] > 10) { if (i < lo) lo = i; if (i > hi) hi = i; }
      if (hi < 0) continue;
      const cxn = (lo + hi) / 2, keep = Math.max(5, (hi - lo) * 0.30);   // inner ~tunic
      for (let i = lo; i <= hi; i++) if (Math.abs(i - cxn) <= keep) { const oo = (j * fw + i) * 4; od[oo] = ld[oo]; od[oo + 1] = ld[oo + 1]; od[oo + 2] = ld[oo + 2]; od[oo + 3] = ld[oo + 3]; }
    }
    cx.putImageData(id, 0, 0); return c;
  }
  // longcape: a cloak-colour drape behind the legs, shoulders → feet (drawn behind)
  function makeLongCape() {
    const c = document.createElement("canvas"); c.width = fw; c.height = fh; const cx = c.getContext("2d");
    const id = cx.createImageData(fw, fh); const od = id.data;
    const midc = Math.round(fw / 2);
    for (let j = 40; j < fh; j++) {
      const t = (j - 40) / (fh - 40);
      const halfw = Math.round(10 + t * 12);                // widens toward the feet
      const val = Math.round(150 - t * 60 + (j % 2) * 8);    // shaded drape + vertical folds
      for (let i = midc - halfw; i <= midc + halfw; i++) { if (i < 0 || i >= fw) continue; const oo = (j * fw + i) * 4; od[oo] = od[oo + 1] = od[oo + 2] = (i === midc - halfw || i === midc + halfw) ? 70 : val; od[oo + 3] = 235; }
    }
    cx.putImageData(id, 0, 0); return c;
  }
  parts.helmet = makeHelmet();
  parts.nocape = makeNoCape();
  parts.longcape = makeLongCape();

  // export masks as dataURLs
  const out = {}; for (const k in parts) out[k] = parts[k].toDataURL("image/png");

  // ---------- PROOF montage ----------
  // tint a value mask by a color (multiply with mid-ref so shading survives)
  function tinted(maskCanvas, col) {
    const mx = maskCanvas.getContext("2d"); const md = mx.getImageData(0, 0, fw, fh).data;
    const c = document.createElement("canvas"); c.width = fw; c.height = fh; const cx = c.getContext("2d");
    const id = cx.createImageData(fw, fh); const od = id.data;
    for (let n = 0; n < fw * fh; n++) {
      const o = n * 4; const a = md[o + 3]; if (a < 8) continue;
      const f = md[o] / 165;                       // value factor (165 ≈ mid)
      od[o] = Math.min(255, col[0] * f); od[o + 1] = Math.min(255, col[1] * f); od[o + 2] = Math.min(255, col[2] * f); od[o + 3] = a;
    }
    cx.putImageData(id, 0, 0); return c;
  }
  // compose a full figure from a palette {hood,cloak,sash,legs} + variation flags
  function compose(pal, opts = {}) {
    const c = document.createElement("canvas"); c.width = fw; c.height = fh; const cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
    if (opts.longcape) cx.drawImage(tinted(parts.longcape, pal.cloak), 0, 0);    // behind
    cx.drawImage(tinted(parts.legs, pal.legs), 0, 0);
    cx.drawImage(tinted(opts.nocape ? parts.nocape : parts.cloak, pal.cloak), 0, 0);
    cx.drawImage(tinted(parts.sash, pal.sash), 0, 0);
    if (opts.helmet) cx.drawImage(tinted(parts.helmet, pal.hood), 0, 0);
    else { cx.drawImage(tinted(parts.hood, pal.hood), 0, 0); cx.drawImage(tinted(parts.face, SKIN), 0, 0); } // CAS-199: face under the cowl (helmet has its own visor)
    return c;
  }

  const SKIN = [226, 196, 162];   // CAS-199 fixed skin/glow tone for the face mask (class-independent)
  const BASE = { hood: [150, 174, 200], cloak: [150, 174, 200], sash: [200, 40, 60], legs: [40, 40, 46] };
  const Z = 3, pad = 10, cellW = fw * Z, cellH = fh * Z, labH = 22;
  const demos = [
    ["canonical", () => compose(BASE)],
    ["cloak=gold", () => compose({ ...BASE, hood: [210, 170, 70], cloak: [210, 170, 70] })],
    ["cloak=purple", () => compose({ ...BASE, hood: [150, 90, 200], cloak: [150, 90, 200] })],
    ["cloak=teal", () => compose({ ...BASE, hood: [70, 180, 175], cloak: [70, 180, 175] })],
    ["sash=cyan legs=tan", () => compose({ ...BASE, sash: [60, 200, 230], legs: [150, 120, 80] })],
    ["VAR helmet", () => compose({ ...BASE, hood: [200, 205, 215] }, { helmet: true })],
    ["VAR no-cape", () => compose(BASE, { nocape: true })],
    ["VAR long-cape", () => compose({ ...BASE, hood: [120, 60, 160], cloak: [120, 60, 160] }, { longcape: true })],
  ];
  const cols = demos.length;
  const cv = document.createElement("canvas"); cv.width = cols * (cellW + pad) + pad; cv.height = cellH + labH + pad * 2;
  const vx = cv.getContext("2d"); vx.imageSmoothingEnabled = false;
  vx.fillStyle = "#222a36"; vx.fillRect(0, 0, cv.width, cv.height); vx.font = "12px monospace";
  demos.forEach((d, k) => {
    const ox = pad + k * (cellW + pad);
    vx.fillStyle = "#3a3f4a"; vx.fillRect(ox, labH, cellW, cellH);
    vx.imageSmoothingEnabled = false; vx.drawImage(d[1](), 0, 0, fw, fh, ox, labH, cellW, cellH);
    vx.fillStyle = "#bdf"; vx.fillText(d[0], ox, 15);
  });

  return { out, fw, fh, proof: cv.toDataURL("image/png"), bounds: { HEAD_BOTTOM, LEG_TOP } };
}, b64);

for (const k in result.out) writeFileSync(join(OUTDIR, k + ".png"), Buffer.from(result.out[k].split(",")[1], "base64"));
writeFileSync(join(ROOT, "tools", "cas167-parts-proof.png"), Buffer.from(result.proof.split(",")[1], "base64"));
writeFileSync(join(OUTDIR, "parts.json"), JSON.stringify({
  _doc: "CAS-167 phase2: value-normalised (gray+alpha) recolorable part masks split from art-reference/main-character.png. Runtime tints each by the player's palette (multiply, mid-ref 165) and composites in z-order, then bakes into the 140x166 clshero_/clswalk_ cells. Variations swap a slot's mask.",
  figure: { fw: result.fw, fh: result.fh },
  bounds: result.bounds,
  zOrder: ["longcape", "legs", "cloak/nocape", "sash", "hood/helmet"],
  colorSlots: ["hood", "cloak", "sash", "legs"],
  variations: { headwear: ["hood", "helmet", "none"], cape: ["cape", "nocape", "longcape"] },
  defaultPalettes: {
    warrior: { hood: [150, 174, 200], cloak: [150, 174, 200], sash: [200, 40, 60], legs: [40, 40, 46] },
    paladin: { hood: [214, 176, 92], cloak: [214, 176, 92], sash: [180, 40, 50], legs: [40, 40, 46] },
    mage: { hood: [150, 96, 200], cloak: [150, 96, 200], sash: [70, 200, 225], legs: [40, 40, 46] },
    druid: { hood: [96, 168, 96], cloak: [96, 168, 96], sash: [150, 110, 60], legs: [40, 40, 46] },
    priest: { hood: [225, 222, 210], cloak: [225, 222, 210], sash: [220, 185, 90], legs: [40, 40, 46] },
  },
}, null, 2));
console.log("figure", result.fw + "x" + result.fh, "→ wrote", Object.keys(result.out).length, "masks + parts.json + proof");
await browser.close();
