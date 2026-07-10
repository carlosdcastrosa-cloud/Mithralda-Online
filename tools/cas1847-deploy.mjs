// CAS-1849 deploy (Lock-On / Enfoque de Objetivo — 9º pilar Souls-like, knob LOCK_ON —
// Build CAS-1848 5230614): Isolated 0-leak overlay of ONLY the game-core lock-on blobs
// (HEAD == build 5230614) onto origin/gh-pages. Everything else on gh-pages stays
// byte-identical. version.json regenerated over the full served tree.
// Overlay set read from `git show --stat 5230614` (lesson CAS-1828: never copy a mirror's
// blob count — verify per Build). This Build touched 5 game blobs (input + render + config +
// sim + strings) — the seam-maestro + reticle feature; NOT game.js/hud.js (that was stamina).
//   sim/config.js   — knob LOCK_ON{enabled,key:Tab,range:340,cycleCd:0.14,reticleCol},
//                     HARD-GATED. OFF => byte-id combat/facing.
//   sim/sim.js      — newHero lockTarget/lockCd (transitorios, fuera de serializeSave =>
//                     save.v1 byte-id, NO clave nueva); export cycleLock() sort determinista
//                     (d2||índice, wrap); tickLock() debounce+auto-clear; SEAM MAESTRO
//                     override de h.facing al target cada frame (corre último, gana sobre
//                     io.aimActive) => melee/backstab/parry/combos se auto-orientan GRATIS,
//                     h.vx/vy (mv) intacto => strafe. 0 RNG (geometría/input, NO lockOnRng)
//                     => srand ON==OFF byte-id. lock* dev hooks.
//   input.js        — edge Tab => sim.cycleLock() gated; preventDefault gate cuando enabled.
//   render/render.js— drawLockReticle (anillo + 4 chevrones rotando con G.t) gated, $0 arte.
//   strings.js      — lockOnHint.
// Guardrails: OFF => sim + save byte-identical to HEAD; srand ON==OFF (no lockOnRng draws).
// NOT deployed: harness tools/cas1847-lock-on.mjs. Auto-wake QA on blockers_resolved.
// Live base actual = 857060c7aadc / 799 files (0-leak target preserved).
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
  const idx = "/tmp/cas1847-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1849: deploy Lock-On/Enfoque de Objetivo (CAS-1848) — build ${build}`);
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
