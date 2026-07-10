// CAS-1836 deploy (Golpe por la Espalda / Backstab — Build CAS-1837):
// Isolated 0-leak overlay of ONLY the 3 game-core backstab blobs (HEAD == build 1586b56)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full served tree.
// Overlay set read from `git show --stat 1586b56` (lesson CAS-1828: never copy a mirror's
// blob count — verify per Build). This Build touched config + sim + strings, and did NOT
// touch input.js or render/render.js (differs from the combo mirror CAS-1833).
//   sim/config.js   — knob BACKSTAB{enabled,rearArcDeg:120,mult:1.8,knockMul:1.6}, HARD-GATED.
//                     OFF => byte-id combat.
//   sim/sim.js      — hitEnemy backstab branch: MELEE hit (opt.melee) whose attack vector enters
//                     enemy rear arc (|angDiff(ang,e.facing)|<rearArcDeg/2) => ×mult dmg + ×knockMul
//                     knock; pure geometry over e.facing (already lives, not serialized) => 0 srand,
//                     NO backstabRng; stacks on POISE.bonusDmg + rematador. NO new save key/field.
//                     backstab* dev hooks + cyan #8fe3ff VFX.
//   strings.js      — backstab banner.
// Guardrails: OFF => sim + save byte-identical to HEAD; srand ON==OFF (no backstabRng draws).
// NOT deployed: harness tools/cas1836-backstab.mjs. Auto-wake QA on blockers_resolved.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "strings.js"];

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
  const idx = "/tmp/cas1836-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1836: deploy Backstab (CAS-1837) — build ${build}`);
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
