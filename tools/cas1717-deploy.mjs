// CAS-1717 deploy (CAS-1715 umbrella, kept lane per CEO reconcile CAS-1713 03:17Z):
// overlay ONLY the CAS-1716 custom-asset build blobs onto gh-pages. Isolated 0-leak delta:
// HEAD blobs swap in, everything else stays byte-identical to origin/gh-pages. version.json regenerated.
//   editor.html / editor.js       — <input webkitdirectory> folder upload + custom-asset palette + stamp tool
//   sim/customassets.js (NEW)     — editor-only IndexedDB store mithralda.editor.assets.v1
//   sim/mapdoc.js                 — additive kind:"custom" deco + world.customAssets (byte-safe w/o md.assets)
//   render/render.js              — kind==="custom" deco branch (lazy Image cache) + seam-fix (already live)
//   game.js                       — customImgReady() dev probe for QA
// NOT deployed: harness tools/cas1716-custom-assets-qa.mjs or any other file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["editor.html", "editor.js", "game.js", "render/render.js", "sim/customassets.js", "sim/mapdoc.js"];

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
  const idx = "/tmp/cas1717-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1717: deploy custom-asset map editor (CAS-1716) — build ${build}`);
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
