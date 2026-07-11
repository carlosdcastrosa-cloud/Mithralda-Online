// CAS-1964 deploy (CAS-1954 EVO — Cenizas de Espíritu / Spirit Summon, knob SUMMON —
// Build CAS-1963, HEAD == fix-forward 2c59d6f): Isolated 0-leak overlay of ONLY the
// game-core blobs REALLY touched by the build onto origin/gh-pages. Everything else on
// gh-pages stays byte-identical. version.json regenerated over the full tree.
// Re-issue of abandoned CAS-1956 (its predecessor Build CAS-1955 is dead-locked; the live
// Build is the fresh CAS-1963 fix-forward at HEAD).
// Overlay set read from `git diff --stat df18e2b(prev-deploy source) HEAD` restricted to
// PROD dirs (lesson CAS-1828/…/1949: never copy a mirror's blob count — verify per Build).
// This Build touched **4** PROD blobs (all differ vs the deployed base 2c0aa99354b9):
//   sim/config.js  — knob SUMMON{enabled:false, key:"KeyN", charges:2, refillOnZone,
//                    summonMs:14000, threat:"nearest", maxActive:1, spirit{hpPct,dmgMul,
//                    moveMul,attackType,atkCdMs,range,tint,alpha,mold}}. enabled:false =>
//                    ambos SEAMs no-op => byte-id a 22 pilares.
//   sim/sim.js     — SEAM1 sombra block-scoped de `h` en updateEnemies (enemigo persigue/
//                    encara al espíritu, nearest, 0 draws); SEAM2 early-return gated en
//                    damageHero (golpe enemigo lo come el espíritu, HP héroe intacto).
//                    Entidad transitoria G._spirit (molde spawnEnemy, ally maxActive:1),
//                    updateSpirit target=artTarget/nearest, hitEnemy{spirit:true} GATEA
//                    crit/boons/procs => baseline ×1 0-srand. Recurso summonCharges mirror
//                    flaskCharges (refill zona/bonfire). _spirit/summon* transitorio fuera
//                    del allowlist => save byte-id. RNG-neutral STRONG (espíritu determinista).
//   render/render.js — espíritu con tinte espectral cian + alpha ($0 arte, procedural).
//   input.js       — KeyN => summon (code dedicado NO rebindable; gated al knob).
// Los harness tools/cas1954-summon.mjs son dev-only y NO se deployan.
// Guardrails: enabled:false => byte-identical a HEAD; srand ON==OFF (0 draws, espíritu determinista).
// Auto-wake QA CAS-1957 on blockers_resolved (CAS-1954 eslabón 3).
// Live base actual = 2c0aa99354b9 / 799 files (0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js", "input.js"];

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
  const idx = "/tmp/cas1954-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1980: GO-LIVE FLIP Cenizas de Espíritu / Spirit Summon (SUMMON enabled:true, config-only) — build ${build}`);
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
