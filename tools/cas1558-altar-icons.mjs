// CAS-1558 — Meta-progression altar node icons (5 + Esencia currency).
// Hand-plotted pixel art, 32x32 native RGBA PNG, transparent bg.
// STYLE FORMULA (frozen, CAS-415): 32px native, reads on panel #12141b,
// dark-fantasy palette (steel #dfe6f0, gold #ffd24d, crimson #c8313a,
// frost #7fd6ff), 1px dark outline, integer-scale only.
// Zero deps: PNG encoded via built-in zlib.
import zlib from "zlib";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTDIR = path.join(ROOT, "assets/ui/icons");
const S = 32;

// ---- palette (locked to HUD formula) ----
const C = {
  out:   [11, 13, 22, 255],   // dark outline
  // crimson (HP)
  red:   [200, 49, 58, 255], redS: [143, 32, 40, 255], redH: [255, 107, 116, 255],
  // steel (blade / bone)
  stl:   [223, 230, 240, 255], stlS: [154, 166, 184, 255], stlH: [255, 255, 255, 255],
  // gold
  gld:   [255, 210, 77, 255], gldS: [200, 149, 31, 255], gldH: [255, 236, 160, 255],
  // leather (boot)
  lea:   [138, 90, 47, 255], leaS: [92, 58, 28, 255], leaH: [181, 124, 69, 255],
  // frost / wind
  cyn:   [127, 214, 255, 255], cynH: [205, 240, 255, 255], cynS: [70, 150, 205, 255],
  // essence (arcane)
  ess:   [181, 123, 255, 255], essS: [122, 69, 200, 255], essH: [224, 196, 255, 255],
  core:  [155, 231, 255, 255],
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
function ring(img, cx, cy, r, c, thick = 1) {
  for (let a = 0; a < 360; a += 3)
    for (let t = 0; t < thick; t++) {
      const rr = r - t;
      const x = Math.round(cx + rr * Math.cos(a * Math.PI / 180));
      const y = Math.round(cy + rr * Math.sin(a * Math.PI / 180));
      px(img, x, y, c);
    }
}
function line(img, x0, y0, x1, y1, c) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  while (true) { px(img, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
}
const isSet = (img, x, y) => inB(x, y) && img[y * S + x][3] !== 0;
// auto-outline: any transparent pixel 4-adjacent to a filled one becomes outline
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

// ---------- 1. hpMax : crimson heart + gold plus ----------
function hpMax() {
  const img = newImg();
  const heart = (cx, cy, c) => {
    disc(img, cx - 4, cy, 5, c); disc(img, cx + 4, cy, 5, c);
    for (let y = 0; y <= 12; y++) { const w = 9 - Math.round(y * 0.72); hline(img, cx - w, cx + w, cy + y, c); }
  };
  heart(15, 13, C.red);
  // shading
  disc(img, 11, 11, 3, C.redH); px(img, 12, 9, C.redH); px(img, 13, 9, C.redH);
  for (let y = 8; y <= 22; y++) { const w = 9 - Math.round(Math.max(0, y - 13) * 0.72); if (y >= 13) px(img, 15 + w - 1, y, C.redS); px(img, 15 + w, y, C.redS); }
  hline(img, 12, 18, 24, C.redS);
  // gold "+" badge top-right (max/increase)
  rect(img, 23, 2, 2, 8, C.gld); rect(img, 20, 4, 8, 2, C.gld);
  px(img, 23, 2, C.gldH); px(img, 20, 4, C.gldH);
  rect(img, 24, 6, 1, 4, C.gldS); hline(img, 22, 27, 6, C.gldS);
  return img;
}

// ---------- 2. dmg : upright steel sword, gold guard ----------
function dmg() {
  const img = newImg();
  // blade (tapered, tip up)
  for (let y = 4; y <= 21; y++) { const w = y < 7 ? y - 4 : 2; hline(img, 15 - w, 15 + w, y, C.stl); }
  // blade highlight & shadow edges
  vline(img, 13, 8, 21, C.stlH); vline(img, 17, 8, 21, C.stlS); px(img, 15, 4, C.stlH);
  // crossguard
  rect(img, 9, 22, 14, 2, C.gld); hline(img, 9, 22, 23, C.gldS); px(img, 9, 22, C.gldH); px(img, 22, 22, C.gldH);
  // grip
  rect(img, 13, 24, 4, 5, C.leaS);
  for (let y = 24; y <= 28; y += 2) hline(img, 13, 16, y, C.lea);
  // pommel
  disc(img, 15, 29, 2, C.gld); px(img, 14, 28, C.gldH);
  return img;
}

// ---------- 3. moveSpd : leather boot + cyan wind streaks ----------
function moveSpd() {
  const img = newImg();
  // wind streaks (behind, left)
  hline(img, 2, 11, 10, C.cyn); hline(img, 4, 13, 15, C.cynH); hline(img, 2, 10, 20, C.cyn);
  px(img, 11, 10, C.cynH); px(img, 13, 15, C.cynH); px(img, 10, 20, C.cynH);
  // boot shaft
  rect(img, 16, 7, 7, 14, C.lea);
  vline(img, 16, 7, 20, C.leaH); vline(img, 22, 8, 20, C.leaS);
  // foot (points right)
  rect(img, 16, 21, 12, 5, C.lea);
  hline(img, 16, 27, 25, C.leaS); // sole shadow
  rect(img, 16, 26, 13, 2, C.leaS); // sole
  px(img, 27, 22, C.leaH);
  // cuff + buckle
  rect(img, 15, 6, 9, 2, C.leaH);
  rect(img, 18, 13, 3, 2, C.gld); px(img, 18, 13, C.gldH);
  return img;
}

// ---------- 4. reroll : cyan cycle arrows + bone die ----------
function reroll() {
  const img = newImg();
  // cycle ring (two arcs w/ gap top & bottom)
  for (let a = 30; a <= 150; a += 4) { const x = Math.round(15 + 13 * Math.cos(a * Math.PI / 180)); const y = Math.round(15 + 13 * Math.sin(a * Math.PI / 180)); px(img, x, y, C.cyn); px(img, x, y - 1, C.cynH); }
  for (let a = 210; a <= 330; a += 4) { const x = Math.round(15 + 13 * Math.cos(a * Math.PI / 180)); const y = Math.round(15 + 13 * Math.sin(a * Math.PI / 180)); px(img, x, y, C.cyn); px(img, x, y + 1, C.cynS); }
  // arrowheads
  const ah = (x, y, dir) => { for (let k = 0; k < 4; k++) { vline(img, x + dir * k, y - k, y + k, C.cynH); } };
  ah(3, 15, 1); ah(27, 15, -1);
  // die (rotated square, bone)
  const dieCx = 15, dieCy = 15;
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) <= 6) px(img, dieCx + x, dieCy + y, C.stl);
  for (let y = -6; y <= 0; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) <= 6) { if ((x + y) % 2 === 0) px(img, dieCx + x, dieCy + y, C.stlH); }
  for (let y = 1; y <= 6; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) <= 6) px(img, dieCx + x, dieCy + y, C.stlS);
  // re-lay face w/ base then pips
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) <= 6) px(img, dieCx + x, dieCy + y, y < 0 ? C.stl : (y === 0 ? C.stl : C.stlS));
  // pips (5-face) dark
  const pip = (x, y) => rect(img, dieCx + x - 1, dieCy + y - 1, 2, 2, C.out);
  pip(0, 0); pip(-3, -3); pip(3, 3); pip(3, -3); pip(-3, 3);
  return img;
}

