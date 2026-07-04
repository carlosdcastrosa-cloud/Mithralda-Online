// CAS-1174 deploy: overlay the mobile 390px HUD fix onto gh-pages.
//   hud.js          — CAS-452 ≤480px console-hide + 0.70 scale tier (not yet live)
//   render/render.js — CAS-1174 ≤480px zone/OBJETIVO/tracker reflow + minimap/consumable
//                      scaling (carries CAS-453 hintFit + CAS-458 pause-dialog riders
//                      already committed to master in 371352b).
// Same proven overlay recipe as tools/cas456-deploy.mjs: read origin/gh-pages tree,
// swap only the CHANGED files for their HEAD blobs, recompute the version stamp over the
// exact deployed fileset, push a single commit to refs/heads/gh-pages.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];
const CHANGED = ["hud.js","render/render.js"];

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets","ui").toString().split("\n").filter(Boolean);
  const fromHead = new Set(CHANGED);
  const files = [...new Set([...ROOT_FILES, ...tracked, ...CHANGED])].sort();
  const h = createHash("sha256");
  for (const f of files) {
    const ref = fromHead.has(f) ? `HEAD:${f}` : `origin/gh-pages:${f}`;
    const blob = git("show", ref);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas1174-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of CHANGED) {
    const sha = gitStr("rev-parse", `HEAD:${f}`);
    execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${sha},${f}`], { env });
  }
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1174: mobile 390px HUD fix live — build ${build}`);
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
