#!/usr/bin/env node
// CAS-200 — PixelLab REST v2 driver (FOUNTAINS dark-fantasy re-style).
// Validates the originally-requested PixelLab pipeline now that the board
// supplied the docs + a working Bearer token (configured in ~/.claude.json).
//
// pixflux returns the PNG synchronously (base64) — no job polling needed.
// We force the frozen FOUNTAINS palette via `color_image` so every sprite is
// locked to the STYLE FORMULA, then drop-in at the game's native cell sizes.
//
// Usage: node tools/cas200-pixellab.mjs <slug> "<description>" [w] [h] [view] [outline] [shading]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const TOKEN = '70aee9a0-4277-441b-bf1f-44de91b14f5c';
const BASE = 'https://api.pixellab.ai/v2';
const STYLE_TOKEN = 'chunky 32px top-down pixel art, cold desaturated dark-fantasy gloom, near-black outlines, dramatic torch light, crimson blood signal';

// ---- pure-JS PNG encoder (RGB, no deps) ----
function crc32(buf) {
  let c, table = crc32._t;
  if (!table) {
    table = crc32._t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgb) { // rgb: Uint8Array length w*h*3
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit, RGB
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy ? rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride) : raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

// ---- build a forced-palette swatch image from palette.fountains.json ----
function paletteImage() {
  const p = JSON.parse(fs.readFileSync('design/palette.fountains.json', 'utf8'));
  const r = p.roles;
  const cols = [];
  const env = r.environment;
  for (const k of ['moss', 'dirt', 'stone', 'cobble', 'ash', 'water']) { const o = env[k]; for (const v of Object.values(o)) if (typeof v === 'string' && v[0] === '#') cols.push(v); }
  cols.push(env.outline, env.bg, env.night, env.twig);
  const sh = r.actors.shared; for (const v of Object.values(sh)) cols.push(v);
  const sig = r.signal; for (const [k, v] of Object.entries(sig)) if (k[0] !== '_') cols.push(v);
  // grid of swatches, 8px each
  const SW = 8, perRow = 8, rows = Math.ceil(cols.length / perRow);
  const w = perRow * SW, h = rows * SW;
  const rgb = Buffer.alloc(w * h * 3);
  cols.forEach((c, i) => {
    const [rr, gg, bb] = hex(c);
    const cx = (i % perRow) * SW, cy = Math.floor(i / perRow) * SW;
    for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) {
      const idx = ((cy + y) * w + (cx + x)) * 3; rgb[idx] = rr; rgb[idx + 1] = gg; rgb[idx + 2] = bb;
    }
  });
  return encodePNG(w, h, rgb).toString('base64');
}

async function main() {
  const [slug, desc, w = '64', h = '64', view = 'high top-down', outline = 'single color black outline', shading = 'medium shading'] = process.argv.slice(2);
  if (!slug || !desc) { console.error('usage: node tools/cas200-pixellab.mjs <slug> "<description>" [w] [h] [view] [outline] [shading]'); process.exit(1); }
  const color_b64 = paletteImage();
  const body = {
    description: `${desc}. ${STYLE_TOKEN}`,
    image_size: { width: +w, height: +h },
    view, outline, shading,
    detail: 'medium detail',
    text_guidance_scale: 7,
    no_background: true,
    color_image: { type: 'base64', base64: color_b64 },
  };
  console.log(`→ pixflux ${slug} ${w}x${h} "${desc.slice(0, 60)}…"`);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/create-image-pixflux`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status}: ${txt.slice(0, 500)}`); process.exit(1); }
  const json = JSON.parse(txt);
  const b64 = json.image?.base64 || json.image;
  const outDir = 'assets/pixellab/fountains';
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${slug}.png`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`✓ ${out} (${fs.statSync(out).size} bytes, ${((Date.now() - t0) / 1000).toFixed(1)}s) usage=${JSON.stringify(json.usage)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
