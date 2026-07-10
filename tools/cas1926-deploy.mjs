// CAS-1926 deploy (Resinas / Buffs de Arma — Weapon Grease, 20º pilar Souls-like,
// knob WEAPON_BUFFS — Build CAS-1927 d6b68bb): Isolated 0-leak overlay of ONLY the
// game-core blobs REALLY touched by the build (HEAD == build d6b68bb) onto
// origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full tree. Overlay set read from `git show --stat d6b68bb`
// (lesson CAS-1828/…/1914/1920: never copy a mirror's blob count — verify per Build).
// This Build touched **4** PROD blobs:
//   sim/config.js  — knob WEAPON_BUFFS{enabled:true, applyKey:"BracketRight",
//                    cycleKey:"BracketLeft", applyMs, refillOnZone, order[ember,whet,frost],
//                    types{ember ×1.15+burn{5} · whet ×1.35 puro · frost ×1.10+slow}}.
//                    enabled:false => applyWeaponBuff() rama muerta => byte-id a HEAD
//                    (AC0/OFF, 19 pilares).
//   sim/sim.js     — applyWeaponBuff()+cycleBuff() exportados + gated; buffMul(h) ÚLTIMO
//                    factor en applyHeroMelee (tras TWO_HAND×ARCHETYPES×ARTS); elemento
//                    on-hit hitEnemy (ember→applyStatus burn · frost→slow · whet→puro);
//                    tickBuff (decrementa wbuffT/applyBuffT) + refillBuffs (espejo
//                    refillThrowables: flaskZone + BONFIRE hook). Windup applyBuffT en
//                    gates attack/heavy/art/throw. Campos transitorios (buffSel/*Charges/
//                    _wbuff/wbuffT/applyBuffT/buffZone) fuera del allowlist => save byte-id.
//                    RNG-neutral (0-draw).
//   input.js       — 2 alias fijos gated (teclas BracketRight/BracketLeft) tras bloque
//                    THROWABLES (no rebindable) + botones táctiles. OFF => sin binding.
//   render/render.js — botón HUD táctil tb.weaponbuff (glyph+conteo) + tb.buffcycle.
//                    OFF => sin botón => layout byte-id.
// El harness tools/cas1926-weapon-buffs.mjs es dev-only y NO se deploya.
// Guardrails: enabled:false => sim/input/render + save byte-identical to HEAD; srand ON==OFF (no draws).
// Auto-wake QA CAS-1929 on blockers_resolved (CAS-1926 eslabón 3).
// Live base actual = 3970f3b102b9 / 799 files (Throwables CAS-1922, 0-leak target preserved).
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
  const idx = "/tmp/cas1926-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1926: deploy Resinas / Buffs de Arma / Weapon Grease (CAS-1927) — build ${build}`);
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
