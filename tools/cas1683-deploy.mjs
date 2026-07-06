// CAS-1683 deploy: overlay the Eventos de Zona build (CAS-1682, master HEAD 6516f75 —
// "Eventos de Zona aleatorios (santuario/cofre custodiado/duende) — 0-2 POIs opt-in por zona",
// additive core-loop feature gated by ZONE_EVENTS.enabled) onto gh-pages. Live base ==
// gh-pages tip 2a98b256 (Arena persistent records, CAS-1675, build f0013c013a0c). The CAS-1682
// commit changed exactly these 4 deployable code files (harness tools/cas1681-events.mjs is NOT
// deployed); a code drift scan (HEAD vs gh-pages over game.js/render/sim + root code files) shows
// only these 4 diverge, so this overlay is clean-isolated (0 leak). Recipe mirrors cas1675-deploy.mjs.
//   game.js          gh -> HEAD  (__dev wrapper: zone-events dev hooks for QA)
//   render/render.js gh -> HEAD  (POI markers / event visuals)
//   sim/config.js    gh -> HEAD  (ZONE_EVENTS.enabled/density knobs + eventRng seed)
//   sim/sim.js       gh -> HEAD  (feature: santuario/cofre custodiado/duende POI spawn+resolve)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"]; // HEAD versions
const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch", "origin", "gh-pages", "--quiet");

const shas = {};
for (const f of OVERLAY) shas[f] = gitStr("rev-parse", `HEAD:${f}`);

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets","ui").toString().split("\n").filter(Boolean);
  const files = [...new Set([...ROOT_FILES, ...tracked, ...OVERLAY])].sort();
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
  const idx = "/tmp/cas1683-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1683: Eventos de Zona (santuario/cofre/duende) — build ${build}`);
  try {
    execFileSync("git", ["push","origin",`${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr||e.stdout||e.message||"").toString().slice(0,300) };
  }
}

let res = buildAndPush();
if (!res.pushed) { git("fetch","origin","gh-pages","--quiet"); res = buildAndPush(); }
console.log(JSON.stringify(res));
if (!res.pushed) process.exit(1);
