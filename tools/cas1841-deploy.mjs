// CAS-1841 deploy (Estamina/Vigor — Pilar 8, knob STAMINA — Build CAS-1842):
// Isolated 0-leak overlay of ONLY the game-core stamina blobs (HEAD == build 3a21bce)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full served tree.
// Overlay set read from `git show --stat 3a21bce` (lesson CAS-1828: never copy a mirror's
// blob count — verify per Build). This Build touched game.js + hud.js + config + sim + strings
// (5 blobs, MORE than the 3-blob backstab mirror — the HUD stamina bar + game.js feed hook).
//   sim/config.js   — knob STAMINA{enabled,max,regen,regenDelay,cost{dodge,parry,heavy,finisher,
//                     ability,ultimate}}, HARD-GATED. OFF => byte-id combat.
//   sim/sim.js      — spendStam(h,cost) gates every POWER action (dodge/parry/heavy/finisher/
//                     ability/ultimate); light L NEVER gated. tickStamina regen w/ post-spend
//                     pause. 0 RNG (compare+subtract, NO staminaRng) => srand ON==OFF byte-id.
//                     h.stam/_stamFlash/_stamRegenPauseT transitorios (NOT in serializeSave
//                     allowlist) => save.v1 byte-id, NO mithralda.stamina.v1. stamina* dev hooks.
//   game.js         — HUD stamina feed hook (gated).
//   hud.js          — stamina bar render + deny flash (gated).
//   strings.js      — notEnoughStamina.
// Guardrails: OFF => sim + save byte-identical to HEAD; srand ON==OFF (no staminaRng draws).
// NOT deployed: harness tools/cas1841-stamina.mjs. Auto-wake QA on blockers_resolved.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "hud.js", "sim/config.js", "sim/sim.js", "strings.js"];

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
  const idx = "/tmp/cas1841-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1841: deploy Estamina/Vigor (CAS-1842) — build ${build}`);
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
