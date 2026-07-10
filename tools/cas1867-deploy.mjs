// CAS-1870 deploy (Mancha de Sangre / Bloodstain-Corpse-Run — 11º pilar Souls-like,
// knob BLOODSTAIN — Build CAS-1869 91dba2e): Isolated 0-leak overlay of ONLY the
// game-core bloodstain blobs (HEAD == build 91dba2e) onto origin/gh-pages. Everything
// else on gh-pages stays byte-identical. version.json regenerated over the full served tree.
// Overlay set read from `git show --stat 91dba2e` (lesson CAS-1828/1861: never copy a
// mirror's blob count — verify per Build). This Build touched **6** game blobs
// (game + persist + render + config + sim + strings); tools/cas1867-bloodstain.mjs is the
// dev harness and is NOT deployed.
//   sim/config.js    — knob BLOODSTAIN{enabled,lossPct:1.0,recoverRadius:32,markerColor}
//                      HARD-GATED. enabled:false => banking de siempre, byte-id a HEAD (AC1).
//   sim/sim.js       — heroDie intercepta el banking de Esencia => atRisk a Mancha en el
//                      punto de muerte (store aislado); tickBloodstain recupera vía dist²
//                      (misma zona + recoverRadius) y banca; 2ª muerte reemplaza+pierde vieja.
//                      0 RNG (NO bloodstainRng) => srand ON==OFF byte-id (AC2). bloodstain* hooks.
//   persist.js       — G.bloodstain en store aislado mithralda.bloodstain.v1 (mirror KEY_ARENA)
//                      vía flag one-shot G.bloodstainDirty => save.v1 allowlist intacta (AC7).
//   render/render.js — marcador $0 arte (charco markerColor + shimmer con G.t), gated.
//   game.js          — feed gated BLOODSTAIN.enabled.
//   strings.js       — bloodstain hint.
// Guardrails: enabled:false => sim + save byte-identical to HEAD; srand ON==OFF (no draws).
// NOT deployed: harness tools/cas1867-bloodstain.mjs. Auto-wake QA on blockers_resolved.
// Live base actual = 3cdecd9d3bdc / 799 files (Estus CAS-1861, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "persist.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];

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
  const idx = "/tmp/cas1867-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1870: deploy Mancha de Sangre/Bloodstain (CAS-1869) — build ${build}`);
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
