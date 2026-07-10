// CAS-1931 deploy (Acumulación de Estados — Status Buildup, 21º pilar Souls-like,
// knob STATUS_BUILDUP — Build CAS-1933 92d2bfa): Isolated 0-leak overlay of ONLY the
// game-core blobs REALLY touched by the build (HEAD == build 92d2bfa) onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full tree. Overlay set read from `git show --stat 92d2bfa`
// (lesson CAS-1828/…/1920/1926: never copy a mirror's blob count — verify per Build).
// This Build touched **2** PROD blobs (feedback floater/addFx ⇒ render $0):
//   sim/config.js  — knob STATUS_BUILDUP{enabled:true, types{bleed,poison,frost},
//                    elementMap{burn→poison, slow→frost}, thresholds, decayPerSec,
//                    procPctHp, bossBuildMul, bossProcPctHp}. enabled:false =>
//                    reconversión statusOrBuildup cae a applyStatus instantáneo, bleed
//                    inerte, 0 medidor/tick/proc => byte-id a HEAD (AC0/OFF, 20 pilares).
//   sim/sim.js     — medidor OCULTO ent.bld por tipo (mirror perezoso dots);
//                    addBuildup (sube ×bossBuildMul, procea+reset al cruzar threshold);
//                    procBuildup (bleed⇒ráfaga round(maxHp*procPctHp) defence-bypass a
//                    killEnemy/heroDie · poison⇒applyStatus poison DoT · frost⇒applyStatus
//                    slow+drena stam héroe); tickBuildup decae decayPerSec*dt junto a
//                    tickDots (héroe+enemigos). Reconversión GATED statusOrBuildup en
//                    hitEnemy boons+WEAPON_BUFFS ember/frost+afijo burn + damageHero infl;
//                    físico melee⇒addBuildup bleed (hero+enemy paridad). Campo transitorio
//                    ent.bld fuera del allowlist => save.v1 byte-id sin clave bld*.
//                    RNG-neutral STRONG (0-draw, srand ON==OFF 48-draw).
// El harness tools/cas1931-status-buildup.mjs es dev-only y NO se deploya.
// Guardrails: enabled:false => sim/config + save byte-identical to HEAD; srand ON==OFF (no draws).
// Auto-wake QA CAS-1935 on blockers_resolved (CAS-1931 eslabón 3).
// Live base actual = 7d47bd4f163f / 799 files (Weapon Buffs CAS-1928, 0-leak target preserved).
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
  const idx = "/tmp/cas1931-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1931: deploy Acumulación de Estados / Status Buildup (CAS-1933) — build ${build}`);
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
