// CAS-1882 deploy (Hoguera/Rest Site — Bonfire, 13º pilar capstone Souls-like,
// knob BONFIRE — Build CAS-1881 8763856): Isolated 0-leak overlay of ONLY the
// game-core bonfire blobs (HEAD == build 8763856) onto origin/gh-pages. Everything
// else on gh-pages stays byte-identical. version.json regenerated over the full served tree.
// Overlay set read from `git show --stat 8763856` (lesson CAS-1828/1861/1870: never copy a
// mirror's blob count — verify per Build). This Build touched **4** game blobs
// (render + config + sim + strings); tools/cas1879-bonfire.mjs is the dev harness and is
// NOT deployed. (NO input.js this time — Bonfire reusa KeyE interact(), sin bind nuevo.)
//   sim/config.js    — knob BONFIRE{enabled,safeRadius,...} + recarga Estus (reusa FLASK.charges).
//                      enabled:false => rama de fuente intacta (heal+ancla), byte-id a HEAD (AC1).
//   sim/sim.js       — extiende la rama de fuente de interact() gateada BONFIRE.enabled: recarga
//                      Estus, fija ancla h.respawn (ya lo hace la fuente) y REPUEBLA no-jefes de
//                      la zona DETERMINISTA 0-draw (grid+tipo por índice, applyZoneScale; sin
//                      rr()/ri()/maybeAffix; jefes excluidos). Safe-gate: no-jefe en aggro dentro
//                      de safeRadius deniega descanso (toast+deny). 0 RNG (NO bonfireRng) =>
//                      srand ON==OFF byte-id (AC2). Ancla transitoria => save.v1 byte-id sin
//                      clave bonfire* (AC7). bonfire* dev hooks.
//   render/render.js — llama/glow procedural $0 en cada fountain, gateada.
//   strings.js       — 2 strings aditivos (rest hint + safe-deny toast).
// Guardrails: enabled:false => sim + save byte-identical to HEAD; srand ON==OFF (no draws).
// NOT deployed: harness tools/cas1879-bonfire.mjs. Auto-wake QA on blockers_resolved.
// Live base actual = e28b97b15ab1 / 799 files (Shield Block CAS-1875, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];

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
  const idx = "/tmp/cas1879-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1882: deploy Hoguera/Rest Site/Bonfire (CAS-1881) — build ${build}`);
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
