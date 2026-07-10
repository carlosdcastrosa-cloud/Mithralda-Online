// CAS-1947 deploy (Pilar 22 — Jefe Firma multi-fase, knob SIGNATURE_BOSS —
// Build CAS-1948, HEAD == fix 8f91225): Isolated 0-leak overlay of ONLY the
// game-core blobs REALLY touched by the build onto origin/gh-pages. Everything
// else on gh-pages stays byte-identical. version.json regenerated over the full
// tree. Overlay set read from `git diff --stat 36a927b(pre-build) HEAD` restricted
// to PROD dirs (lesson CAS-1828/…/1931: never copy a mirror's blob count — verify
// per Build; the FIX commit 8f91225 only re-touched sim.js, but the cumulative
// PROD delta vs the deployed base is 3 blobs).
// This Build touched **3** PROD blobs:
//   sim/config.js  — knob SIGNATURE_BOSS{enabled:true, boss:"calderatyrant",
//                    zone:"caldera", phase2HpPct, transitionWindowMs, transitionVulnMul,
//                    poiseBreakStunMs, phases{p1,p2}, ailmentsToHero{buildPerHit,cap},
//                    rewards{essenceBonus,guaranteedRarity}} + bossRng stream. OFF
//                    (enabled:false) => todos los seams gated => byte-id a 21 pilares.
//   sim/sim.js     — spawnChampion marca _sbPhase/_sbTransT/_sbVuln en el capstone
//                    calderatyrant/caldera; updateEnemies transición 1→2 @≤50% HP (una
//                    vez) + ventana vuln + tick + poiseMul fase 2; hitEnemy ×transitionVulnMul
//                    en _sbVuln + escalado poise autoritativo por golpe + stagger poiseBreakStunMs;
//                    specialNow slam infl frost fase 2; damageHero cap ailmentsToHero.cap
//                    SCOPED al feed del jefe (nunca one-shot, Pilar21 intacto); killEnemy
//                    +essenceBonus Esencia + drop garantizado (bossRng, no perturba srand).
//                    _sb* transitorio fuera del allowlist => save byte-id. RNG-neutral STRONG.
//   render/render.js — glyph de fase (FASE I / FASE II) + tinte vuln en barra de jefe
//                    (procedural $0 arte).
// Los harness tools/cas1947-signature-boss*.mjs son dev-only y NO se deployan.
// Guardrails: enabled:false => byte-identical a HEAD; srand ON==OFF (0 draws, bossRng dedicado).
// Auto-wake QA CAS-1950 on blockers_resolved (CAS-1947 eslabón 3).
// Live base actual = 5cc1b10af498 / 799 files (0-leak target preserved).
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
  const idx = "/tmp/cas1947-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1947: deploy Jefe Firma multi-fase / SIGNATURE_BOSS (CAS-1948) — build ${build}`);
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
