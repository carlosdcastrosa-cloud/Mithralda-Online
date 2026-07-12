// deploy-lib.mjs — shared, hardened overlay-deploy helper for gh-pages.  (CAS-2223)
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the overlay-drift SEV-1 anti-pattern
// ─────────────────────────────────────────────────────────────────────────────
// Our LIVE deploys are *overlay* deploys: we take the current gh-pages tree as a
// base and replace only a small set of files (OVERLAY) with HEAD blobs, then push.
// Keeping the blast radius small is a FEATURE (a bad art PNG can't touch code).
//
// But it has one lethal failure mode. index.html loads a fixed set of ES modules
// (the MODS list, index.html:71-73) as ONE module graph under a shared ?v=<build>.
// If we overlay a HEAD code file (say render.js) that `import`s an export which the
// STALE gh-pages copy of ANOTHER loaded module (say config.js) does not provide,
// the browser's ES-module linker throws at load time → BLACK SCREEN for every
// player. This is exactly what CAS-2202 did (render.js needed T_STREET+PIXELART
// that the base config.js lacked) and what CAS-2220 had to hotfix. It has bitten
// us more than once, and every time the served bytes looked "fine" in isolation —
// the bug is in the *set*, not any one file.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MODS-INTERSECTION RULE (enforced by preflightOverlay below)
// ─────────────────────────────────────────────────────────────────────────────
// The resulting LIVE module graph is safe-by-construction iff, after the overlay,
// every loaded module matches HEAD. A sufficient, checkable condition:
//
//     ( files that DIVERGE between gh-pages and HEAD )  ∩  ( MODS runtime graph )
//        MUST be a subset of  OVERLAY.
//
// In words: any code file that is (a) actually loaded by index.html AND (b) not
// byte-identical between the live base and HEAD MUST be in the overlay set — else
// LIVE would keep a stale copy of it while its siblings advance to HEAD, i.e. the
// drift that crashes boot. If the preflight finds an uncovered divergent module it
// FAILS THE DEPLOY LOUDLY (throws) with the missing list, instead of shipping a
// crash. Non-code divergences (PNGs, JSON, .md) are ignored: a missing/stale asset
// falls back to procedural rendering and never breaks boot — only import/export
// mismatches in the MODS graph do (see CAS-2220 memory).
//
// This does NOT force full-tree deploys (an explicit non-goal). It only enforces
// internal consistency of whatever overlaid *set* you chose: either drop a file
// from the graph's divergence (don't touch it) or add it to OVERLAY.
//
// Pure logic lives in checkOverlayConsistency() so it is unit-testable without git
// (see tools/deploy-lib.test.mjs).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
export const gitStr = (...a) => git(...a).toString().trim();

