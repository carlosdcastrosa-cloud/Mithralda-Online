// ---------------------------------------------------------------------------
// CAS-37 — POST-DEPLOY VERIFICATION GATE: live bundle MUST equal master HEAD.
//
// Origin: QA pass #3 (CAS-27) caught a STALE live build — `master` had landed
// the gear re-land (CAS-29, 1190023) but the deployed bundle was an older one
// missing the 7 gear `__dev` hooks. A board-tracked feature never reached the
// player and nothing flagged it until a manual playtest. This gate makes that
// failure mode LOUD: a deploy that publishes a bundle older than (or different
// from) master fails here instead of going green.
//
// HOW (strongest possible fingerprint — no stamping, no chicken-egg):
//   The deployed bundle is the SAME static files we ship. We fetch every one of
//   them from the LIVE url and sha256-compare to the local working-tree file.
//   Higgsfield serves our JS/asset files byte-identical; it only injects a tiny
//   iframe-bootstrap <script> into index.html, which we normalize away before
//   comparing. Byte-identity of the served bundle == "live is this exact tree".
//
//   We then assert the local tree is clean and report HEAD, so
//     live bundle == working tree  AND  working tree == master HEAD
//   together prove  live bundle == master HEAD.
//
//   Finally we fold in the behavioral assert the QA Lead built
//   (tools/gear-live.mjs) so the gate also proves the 7 gear hooks actually
//   work live — the exact regression CAS-27 hit. (skip with --no-behavior)
//
// EXIT: non-zero + a clear mismatch list on ANY drift; prints a JSON report.
//
// Run AFTER every `deploy_game`:  node tools/deploy-verify.mjs
//   flags: --code-only     compare only code (index.html + *.js), skip assets
//          --no-behavior   skip the gear-live.mjs behavioral assert (faster)
//          --base=<url>    override the live base url
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { ROOT } from "./harness.mjs";

const args = process.argv.slice(2);
const CODE_ONLY = args.includes("--code-only");
const NO_BEHAVIOR = args.includes("--no-behavior");
const BASE = (args.find((a) => a.startsWith("--base="))?.slice(7) || "https://tender-bridge-504.higgsfield.gg").replace(/\/$/, "");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// The shipped bundle == exactly what the Higgsfield zip contains (README
// "Despliegue"): root runtime files + sim/ + render/ + assets/. Enumerated from
// disk so a newly added file is covered automatically.
// NB: logic.js IS in the deploy zip but is a Higgsfield platform-manifest (the
// rules module the platform consumes server-side) — it is NOT served over HTTP
// (GET /logic.js -> 404), so it can't be byte-compared live. Its content is an
// unchanging solo no-op stub; excluded from the served-bundle comparison.
const ROOT_FILES = ["index.html", "game.js", "audio.js", "input.js", "view.js", "strings.js"];
function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}
const CODE = [...ROOT_FILES, ...walk("sim"), ...walk("render")];
const ASSETS = CODE_ONLY ? [] : walk("assets");
const BUNDLE = [...CODE, ...ASSETS];

// Higgsfield injects a self-contained iframe-redirect bootstrap into index.html
// (a <script>(function(){ ... '__raw' ... })()</script> right before </head>).
// Strip any such script so we compare OUR index content, not their wrapper.
const stripHiggsfield = (html) =>
  html.replace(/<script>\(function\(\)\{[^]*?__raw[^]*?\}\)\(\)<\/script>/g, "");

const liveUrl = (rel) => (rel === "index.html" ? `${BASE}/index.html?__raw=1` : `${BASE}/${rel}`);

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function compareFile(rel) {
  const local = readFileSync(join(ROOT, rel));
  let live;
  try { live = await fetchBytes(liveUrl(rel)); }
  catch (e) { return { rel, ok: false, reason: `live fetch failed: ${e.message}` }; }
  let lh, vh;
  if (rel === "index.html") {
    lh = sha256(stripHiggsfield(local.toString("utf8")));
    vh = sha256(stripHiggsfield(live.toString("utf8")));
  } else {
    lh = sha256(local); vh = sha256(live);
  }
  return lh === vh
    ? { rel, ok: true }
    : { rel, ok: false, reason: "bundle drift (live bytes != master)", localSha: lh.slice(0, 12), liveSha: vh.slice(0, 12) };
}

// concurrency-limited map (keep the live server happy on 80+ files)
async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

function gitContext() {
  const git = (a) => execFileSync("git", a, { cwd: ROOT }).toString().trim();
  try {
    const head = git(["rev-parse", "HEAD"]);
    const dirty = git(["status", "--porcelain", "--", ...BUNDLE]).split("\n").filter(Boolean);
    return { head, headShort: head.slice(0, 7), dirtyBundleFiles: dirty };
  } catch (e) { return { error: e.message }; }
}

function runBehavior() {
  try {
    execFileSync("node", [join(ROOT, "tools", "gear-live.mjs")], { cwd: ROOT, stdio: "pipe", timeout: 120000 });
    return { ran: true, pass: true };
  } catch (e) {
    const tail = (e.stdout?.toString() || "").split("\n").slice(-30).join("\n");
    return { ran: true, pass: false, detail: e.message, tail };
  }
}

// ---- run ----
const git = gitContext();
const results = await pmap(BUNDLE, 12, compareFile);
const codeSet = new Set(CODE);
const mismatches = results.filter((r) => !r.ok);
const behavior = NO_BEHAVIOR ? { ran: false } : runBehavior();

const codeDrift = mismatches.filter((m) => codeSet.has(m.rel));
const bundlePass = mismatches.length === 0;
const treeClean = git.dirtyBundleFiles && git.dirtyBundleFiles.length === 0;
const behaviorPass = NO_BEHAVIOR || behavior.pass === true;
const pass = bundlePass && treeClean && behaviorPass && !git.error;

const report = {
  gate: "deploy-verify (live bundle == master HEAD)",
  base: BASE,
  master: git,
  bundle: { total: BUNDLE.length, codeFiles: CODE.length, assetFiles: ASSETS.length, codeOnly: CODE_ONLY },
  mismatches,
  behavior,
  treeClean,
  pass,
};

console.log("\n===DEPLOY_VERIFY_JSON===");
console.log(JSON.stringify(report, null, 2));
console.log("===END_REPORT===");

if (!pass) {
  console.error("\n✖ DEPLOY GATE FAILED — live build is NOT master HEAD.");
  if (git.error) console.error(`  • git context unavailable: ${git.error}`);
  if (!treeClean) console.error(`  • working tree has uncommitted bundle files (can't equal master): ${git.dirtyBundleFiles?.join(", ")}`);
  if (codeDrift.length) console.error(`  • CODE drift (${codeDrift.length}): ${codeDrift.map((m) => m.rel).join(", ")}`);
  const assetDrift = mismatches.filter((m) => !codeSet.has(m.rel));
  if (assetDrift.length) console.error(`  • ASSET drift (${assetDrift.length}): ${assetDrift.map((m) => m.rel).join(", ")}`);
  if (!behaviorPass) console.error(`  • behavioral assert (gear-live) failed — gear hooks not live`);
  console.error("  → Re-deploy master with the existing game_id, then re-run this gate.\n");
  process.exit(1);
}

console.log(`\n✔ DEPLOY GATE PASSED — live bundle == master @ ${git.headShort} (${BUNDLE.length} files byte-identical${NO_BEHAVIOR ? "" : " + gear-live behavioral assert"}).\n`);
process.exit(0);
