// CAS-2025 deploy (CAS-2023 NG+ / Nueva Partida Plus — NG_PLUS knob, Build CAS-2024, HEAD == c67f7e1):
// Isolated 0-leak overlay of the EXACTLY-4 prod blobs REALLY touched by the build onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json regenerated
// over the full tree.
//
// DARK deploy: NG_PLUS ships enabled:false (Gate CEO owns the flip). enabled:false ⇒ every seam
// falls to its pre-existing CAS-450 World Tier value (loot floor unchanged, Esencia ×1, poise ×1),
// 0 feature draws, NO new save field (rides conquest.tier) ⇒ save.v1 + srand byte-id to HEAD.
//
// REAL blob set derived EMPIRICALLY from `git diff --stat eb7dee7..c67f7e1` (build-parent..HEAD),
// NOT the ticket path-list (CAS-2018 lesson: strings.js served from root). Confirmed 4 prod blobs:
//   sim/config.js    — NG_PLUS knob {enabled:false + lootFloorPerTier/essMulPerTier/poise sub-flag}.
//   sim/sim.js       — 4 gated seams (ngLootFloor / essenceForRun drip / poiseCeil scale / reframe).
//   render/render.js — ascend-scene "Ciclo N+1 / NG+" reframe (gated on NG_PLUS.reframePrompt).
//   strings.js       — ng* reframe copy.
// The harness tools/cas2023-ngplus.mjs is dev-only and is NOT deployed.
// Rollback = revert of these 4 blobs. Live base actual = 4678cbd03e4d / 799 (post Onboarding CAS-2021).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "render/render.js", "strings.js"];

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
  const idx = "/tmp/cas2025-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2025 (CAS-2023): deploy NG+ — NG_PLUS enabled:false DARK (sim/config.js+sim/sim.js+render/render.js+strings.js, 4 prod blobs) — build ${build}`);
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
