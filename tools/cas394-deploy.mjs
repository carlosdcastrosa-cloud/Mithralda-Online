// CAS-394 deploy: overlay the changed runtime files onto origin/gh-pages, stamp version.json
// from the EXACT deployed fileset (NOT the WIP working tree — a concurrent agent's committed-but-
// -unrelated files, e.g. sprites.js ahead, stay at their gh-pages bytes), commit onto the CURRENT
// gh-pages tip via a temp index, and push. Retries once on a diverged (non-ff) push.
//
// Same build-id algorithm as tools/build-id.mjs: sha256 over (path + \0 + blob) for the sorted
// [ROOT_FILES + tracked sim/render/assets] set, everything from gh-pages EXCEPT CHANGED (from HEAD).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];
// CAS-394 touched these shipped modules (vs the gh-pages baseline). Everything else = gh-pages bytes.
const CHANGED = ["game.js","input.js","strings.js","sim/config.js","sim/sim.js","render/render.js"];
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets").toString().split("\n").filter(Boolean);
  const files = [...ROOT_FILES, ...tracked].sort();
  const changed = new Set(CHANGED);
  const h = createHash("sha256");
  for (const f of files) {
    const ref = changed.has(f) ? `HEAD:${f}` : `origin/gh-pages:${f}`;
    const blob = git("show", ref);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas394-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  const gitI = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024, env });
  // temp index seeded from the CURRENT gh-pages tree
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  // overlay each changed file: write its HEAD blob into the object db, stage it in the temp index
  for (const f of CHANGED) {
    const sha = gitStr("rev-parse", `HEAD:${f}`);
    execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${sha},${f}`], { env });
  }
  // stamp version.json from the computed build
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-394: opt-in zone modifier (Curse/Heat) — build ${build}`);
  // push from the repo root so the RELATIVE credential.helper path resolves
  try {
    execFileSync("git", ["push","origin",`${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr||e.stdout||e.message||"").toString().slice(0,300) };
  }
}

let res = buildAndPush();
if (!res.pushed) {
  // diverged tip → re-fetch and rebuild onto the new tip once
  git("fetch","origin","gh-pages","--quiet");
  res = buildAndPush();
}
console.log(JSON.stringify(res));
if (!res.pushed) process.exit(1);
