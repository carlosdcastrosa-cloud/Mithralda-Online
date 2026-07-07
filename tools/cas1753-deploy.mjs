// CAS-1753 deploy (CAS-1751 Códice de Botín chain; build CAS-1752 = 59d183a):
// Isolated 0-leak overlay of ONLY the 7 codex-changed game blobs (HEAD) onto origin/gh-pages.
// Everything else on gh-pages stays byte-identical. version.json regenerated over the full served tree.
//   game.js / input.js / persist.js / render/render.js / sim/config.js / sim/gear.js / sim/sim.js
//   — read-only loot ledger (mithralda.codex.v1 isolated key), account bonus folded into
//     equippedDmg/heroMaxHp, `codex` UI scene + HUD button, CODEX knob in sim/config.js.
//     RNG-neutral by construction; CODEX OFF == HEAD byte-identical (proven by build harness).
// gh-pages versions of all 7 verified == pre-codex parent 49b7be7 ⇒ overlay introduces ONLY the codex diff.
// NOT deployed: harness tools/cas1752-codex.mjs or any other working-tree file.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "input.js", "persist.js", "render/render.js", "sim/config.js", "sim/gear.js", "sim/sim.js"];

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
  const idx = "/tmp/cas1753-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1753: deploy Códice de Botín (CAS-1752) — build ${build}`);
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
