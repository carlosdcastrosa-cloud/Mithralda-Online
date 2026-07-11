// CAS-2156: Deploy overlay DARK — LUNGE / Estocada de Avance (mec #40).
// Overlay = REAL blob set del Build CAS-2156 (git show --stat 717e472): mec #40 SÍ toca input.js (tecla Backslash + botón móvil)
// Y render/render.js (botón HUD tb.lunge se atenúa por _lungeCd) ⇒ 5 blobs: sim/config.js + sim/sim.js + input.js + strings.js +
// render/render.js. LUNGE.enabled:false ⇒ DARK, OFF==HEAD byte-id, 0 draws ⇒ srand ON==OFF. tools/ y design/ NO servidos.
// Supersede 04486d8c3b84/799. Mirror CAS-2147 (GuardBreak 5-blob) / CAS-2151 (mecanismo overlay).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const OVERLAY = ["sim/config.js", "sim/sim.js", "input.js", "strings.js", "render/render.js"];
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
  const idx = "/tmp/cas2156-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m",
    `CAS-2156: Deploy LUNGE/Estocada de Avance (mec #40) DARK — 5-blob overlay (config+sim+input+strings+render), LUNGE.enabled:false — build ${build}`);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}
let res = buildAndPush();
if (!res.pushed) { git("fetch", "origin", "gh-pages", "--quiet"); res = buildAndPush(); }
// md5 of each served behavior blob (byte-verify handle for QA/CEO)
const md5 = {};
for (const f of OVERLAY) md5[f] = createHash("md5").update(git("cat-file", "blob", shas[f])).digest("hex");
console.log(JSON.stringify({ ...res, md5, supersedes: "04486d8c3b84" }));
if (!res.pushed) process.exit(1);
