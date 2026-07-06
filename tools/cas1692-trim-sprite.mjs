// CAS-1692: trim transparent padding from a PixelLab RGBA rotation PNG → tight cutout.
// Pure Node (zlib only). Decodes 8-bit RGBA (colortype 6), crops to alpha bbox
// (with a 1px margin), re-encodes as 8-bit RGBA PNG (filter 0). Mirrors the tight
// framing of the existing FOUNTAINS enemy cutouts (enemy_orc/skeleton/wraith 64x64).
//
//   node tools/cas1692-trim-sprite.mjs <in.png> <out.png> [alphaThresh=8]
import fs from "node:fs";
import zlib from "node:zlib";

const [,, inPath, outPath, threshArg] = process.argv;
if (!inPath || !outPath) { console.error("usage: trim <in> <out>"); process.exit(1); }
const ALPHA = threshArg ? +threshArg : 8;

function readChunks(buf) {
  let p = 8; const chunks = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    chunks.push({ type, data });
    p += 12 + len;
  }
  return chunks;
}

function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

function decode(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), bd = buf[24], ct = buf[25];
  if (bd !== 8 || ct !== 6) throw new Error(`unsupported bd=${bd} ct=${ct}`);
  const chunks = readChunks(buf);
  const idat = Buffer.concat(chunks.filter(c => c.type === "IDAT").map(c => c.data));
  const raw = zlib.inflateSync(idat);
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rawv = raw[rp++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;       // left
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;          // up
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0; // up-left
      let v;
      switch (ft) {
        case 0: v = rawv; break;
        case 1: v = rawv + a; break;
        case 2: v = rawv + b; break;
        case 3: v = rawv + ((a + b) >> 1); break;
        case 4: v = rawv + paeth(a, b, c); break;
        default: throw new Error("bad filter " + ft);
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { w, h, data: out };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encode(w, h, data) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const img = decode(fs.readFileSync(inPath));
const { w, h, data } = img;
let x0 = w, y0 = h, x1 = -1, y1 = -1;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (data[(y * w + x) * 4 + 3] >= ALPHA) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
if (x1 < 0) { console.error("empty image"); process.exit(1); }
const M = 1;
x0 = Math.max(0, x0 - M); y0 = Math.max(0, y0 - M); x1 = Math.min(w - 1, x1 + M); y1 = Math.min(h - 1, y1 + M);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const crop = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) data.copy(crop, y * cw * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0) * 4 + cw * 4);
fs.writeFileSync(outPath, encode(cw, ch, crop));
console.log(`${inPath.split("/").pop()} ${w}x${h} → ${outPath.split("/").pop()} ${cw}x${ch} (bbox ${x0},${y0}..${x1},${y1})`);
