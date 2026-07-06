// CAS-1675 deploy: overlay the Arena Persistent Records build (CAS-1676, master HEAD 27c7ba3 —
// "Arena persistent records — bestBossWave + one-time milestone payoff", additive DELTA over
// CAS-1670) onto gh-pages. Live base == gh-pages tip d5c7647 (Arena boss waves, CAS-1670,
// build b0d3cd4e6fd5). The CAS-1676 commit changed exactly these 4 deployable code files
// (harnesses tools/cas1675-arena-records.mjs + tools/cas1670-bosswaves.mjs are NOT deployed);
// a code drift scan (HEAD vs gh-pages, excl tools/, shots/, and repo-only dirs
// docs/godot/hosting/tools-sprites/ops/design/art-reference/assets + *.md + package*.json) shows
// only these 4 + two pre-existing legacy files (logic.js, version.js — untouched since CAS-849,
// NOT arena, NOT referenced) diverge, so this overlay is clean-isolated (0 leak; legacy files
// stay at their gh-pages versions). Recipe mirrors cas1670-deploy.mjs.
//   game.js          gh -> HEAD  (__dev wrapper: arena records dev hooks for QA)
//   render/render.js gh -> HEAD  ('Mejor Jefe: Oleada N' menu + death overlay display)
//   sim/config.js    gh -> HEAD  (ARENA.bossRecordEssBase:10 knob)
//   sim/sim.js       gh -> HEAD  (feature: bestBossWave persist + one-time milestone payoff)
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
  const idx = "/tmp/cas1675-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1675: Arena persistent records (bestBossWave + milestone payoff) — build ${build}`);
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
