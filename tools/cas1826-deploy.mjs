// CAS-1828 deploy (Aturdimiento por Postura — Poise/Stagger, Build CAS-1827):
// Isolated 0-leak overlay of ONLY the 4 game-core poise blobs (HEAD == build 76fb9cb)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full served tree.
//   sim/config.js  — knob POISE{enabled,...} elite{max100/dur1.6/x1.5} boss{max280/dur1.0/x1.9},
//                    HARD-GATED. OFF => no poise fields armed, byte-id combat.
//   sim/sim.js     — STAGGER = stun-by-posture reusing the live e.stun gate (~3274, zero new AI);
//                    bonus dmg on staggered enemy computed in deterministic hitEnemy sink (0 srand
//                    draws => srand ON==OFF). 5 transient fields on G.enemies (NOT serialized) =>
//                    save.v1 byte-id. NO poiseRng. Standard tier gating. OFF => sim byte-id.
//   render/render.js — stagger cue (poise bar / stagger flash), gated (0-RNG, $0).
//   strings.js     — 1 string for the poise/stagger feature.
// Guardrails: OFF => sim + save byte-identical to HEAD; srand ON==OFF (no poiseRng draws).
// NOT deployed: harness tools/cas1826-poise.mjs. Auto-wake QA on blockers_resolved.
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
  const idx = "/tmp/cas1826-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1828: deploy Aturdimiento por Postura (CAS-1827) — build ${build}`);
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
