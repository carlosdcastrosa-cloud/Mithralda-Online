// CAS-1887 deploy (Bonfire Pilar 13 PLACEMENT RETUNE — knob BONFIRE.sites — Build
// CAS-1886 2bbbb9a): Isolated 0-leak overlay of ONLY the game-core blobs changed by
// this Build (HEAD == build 2bbbb9a) onto origin/gh-pages. Everything else on gh-pages
// stays byte-identical. version.json regenerated over the full served tree.
// Overlay set read from `git show --stat 2bbbb9a` (lesson CAS-1828/1861/1870/1882: never
// copy a mirror's blob count — verify per Build). This Build touched **3** game blobs
// (render + config + sim). strings.js NOT touched (no new strings, placement-only).
// tools/cas1879-bonfire.mjs is the dev harness and is NOT deployed.
//   sim/config.js    — knob BONFIRE.sites = lista de ZONAS de caza pobladas + siteAnchor.
//                      Aditivo: las 2 fountains de `field` siguen curando. enabled:false =>
//                      sites no detectados => byte-id a HEAD (AC1/OFF).
//   sim/sim.js       — bonfireSites(w) resuelve cada zona a pos DETERMINISTA 0-draw desde el
//                      rect del primer spawner en-zona (guard descarta huntZones->field);
//                      interact() enruta el site por la MISMA rama gateada de descanso
//                      (rest = f || site) => zoneOf(site)=zona poblada => repop>0 automatico.
//                      bonfireRespawn/bonfireUnsafe SIN cambios. 0 RNG => srand ON==OFF byte-id.
//   render/render.js — hoguera standalone procedural $0 (piedra+leños+llama/glow), gateada +
//                      view-culled por site. Sin PNG.
// Guardrails: enabled:false / sites vacio => sim + save byte-identical to HEAD; 0 RNG (sites
// = config estatica) => srand ON==OFF; save.v1 byte-id (sin estado nuevo). $0 arte.
// NOT deployed: harness tools/cas1879-bonfire.mjs. Auto-wake QA CAS-1888 on blockers_resolved.
// Live base actual = 1be397f48cfb / 799 files (Bonfire CAS-1882, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["render/render.js", "sim/config.js", "sim/sim.js"];

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
  const idx = "/tmp/cas1887-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1887: deploy Bonfire placement retune BONFIRE.sites (CAS-1886) — build ${build}`);
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
