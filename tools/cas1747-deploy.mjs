// CAS-1747 deploy (CAS-1744 Caldera de Cenizas chain; build CAS-1783 commit b544f11):
// Isolated 0-leak overlay of ONLY the blobs the Caldera build touched (HEAD blobs) onto origin/gh-pages.
// Everything else on gh-pages stays byte-identical. version.json regenerated over the full served tree.
//
// 7 game-core code blobs (5th gated endgame zone, additive behind ZONE5.enabled=false ⇒ OFF byte-identical):
//   render/render.js  — molten tint (reuses cave_floor) + gated-portal req render
//   render/sprites.js — ENEMY_STRIPS x3: emberkin/magmabrute/calderatyrant (idle/walk/attack/hurt/death)
//   sim/config.js     — T_CALDERA tile, ZONE5 knob, ZONE_TIER/HUNTS.caldera, CALDERA_POWER_REQ, ETPL, ZONE5_MOD emberfury
//   sim/gear.js       — ZONE_LOOT.caldera tier[4,4]
//   sim/sim.js        — zone5Rng(0xca1de5a0) bonus-loot stream, usePortal gate, dynamic modifier pool, killEnemy bonus, QA hooks
//   sim/world.js      — gated caldera biome block (molten floor, spawner, gated portal), zoneOf caldera
//   strings.js        — caldera toasts
//
// 15 mob/boss animation strips (committed 983457d, NOT yet on gh-pages — game loads them when ZONE5 active):
//   assets/pixellab/fountains/anim/{emberkin,magmabrute,calderatyrant}_{idle,walk,attack,hurt,death}_strip.png
//
// NOT deployed: harness tools/*.mjs or any other working-tree file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const STRIP_DIR = "assets/pixellab/fountains/anim";
const MOBS = ["emberkin", "magmabrute", "calderatyrant"];
const STATES = ["idle", "walk", "attack", "hurt", "death"];
const STRIPS = MOBS.flatMap(m => STATES.map(s => `${STRIP_DIR}/${m}_${s}_strip.png`));
const CODE = ["render/render.js", "render/sprites.js", "sim/config.js", "sim/gear.js", "sim/sim.js", "sim/world.js", "strings.js"];
const OVERLAY = [...CODE, ...STRIPS];

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
  const idx = "/tmp/cas1747-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1747: deploy Caldera de Cenizas (CAS-1783) — build ${build}`);
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