// ---------- 5. startGold : gold coin stack ----------
function startGold() {
  const img = newImg();
  const coin = (cy) => {
    for (let y = -2; y <= 2; y++) { const w = 9 - Math.abs(y) * 2; hline(img, 15 - w, 15 + w, cy + y, C.gld); }
    hline(img, 7, 23, cy - 2, C.gldH); hline(img, 8, 22, cy + 2, C.gldS);
    px(img, 9, cy - 1, C.gldH);
  };
  coin(24); coin(19); coin(14);
  // top coin face detail: little star / shine
  rect(img, 14, 13, 3, 3, C.gldH); px(img, 15, 14, C.gldS);
  hline(img, 11, 19, 9, C.gldH);
  return img;
}

// ---------- 6. essence : arcane violet shard (currency) ----------
function essence() {
  const img = newImg();
  // diamond
  for (let y = 5; y <= 27; y++) {
    let w;
    if (y <= 13) w = Math.round((y - 5) * 1.15);
    else w = Math.round((27 - y) * 0.85);
    hline(img, 15 - w, 15 + w, y, C.ess);
  }
  // facets: left lit, right shadow, center core
  for (let y = 5; y <= 13; y++) { const w = Math.round((y - 5) * 1.15); line(img, 15, 5, 15 - w, 13, C.essH); }
  for (let y = 13; y <= 27; y++) { const w = Math.round((27 - y) * 0.85); px(img, 15 + w, y, C.essS); px(img, 15 + w - 1, y, C.essS); }
  vline(img, 15, 6, 26, C.essH);
  // bright core
  disc(img, 15, 14, 2, C.core); px(img, 15, 13, [255, 255, 255, 255]);
  // sparkles
  px(img, 24, 8, C.essH); px(img, 7, 18, C.essH); px(img, 22, 22, C.core);
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
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

const set = { altar_hpmax: hpMax, altar_dmg: dmg, altar_movespd: moveSpd, altar_reroll: reroll, altar_startgold: startGold, altar_essence: essence };
for (const [name, fn] of Object.entries(set)) {
  const img = fn(); outline(img);
  const buf = encodePNG(img);
  const fp = path.join(OUTDIR, name + ".png");
  fs.writeFileSync(fp, buf);
  console.log(name + ".png", buf.length + "B", "md5=" + crypto.createHash("md5").update(buf).digest("hex").slice(0, 8));
}
console.log("done ->", OUTDIR);
