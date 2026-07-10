// CAS-1907 deploy (Arquetipos de Arma / Weapon Archetypes — 17º pilar Souls-like,
// knob WEAPON_ARCHETYPES — Build CAS-1909 9e57b14): Isolated 0-leak overlay of ONLY the
// game-core blobs REALLY touched by the build (HEAD == build 9e57b14) onto origin/gh-pages.
// Everything else on gh-pages stays byte-identical. version.json regenerated over the full tree.
// Overlay set read from `git show --stat 9e57b14` (lesson CAS-1828/…/1892/1897/1901: never copy
// a mirror's blob count — verify per Build). This Build touched **2** game blobs (config + sim);
// helper weaponArchetype() reuses existing render/VFX ⇒ NO render/hud/input/game. The harness
// tools/cas1907-weapon-archetypes.mjs is dev-only and is NOT deployed.
//   sim/config.js  — knob WEAPON_ARCHETYPES{enabled:true, byDefId{w_steel:greatsword,
//                    w_rune:spear,w_rusty:dagger}, classes{sword,greatsword,dagger,spear}}.
//                    enabled:false => ARCH_UNIT (all mul 1) => byte-id a HEAD (AC1/OFF).
//   sim/sim.js     — helper weaponArchetype(h) (espejo equipLoad, 0-draw, sin campo de save) +
//                    seams ×mul gated WEAPON_ARCHETYPES.enabled: applyHeroMelee reach/arc/dmg +
//                    hitEnemy poiseDmg/backstab + heroAttack/heavyAttack swing + heavy/finisher stam.
//                    Los mul COMPONEN ×TWO_HAND. RNG-neutral (0-draw), save-neutral (transitorio).
// Guardrails: enabled:false => sim + save byte-identical to HEAD; srand ON==OFF (no draws).
// NOT deployed: harness tools/cas1907-weapon-archetypes.mjs. Auto-wake QA CAS-1911 on blockers_resolved.
// Live base actual = fb00a6e03db2 / 799 files (Hyperarmor CAS-1903, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js"];

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
  const idx = "/tmp/cas1907-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1907: deploy Weapon Archetypes (CAS-1909) — build ${build}`);
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
