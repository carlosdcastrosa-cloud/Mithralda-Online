// CAS-2018 deploy (CAS-2016 Combat Primer — ONBOARDING knob, Build CAS-2017, HEAD == f9febed):
// Isolated 0-leak overlay of the EXACTLY-4 prod blobs REALLY touched by the build onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json regenerated
// over the full tree.
//
// DARK deploy: ONBOARDING ships enabled:false (Gate CEO owns the flip). enabled:false ⇒ TUT_STEPS
// == HEAD byte-id, tutMarkC seams no-op (0 state touch, 0 srand), save.v1 + srand byte-id to HEAD.
//
// REAL blob set derived EMPIRICALLY from `git diff --stat 2a451ef..f9febed` (build-parent..HEAD),
// NOT from the ticket (CAS-1990/2012 lesson). The ticket's scope `sim/ render/ game.js input.js
// persist.js` MISSED strings.js (root-level served prod module in index.html MODS) — the build
// touched it (6 combat-step headers + bind-aware copy + tutDoneCodex pointer). Included here.
//   sim/config.js    — ONBOARDING knob {enabled:false + 6 teach* a11y sub-flags + skippable}.
//   sim/sim.js       — composeTutSteps() gate + 6 tutMarkC seams + tickTutorial combat cases.
//   render/render.js — coachmark binding resolver + done-card codex pointer.
//   strings.js       — 6 combat-step headers + bind-aware copy + tutDoneCodex.
// The harness tools/cas2016-primer.mjs is dev-only and is NOT deployed.
// Rollback = revert of these 4 blobs. Live base actual = 1868d83bd845 / 799 (post JUICE CAS-2012).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js", "strings.js"];

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
  const idx = "/tmp/cas2018-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2018 (CAS-2016): deploy Combat Primer — ONBOARDING enabled:false DARK (sim/config.js+sim/sim.js+render/render.js+strings.js, 4 prod blobs) — build ${build}`);
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
