// CAS-2215 hotfix: restore live boot after CAS-2219's deploy re-broke the module graph.
// CAS-2219 shipped render.js + game.js that import PIXELART (CAS-2208 gate) but a config.js
// WITHOUT the PIXELART export => module-link SyntaxError => black screen. Root class identical
// to the CAS-2202/T_STREET break. Fix = overlay master's config.js (exports BOTH T_STREET and
// PIXELART; verified zero mechanic `enabled` flips vs live) on top of current gh-pages HEAD.
// Boot-verified locally before push. Reversible.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();
git("fetch", "origin", "gh-pages", "--quiet");
git("fetch", "origin", "master", "--quiet");
const overlay = { "sim/config.js": gitStr("rev-parse", "origin/master:sim/config.js") };
// safety asserts
const cfg = git("cat-file", "blob", overlay["sim/config.js"]).toString();
if (!/export const PIXELART/.test(cfg) || !/export const T_STREET/.test(cfg))
  throw new Error("master config.js missing PIXELART/T_STREET export — abort");
function computeBuild() {
  const tracked = git("ls-tree", "-r", "--name-only", "origin/gh-pages").toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...Object.keys(overlay)])].filter(f => f !== "version.json").sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = overlay[f] ? git("cat-file", "blob", overlay[f]) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}
const { build, files } = computeBuild();
const idx = "/tmp/cas2215-hf-index";
const env = { ...process.env, GIT_INDEX_FILE: idx };
execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
for (const [f, sha] of Object.entries(overlay))
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${sha},${f}`], { env });
const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: JSON.stringify({ build, files }) }).toString().trim();
execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
const parent = gitStr("rev-parse", "origin/gh-pages");
const msg = `CAS-2215 hotfix: restore boot — overlay master config.js (PIXELART+T_STREET exports) after CAS-2219 shipped render/game importing PIXELART without the export — build ${build}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`;
const commit = gitStr("commit-tree", tree, "-p", parent, "-m", msg);
let pushed = false, err = null;
if (process.argv.includes("--push")) {
  try { execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" }); pushed = true; }
  catch (e) { err = (e.stderr || e.stdout || e.message || "").toString().slice(0, 400); }
}
console.log(JSON.stringify({ overlay, build, files, parent, commit, pushed, err }, null, 2));
