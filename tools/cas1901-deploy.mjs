// CAS-1901 deploy (Hyperarmor / Superarmadura en Golpes Comprometidos — 16º pilar
// Souls-like, knob HYPERARMOR — Build CAS-1902 784744e): Isolated 0-leak overlay of
// ONLY the game-core hyperarmor blobs (HEAD == build 784744e) onto origin/gh-pages.
// Everything else on gh-pages stays byte-identical. version.json regenerated over the
// full served tree.
// Overlay set read from `git show --stat 784744e` (lesson CAS-1828/1861/1870/1879/1892/1897:
// never copy a mirror's blob count — verify per Build). This Build touched **2** game blobs
// (config + sim); VFX reuses addFx (dodgering) ⇒ NO render. tools/cas1901-hyperarmor.mjs is the
// dev harness and is NOT deployed.
//   sim/config.js  — knob HYPERARMOR{enabled,appliesTo{heavy,finisher},poiseThreshold:34,
//                    twoHandBonus:1.0,vfx:true}. enabled:false => neutral => byte-id a HEAD (AC5/OFF).
//   sim/sim.js     — seam gated HYPERARMOR.enabled: rama en damageHero JUSTO antes del applyStatus
//                    del stun (CAS-1826) que suprime SÓLO ese stun (infl=null) durante la ventana
//                    comprometida ((h._heavy||h._comboFin)&&h.atkAnim>0) cuando poise-dmg(=dmg crudo)
//                    < thr; el daño sigue aterrizando (NO i-frame); >=thr rompe. slow/dot intactos.
//                    RNG-neutral (0-draw, NO hyperArmorRng), save-neutral (h.hyperarmor transitorio).
// Guardrails: enabled:false => sim + save byte-identical to HEAD; srand ON==OFF (no draws).
// NOT deployed: harness tools/cas1901-hyperarmor.mjs. Auto-wake QA CAS-1904 on blockers_resolved.
// Live base actual = b621205ffc42 / 799 files (Two-Handing CAS-1897, 0-leak target preserved).
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
  const idx = "/tmp/cas1901-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1901: deploy Hyperarmor (CAS-1902) — build ${build}`);
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
