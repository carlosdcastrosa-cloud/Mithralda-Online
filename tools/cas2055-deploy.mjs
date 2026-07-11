// CAS-2055 FLIP deploy (Gate CEO GO for CAS-2046 Boss Rush Time-Attack):
// config-only flip timeAttack:false→true (commit aeaa69c, mirror CAS-2043). Isolated 0-leak
// overlay of the EXACTLY-5 prod blobs onto origin/gh-pages; everything else byte-identical.
// version.json regenerated over the full tree.
//
// LIVE deploy: BOSS_RUSH.timeAttack now ships TRUE ⇒ entire layer active (timer + score +
// records + recap). ONLY sim/config.js changed vs the DARK deploy (build 1784390064aa); the
// other 4 blobs stay byte-identical to QA-proven (sim caf4cafa / render ebfb28d3 /
// strings 0bc2effd / input 898090c0). Isolated save mithralda.bossrush.v1 schema unchanged.
// Rollback = revert config.js (true→false), redeploy. Live base actual = 1784390064aa / 799.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js", "strings.js", "input.js"];

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
  const idx = "/tmp/cas2055-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2055 (CAS-2046): FLIP Boss Rush Time-Attack — BOSS_RUSH.timeAttack:true LIVE (config-only, Gate CEO GO; sim/config.js changed, other 4 blobs byte-id QA-proven) — build ${build}`);
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
