// ---------------------------------------------------------------------------
// Shared test harness: a tiny static file server + headless Chromium launcher.
// Used by tools/smoke.mjs and tools/determinism.mjs. No runtime game deps —
// puppeteer-core lives in devDependencies; the shipped game has zero deps.
// ---------------------------------------------------------------------------
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".webp": "image/webp",
  ".csv":  "text/csv; charset=utf-8",
  ".svg":  "image/svg+xml",
};

// Serve `root` over HTTP on an ephemeral port. Returns { url, close }.
export function startServer(root = ROOT) {
  const server = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/" || p === "") p = "/index.html";
      // Browsers auto-request /favicon.ico; answer cleanly so it isn't a 404.
      if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }
      // contain within root (no path traversal)
      const full = normalize(join(root, p));
      if (!full.startsWith(root) || !existsSync(full) || !statSync(full).isFile()) {
        res.writeHead(404); res.end("404"); return;
      }
      res.writeHead(200, { "content-type": MIME[extname(full)] || "application/octet-stream" });
      createReadStream(full).pipe(res);
    } catch {
      res.writeHead(500); res.end("500");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Find a usable Chromium binary across environments (CI, local, sandbox).
export function findChromium() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null; // puppeteer may still resolve its own bundled browser
}

export const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
  // Keep rAF / timers running at full rate in headless so FPS sampling is real.
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

export function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exitCode = 1;
  throw new Error(msg);
}
