// CAS-1997 deploy (CAS-1995 EVO — Códice de Combate + Hints contextuales, knob COMBAT_CODEX —
// Build CAS-1996, HEAD == f9dfae3): Isolated 0-leak overlay of ONLY the game-core blobs REALLY
// touched by the build onto origin/gh-pages. Everything else on gh-pages stays byte-identical.
// version.json regenerated over the full tree. DARK deploy (ships COMBAT_CODEX.enabled:false).
//
// Overlay set read from `git diff --stat aa761ca(build parent) HEAD` restricted to PROD blobs
// (lesson CAS-1828/…/1990: never copy a mirror's blob count — verify per Build). The ticket
// ANTICIPATED 5–6; the Build actually touched **6** PROD blobs (all differ vs live 4ca5e4476576):
//   game.js         — createGame() wires persist.bootHints() (rehydrate first-encounter flags
//                     from its OWN isolated store mithralda.hints.v1).
//   sim/config.js   — knob COMBAT_CODEX{enabled:false, codexKey:"Backquote", showContextHints,
//                     toastSecs, showHudHint} + COMBAT_CODEX_ENTRIES (data-driven table, bindings
//                     resolved by getter over live knobs — the codex can never lie).
//                     enabled:false ⇒ codexKey inerte, fireHint retorna temprano, la clave
//                     mithralda.hints.v1 NUNCA se crea ⇒ save.v1 + srand byte-id a HEAD.
//   sim/sim.js      — scene "combatcodex" + ACTIONS.combatCodex + sim.openCombatCodex gate;
//                     5 first-encounter hint toasts cableados a ramas EXISTENTES (spendStam/
//                     damageHero/spawnChampion/bonfire-rest/createHero); serializeHints/loadHints/
//                     bootHints/hintsDirty flush. Sólo LEE + toast ⇒ 0 draws (RNG-neutral).
//   render/render.js — renderCombatCodex scrollable + HUD "[`] Códice" affordance, procedural, $0 arte.
//   input.js        — codexKey (Backquote) abre/cierra el códice; se añadió .key data-driven a
//                     los knobs PARRY/ARENA (antes literal en input.js) — behavior-identical.
//   persist.js      — store propio mithralda.hints.v1 (bootHints/serialize/load); nunca el run save.
// Los harness tools/cas1995-codex.mjs son dev-only y NO se deployan.
// Guardrails: enabled:false => byte-identical a HEAD; el códice sólo LEE, los hints sólo toast (0 srand).
// Auto-wake QA CAS-1998 on blockers_resolved (CAS-1995 eslabón QA).
// Live base actual = 4ca5e4476576 / 799 files (0-leak target preserved; post-Boss-Rush go-live).
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
  const idx = "/tmp/cas1997-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1997 (CAS-1995): deploy Códice de Combate + Hints (COMBAT_CODEX overlay, 6 prod blobs, DARK enabled:false) — build ${build}`);
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
