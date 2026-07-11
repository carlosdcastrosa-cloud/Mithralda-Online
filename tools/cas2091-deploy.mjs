// CAS-2091 (Deploy for CAS-2090): Deploy the "Desafío con Semilla" (Seeded Challenge Run) DARK build
// to gh-pages. Build landed at HEAD 72fb436, feature gated OFF (SEEDED_CHALLENGE.enabled:false,
// sim/config.js:1735) ⇒ NOT-DARK byte-change: the source blobs genuinely change even though the mode
// is off, so served md5 for each overlay blob must == HEAD (new bytes), NOT byte-identical-to-prior.
//
// Standard-chain overlay deploy (mirror cas2087/cas2081/cas2073). EMPIRICAL blob set from
// `git diff 72fb436~1..72fb436` (excl design/ doc + tools/ harness, both non-served) = EXACTLY 6
// served blobs vs the current live build 4a9459a6ee34/799:
//   sim/config.js, sim/sim.js, render/render.js, game.js, input.js, persist.js
// All 6 confirmed present in the gh-pages tree at these exact paths (game/input/persist at ROOT,
// config/sim under sim/, render under render/). No new served files ⇒ files stays 799. version.json
// regenerated over the full tree. Reversible: feature is config-gated OFF; Gate CEO flips
// SEEDED_CHALLENGE.enabled:false→true later (config-only, mirror CAS-2043/2055).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js", "game.js", "input.js", "persist.js"]; // repo paths == served gh-pages tree paths

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
  const idx = "/tmp/cas2091-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2091 (CAS-2090): Deploy Desafío con Semilla (Seeded Challenge Run) DARK overlay — 6 blobs (config/sim/render/game/input/persist), SEEDED_CHALLENGE.enabled:false, reversible — build ${build}`);
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
