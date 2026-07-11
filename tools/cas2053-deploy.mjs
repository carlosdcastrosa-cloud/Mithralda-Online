// CAS-2053 deploy (recovery Deploy for CAS-2046 Boss Rush Time-Attack, Build CAS-2052 == df6c208):
// Isolated 0-leak overlay of the EXACTLY-5 prod blobs REALLY touched by the build onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json regenerated
// over the full tree.
//
// DARK deploy: BOSS_RUSH.timeAttack ships false (Gate CEO owns the flip, mirror CAS-2043).
// timeAttack:false ⇒ ENTIRE layer dormant (timer + score + records + recap all gated off),
// gauntlet byte-identical to live path; isolated save mithralda.bossrush.v1 stays {v:1,bestRound}
// (additive schema not bumped while DARK) ⇒ save + srand byte-id to live.
//
// REAL blob set derived EMPIRICALLY from `git diff --stat df6c208^..df6c208` (build-parent..HEAD),
// matches ticket's 5-blob prediction exactly:
//   sim/config.js    — BOSS_RUSH.timeAttack:false + showTimer/showScore sub-toggles.
//   sim/sim.js       — time-attack timer (SIM dt, combat-only) + score + records persist seam.
//   render/render.js — HUD timer + score/records block in recap overlay.
//   strings.js       — time-attack copy (served from root).
//   input.js         — time-attack scene guards.
// The harness tools/cas2047-timeattack.mjs is dev-only and is NOT deployed.
// Rollback = revert of these 5 blobs. Live base actual = 1cc255d4b339 / 799 (post NG+ Recap flip CAS-2043).
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
  const idx = "/tmp/cas2053-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2053 (CAS-2046): deploy (recovery) Boss Rush Time-Attack — BOSS_RUSH.timeAttack:false DARK (sim/config.js+sim/sim.js+render/render.js+strings.js+input.js, 5 prod blobs) — build ${build}`);
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
