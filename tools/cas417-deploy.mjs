// CAS-417 deploy: overlay the icon-wiring runtime files (hud.js, render/render.js,
// render/sprites.js) PLUS the new CAS-415 icon PNGs (assets/ui/icons/*.png — not yet on
// gh-pages) onto origin/gh-pages, stamp version.json from the EXACT deployed fileset,
// commit onto the CURRENT gh-pages tip via a temp index, push. Same build-id algorithm
// as tools/build-id.mjs. Retries once on a diverged push. Mirror of tools/cas416-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];
const CHANGED = ["hud.js","render/render.js","render/sprites.js"];
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch","origin","gh-pages","--quiet");

// the 33 icon PNGs the loader references (montage/README stay repo-only)
const ICONS = [];
for (const cl of ["warrior","paladin","mage","druid","priest"]) for (let i = 0; i < 4; i++) ICONS.push(`assets/ui/icons/spell_${cl}_${i}.png`);
for (const s of ["head","body","legs","feet","neck","back","ring","bag","weapon","shield"]) ICONS.push(`assets/ui/icons/slot_${s}.png`);
for (const k of ["potion_hp","potion_mp","coin"]) ICONS.push(`assets/ui/icons/hud_${k}.png`);

function computeBuild() {
  const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets").toString().split("\n").filter(Boolean);
  const fromHead = new Set([...CHANGED, ...ICONS]);
  const files = [...new Set([...ROOT_FILES, ...tracked, ...ICONS])].sort();
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
  const idx = "/tmp/cas417-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of [...CHANGED, ...ICONS]) {
    const sha = gitStr("rev-parse", `HEAD:${f}`);
    execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${sha},${f}`], { env });
  }
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-417: UI icon wiring (spell bar / inventario / HUD chips / Q) — build ${build}`);
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
