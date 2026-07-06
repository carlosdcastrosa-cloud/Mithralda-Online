// CAS-1566 — Tier-2 altar node icons (5) + Ascension badge (1).
// v2 of CAS-1558. Hand-plotted pixel art, 32x32 native RGBA PNG, transparent bg.
// STYLE FORMULA (frozen, CAS-415/1558): 32px native, reads on panel #12141b,
// dark-fantasy palette (steel #dfe6f0, gold #ffd24d, crimson #c8313a,
// frost #7fd6ff, arcane #b57bff), 1px dark outline, integer-scale only.
// Same helpers/palette as tools/cas1558-altar-icons.mjs so the set stays coherent.
// Keys -> altar_<key.toLowerCase()>.png (1:1 with GE wiring, CAS-1562/417 fallback).
// Zero deps: PNG encoded via built-in zlib.
import zlib from "zlib";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTDIR = path.join(ROOT, "assets/ui/icons");
const S = 32;

// ---- palette (locked to HUD/altar-v1 formula) ----
const C = {
  out:   [11, 13, 22, 255],   // dark outline
  red:   [200, 49, 58, 255], redS: [143, 32, 40, 255], redH: [255, 107, 116, 255],
  stl:   [223, 230, 240, 255], stlS: [154, 166, 184, 255], stlH: [255, 255, 255, 255],
  gld:   [255, 210, 77, 255], gldS: [200, 149, 31, 255], gldH: [255, 236, 160, 255],
  lea:   [138, 90, 47, 255], leaS: [92, 58, 28, 255], leaH: [181, 124, 69, 255],
  cyn:   [127, 214, 255, 255], cynH: [205, 240, 255, 255], cynS: [70, 150, 205, 255],
  ess:   [181, 123, 255, 255], essS: [122, 69, 200, 255], essH: [224, 196, 255, 255],
  core:  [155, 231, 255, 255],
  wht:   [255, 255, 255, 255],
  grn:   [123, 212, 74, 255],
};

function newImg() { return Array.from({ length: S * S }, () => [0, 0, 0, 0]); }
const inB = (x, y) => x >= 0 && x < S && y >= 0 && y < S;
function px(img, x, y, c) { if (inB(x, y)) img[y * S + x] = c.slice(); }
function rect(img, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, x + i, y + j, c); }
function hline(img, x0, x1, y, c) { for (let x = x0; x <= x1; x++) px(img, x, y, c); }
function vline(img, x, y0, y1, c) { for (let y = y0; y <= y1; y++) px(img, x, y, c); }
function disc(img, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r + r * 0.4) px(img, cx + x, cy + y, c);
}
function line(img, x0, y0, x1, y1, c) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  while (true) { px(img, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
}
const isSet = (img, x, y) => inB(x, y) && img[y * S + x][3] !== 0;
function outline(img, c = C.out) {
  const add = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (isSet(img, x, y)) continue;
    if (isSet(img, x - 1, y) || isSet(img, x + 1, y) || isSet(img, x, y - 1) || isSet(img, x, y + 1) ||
        isSet(img, x - 1, y - 1) || isSet(img, x + 1, y - 1) || isSet(img, x - 1, y + 1) || isSet(img, x + 1, y + 1))
      add.push([x, y]);
  }
  for (const [x, y] of add) px(img, x, y, c);
}
// 4-point sparkle star (top-right accent, "boon" mark)
function sparkle(img, cx, cy, r, c, ch) {
  vline(img, cx, cy - r, cy + r, c); hline(img, cx - r, cx + r, cy, c);
  for (let k = 1; k <= r - 1; k++) { px(img, cx - k, cy - (r - k), c); px(img, cx + k, cy - (r - k), c); px(img, cx - k, cy + (r - k), c); px(img, cx + k, cy + (r - k), c); }
  px(img, cx, cy, ch); px(img, cx, cy - 1, ch);
}
// small gold "+" badge (extra / tier marker)
function plusBadge(img, x, y) {
  rect(img, x, y - 3, 2, 8, C.gld); rect(img, x - 3, y, 8, 2, C.gld);
  px(img, x, y - 3, C.gldH); px(img, x - 3, y, C.gldH);
  px(img, x + 1, y + 4, C.gldS); px(img, x + 4, y + 1, C.gldS);
}

