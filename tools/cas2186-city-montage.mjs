// CAS-2186 — Tibia-ward city art module, Phase 1 verification montage.
// Composites the batch-1 city sprites (house, lamp, depot, temple) on a real
// cobblestone ground swatch (sliced from the generated Wang street tileset),
// bottom-center anchored on a 32px grid, at game density + 2x zoom, so the set
// can be judged at scale next to its siblings (STYLE_FORMULA_CITY.md checklist).
import zlib from "zlib";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CITY = path.join(ROOT, "assets/pixellab/city");

// --- robust PNG decode (all filter types 0-4, RGBA8) ---
function decodePNG(buf) {
  let o = 8, W, H, bitDepth, colorType; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o); const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === "IHDR") { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("only 8-bit supported, got " + bitDepth);
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : (() => { throw new Error("colorType " + colorType); })();
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * ch;
  const out = Buffer.alloc(stride * H);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let p = 0;
  for (let y = 0; y < H; y++) {
    const f = raw[p++];
    for (let x = 0; x < stride; x++) {
      const rawv = raw[p++];
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let v;
      if (f === 0) v = rawv; else if (f === 1) v = rawv + a; else if (f === 2) v = rawv + b;
      else if (f === 3) v = rawv + ((a + b) >> 1); else v = rawv + paeth(a, b, c);
      out[y * stride + x] = v & 0xff;
    }
  }
  const img = new Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (ch === 4) img[i] = [out[i*4], out[i*4+1], out[i*4+2], out[i*4+3]];
    else if (ch === 3) img[i] = [out[i*3], out[i*3+1], out[i*3+2], 255];
    else img[i] = [out[i], out[i], out[i], 255];
  }
  return { W, H, img };
}

function encodePNG(W, H, px) {
  const stride = W * 4 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) { raw[y * stride] = 0; for (let x = 0; x < W; x++) { const c = px[y * W + x]; const o = y * stride + 1 + x * 4; raw[o] = c[0]; raw[o+1] = c[1]; raw[o+2] = c[2]; raw[o+3] = c[3]; } }
  const comp = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", comp), chunk("IEND", Buffer.alloc(0))]);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }

const load = (f) => decodePNG(fs.readFileSync(path.join(CITY, f)));

// ground: slice the 4x4 Wang tileset into 32px tiles, pick the "most cobble" (least green-dominant, opaque) tile
const ts = load("cobble_street_tileset.png");
const TN = ts.W / 32;
let bestTile = null, bestScore = -1;
for (let ty = 0; ty < TN; ty++) for (let tx = 0; tx < TN; tx++) {
  let score = 0, n = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = ts.img[(ty*32+y)*ts.W + (tx*32+x)]; if (c[3] < 200) { score -= 5; continue; }
    // cobble = grey/blue, low green dominance; reward when green isn't the max channel
    if (c[1] > c[0] && c[1] > c[2]) score -= 2; else score += 1; n++;
  }
  if (n > 800 && score > bestScore) { bestScore = score; bestTile = { tx, ty }; }
}
const groundTile = (x, y) => ts.img[((bestTile.ty*32) + (y & 31)) * ts.W + (bestTile.tx*32) + (x & 31)];

// assets to show, in tile-scale order; bottom-center anchored
const ALL = ["street_lamp_v2","street_lamp","park_bench","stone_well","park_tree","house_red","house_blue","tavern","depot","temple"];
const items = ALL.filter(n => fs.existsSync(path.join(CITY, n+".png"))).map(n=>({name:n,label:n}));
for (const it of items) it.png = load(it.name + ".png");

// layout: one row of sprites on a cobble ground band, at 1x game density
const pad = 24, gap = 28, groundH = 224, labelH = 16;
let widths = items.map(it => Math.max(it.png.W, 40));
const CW = pad*2 + widths.reduce((a,b)=>a+b,0) + gap*(items.length-1);
const CH = pad + labelH + groundH + pad;
const panel = [26, 24, 30, 255];
const px = Array.from({ length: CW * CH }, () => panel.slice());
const put = (x, y, c) => { if (x<0||x>=CW||y<0||y>=CH||c[3]===0) return; const a=c[3]/255, d=px[y*CW+x]; px[y*CW+x]=[Math.round(c[0]*a+d[0]*(1-a)),Math.round(c[1]*a+d[1]*(1-a)),Math.round(c[2]*a+d[2]*(1-a)),255]; };

const groundTop = pad + labelH;
// tile cobble ground band
for (let y = 0; y < groundH; y++) for (let x = 0; x < CW; x++) put(x, groundTop + y, groundTile(x, y));
// faint 32px grid on ground
for (let gx = 0; gx <= CW; gx += 32) for (let y = 0; y < groundH; y++) put(gx, groundTop + y, [255,255,255,22]);
for (let gy = 0; gy <= groundH; gy += 32) for (let x = 0; x < CW; x++) put(x, groundTop + gy, [255,255,255,22]);

// place each sprite bottom-anchored, resting near the ground band bottom
let cx = pad;
const baseline = groundTop + groundH - 16;
for (let i = 0; i < items.length; i++) {
  const it = items[i]; const w = it.png.W, h = it.png.H;
  const ox = cx + Math.floor((widths[i] - w) / 2);
  const oy = baseline - h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = it.png.img[y*w+x]; if (c[3] > 10) put(ox + x, oy + y, c); }
  // label
  cx += widths[i] + gap;
}

const outBuf = encodePNG(CW, CH, px);
const outDir = path.join(ROOT, "shots", "cas2186");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "city_batch1_gamescale.png");
fs.writeFileSync(outPath, outBuf);
console.log("wrote", outPath, CW + "x" + CH, "ground tile", bestTile, "items:", items.map(i=>i.label).join(", "));
