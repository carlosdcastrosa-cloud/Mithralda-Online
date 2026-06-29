// Throwaway local gzip static server for godot/build-g1 (mimics GitHub Pages
// gzip wire transfer so CDP throttle numbers are faithful). node tools/_cas187-serve.mjs [port]
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { ROOT } from "./harness.mjs";

const DIR = join(ROOT, "godot", "build-g1");
const PORT = Number(process.argv[2] || 8791);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm",
  ".pck": "application/octet-stream", ".png": "image/png" };
const GZIP = new Set([".html", ".js", ".wasm", ".pck"]);

http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const file = join(DIR, p);
  if (!existsSync(file)) { res.writeHead(404); res.end("nf"); return; }
  const ext = extname(file);
  const buf = readFileSync(file);
  const h = { "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };
  if (GZIP.has(ext)) { const g = gzipSync(buf); res.writeHead(200, { ...h, "Content-Encoding": "gzip" }); res.end(g); }
  else { res.writeHead(200, h); res.end(buf); }
}).listen(PORT, () => console.log(`serving ${DIR} on http://localhost:${PORT}/`));