// ---------- 1. t2_boonrare : rare (blue) faceted gem + gold boon sparkle ----------
function boonRare() {
  const img = newImg();
  // hexagon-cut gem, frost/blue = "rare"
  const cx = 14;
  for (let y = 8; y <= 26; y++) {
    let w;
    if (y <= 12) w = 3 + (y - 8);           // crown widening
    else if (y <= 15) w = 7;                // girdle
    else w = Math.round((26 - y) * 0.9);    // pavilion taper
    hline(img, cx - w, cx + w, y, C.cyn);
  }
  // table facet (top) highlight
  rect(img, cx - 4, 8, 9, 2, C.cynH); hline(img, cx - 6, cx + 7, 12, C.cynH);
  // left lit facet / right shadow facet
  for (let y = 12; y <= 26; y++) { const w = y <= 15 ? 7 : Math.round((26 - y) * 0.9); line(img, cx, 15, cx - w, y, C.cynH); px(img, cx + w, y, C.cynS); px(img, cx + w - 1, y, C.cynS); }
  vline(img, cx, 10, 24, C.cynH);
  disc(img, cx, 14, 2, C.wht);
  // gold "boon" sparkle top-right
  sparkle(img, 25, 7, 4, C.gld, C.gldH);
  px(img, 22, 22, C.cynH); px(img, 6, 20, C.cynH);
  return img;
}

// ---------- 2. t2_startboon : gift box (blessing granted at run start) ----------
function startBoon() {
  const img = newImg();
  // box body (violet arcane = boon)
  rect(img, 7, 14, 18, 12, C.ess);
  vline(img, 7, 14, 25, C.essH); hline(img, 8, 23, 25, C.essS); vline(img, 24, 15, 25, C.essS);
  rect(img, 8, 15, 15, 2, C.essH); // lid overhang top-lit
  // lid
  rect(img, 6, 11, 20, 4, C.essS);
  hline(img, 6, 25, 11, C.essH);
  // ribbon vertical (crimson) + horizontal
  rect(img, 14, 11, 3, 15, C.red); vline(img, 14, 11, 25, C.redH); vline(img, 16, 11, 25, C.redS);
  hline(img, 6, 25, 18, C.red); hline(img, 6, 25, 17, C.redH);
  // bow loops on top
  disc(img, 12, 9, 2, C.red); disc(img, 19, 9, 2, C.red);
  px(img, 12, 8, C.redH); px(img, 19, 8, C.redH);
  rect(img, 14, 8, 3, 3, C.redS);
  // gold sparkle over the gift
  sparkle(img, 25, 6, 3, C.gld, C.gldH);
  return img;
}

// ---------- 3. t2_dashiframe : steel shield + cyan dash streaks (invuln dash) ----------
function dashIframe() {
  const img = newImg();
  // dash speed streaks trailing left
  hline(img, 1, 9, 9, C.cyn); px(img, 10, 9, C.cynH);
  hline(img, 2, 8, 22, C.cyn); px(img, 9, 22, C.cynH);
  hline(img, 0, 6, 15, C.cynH);
  // heraldic shield (points down), steel with cyan rim glow
  const cx = 19;
  for (let y = 7; y <= 24; y++) {
    let w;
    if (y <= 20) w = 8;
    else w = 8 - Math.round((y - 20) * 2.1);
    if (w < 0) w = 0;
    hline(img, cx - w, cx + w, y, C.stl);
  }
  // top rim + bevel
  rect(img, cx - 8, 7, 17, 2, C.stlH);
  vline(img, cx - 8, 8, 20, C.stlH); vline(img, cx + 8, 8, 20, C.stlS);
  for (let y = 21; y <= 24; y++) { const w = 8 - Math.round((y - 20) * 2.1); if (w >= 0) px(img, cx + w, y, C.stlS); }
  // cyan invuln glimmer on the shield face (chevron)
  line(img, cx - 5, 11, cx, 17, C.cynH); line(img, cx, 17, cx + 5, 11, C.cynH);
  disc(img, cx, 13, 1, C.core);
  return img;
}

