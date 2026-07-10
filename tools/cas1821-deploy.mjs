// CAS-1821 deploy (Habilidades especiales telegrafiadas, Build CAS-1820 — enemy abilities):
// Isolated 0-leak overlay of ONLY the 3 game-core ability blobs (HEAD == build 3b43f92)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full served tree.
//   sim/config.js  — knob ENEMY_ABILITIES{enabled,...}, HARD-GATED. OFF => 0 assignments.
//   sim/sim.js     — A1 directional lunge (special.lunge, src=e => parryable+evadible) on a
//                    rusher élite; A2 radial ground-slam (special.slam, shards src=null) on a
//                    brute élite; windup->strike AI + armTelegraph + damageHero (BORROWED live
//                    machinery). Dedicated abilityRng 0x0ab111a7 (0 srand draws => srand ON==OFF).
//                    e.special transient (NOT serialized) => save.v1 byte-id. OFF => sim byte-id.
//   render/render.js — telegraph cue for the new specials, gated (0-RNG, $0).
// Guardrails: OFF => 0 assignments => sim + save byte-identical to HEAD; srand ON==OFF.
// NOT deployed: harness tools/cas1819-abilities.mjs. Auto-wake QA CAS-1822.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js"];

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
  const idx = "/tmp/cas1821-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1821: deploy Habilidades especiales telegrafiadas (CAS-1820) — build ${build}`);
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
