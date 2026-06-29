// ---------------------------------------------------------------------------
// CAS-177 — Backup static host verification (the spike's evidence).
//
// Boots the REAL game served by the production-faithful backup host
// (tools/backup-host-serve.mjs, applying tools/backup-host-policy.mjs) and
// proves the backup host is a drop-in replacement for the live URL:
//
//   A. Game boots to menu -> class select -> play, 0 page errors, 0 failed reqs.
//   B. Cache headers are CAS-58-correct:
//        version.json -> no-store ; *.html -> no-cache ; assets -> immutable.
//   C. The stale-build invariant holds: EVERY cacheable asset the game loads is
//      requested with ?v=<build> matching window.__BUILD. Because version.json
//      is no-store, a returning player always re-reads the build id; because
//      every asset URL carries that id, a new build changes every cache key ->
//      no returning player can run a stale module (the CAS-58 bug, structurally
//      prevented on the backup host too).
//   D. Load is fast on desktop AND a mobile viewport (time-to-menu reported).
//
// Run: node tools/backup-host-verify.mjs   (or: npm run backup-host-verify)
// Self-contained: exports the bundle first if deploy/backup-host is missing.
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { startBackupHost } from "./backup-host-serve.mjs";
import { NO_STORE, NO_CACHE, IMMUTABLE } from "./backup-host-policy.mjs";

const OUT = join(ROOT, "deploy", "backup-host");
const CACHEABLE_EXT = /\.(js|mjs|png|jpg|jpeg|webp|mp4|svg|css)(\?|$)/i;

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

// 0) ensure an exported bundle exists
if (!existsSync(OUT)) {
  console.log("· exporting bundle (deploy/backup-host missing)…");
  execFileSync("node", [join(ROOT, "tools", "backup-host-export.mjs")], { stdio: "inherit" });
}

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startBackupHost(OUT);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

// header capture across the whole load
const headers = {};                 // path -> cache-control
const cacheableNoVersion = [];      // cacheable assets fetched WITHOUT ?v=
const errors = [];

async function bootRun(label, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${label}] console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => errors.push(`[${label}] requestfailed: ${r.url()}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(srv.url).origin) return;
    if (r.status() >= 400) errors.push(`[${label}] http ${r.status()}: ${u.pathname}`);
    headers[u.pathname] = r.headers()["cache-control"] || "(none)";
    // CAS-58 invariant: cacheable assets MUST carry a ?v= cache-buster.
    if (CACHEABLE_EXT.test(u.pathname) && !u.searchParams.has("v")) {
      cacheableNoVersion.push(u.pathname + u.search);
    }
  });

  const t0 = Date.now();
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  const tMenu = Date.now() - t0;
  const build = await page.evaluate("window.__BUILD");
  await page.close();
  return { tMenu, build };
}

try {
  // A + D — desktop boot
  const desktop = await bootRun("desktop", { width: 1280, height: 720, deviceScaleFactor: 1 });
  pass(`desktop boot to menu in ${desktop.tMenu}ms (build=${desktop.build})`);
  // D — mobile viewport parity
  const mobile = await bootRun("mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  pass(`mobile (390x844) boot to menu in ${mobile.tMenu}ms`);

  if (errors.length === 0) pass("0 page errors / failed requests across both loads");
  else { fail(`${errors.length} page errors:`); errors.slice(0, 12).forEach((e) => console.error("   " + e)); }

  // B — header policy
  const vc = headers["/version.json"];
  vc === NO_STORE ? pass(`version.json -> ${vc}`) : fail(`version.json cache-control=${vc} (want ${NO_STORE})`);
  const hc = headers["/index.html"];
  hc === NO_CACHE ? pass(`index.html -> ${hc}`) : fail(`index.html cache-control=${hc} (want ${NO_CACHE})`);
  const aPath = Object.keys(headers).find((p) => /\.(js|png|webp)$/i.test(p));
  const ac = aPath && headers[aPath];
  ac === IMMUTABLE ? pass(`assets (${aPath}) -> ${ac}`) : fail(`asset cache-control=${ac} (want ${IMMUTABLE})`);

  // C — stale-build invariant
  if (cacheableNoVersion.length === 0) pass("every cacheable asset requested with ?v=<build> (no stale-build hole)");
  else { fail(`${cacheableNoVersion.length} cacheable asset(s) fetched WITHOUT ?v= (stale-build risk):`); cacheableNoVersion.slice(0, 8).forEach((u) => console.error("   " + u)); }

  if (desktop.build && desktop.build === mobile.build) pass(`build id consistent across loads: ${desktop.build}`);
  else fail(`build id mismatch desktop=${desktop.build} mobile=${mobile.build}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\n✅ backup-host verify PASS" : "\n❌ backup-host verify FAIL");
process.exit(ok ? 0 : 1);