// ---------- 4. t2_zonechest : wooden treasure chest, gold bands + lock ----------
function zoneChest() {
  const img = newImg();
  // lid (rounded top)
  for (let y = 8; y <= 13; y++) { const w = 11 - Math.max(0, 12 - y) * 0; hline(img, 15 - 11, 15 + 11, y, C.lea); }
  // round the lid corners
  px(img, 4, 8, [0,0,0,0]); px(img, 26, 8, [0,0,0,0]); px(img, 4, 9, [0,0,0,0]); px(img, 26, 9, [0,0,0,0]);
  hline(img, 6, 24, 8, C.leaH);
  // body
  rect(img, 4, 14, 23, 12, C.lea);
  hline(img, 5, 25, 25, C.leaS); vline(img, 4, 14, 25, C.leaH); vline(img, 26, 14, 25, C.leaS);
  // plank shading
  vline(img, 10, 15, 25, C.leaS); vline(img, 20, 15, 25, C.leaS);
  // gold bands (left, right, mid) around lid+body
  vline(img, 7, 8, 25, C.gld); vline(img, 23, 8, 25, C.gld);
  px(img, 7, 8, C.gldH); px(img, 23, 8, C.gldH);
  // lid/body seam gold rim
  hline(img, 4, 26, 13, C.gld); hline(img, 5, 25, 13, C.gldH);
  // lock plate
  rect(img, 13, 15, 5, 5, C.gld); rect(img, 14, 16, 3, 3, C.gldS);
  px(img, 15, 17, C.out); px(img, 15, 18, C.out); // keyhole
  px(img, 13, 15, C.gldH);
  // treasure glow peeking under lid
  hline(img, 9, 21, 14, C.gldH);
  return img;
}

// ---------- 5. t2_reroll : cycle arrows + bone die + gold "+" (extra reroll) ----------
function t2Reroll() {
  const img = newImg();
  const cx = 14, cy = 16;
  // cycle ring (two arcs w/ gap left & right)
  for (let a = 35; a <= 145; a += 4) { const x = Math.round(cx + 12 * Math.cos(a * Math.PI / 180)); const y = Math.round(cy + 12 * Math.sin(a * Math.PI / 180)); px(img, x, y, C.cyn); px(img, x, y + 1, C.cynS); }
  for (let a = 215; a <= 325; a += 4) { const x = Math.round(cx + 12 * Math.cos(a * Math.PI / 180)); const y = Math.round(cy + 12 * Math.sin(a * Math.PI / 180)); px(img, x, y, C.cyn); px(img, x, y - 1, C.cynH); }
  // arrowheads
  const ah = (x, y, dir) => { for (let k = 0; k < 4; k++) vline(img, x + dir * k, y - k, y + k, C.cynH); };
  ah(cx, 28, 1); ah(cx, 4, -1);
  // die (rotated square, bone)
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) <= 6) px(img, cx + x, cy + y, y < 0 ? C.stlH : (y === 0 ? C.stl : C.stlS));
  // pips (5-face)
  const pip = (x, y) => rect(img, cx + x - 1, cy + y - 1, 2, 2, C.out);
  pip(0, 0); pip(-3, -3); pip(3, 3); pip(3, -3); pip(-3, 3);
  // gold "+" badge (marks extra tier-2 reroll charge)
  plusBadge(img, 26, 6);
  return img;
}

// ---------- 6. ascension : radiant gold rising chevrons + star (rank marker) ----------
function ascension() {
  const img = newImg();
  const cx = 15;
  // three stacked upward chevrons (rank tiers), widening downward
  const chevron = (y, half, c, ch) => {
    for (let k = 0; k <= half; k++) { px(img, cx - k, y + k, c); px(img, cx + k, y + k, c); px(img, cx - k, y + k + 1, c); px(img, cx + k, y + k + 1, c); }
    px(img, cx, y, ch);
  };
  chevron(20, 7, C.gldS, C.gld);
  chevron(15, 7, C.gld, C.gldH);
  chevron(10, 7, C.gldH, C.wht);
  // crowning radiant star at apex
  disc(img, cx, 6, 2, C.gld);
  sparkle(img, cx, 6, 4, C.gldH, C.wht);
  // upward light rays
  px(img, cx - 6, 3, C.gldH); px(img, cx + 6, 3, C.gldH);
  px(img, cx - 9, 6, C.gld); px(img, cx + 9, 6, C.gld);
  return img;
}

// ---------- PNG encode ----------
function encodePNG(img) {
  const raw = Buffer.alloc((S * 4 + 1) * S);
  let o = 0;
  for (let y = 0; y < S; y++) { raw[o++] = 0; for (let x = 0; x < S; x++) { const p = img[y * S + x]; raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3]; } }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

const set = {
  altar_t2_boonrare: boonRare,
  altar_t2_startboon: startBoon,
  altar_t2_dashiframe: dashIframe,
  altar_t2_zonechest: zoneChest,
  altar_t2_reroll: t2Reroll,
  altar_ascension: ascension,
};
for (const [name, fn] of Object.entries(set)) {
  const img = fn(); outline(img);
  const buf = encodePNG(img);
  const fp = path.join(OUTDIR, name + ".png");
  fs.writeFileSync(fp, buf);
  console.log(name + ".png", buf.length + "B", "md5=" + crypto.createHash("md5").update(buf).digest("hex").slice(0, 8));
}
console.log("done ->", OUTDIR);
