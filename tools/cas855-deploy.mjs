// CAS-855 deploy: re-apply the CAS-452/CAS-1174 mobile 390px HUD fixes to gh-pages.
// The fixes were live in gh-pages 4c46c26/b133985 but later "Add files via upload"
// commits (2c1cc59..3e0c53d) replaced render/render.js with a newer Continente-Tiled
// lineage that lacked them. This deploy overlays a PATCHED copy of the CURRENT
// gh-pages render/render.js (fix hunks ported forward — no clobber of the newer CT
// work) onto the gh-pages tree. Same overlay recipe as tools/cas1174-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PATCHED = "/tmp/ghp-render-patched.js"; // current gh-pages render.js + 390px hunks
const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");
const renderSha = gitStr("hash-object","-w","--",PATCHED);

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets","ui").toString().split("\n").filter(Boolean);
  const files = [...new Set([...ROOT_FILES, ...tracked, "render/render.js"])].sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = f === "render/render.js" ? readFileSync(PATCHED) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas855-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${renderSha},render/render.js`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-855: re-apply CAS-452 mobile 390px HUD fix (regressed by upload) — build ${build}`);
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