// Parse the authoritative runtime module graph out of index.html's `const MODS = [...]`.
// Returns paths exactly as loaded (repo-relative, e.g. "sim/config.js", "game.js").
export function parseMods(indexHtmlPath = "index.html") {
  const src = readFileSync(indexHtmlPath, "utf8");
  const m = src.match(/const\s+MODS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) throw new Error(`parseMods: could not find 'const MODS = [...]' in ${indexHtmlPath}`);
  const mods = [...m[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
  if (!mods.length) throw new Error(`parseMods: MODS list parsed empty in ${indexHtmlPath}`);
  return mods;
}

// PURE core of the guard — no git, no fs. Given the three sets, return the
// divergent+loaded code files that the overlay fails to cover.
//   divergent : string[]  files that differ between the live base and HEAD
//   mods      : string[]  the runtime module graph (from parseMods)
//   overlay   : string[]  the files this deploy will ship from HEAD
// Returns { loadedDivergent, missing, ok }.
export function checkOverlayConsistency({ divergent, mods, overlay }) {
  const modsSet = new Set(mods);
  const overlaySet = new Set(overlay);
  const loadedDivergent = divergent.filter(f => modsSet.has(f));
  const missing = loadedDivergent.filter(f => !overlaySet.has(f));
  return { loadedDivergent, missing, ok: missing.length === 0 };
}

// Full preflight: gathers divergence via git and MODS via index.html, applies the
// rule, and THROWS with an actionable message if the overlay set is inconsistent.
// Returns the diagnostic object on success.
export function preflightOverlay({
  overlay,
  base = "origin/gh-pages",
  head = "HEAD",
  indexHtml = "index.html",
  fetch = true,
} = {}) {
  if (!Array.isArray(overlay) || !overlay.length) throw new Error("preflightOverlay: `overlay` must be a non-empty array of paths");
  if (fetch) git("fetch", "origin", base.replace(/^origin\//, ""), "--quiet");
  const divergent = gitStr("diff", "--name-only", `${base}`, head).split("\n").filter(Boolean);
  const mods = parseMods(indexHtml);
  const res = checkOverlayConsistency({ divergent, mods, overlay });
  if (!res.ok) {
    throw new Error(
      "OVERLAY-DRIFT PREFLIGHT FAILED — deploy rejected (would risk a LIVE boot crash).\n" +
      `These runtime modules DIVERGE between ${base} and ${head} but are NOT in OVERLAY:\n` +
      res.missing.map(f => `    - ${f}`).join("\n") + "\n" +
      "The live tree would keep STALE copies of them while their siblings advance to HEAD,\n" +
      "which can throw at ES-module link time (missing export) → black screen for every player.\n" +
      "Fix: add each listed file to OVERLAY, or avoid diverging it. See the MODS-intersection\n" +
      "rule at the top of tools/deploy-lib.mjs (ref CAS-2220 / CAS-2202 / CAS-2223)."
    );
  }
  return res;
}

// Build the version fingerprint over the RESULTING live tree (base ∪ overlay).
// `shas` maps every overlaid path -> the blob sha that will be shipped.
export function computeBuild({ shas, base = "origin/gh-pages" }) {
  const tracked = git("ls-tree", "-r", "--name-only", base).toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...Object.keys(shas), "version.json"])].filter(f => f !== "version.json").sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = shas[f] ? git("cat-file", "blob", shas[f]) : git("show", `${base}:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

// Compose base ∪ overlay + version.json into a tree and push it to gh-pages.
// Returns { build, files, commit, pushed, err? }.
export function buildAndPush({ shas, message, base = "origin/gh-pages", indexTmp = "/tmp/deploy-lib-index" }) {
  const { build, files } = computeBuild({ shas, base });
  const version = JSON.stringify({ build, files });
  const env = { ...process.env, GIT_INDEX_FILE: indexTmp };
  execFileSync("git", ["read-tree", base], { env });
  for (const [f, s] of Object.entries(shas)) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${s},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", base);
  const fullMsg = `${message}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`;
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", fullMsg);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}

// One-call helper for casNNNN-deploy.mjs scripts: PREFLIGHT (throws on drift) then
// buildAndPush. `overlay` is either an array of paths (all shipped from HEAD) or an
// object { path: "HEAD" | "<sha>" }. Assets in `overlay` that aren't in MODS are fine.
export function deployOverlay({ overlay, message, base = "origin/gh-pages", head = "HEAD", indexHtml = "index.html", indexTmp = "/tmp/deploy-lib-index" }) {
  const overlayMap = Array.isArray(overlay)
    ? Object.fromEntries(overlay.map(f => [f, "HEAD"]))
    : overlay;
  const preflight = preflightOverlay({ overlay: Object.keys(overlayMap), base, head, indexHtml });
  const shas = {};
  for (const [f, s] of Object.entries(overlayMap)) shas[f] = (s === "HEAD" || s === head) ? gitStr("rev-parse", `${head}:${f}`) : s;
  const result = buildAndPush({ shas, message, base, indexTmp });
  return { overlaySha: shas, preflight, ...result };
}
