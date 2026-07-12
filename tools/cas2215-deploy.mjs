// CAS-2215: Deploy grey street tileset (CAS-2206 drop-in) to the shared hub — AND fix the
// P0 live-down that CAS-2202's deploy introduced.
//
// ROOT CAUSE found this heartbeat: live build 60315600deec has render/render.js importing
// `T_STREET` from sim/config.js, but the DEPLOYED config.js never got the CAS-2191 export.
// Native ES modules => module-link SyntaxError => the whole game fails to boot (black screen).
// Confirmed live: pageerror "does not provide an export named 'T_STREET'". CAS-2202 QA was
// still `todo`, so nobody caught it.
//
// This deploy restores a COHERENT city-capable build by overlaying the minimal safe set onto
// origin/gh-pages:
//   1. sim/config.js       <- HEAD  (adds T_STREET export + TOWN_MAP 'S' street glyphs +
//                                     PIXELART export; verified ZERO mechanic `enabled` flips
//                                     vs live => fixes boot AND places the street)
//   2. render/sprites.js   <- SURGICAL (live gh-pages sprites.js + ONLY the CAS-2191 city
//                                     loadImg lines + PROP_SCALE city entries). Deliberately
//                                     NOT HEAD sprites.js — HEAD carries the unshipped, QA-
//                                     flagged CAS-2194 pilot wiring (skel pilot / warrior 88x64
//                                     / fx_nova) whose assets aren't deployed. Excluded.
//   3. assets/pixellab/city/{cobble_street_tileset.png + house_red/depot/temple/street_lamp}
//                                     <- HEAD (grey tileset md5 950888ac + the 4 props sprites
//                                     .js references). Additive.
//
// render/render.js is LEFT AS LIVE — it already draws IMG.city_street via the CITY_WANG dual-
// grid autotiler (line ~524) and only needs T_STREET to exist. NOT bundling the CAS-2208
// PIXELART render gate (separate, unshipped workstream).
//
// Reversible: revert this gh-pages commit + redeploy. Mirror of cas2202-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();
const gitBuf = (...a) => git(...a);

git("fetch", "origin", "gh-pages", "--quiet");
git("fetch", "origin", "master", "--quiet");

// --- 1. Build the SURGICAL sprites.js blob from the live (gh-pages) base ---------------------
let sprites = gitBuf("show", "origin/gh-pages:render/sprites.js").toString();

const ALTAR_ANCHOR = '  loadImg("prop_erw_altar","./assets/props/erw_altar.png");';
const CITY_LOADS = ALTAR_ANCHOR + "\n" +
  '  // CAS-2191/CAS-2215: City Batch-1 street tileset + building props (assets/pixellab/city/,\n' +
  '  // byte-identical STYLE TOKEN). city_street feeds the render.js CITY_WANG dual-grid autotiler.\n' +
  '  loadImg("city_street","./assets/pixellab/city/cobble_street_tileset.png");\n' +
  '  loadImg("prop_city_house","./assets/pixellab/city/house_red.png");\n' +
  '  loadImg("prop_city_depot","./assets/pixellab/city/depot.png");\n' +
  '  loadImg("prop_city_temple","./assets/pixellab/city/temple.png");\n' +
  '  loadImg("prop_city_lamp","./assets/pixellab/city/street_lamp.png");';
if (!sprites.includes(ALTAR_ANCHOR)) throw new Error("altar anchor not found in gh-pages sprites.js");
if (sprites.includes("city_street")) throw new Error("gh-pages sprites.js already has city_street?!");
sprites = sprites.replace(ALTAR_ANCHOR, CITY_LOADS);

const PROP_OLD = "export const PROP_SCALE={ prop_tree_a:0.5, prop_tree_b:0.5, prop_shrub:0.62, prop_bush:0.72, prop_ruin_statue:0.55, prop_ruin_obelisk:0.6, prop_ruin_arch:0.58, prop_erw_fountain:0.5, prop_erw_altar:0.5 };";
const PROP_NEW = "export const PROP_SCALE={ prop_tree_a:0.5, prop_tree_b:0.5, prop_shrub:0.62, prop_bush:0.72, prop_ruin_statue:0.55, prop_ruin_obelisk:0.6, prop_ruin_arch:0.58, prop_erw_fountain:0.5, prop_erw_altar:0.5,\n  prop_city_house:1.0, prop_city_depot:1.0, prop_city_temple:1.0, prop_city_lamp:1.0 };";
if (!sprites.includes(PROP_OLD)) throw new Error("PROP_SCALE anchor not found in gh-pages sprites.js");
sprites = sprites.replace(PROP_OLD, PROP_NEW);

const spritesSha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: sprites }).toString().trim();

// --- 2/3. Blobs to overlay: path -> sha ------------------------------------------------------
const ASSETS = [
  "assets/pixellab/city/cobble_street_tileset.png",
  "assets/pixellab/city/house_red.png",
  "assets/pixellab/city/depot.png",
  "assets/pixellab/city/temple.png",
  "assets/pixellab/city/street_lamp.png",
];
const overlay = { "sim/config.js": gitStr("rev-parse", "origin/master:sim/config.js"),
                  "render/sprites.js": spritesSha };
for (const a of ASSETS) overlay[a] = gitStr("rev-parse", `origin/master:${a}`);

// --- compute deterministic build fingerprint (mirror cas2202) --------------------------------
function computeBuild() {
  const tracked = git("ls-tree", "-r", "--name-only", "origin/gh-pages").toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...Object.keys(overlay)])].filter(f => f !== "version.json").sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = overlay[f] ? git("cat-file", "blob", overlay[f]) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas2215-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const [f, sha] of Object.entries(overlay))
    execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${sha},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const msg = `CAS-2215: deploy grey street tileset (CAS-2206) + FIX P0 live-down (config.js T_STREET export missing since CAS-2202) — overlay config+sprites(surgical)+5 city assets, reversible — build ${build}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`;
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", msg);
  if (process.argv.includes("--push")) {
    try {
      execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
      return { build, files, commit, pushed: true };
    } catch (e) {
      return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 400) };
    }
  }
  return { build, files, commit, pushed: false, dryRun: true };
}

console.log(JSON.stringify({ spritesSha, overlay, ...buildAndPush() }, null, 2));
