// ---------------------------------------------------------------------------
// CAS-180 — Subpath boot verification for the GitHub Pages backup host.
//
// A GitHub Pages PROJECT site serves the bundle under "/<repo>/" — not the
// server root. CAS-180 made the index.html bootstrap base-path-relative so the
// SAME bundle works at any root. This harness proves it: it mounts the exported
// backup-host bundle under a "/Mithralda-Online/" prefix and asserts
//
//   A. Game boots to menu under the subpath, 0 page errors / failed requests.
//   B. The CAS-58 stale-build invariant STILL holds at a subpath: every
//      cacheable module/asset is fetched WITH ?v=<build> (the import map keys
//      resolved correctly under the prefix). A regression here = silent loss of
//      cache-busting on GitHub Pages.
//
// Run: node tools/cas180-subpath-verify.mjs
// ---------------------------------------------------------------------------
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { cacheControlFor, mimeFor } from "./backup-host-policy.mjs";

const OUT = join(ROOT, "deploy", "backup-host");
const PREFIX = "/Mithralda-Online";
const CACHEABLE_EXT = /\.(js|mjs|png|jpg|jpeg|webp|mp4|svg|css)(\?|$)/i;

if (!existsSync(OUT)) { console.error("✖ run `npm run backup-host-export` first."); process.exit(1); }

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

// prefix-mounting static server (prod-faithful cache headers, served under /Mithralda-Online/)
const rootNorm = normalize(OUT);
const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    // Browsers auto-request /favicon.ico at the domain root; the live backup host
    // (backup-host-serve) answers a missing favicon with 204. Mirror that so a
    // cosmetic favicon miss doesn't masquerade as a boot error.
    if (p === "/favicon.ico" && !existsSync(join(rootNorm, "favicon.ico"))) {
      res.writeHead(204, { "cache-control": "no-store" }); res.end(); return;
    }
    if (!p.startsWith(PREFIX)) { res.writeHead(404, { "cache-control": "no-store" }); res.end("404"); return; }
    p = p.slice(PREFIX.length) || "/";
    if (p === "/" || p === "") p = "/index.html";
    const full = normalize(join(rootNorm, p));
    if (!full.startsWith(rootNorm) || !existsSync(full) || !statSync(full).isFile()) {
      res.writeHead(404, { "cache-control": "no-store" }); res.end("404"); return;
    }
    res.writeHead(200, { "content-type": mimeFor(full), "cache-control": cacheControlFor(p) });
    createReadStream(full).pipe(res);
  } catch { res.writeHead(500); res.end("500"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}${PREFIX}/`;

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const errors = [];
const cacheableNoVersion = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(base).origin) return;
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${u.pathname}`);
    if (CACHEABLE_EXT.test(u.pathname) && !u.searchParams.has("v")) cacheableNoVersion.push(u.pathname + u.search);
  });

  const t0 = Date.now();
  await page.goto(base + "index.html?dev", { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  const build = await page.evaluate("window.__BUILD");
  pass(`booted to menu under ${PREFIX}/ in ${Date.now() - t0}ms (build=${build})`);

  if (errors.length === 0) pass("0 page errors / failed requests");
  else { fail(`${errors.length} page errors:`); errors.slice(0, 12).forEach((e) => console.error("   " + e)); }

  if (cacheableNoVersion.length === 0) pass("every cacheable asset requested with ?v=<build> at subpath (no stale-build hole)");
  else { fail(`${cacheableNoVersion.length} asset(s) WITHOUT ?v= at subpath:`); cacheableNoVersion.slice(0, 8).forEach((u) => console.error("   " + u)); }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

console.log(ok ? "\n✅ CAS-180 subpath verify PASS" : "\n❌ CAS-180 subpath verify FAIL");
process.exit(ok ? 0 : 1);
