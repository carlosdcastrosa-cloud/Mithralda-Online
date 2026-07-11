// CAS-2087 (fix for CAS-2085 R2 / dup CAS-2086): Deploy the Summon key-collision fix to gh-pages.
// Build landed at HEAD e082603: SUMMON.key "KeyN" → "Comma" so the desktop keyboard dispatch no
// longer has the heavy handler (input.js:282 COMBO.heavyKey==="KeyN") swallow the summon key
// (input.js:324 SUMMON.key) — spawnSpirit becomes reachable on desktop for all 5 classes; N stays heavy.
//
// Standard-chain overlay deploy (mirror cas2081/cas2073). EMPIRICAL blob set from
// `git diff e082603~1..e082603` (excl tools/ harness, non-served) = EXACTLY 2 served blobs vs the
// current live build b952eea17cea/799: sim/config.js (the functional key change) and input.js (a
// comment-only byte change; handler dispatches on SUMMON.key dynamically). NOT sim.js/render/strings/
// settings. No new served files ⇒ files stays 799. version.json regenerated over the full tree.
// NOT-DARK byte-change deploy: served md5 for the 2 overlay blobs must == HEAD (new bytes).
// Reversible via git revert (config value flip, no schema/save change).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "input.js"];  // repo paths == served gh-pages tree paths (input.js at ROOT)

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
  const idx = "/tmp/cas2087-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2087 (CAS-2086): Deploy Summon key-collision fix overlay — 2 blobs (sim/config.js SUMMON.key→Comma, input.js comment), spawnSpirit reachable on desktop, reversible — build ${build}`);
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
