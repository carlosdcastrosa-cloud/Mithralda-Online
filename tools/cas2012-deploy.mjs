// CAS-2012 deploy (CAS-2010 Game-Feel/Impact Pass v1 — JUICE knob, Build CAS-2011, HEAD == 5f3e3d1):
// Isolated 0-leak overlay of the EXACTLY-2 prod blobs REALLY touched by the build onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json regenerated
// over the full tree.
//
// LIVE deploy (no dark stage): JUICE ships enabled:true (realce). It gates/extends the ALREADY-LIVE
// hit-stop (freeze) / screen-shake (shakeAdd) / impact-flash primitives (CAS-127/272/273) — presentation
// only (G.hitstop/G.shake transient + un-serialized, 0 srand draws) ⇒ save.v1 + srand byte-id to HEAD.
//   sim/config.js — new JUICE knob {enabled:true,hitStop,screenShake,flash,hitStopCapFrames:9}.
//   sim/sim.js    — freeze() a11y+cap gate, shakeAdd() master toggle, flash sub-flag, 4 coverage seams.
// render/render.js was NOT touched by the build (flash gating lives in sim.js) ⇒ NOT in overlay.
// The harness tools/cas2010-juice.mjs is dev-only and is NOT deployed.
// Rollback = revert of these 2 blobs. Live base actual = 91b4c9956255 / 799 files (post Balance Tier-1 CAS-2006).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js"];

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch", "origin", "gh-pages", "--quiet");

const shas = {};
for (const f of OVERLAY) shas[f] = gitStr("rev-parse", `HEAD:${f}`);

function computeBuild() {
  const tracked = git("ls-tree", "-r", "--name-only", "origin/gh-pages").toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...OVERLAY, "version.json"])].filter(f => f !== "version.json").sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = OVERLAY.includes(f) ? git("cat-file", "blob", shas[f]) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas2012-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2012 (CAS-2010): deploy Game-Feel/Impact Pass v1 — JUICE enabled:true LIVE (sim/config.js+sim/sim.js, 2 prod blobs) — build ${build}`);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}

let res = buildAndPush();
if (!res.pushed) { git("fetch", "origin", "gh-pages", "--quiet"); res = buildAndPush(); }
console.log(JSON.stringify(res));
if (!res.pushed) process.exit(1);
