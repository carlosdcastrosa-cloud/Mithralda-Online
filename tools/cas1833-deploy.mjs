// CAS-1833 deploy (Combos/Moveset + rematador anti-Stagger — Build CAS-1832):
// Isolated 0-leak overlay of ONLY the 4 game-core combo blobs (HEAD == build 64c74a2)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full served tree.
// NOTE the overlay set differs from the poise mirror (CAS-1826): this Build touched
//   input.js + strings.js, and did NOT touch render/render.js. Set read from
//   `git show --stat 64c74a2` (lesson CAS-1828: never copy the mirror's blob count).
//   input.js        — dedicated COMBO.heavyKey (KeyN) -> sim.heavyAttack(), gated, non-rebindable.
//   sim/config.js   — knob COMBO{chain window/finisher, heavy cd/dmg/poise, staggerPunishMul},
//                     HARD-GATED. OFF => byte-id combat.
//   sim/sim.js      — hero comboCount/comboT/_comboFin/_heavy transient state (mirror frenzyStacks,
//                     NOT serialized => save.v1 byte-id); light chain L->L->L finisher; heavyAttack();
//                     rematador (staggerPunishMul, opt.melee + e.staggerT>0, stacks on POISE bonus,
//                     0 srand draws => srand ON==OFF). NO comboRng.
//   strings.js      — STR.execute (REMATE banner).
// Guardrails: OFF => sim + save byte-identical to HEAD; srand ON==OFF (no comboRng draws).
// NOT deployed: harness tools/cas1831-combo.mjs. Auto-wake QA on blockers_resolved.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["input.js", "sim/config.js", "sim/sim.js", "strings.js"];

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
  const idx = "/tmp/cas1833-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1833: deploy Combos/Moveset (CAS-1832) — build ${build}`);
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
