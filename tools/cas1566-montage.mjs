// CAS-1566 montage — v1 altar icons (row 1) + v2 tier-2/ascension (row 2)
// on panel #12141b, at 1x and 6x, to verify STYLE FORMULA coherence.
import zlib from "zlib";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ICO = path.join(ROOT, "assets/ui/icons");

function decodePNG(buf) {
  let o = 8; const chunks = {};
  let W, H; const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o); const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.slice(o + 8, o + 8 + len);
    if (type === "IHDR") { W = data.readUInt32BE(0); H = data.readUInt32BE(4); }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const img = new Array(W * H);
  const stride = W * 4 + 1;
  const pa = (x, y) => raw[y * stride + 1 + x * 4];
  for (let y = 0; y < H; y++) {
    const f = raw[y * stride];
    for (let x = 0; x < W; x++) {
      let r = raw[y * stride + 1 + x * 4], g = raw[y * stride + 2 + x * 4], b = raw[y * stride + 3 + x * 4], a = raw[y * stride + 4 + x * 4];
      // only filter 0 used by our encoder
      img[y * W + x] = [r, g, b, a];
    }
  }
  return { W, H, img };
}

const v1 = ["altar_hpmax", "altar_dmg", "altar_movespd", "altar_reroll", "altar_startgold", "altar_essence"];
const v2 = ["altar_t2_boonrare", "altar_t2_startboon", "altar_t2_dashiframe", "altar_t2_zonechest", "altar_t2_reroll", "altar_ascension"];

const scale = 5, pad = 10, gap = 8;
const cols = 6;
const colW = 32 * scale + gap;      // zoomed column stride
const cell = colW;                  // reuse for both rows so they align
const CW = cols * colW + pad * 2;
const rowH1x = 40, rowHscale = 32 * scale + 12;
// layout: two blocks (v1, v2); each block = 1x row + 6x row
const blocks = [v1, v2];
const CH = pad + blocks.length * (rowH1x + rowHscale + 16) + pad;
const bg = [18, 20, 27, 255];
const out = Array.from({ length: CW * CH }, () => bg.slice());
const put = (x, y, c) => { if (x >= 0 && x < CW && y >= 0 && y < CH && c[3] !== 0) { const a = c[3] / 255; const d = out[y * CW + x]; out[y * CW + x] = [Math.round(c[0]*a + d[0]*(1-a)), Math.round(c[1]*a + d[1]*(1-a)), Math.round(c[2]*a + d[2]*(1-a)), 255]; } };

let yy = pad;
for (const names of blocks) {
  // 1x row
  names.forEach((n, i) => {
    const { W, H, img } = decodePNG(fs.readFileSync(path.join(ICO, n + ".png")));
    const ox = pad + i * cell + Math.floor((cell - W) / 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(ox + x, yy + y, img[y * W + x]);
  });
  yy += rowH1x + 6;
  // 6x row
  names.forEach((n, i) => {
    const { W, H, img } = decodePNG(fs.readFileSync(path.join(ICO, n + ".png")));
    const ox = pad + i * cell + Math.floor((cell - 32) / 2 * 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = img[y * W + x]; for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(ox + x * scale + sx, yy + y * scale + sy, c); }
  });
  yy += rowHscale + 16;
}

// encode
function encodePNG(W, H, img) {
  const raw = Buffer.alloc((W * 4 + 1) * H); let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0; for (let x = 0; x < W; x++) { const p = img[y * W + x]; raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3]; } }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const CRCT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
const fp = path.join(ROOT, "tools", "cas1566-montage.png");
fs.writeFileSync(fp, encodePNG(CW, CH, out));
console.log("montage ->", fp, CW + "x" + CH);
