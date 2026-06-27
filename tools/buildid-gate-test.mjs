// ---------------------------------------------------------------------------
// CAS-68 — NEGATIVE TEST for the build-id self-consistency gate.
//
// Proves deploy-verify (and stamp --check) FAIL on the two reuse/staleness
// failure modes that byte-compare alone cannot catch:
//   A) FORGOT TO STAMP: committed version.json build != hash(tree).
//   B) REUSED LIVE ID:  the deployed zip excluded version.json, so the live url
//      serves a stale `build` while the code changed (the CAS-54 failure).
//
// No real deploy is touched: we stand up a local static server that serves the
// real tree EXCEPT a poisoned /version.json, and point deploy-verify at it with
// --base. A gate that passes here would be broken, so we assert it exits != 0
// AND that the report flags the right cause.
//
// Run: node tools/buildid-gate-test.mjs   (npm run buildid-gate-test)
// ---------------------------------------------------------------------------
import http from "node:http";
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./harness.mjs";
import { computeBuildId } from "./build-id.mjs";

const execFileAsync = promisify(execFile);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".csv": "text/csv", ".svg": "image/svg+xml" };
const VJSON = join(ROOT, "version.json");
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => console.log(`✔ ${m}`);

// --- a static server for ROOT with an overridable /version.json payload ---
function serveWithVersion(versionPayload) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/" || p === "") p = "/index.html";
    if (p === "/version.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(versionPayload); return; }
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT) || !existsSync(full) || !statSync(full).isFile()) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "content-type": MIME[extname(full)] || "application/octet-stream" });
    createReadStream(full).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
  }));
}

// run deploy-verify against a base; return {exit, report}. MUST be async — the
// local mirror server runs in THIS process's event loop, so a blocking
// execFileSync would deadlock (server can't answer the subprocess's fetches).
async function runGate(base) {
  try {
    const { stdout } = await execFileAsync("node", [join(ROOT, "tools", "deploy-verify.mjs"), "--no-behavior", `--base=${base}`], { cwd: ROOT });
    return { exit: 0, report: extractReport(stdout) };
  } catch (e) {
    return { exit: e.code ?? 1, report: extractReport(e.stdout?.toString() || "") };
  }
}
function extractReport(out) {
  const m = out.match(/===DEPLOY_VERIFY_JSON===\n([\s\S]*?)\n===END_REPORT===/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

// We control the on-disk version.json explicitly per phase (the shared working
// tree may carry other agents' uncommitted edits, so the ambient committed id
// need not match the tree hash). Always restore the original at the end.
const real = readFileSync(VJSON, "utf8");
const trueId = computeBuildId().build;                 // what the served tree MUST carry
const POISON = "deadbeefcafe";
const stampDisk = (id) => writeFileSync(VJSON, JSON.stringify({ build: id, files: 0 }) + "\n");
const FRESH = JSON.stringify({ build: trueId, files: computeBuildId().files }) + "\n";

try {
  // ---- CONTROL: correctly stamped on disk AND served -> gate's build-id passes
  writeFileSync(VJSON, FRESH);
  const srvGood = await serveWithVersion(FRESH);
  const g = await runGate(srvGood.url);
  await srvGood.close();
  if (g.report?.buildId?.pass !== true) fail(`CONTROL: build-id check failed on a correctly-stamped tree (committed=${g.report?.buildId?.committed}, live=${g.report?.buildId?.live}, expected=${g.report?.buildId?.expected})`);
  else pass(`CONTROL: correctly-stamped tree passes the build-id check (id=${trueId})`);

  // ---- MODE B: committed id CORRECT, but the LIVE url serves a reused/stale id
  // (the CAS-54 failure: version.json was excluded from the deploy zip).
  writeFileSync(VJSON, FRESH);
  const srvBad = await serveWithVersion(JSON.stringify({ build: POISON, files: 0 }) + "\n");
  const b = await runGate(srvBad.url);
  await srvBad.close();
  if (b.exit === 0) fail("MODE B: gate PASSED with a reused/stale live build-id (should fail)");
  else if (b.report?.buildId?.liveFresh !== false) fail("MODE B: gate failed but did not flag liveFresh=false");
  else pass(`MODE B: reused live build-id caught (live=${b.report.buildId.live}, expected=${b.report.buildId.expected}, exit=${b.exit})`);

  // ---- MODE A: forgot to stamp — committed version.json is stale vs the tree
  stampDisk(POISON);
  let stampCheckExit = 0;
  try { execFileSync("node", [join(ROOT, "tools", "stamp-version.mjs"), "--check"], { cwd: ROOT, stdio: "pipe" }); }
  catch (e) { stampCheckExit = e.status ?? 1; }
  if (stampCheckExit === 0) fail("MODE A: `stamp --check` PASSED on a stale version.json (should fail)");
  else pass(`MODE A: stale committed version.json caught by stamp --check (exit=${stampCheckExit})`);

  const srvA = await serveWithVersion(JSON.stringify({ build: POISON, files: 0 }) + "\n");
  const a = await runGate(srvA.url);
  await srvA.close();
  if (a.report?.buildId?.committedFresh !== false) fail("MODE A: deploy-verify did not flag committedFresh=false on a stale committed id");
  else pass(`MODE A: deploy-verify flags stale committed build-id (committed=${a.report.buildId.committed}, expected=${a.report.buildId.expected})`);
} catch (e) {
  fail(`unexpected: ${e.message}`);
} finally {
  writeFileSync(VJSON, real); // restore the real version.json no matter what
}

if (!ok) { console.error("\n✖ BUILD-ID GATE TEST FAILED.\n"); process.exit(1); }
console.log("\n✔ BUILD-ID GATE TEST PASSED — reused/stale build-ids are caught loudly.\n");
process.exit(0);
