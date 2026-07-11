// CAS-2037 deploy (CAS-2035 NG+ Cycle Recap overlay, Build CAS-2036 == e22de8f):
// Isolated 0-leak overlay of the EXACTLY-5 prod blobs REALLY touched by the build onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json regenerated
// over the full tree.
//
// DARK deploy: NG_PLUS.recap ships false (Gate CEO owns the flip). recap:false ⇒ offerAscend
// scene stays "ascend" (byte-id HEAD render path), 0 recap draws, NO new save field
// (rides conquest.tier) ⇒ save.v1 + srand byte-id to HEAD.
//
// REAL blob set derived EMPIRICALLY from `git diff --stat e22de8f^..e22de8f` (build-parent..HEAD),
// NOT the ticket path-list (CAS-2018 lesson: verify the tree diff). Ticket predicted 4
// (config+sim+render+strings) and MISSED input.js. Confirmed 5 prod blobs:
//   sim/config.js    — NG_PLUS.recap:false sub-flag.
//   sim/sim.js       — offerAscend scene branch ("ascendRecap") + ngTierPreview(tier) export.
//   render/render.js — renderAscendRecap (cycle header + hero snapshot + tier+1 preview).
//   strings.js       — ngRecap* copy (served from root).
//   input.js         — acceptAscend/declineAscend scene guards broadened for "ascendRecap".
// The harness tools/cas2036-recap.mjs is dev-only and is NOT deployed.
// Rollback = revert of these 5 blobs. Live base actual = d1405a9bcfc5 / 799 (post NG+ flip CAS-2029).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js", "strings.js", "input.js"];

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
  const idx = "/tmp/cas2037-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2037 (CAS-2035): deploy NG+ Cycle Recap — NG_PLUS.recap:false DARK (sim/config.js+sim/sim.js+render/render.js+strings.js+input.js, 5 prod blobs) — build ${build}`);
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
