// CAS-651 deploy: overlay the padded warrior idle8/walk8 strips (164px cells) onto
// gh-pages. gh-pages render.js already carries the matching +12 DIR8_AX table (identical
// to master), but the strips there are still the 140px versions -> live mis-anchor.
// Same overlay recipe as tools/cas855-deploy.mjs (blob overlay + version.json rebuild).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const OVERLAY = {
  "assets/erw/hero/classes/warrior_idle8.png": "assets/erw/hero/classes/warrior_idle8.png",
  "assets/erw/hero/classes/warrior_walk8.png": "assets/erw/hero/classes/warrior_walk8.png",
};
const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");
const shas = {};
for (const [dst, src] of Object.entries(OVERLAY)) shas[dst] = gitStr("hash-object","-w","--",src);

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets","ui").toString().split("\n").filter(Boolean);
  const files = [...new Set([...ROOT_FILES, ...tracked, ...Object.keys(OVERLAY)])].sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = OVERLAY[f] ? readFileSync(OVERLAY[f]) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas651-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const [dst] of Object.entries(OVERLAY))
    execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[dst]},${dst}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-651: padded warrior idle8/walk8 strips (164px cells, un-clipped sword flame) to match +12 DIR8_AX — build ${build}`);
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
