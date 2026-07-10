// CAS-1897 deploy (Two-Handing / Empuñadura a Dos Manos — 15º pilar Souls-like,
// knob TWO_HAND — Build CAS-1896 79f54d6): Isolated 0-leak overlay of ONLY the
// game-core two-hand blobs (HEAD == build 79f54d6) onto origin/gh-pages. Everything
// else on gh-pages stays byte-identical. version.json regenerated over the full served tree.
// Overlay set read from `git show --stat 79f54d6` (lesson CAS-1828/1861/1870/1879/1892: never copy a
// mirror's blob count — verify per Build). This Build touched **6** game blobs
// (config + sim + input + game + hud + render); tools/cas1895-two-hand.mjs is the dev harness and is
// NOT deployed.
//   sim/config.js  — knob TWO_HAND{enabled,key:ShiftRight,dmgMul1.35,poiseMul1.5,stamMul1.15,
//                    dropsShield,moveMul1.0}. enabled:false => neutral => byte-id a HEAD (AC1/OFF).
//   sim/sim.js     — seams gated TWO_HAND.enabled: equipLoad excluye escudo (drop banda, CAS-1889);
//                    applyHeroMelee ×dmgMul + poise ×poiseMul (CAS-1826); heavy/finisher stam ×stamMul
//                    (CAS-1841); rama de bloqueo damageHero sale temprano (reusa gate h.blocking,
//                    CAS-1873). RNG-neutral (0-draw, NO twoHandRng), save-neutral (transitorio).
//   input.js       — toggle ShiftRight => h.twoHand; móvil botón HUD toggle.
//   game.js        — feed gated de estado two-hand a HUD ($0 arte).
//   hud.js         — indicador de postura DOM ($0 arte).
//   render/render.js — hook de postura ($0 arte, view-culled).
// Guardrails: enabled:false => sim + save byte-identical to HEAD; srand ON==OFF (no draws).
// NOT deployed: harness tools/cas1895-two-hand.mjs. Auto-wake QA CAS-1898 on blockers_resolved.
// Live base actual = aea6ee9ab047 / 799 files (Equip Load CAS-1892, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "hud.js", "input.js", "render/render.js", "sim/config.js", "sim/sim.js"];

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
  const idx = "/tmp/cas1895-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1895: deploy Two-Handing (CAS-1896) — build ${build}`);
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
