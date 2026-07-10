// CAS-1914 deploy (Artes de Arma / Weapon Arts — 18º pilar Souls-like,
// knob WEAPON_ARTS — Build CAS-1915 d9395d8): Isolated 0-leak overlay of ONLY the
// game-core blobs REALLY touched by the build (HEAD == build d9395d8) onto origin/gh-pages.
// Everything else on gh-pages stays byte-identical. version.json regenerated over the full tree.
// Overlay set read from `git show --stat d9395d8` (lesson CAS-1828/…/1901/1907: never copy
// a mirror's blob count — verify per Build). This Build touched **4** PROD blobs:
//   sim/config.js  — knob WEAPON_ARTS{enabled:true, key:"Semicolon", cooldownMs, classes por
//                    arquetipo (greatsword/dagger/spear/sword muls dmg/reach/arc/poise + stam)}.
//                    enabled:false => weaponArt() rama muerta => byte-id a HEAD (AC0/OFF, 17 pilares).
//   sim/sim.js     — weaponArt() exportado + gated (play+vivo+atkCD<=0+artCD<=0+melee); despacha
//                    por weaponArchName(h) (mapa byDefId append-only), arma swing h._art =>
//                    applyHeroMelee/hitEnemy leen h._artCls (dmg/reach/arc/poise) componiendo
//                    ×arquetipo ×TWO_HAND. greatsword extiende ventana HYPERARMOR (h._artHyper);
//                    dagger dash rear => auto-backstab; spear reach↑↑ arco↓ pierce; sword arco
//                    completo. Coste spendStam + h.artCD transitorio (mirror h.atkCD, fuera
//                    allowlist) => save-neutral. RNG-neutral (0-draw).
//   input.js       — alias fijo gated (tecla Semicolon) tras bloque TWO_HAND (no rebindable) +
//                    botón HUD táctil tb.weaponart (patrón tb.twohand; OFF => sin botón).
//   render/render.js — dibuja botón HUD táctil tb.weaponart (OFF => sin botón => layout byte-id).
// El harness tools/cas1914-weapon-arts.mjs es dev-only y NO se deploya.
// Guardrails: enabled:false => sim/input/render + save byte-identical to HEAD; srand ON==OFF (no draws).
// Auto-wake QA CAS-1917 on blockers_resolved (CAS-1914 eslabón 3).
// Live base actual = a56f0b829e82 / 799 files (Weapon Archetypes CAS-1910, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/config.js", "sim/sim.js", "input.js", "render/render.js"];

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
  const idx = "/tmp/cas1914-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1914: deploy Weapon Arts (CAS-1915) — build ${build}`);
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
