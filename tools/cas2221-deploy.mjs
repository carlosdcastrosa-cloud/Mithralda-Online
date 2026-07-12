// CAS-2221: CEO Gate GO — deploy the PixelLab pilot live flip (CAS-2184/CAS-2194 `0dafcd7`)
// to gh-pages LIVE. Ships skeleton pilot strips + Fire-Nova + CLS.warrior 88×64 fix.
//
// Pre-flight facts (verified against origin/gh-pages, 2026-07-12):
//   • LIVE render/render.js  == master  (already carries 0dafcd7's bodyScale hunk AND the
//     CAS-2216 nova tint — rode the CAS-2220 consistent-module-graph deploy). Not overlaid.
//   • LIVE sim/config.js     == master  (PIXELART export live since CAS-2215 boot hotfix). Not overlaid.
//   • LIVE sim/*.js, game.js, world.js, index.html == master. Not overlaid.
//   • LIVE render/sprites.js == 93b4f1b = the PRE-pilot parent blob (no skel_pilot, CLS.warrior 22×34,
//     no per-strip `src`, no fx_nova pilot override). THIS is the only stale code file.
//   • Pilot asset PNGs (skel side strips + pilot nova) are NOT on gh-pages → the wiring would 404
//     and silently fall back to procedural. Must upload them.
//
// Overlay (path -> master blob). Result: the ENTIRE live code tree == master, plus pilot assets.
// Module-graph consistent (master sprites.js is exactly what master render.js was built against),
// so no SEV-1 boot risk. Reversible = revert the commit + redeploy. Mirror of cas2219-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = {
  "render/sprites.js":                                   "HEAD", // pilot wiring + CLS.warrior 88×64 (+CAS-2217 CLS data)
  "assets/pixellab/pilot/mobs/skel_idle_side.png":       "HEAD", // 124×124  fc1
  "assets/pixellab/pilot/mobs/skel_walk_side.png":       "HEAD", // 744×124  fc6
  "assets/pixellab/pilot/mobs/skel_attack_side.png":     "HEAD", // 868×124  fc7
  "assets/pixellab/pilot/fx/nova_strip.png":             "HEAD", // 1152×128 9f×128 (matches FX_STRIP.nova)
};

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();
git("fetch", "origin", "gh-pages", "--quiet");

const shas = {};
for (const [f, s] of Object.entries(OVERLAY)) shas[f] = s === "HEAD" ? gitStr("rev-parse", `HEAD:${f}`) : s;

function computeBuild() {
  const tracked = git("ls-tree", "-r", "--name-only", "origin/gh-pages").toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...Object.keys(OVERLAY), "version.json"])].filter(f => f !== "version.json").sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = OVERLAY[f] ? git("cat-file", "blob", shas[f]) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas2221-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const [f, s] of Object.entries(shas)) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${s},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2221: deploy PixelLab pilot live flip (CAS-2184/0dafcd7) — skel strips + Fire-Nova + CLS.warrior 88x64 — overlay render/sprites.js(HEAD)+4 pilot PNGs, whole code tree now ==master, module-consistent, reversible — build ${build}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}

console.log(JSON.stringify({ overlaySha: shas, ...buildAndPush() }, null, 2));
