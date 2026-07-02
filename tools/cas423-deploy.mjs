// CAS-423 deploy: overlay the re-lit ground (4 assets/tiles PNGs + render/palette.js) and
// render/render.js (restores the CAS-272 v2 draft reveal pop that the CAS-416/417 overlays
// clobbered) onto origin/gh-pages, stamp version.json from the EXACT deployed fileset,
// commit onto the current gh-pages tip via a temp index, push. Mirror of cas417-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];
const CHANGED = ["assets/tiles/ruins_grass.png","assets/tiles/ruins_grass2.png","assets/tiles/ruins_floor.png","assets/tiles/ruins_floor2.png","render/palette.js","render/render.js"];
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets").toString().split("\n").filter(Boolean);
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
  const idx = "/tmp/cas423-index";
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
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-423: re-lit outdoor ground (tiles + palette) + restore CAS-272 v2 reveal pop — build ${build}`);
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
