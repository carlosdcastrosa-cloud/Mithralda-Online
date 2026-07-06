// CAS-1657 deploy: overlay the Conjuntos de Objetos (Item Sets) build onto gh-pages.
// The CAS-1654 build (master HEAD, harness tail CAS-1655 a6be327) never landed on gh-pages —
// live is still v3 f67129f00d14 (CAS-1649). The 4 game files that changed carry the additive
// Item Sets code on top of v3; gh-pages base for all 4 == the live v3 blobs (verified drift:
//   sim/gear.js     live 73c8d9db -> HEAD dafead94
//   sim/sim.js      live 0e5f8693 -> HEAD 85b14a23
//   render/render.js live c8e4125e -> HEAD 34b53621
//   game.js         live 99147e8c -> HEAD 09a986c0
// so overlay is clean-isolated. Recipe mirrors tools/cas1649-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "render/render.js", "sim/gear.js", "sim/sim.js"]; // HEAD versions
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
  const idx = "/tmp/cas1657-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1657: Conjuntos de Objetos (Item Sets) — build ${build}`);
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
