// CAS-1990 deploy (CAS-1988 EVO — Modo Boss Rush / Gauntlet, knob BOSS_RUSH —
// Build CAS-1989, HEAD == 0282d85): Isolated 0-leak overlay of ONLY the game-core
// blobs REALLY touched by the build onto origin/gh-pages. Everything else on gh-pages
// stays byte-identical. version.json regenerated over the full tree.
// Overlay set read from `git diff --stat e6f5b49(CAS-1980 flip = currently-live source) HEAD`
// restricted to PROD blobs (lesson CAS-1828/…/1964: never copy a mirror's blob count —
// verify per Build). The ticket ANTICIPATED 5; the Build actually touched **6** PROD blobs
// (all differ vs the live base c960c813843d):
//   game.js         — createGame() wires persist.bootBossRush() (rehydrate best round from
//                     its OWN store mithralda.bossrush.v1, independent of any character/run save).
//   sim/config.js   — knob BOSS_RUSH{enabled:false, key:"KeyB", sequence[caves,swamp,abyss,
//                     caldera], hpStep/dmgStep scaling, restSeconds, healFrac:1.0 (full heal
//                     between rounds = real checkpoint), refillOnRest (recarga TODO el kit),
//                     essPerRound/essStepRound/clearBonusEss/recordEssBase (0 RNG rewards)}.
//                     enabled:false => modo INALCANZABLE (menú no muestra entrada, KeyB inerte,
//                     tickBossRush nunca corre) => byte-id a 23 pilares.
//   sim/sim.js      — controlador Boss Rush PARALELO a ARENA (CAS-1664, no toca su código);
//                     gate BOSS_RUSH.enabled + G.bossRushMode; RNG bossRushRng dedicado
//                     (NUNCA srand); HUNTS finitos ordenados; hoguera cura+refill entre rondas;
//                     score = mejor ronda; fin => menú (no victory). Estado transitorio fuera
//                     del save allowlist => save.v1 byte-id.
//   render/render.js — HUD/overlay Boss Rush (ronda, respiro, récord) procedural, $0 arte.
//   input.js        — KeyB => entrar Boss Rush desde el menú (code dedicado; gated al knob).
//   persist.js      — store propio mithralda.bossrush.v1 (bootBossRush/best round); nunca el run save.
// Los harness tools/cas1988-bossrush.mjs son dev-only y NO se deployan.
// Guardrails: enabled:false => byte-identical a HEAD; todo draw viene de bossRushRng (0 srand).
// Auto-wake QA CAS-1991 on blockers_resolved (CAS-1988 eslabón QA).
// Live base actual = c960c813843d / 799 files (0-leak target preserved; post-SUMMON go-live).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "input.js", "persist.js", "render/render.js", "sim/config.js", "sim/sim.js"];

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
  const idx = "/tmp/cas1988-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1990 (CAS-1988): deploy Modo Boss Rush / Gauntlet (BOSS_RUSH, Build CAS-1989) — dark enabled:false — build ${build}`);
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
