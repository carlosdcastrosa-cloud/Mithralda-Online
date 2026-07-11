// CAS-2006 deploy (CAS-2004 Balance & Cohesión Tier-1 — 7 config knobs re-tuned, Build CAS-2005,
// HEAD == 1d65b96): Isolated 0-leak overlay of the SINGLE prod blob REALLY touched by the build
// (sim/config.js) onto origin/gh-pages. Everything else on gh-pages stays byte-identical.
// version.json regenerated over the full tree.
//
// LIVE deploy (no dark stage): the 7 knobs belong to already-live systems (no `enabled` flag) ⇒
// the overlay puts the re-tuned values LIVE directly. Rollback = revert of this 1 blob.
//   sim/config.js — 7 hunks, config-only (per design/cas2004-balance-cohesion.md b1d830b):
//     staggerPunishMul 2.2->1.6 · POISE.boss.bonusDmg 1.9->1.6 · riposteMult 2.4->2.0 ·
//     WEAPON_BUFFS.whet.dmgMul 1.35->1.22 · STAMINA.regen 22->17 · poiseThreshold 34->24 ·
//     STATUS_BUILDUP.bleed.procPctHp 0.14->0.11. No new mechanic/mode/zone; 0 new RNG draws.
// The harness tools/cas2005-balance-regression.mjs is dev-only and is NOT deployed.
// Guardrail: config-only ⇒ save.v1 + srand byte-id to HEAD (no new state keys, RNG-neutral).
// Live base actual = c7cfc0e489e8 / 799 files (post COMBAT_CODEX go-live CAS-2002).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js"];

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
  const idx = "/tmp/cas2006-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2006 (CAS-2004): deploy Balance Tier-1 (sim/config.js, 1 prod blob, LIVE) — build ${build}`);
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
