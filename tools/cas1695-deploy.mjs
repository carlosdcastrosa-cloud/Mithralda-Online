// CAS-1695 deploy: overlay 8-dir ANIMATED Nuevos MOBS onto gh-pages.
// v1 (single-cutout ENEMY_IMG mobs) already LIVE; this ships the CAS-1706 wiring +
// CAS-1699 animated strips. Precise 0-leak delta vs current gh-pages (verified by
// blob compare HEAD..origin/gh-pages — game.js/world.js/bestiary/strings/cutouts already live):
//   sim/config.js     — richAnim:true on ashwraith/ironback/thornspitter ETPL rows (CAS-1706)
//   render/render.js  — CAS-1706 crash-guard `if(!drew && spr)` (CAS-360 undefined-SP window)
//   render/sprites.js — ENEMY_STRIPS entries for the 3 mobs (idle4/walk6/attack9/hurt7/death9)
//   assets/pixellab/fountains/anim/{ashwraith,ironback,thornspitter}_{idle,walk,attack,hurt,death}_strip.png (15 NEW)
// NOT deployed: harness tools/cas1693-newmobs.mjs / tools/cas1699-*.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const MOBS = ["ashwraith", "ironback", "thornspitter"];
const STATES = ["idle", "walk", "attack", "hurt", "death"];
const STRIPS = MOBS.flatMap(m => STATES.map(s => `assets/pixellab/fountains/anim/${m}_${s}_strip.png`));
const OVERLAY = [
  "sim/config.js", "render/render.js", "render/sprites.js",
  ...STRIPS,
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
  const idx = "/tmp/cas1695-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1695: Nuevos MOBS 8-dir animados — build ${build}`);
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
