// CAS-2081 (CAS-2080): Deploy — Pactos increment overlay (D1 badge + D2 3 modifiers) to gh-pages.
// Padre CAS-2080 Build landed at HEAD commit 29b5923 (thin ADDITIVE extension of live CAS-1763
// "Pactos de Poder": D2 3 new PACTS.defs presagio/corrosion/quebranto rank-0-inert, D1
// renderPactBadge INTENSIDAD HUD gated heat>0). New source bytes but defaults keep it inert at
// heat=0 ⇒ RUNTIME byte-identical to prior live at heat0, but SOURCE bytes DID change.
//
// Standard-chain overlay deploy (mirror cas2073/2060/2055). EMPIRICAL blob set from
// `git diff 29b5923~1..29b5923` (excl tools/ + design/*.md non-served) = EXACTLY 3 served blobs
// vs current live build c852c60d7993/799: sim/config.js, sim/sim.js, render/render.js. NOT
// input.js, NOT strings.js, NOT settings.js. No new files ⇒ files stays 799. version.json
// regenerated over the full tree.
// NOT-DARK-byte-change deploy: served md5 for the 3 overlay blobs must == HEAD (new bytes),
// NOT byte-identical to prior live blob. Reversible via git revert (no knob flip — additive/inert).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js"];

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
  const idx = "/tmp/cas2081-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2081 (CAS-2080): Deploy Pactos increment overlay — 3 blobs (sim/config.js, sim/sim.js, render/render.js), additive/inert at heat0, reversible via revert — build ${build}`);
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
