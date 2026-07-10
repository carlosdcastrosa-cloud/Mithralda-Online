// CAS-1920 deploy (Consumibles Arrojadizos / Throwing Items — 19º pilar Souls-like,
// 1ª herramienta a DISTANCIA, knob THROWABLES — Build CAS-1922 30e0613): Isolated 0-leak
// overlay of ONLY the game-core blobs REALLY touched by the build (HEAD == build 30e0613)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full tree. Overlay set read from `git show --stat 30e0613`
// (lesson CAS-1828/…/1907/1914: never copy a mirror's blob count — verify per Build).
// This Build touched **4** PROD blobs:
//   sim/config.js  — knob THROWABLES{enabled:true, throwKey:"Quote", cycleKey:"Slash",
//                    windupMs, cooldownMs, refillOnZone, order, types{knife 6c/8stam/spd520/dmg14
//                    recto · firebomb 3c/20stam/aoe26/burn{6} arc}}. enabled:false => throwItem()
//                    rama muerta => byte-id a HEAD (AC0/OFF, 18 pilares).
//   sim/sim.js     — throwItem()+cycleThrow() exportados + gated; tickThrow (refill por zona +
//                    cd/windup wind-down); refillThrowables (hook zona + BONFIRE.refillFlasks).
//                    Spawn reusa molde de proyectil de hechizo => colisión/hitEnemy/applyStatus(burn)/
//                    aoe/filtro life>0 YA vivos. Aim vía artTarget (LOCK_ON) o facing. Coste spendStam.
//                    Windup punible bloquea attack+move. Campos transitorios (throwSel/*Charges/throwCD/
//                    throwWind/throwZone) fuera del allowlist => save byte-id. RNG-neutral (0-draw).
//   input.js       — 2 alias fijos gated (teclas Quote/Slash) tras bloque WEAPON_ARTS (no
//                    rebindable) + botones táctiles. OFF => sin binding.
//   render/render.js — draw kind:knife + kind:firebomb (procedural $0 asset) + botón HUD táctil
//                    tb.throwable (glyph+conteo) + tb.throwcycle. OFF => sin botón => layout byte-id.
// El harness tools/cas1920-throwables.mjs es dev-only y NO se deploya.
// Guardrails: enabled:false => sim/input/render + save byte-identical to HEAD; srand ON==OFF (no draws).
// Auto-wake QA CAS-1924 on blockers_resolved (CAS-1920 eslabón 3).
// Live base actual = 71160e07eaab / 799 files (Weapon Arts CAS-1916, 0-leak target preserved).
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
  const idx = "/tmp/cas1920-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1920: deploy Consumibles Arrojadizos / Throwables (CAS-1922) — build ${build}`);
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
