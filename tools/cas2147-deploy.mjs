// CAS-2147: Deploy overlay DARK — Empujón/Patada Rompe-Guardia (mec #38).
// Overlay = REAL blob set del Build CAS-2146 (git show --stat 5f7c33e): mec #38 SÍ toca input.js
// (tecla Period + botón HUD) y render/render.js (botón móvil) ⇒ 5 blobs: input.js + render/render.js +
// sim/config.js + sim/sim.js + strings.js. GUARD_BREAK.enabled:false ⇒ DARK, OFF==HEAD byte-id, 0 draws
// ⇒ srand ON==OFF. tools/ NO servido. Supersede 7847befbb4a7/799. Mirror CAS-2136/CAS-2133.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const OVERLAY = ["input.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
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
  const idx = "/tmp/cas2147-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m",
    `CAS-2147: Deploy Empujón/Rompe-Guardia (mec #38) DARK — 5-blob overlay (input.js+render/render.js+sim/config.js+sim/sim.js+strings.js), GUARD_BREAK.enabled:false — build ${build}`);
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
