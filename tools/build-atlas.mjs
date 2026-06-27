// build-atlas.mjs — Mithralda asset-atlas packer (zero runtime deps; Node built-ins only).
//
// Scans assets/{char,class,tiles,props}/*.png, packs every sprite-sheet into ONE
// RGBA8 PNG (assets/atlas/atlas.png) plus a manifest (assets/atlas/atlas.json)
// mapping each game load-key -> {x,y,w,h} within the atlas.
//
// Why: the browser client currently issues ~68 separate image requests at boot.
// The atlas collapses that into a single request, keeping first-load fast (the
// "no entry friction" deploy invariant) without touching any draw code — the
// loader slices each sheet back out of the atlas at its original dimensions.
//
// Run:  node tools/build-atlas.mjs
// Output is deterministic (assets walked in sorted order) so the artifact is
// reproducible and diff-friendly.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "assets");
const OUT_DIR = path.join(ASSETS, "atlas");
const ATLAS_W = 1024;   // >= widest source sheet (704px); power-of-two friendly
const PAD = 1;          // transparent gutter to avoid bilinear bleed if ever sampled

// ---------------- minimal PNG codec (RGBA8, non-interlaced) ----------------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Decode an RGBA8 non-interlaced PNG -> {w,h,data:Uint8Array(w*h*4)}.
function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0)
    throw new Error(`unsupported PNG (bd=${bitDepth} ct=${colorType} il=${interlace})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = new Uint8Array(w * h * bpp);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = raw.subarray(p, p + stride); p += stride;
    const line = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: v = (v + paeth(a, b, c)) & 0xff; break;
        default: throw new Error("bad filter " + filter);
      }
      line[i] = v;
    }
    out.set(line, y * stride);
    prev = line;
  }
  return { w, h, data: out };
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Encode RGBA8 -> PNG (filter 0 per scanline; zlib max compression).
function encodePNG(w, h, data) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------- map source files -> game load-keys ----------------
// Keys MUST match game.js IMG[...] keys so the loader is a drop-in.
function keyFor(rel) {
  const dir = rel.split(path.sep)[1];
  const base = path.basename(rel, ".png");
  if (dir === "char") return base;            // e.g. mage_walk
  if (dir === "class") return "cls_" + base;  // e.g. cls_warrior_idle_down
  if (dir === "tiles") return base;           // e.g. cave_floor
  if (dir === "props") return "prop_" + base; // e.g. prop_barrel
  return null;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith(".png")) yield p;
  }
}

// ---------------- pack ----------------
const sources = [];
for (const sub of ["char", "class", "tiles", "props"]) {
  const d = path.join(ASSETS, sub);
  if (!fs.existsSync(d)) continue;
  for (const f of walk(d)) {
    const rel = path.relative(ASSETS, f);
    const k = keyFor(path.join("assets", rel));
    if (!k) continue;
    const img = decodePNG(fs.readFileSync(f));
    sources.push({ key: k, rel, ...img });
  }
}
// Stable order: tallest first (better shelf packing), then by key for determinism.
sources.sort((a, b) => b.h - a.h || a.key.localeCompare(b.key));

const frames = {};
let cx = PAD, cy = PAD, shelfH = 0, atlasH = 0;
for (const s of sources) {
  if (cx + s.w + PAD > ATLAS_W) { cx = PAD; cy += shelfH + PAD; shelfH = 0; }
  s.x = cx; s.y = cy;
  frames[s.key] = { x: s.x, y: s.y, w: s.w, h: s.h };
  cx += s.w + PAD;
  if (s.h > shelfH) shelfH = s.h;
  if (cy + s.h + PAD > atlasH) atlasH = cy + s.h + PAD;
}
const atlasH2 = atlasH;

// Composite into one RGBA buffer.
const atlas = new Uint8Array(ATLAS_W * atlasH2 * 4);
for (const s of sources) {
  for (let row = 0; row < s.h; row++) {
    const srcOff = row * s.w * 4;
    const dstOff = ((s.y + row) * ATLAS_W + s.x) * 4;
    atlas.set(s.data.subarray(srcOff, srcOff + s.w * 4), dstOff);
  }
}

// ---------------- self-test: every packed region must equal its source ----------------
let checked = 0;
for (const s of sources) {
  for (const [px, py] of [[0, 0], [s.w - 1, s.h - 1], [(s.w >> 1), (s.h >> 1)]]) {
    const si = (py * s.w + px) * 4;
    const di = ((s.y + py) * ATLAS_W + (s.x + px)) * 4;
    for (let c = 0; c < 4; c++) {
      if (s.data[si + c] !== atlas[di + c])
        throw new Error(`round-trip mismatch on ${s.key} at (${px},${py})`);
    }
  }
  checked++;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const png = encodePNG(ATLAS_W, atlasH2, atlas);
fs.writeFileSync(path.join(OUT_DIR, "atlas.png"), png);
const manifest = {
  version: 1,
  generated_by: "tools/build-atlas.mjs",
  image: "atlas.png",
  meta: { w: ATLAS_W, h: atlasH2, format: "RGBA8", pad: PAD },
  count: sources.length,
  frames,
};
fs.writeFileSync(path.join(OUT_DIR, "atlas.json"), JSON.stringify(manifest, null, 0) + "\n");

// Round-trip the encoded PNG to prove it decodes back identically.
const reDecoded = decodePNG(png);
if (reDecoded.w !== ATLAS_W || reDecoded.h !== atlasH2) throw new Error("encode/decode size mismatch");
for (let i = 0; i < atlas.length; i += 977) {
  if (reDecoded.data[i] !== atlas[i]) throw new Error("encode/decode pixel mismatch at " + i);
}

console.log(`packed ${sources.length} sheets -> ${ATLAS_W}x${atlasH2} atlas`);
console.log(`atlas.png: ${(png.length / 1024).toFixed(1)} KB | self-test: ${checked} regions OK, PNG re-decode OK`);
