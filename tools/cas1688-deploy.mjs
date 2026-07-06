// CAS-1688 deploy: overlay the Runas y Engarces (sockets) build (CAS-1687, master HEAD 5744594 —
// "Runas y Engarces (sockets) — 0-2 sockets/gear + 3 runas engarzables (rubi/zafiro/esmeralda)",
// additive ARPG build-diversity feature) onto gh-pages. Live base == gh-pages tip e9c552d
// (Eventos de Zona, CAS-1683, build 7f228f69c975). The CAS-1687 commit changed exactly these 6
// deployable code files (harness tools/cas1687-sockets.mjs is NOT deployed); a code drift scan
// (HEAD vs gh-pages over game.js/input/render/sim code files) shows only these 6 diverge, so this
// overlay is clean-isolated (0 leak). Recipe mirrors cas1683-deploy.mjs (adds input.js + sim/gear.js).
//   game.js          gh -> HEAD  (__dev wrapper: socket dev hooks for QA)
//   input.js         gh -> HEAD  (socket/rune inventory interaction)
//   render/render.js gh -> HEAD  (socket pips + rune visuals in inventory)
//   sim/config.js    gh -> HEAD  (SOCKETS knob + runeRng seed)
//   sim/gear.js      gh -> HEAD  (rollGearInst sockets, socketTotals, rune items)
//   sim/sim.js       gh -> HEAD  (feature: maybeSocketRune, socket effects wiring)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "input.js", "render/render.js", "sim/config.js", "sim/gear.js", "sim/sim.js"]; // HEAD versions
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
  const idx = "/tmp/cas1688-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object","-w","--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index","--add","--cacheinfo",`100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1688: Runas y Engarces (sockets) — build ${build}`);
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
