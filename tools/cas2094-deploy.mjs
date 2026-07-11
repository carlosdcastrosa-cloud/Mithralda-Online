// CAS-2097 (CAS-2094): Deploy — Peligros de Arena / Environmental Hazards (mec #32) overlay to gh-pages.
// Padre CAS-2096 Build landed at HEAD commit d0bad8e (DARK: new ARENA_HAZARDS knob enabled:false +
// dedicated arenaHazardRng stream, transient G.hazards, maybeSpawnHazard gated bossOrElitePresent,
// updateHazards telegraph→active→fade reusing damageHero, procedural render). Gated OFF ⇒ RUNTIME
// byte-identical to prior live (0 draws), but SOURCE bytes DID change.
//
// Standard-chain overlay deploy (mirror cas2073/2081/2091). EMPIRICAL blob set from
// `git diff d0bad8e~1..d0bad8e` (excl tools/ + design/*.md non-served) = EXACTLY 3 served blobs
// vs current live build d06698422a9b/799: sim/config.js, sim/sim.js, render/render.js. NOT input.js,
// NOT strings.js, NOT settings.js, NOT game.js/persist.js. No new files ⇒ files stays 799.
// version.json regenerated over the full tree.
// NOT-DARK-byte-change deploy: served md5 for the 3 overlay blobs must == HEAD (new bytes),
// NOT byte-identical to prior live blob. Reversible via Gate CEO knob flip (config-only).
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
  const idx = "/tmp/cas2094-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2097 (CAS-2094): Deploy Peligros de Arena overlay — 3 blobs (sim/config.js, sim/sim.js, render/render.js), ARENA_HAZARDS.enabled:false DARK/inert (0 draws), reversible via CEO knob flip — build ${build}`);
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
