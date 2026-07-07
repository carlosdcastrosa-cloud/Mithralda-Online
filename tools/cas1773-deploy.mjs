// CAS-1775 deploy (CAS-1773 Medidor de Frenesí chain; build CAS-1774 commit 5df4e83):
// Isolated 0-leak overlay of ONLY the 3 game-core blobs the build touched (HEAD blobs) onto origin/gh-pages.
// Everything else on gh-pages stays byte-identical. version.json regenerated over the full served tree.
//   render/render.js / sim/config.js / sim/sim.js
//     — kill-streak/momentum meter: transient run-state (frenzyStacks/frenzyT, NOT serialized, atkspdBuff
//       pattern), incremented on real killEnemy, shared decay tick, feeds heroAtkspd pre-cap + hitEnemy dmg mul,
//       HUD pip-bar+edge-glow ($0 art). Knob FRENZY.enabled=false ⇒ md5==HEAD, save.v1 byte-id, srand ON==OFF
//       (buff = pure timing of kills, does NOT open RNG). Mirror of Afijos CAS-1770.
//     (Build handoff §"3 blobs config/sim/render": sim/config.js, sim/sim.js, render/render.js. NOT gear.js/hud.js.)
// NOT deployed: harness tools/cas1773-frenzy.mjs or any other working-tree file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["render/render.js", "sim/config.js", "sim/sim.js"];

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();

git("fetch", "origin", "gh-pages", "--quiet");

const shas = {};
for (const f of OVERLAY) shas[f] = gitStr("rev-parse", `HEAD:${f}`);

function computeBuild() {
  const tracked = git("ls-tree", "-r", "--name-only", "origin/gh-pages").toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...OVERLAY, "version.json"])].filter(f => f !== "version.json").sort();
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
  const idx = "/tmp/cas1773-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1775: deploy Medidor de Frenesí (CAS-1774) — build ${build}`);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}

let res = buildAndPush();
if (!res.pushed) { git("fetch", "origin", "gh-pages", "--quiet"); res = buildAndPush(); }
console.log(JSON.stringify(res));
if (!res.pushed) process.exit(1);
