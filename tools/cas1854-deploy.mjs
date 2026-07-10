// CAS-1861 deploy (Frasco de Curación / Estus — 10º pilar Souls-like, knob FLASK —
// Build CAS-1860 3f88e8c): Isolated 0-leak overlay of ONLY the game-core flask blobs
// (HEAD == build 3f88e8c) onto origin/gh-pages. Everything else on gh-pages stays
// byte-identical. version.json regenerated over the full served tree.
// Overlay set read from `git show --stat 3f88e8c` (lesson CAS-1828: never copy a mirror's
// blob count — verify per Build). This Build touched **7** game blobs (game + hud + input +
// render + config + sim + strings) — pulsar-para-beber canal enraizado + botón táctil ⚕ +
// HUD pips/groove; the largest set yet (spec predicted 6, render.js added for touch button).
//   sim/config.js    — knob FLASK{enabled,key:KeyU,charges:3,healPct:0.40,drinkMs:750,
//                      cancelOnAction,refillOnZone}, HARD-GATED. OFF => byte-id combat.
//   sim/sim.js       — newHero flaskCharges/flaskDrinkT/flaskZone (transitorios, FUERA del
//                      allowlist de serializeSave => save.v1 byte-id, NO clave nueva);
//                      drinkFlask() arranca canal (NO consume carga hasta completar);
//                      tickFlask() avanza canal + refill de zona; ROOT vía `||flaskDrinkT>0`
//                      en los 4 gates (heroAttack/heavyAttack/castSpell/doRoll) + vx=vy=0 en
//                      movimiento; CANCEL-on-action aborta sin gastar carga. 0 RNG (NO
//                      flaskRng) => srand ON==OFF byte-id. flask* dev hooks.
//   input.js         — tecla FLASK.key (KeyU) => sim.drinkFlask() (fixed-handler); botón
//                      táctil ⚕ gated (spread ...(FLASK.enabled?{}:{})) => OFF layout byte-id.
//   render/render.js — dibuja botón táctil ⚕ sólo si tb.flask existe, $0 arte.
//   game.js/hud.js   — feed + pips de cargas + groove de progreso del canal, estilos inline
//                      ($0 arte, <style> byte-id OFF), gated FLASK.enabled.
//   strings.js       — flaskHint.
// Guardrails: OFF => sim + save byte-identical to HEAD; srand ON==OFF (no flaskRng draws).
// NOT deployed: harness tools/cas1854-flask.mjs. Auto-wake QA on blockers_resolved.
// Live base actual = d0e69a6dc528 / 799 files (Lock-On CAS-1849, 0-leak target preserved).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["game.js", "hud.js", "input.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];

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
  const idx = "/tmp/cas1854-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1861: deploy Frasco de Curación/Estus (CAS-1860) — build ${build}`);
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
