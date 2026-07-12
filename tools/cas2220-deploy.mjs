// CAS-2220 SEV-1 hotfix — LIVE boot crash: CAS-2202 shipped HEAD render.js (imports
// T_STREET) over a stale gh-pages sim/config.js that predates CAS-2191 (no T_STREET
// export) => ES-module load throws => black screen for every player.
//
// FIX = ship a CONSISTENT module graph. Overlay ALL runtime code files that diverge
// between HEAD and gh-pages AND are actually loaded by index.html's MODS list, so the
// entire loaded graph matches HEAD exactly. Keeps the CAS-2202 facing-dot removal and
// restores boot. Assets load with per-asset procedural fallback => no boot dep on PNGs.
//
// Divergent+loaded set (git diff origin/gh-pages HEAD ∩ index.html MODS):
//   game.js, render/render.js, render/sprites.js, sim/config.js, sim/sim.js,
//   sim/world.js, strings.js
// (logic.js / version.js diverge too but are NOT in MODS => not loaded => excluded.)
// Reversible: revert to the CAS-2202 gh-pages parent + redeploy. Mirror of cas2202-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const OVERLAY = ["game.js", "render/render.js", "render/sprites.js", "sim/config.js", "sim/sim.js", "sim/world.js", "strings.js"];
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
  const idx = "/tmp/cas2220-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2220 SEV-1 hotfix: consistent module graph (7 code blobs) — restores boot after CAS-2202 T_STREET drift — build ${build}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}
console.log(JSON.stringify({ overlaySha: shas, ...buildAndPush() }, null, 2));
