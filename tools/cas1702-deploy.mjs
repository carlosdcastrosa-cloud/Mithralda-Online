// CAS-1702 deploy: overlay the Visual Map Editor + MapDoc v1 round-trip loader build
// (CAS-1702, master HEAD a8a3089) onto gh-pages. Live base == gh-pages tip 5cf8251
// (CAS-1692 Nuevos MOBS, build 4372514cbfa2, 764 files). The a8a3089 commit changed exactly
// these 6 deployable files (harness tools/cas1702-editor-smoke.mjs is NOT deployed); a drift
// scan (HEAD vs gh-pages over all core code files) shows only these 6 diverge → 0-leak overlay.
// Recipe mirrors cas1688-deploy.mjs.
//   editor.html    NEW  (in-browser map editor page)
//   editor.js      NEW  (editor logic: paint/zones/entities/export/▶Jugar)
//   sim/mapdoc.js  NEW  (buildWorldFromMapDoc loader + seed + readMapDoc, RNG-neutral)
//   sim/sim.js     gh -> HEAD  (:97 hook: ?map= reads MapDoc; null default = byte-identical)
//   game.js        gh -> HEAD  (__dev.mapInfo() read-only probe for QA)
//   index.html     gh -> HEAD  (registers sim/mapdoc.js for cache-busting)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["editor.html", "editor.js", "sim/mapdoc.js", "sim/sim.js", "game.js", "index.html"]; // HEAD versions
const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js","editor.html","editor.js"];

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
  const idx = "/tmp/cas1702-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1702: Visual Map Editor + MapDoc v1 loader — build ${build}`);
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
