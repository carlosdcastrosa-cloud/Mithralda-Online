// CAS-272 deploy: overlay the changed runtime files (sim/sim.js = pickBoon rarity payoff,
// render/render.js = draft-card reveal pop) onto origin/gh-pages, stamp version.json from the
// EXACT deployed fileset (concurrent WIP files stay at their gh-pages bytes), commit onto the
// CURRENT gh-pages tip via a temp index, push. Same build-id algorithm as tools/build-id.mjs.
// Retries once on a diverged (non-ff) push. Mirror of tools/cas398-deploy.mjs.
// Usage: node tools/cas272-deploy.mjs [source-ref]   (default HEAD; run from a repo dir whose
// creds can push — the source ref just needs to contain the CHANGED files' blobs.)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const SRC = (process.argv[2] || "HEAD").trim();
const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];
const CHANGED = ["sim/sim.js","render/render.js"];
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets").toString().split("\n").filter(Boolean);
  const files = [...ROOT_FILES, ...tracked].sort();
  const changed = new Set(CHANGED);
  const h = createHash("sha256");
  for (const f of files) {
    const ref = changed.has(f) ? `${SRC}:${f}` : `origin/gh-pages:${f}`;
    const blob = git("show", ref);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas272-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of CHANGED) {
    const sha = gitStr("rev-parse", `${SRC}:${f}`);
    execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${sha},${f}`], { env });
  }
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-272: game-feel v2 (boon-draft rarity payoff + reveal pop) — build ${build}`);
  try {
    execFileSync("git", ["push","origin",`${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr||e.stdout||e.message||"").toString().slice(0,300) };
  }
}

let r = buildAndPush();
if (!r.pushed) {
  console.log(`push rejected (${r.err}) — refetching gh-pages and retrying once`);
  git("fetch","origin","gh-pages","--quiet");
  r = buildAndPush();
}
console.log(JSON.stringify(r, null, 2));
if (!r.pushed) process.exit(1);
