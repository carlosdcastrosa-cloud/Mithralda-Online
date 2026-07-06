// CAS-1692 deploy: overlay Nuevos MOBS build onto gh-pages.
// Changed files vs previous HEAD (CAS-1689/sockets):
//   sim/config.js         — NEW_MOBS knob + 3 new ETPL entries (thornspitter/ironback/ashwraith)
//   sim/world.js          — NEW_MOBS.enabled gates new types in forest/ruins/caves spawners
//   render/render.js      — MOB_GAIT entries for 3 new mobs
//   render/sprites.js     — ENEMY_IMG entries for 3 new sprite cutouts
//   bestiary.js           — ROSTER additions (3 new mob types)
//   strings.js            — mobName entries (3 Spanish mob names)
//   assets/pixellab/fountains/enemy_thornspitter.png  — PixelLab FOUNTAINS-style cutout
//   assets/pixellab/fountains/enemy_ironback.png      — PixelLab FOUNTAINS-style cutout
//   assets/pixellab/fountains/enemy_ashwraith.png     — PixelLab FOUNTAINS-style cutout
// Harness tools/cas1692-mobs-live-qa.mjs is NOT deployed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = [
  "game.js", "sim/config.js", "sim/world.js", "sim/sim.js",
  "render/render.js", "render/sprites.js",
  "bestiary.js", "strings.js",
  "assets/pixellab/fountains/enemy_thornspitter.png",
  "assets/pixellab/fountains/enemy_ironback.png",
  "assets/pixellab/fountains/enemy_ashwraith.png",
];
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
  const idx = "/tmp/cas1692-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1692: Nuevos MOBS — build ${build}`);
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
