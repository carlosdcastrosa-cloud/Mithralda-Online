// CAS-2219: Deploy CAS-2191 city Batch-1 (cobble street Wang tileset + building props)
// to gh-pages LIVE. All city assets 404'd because neither the assets NOR the loader/
// integration code (sprites.js loadImg, config.js T_STREET, world.js city map) were ever
// deployed — only render/render.js's CAS-2191 draw code rode along with the CAS-2202 deploy.
//
// Overlay = explicit path→blobSha map onto gh-pages, so nothing else changes (blast radius):
//   • render/sprites.js, sim/config.js  = LIVE gh-pages version + ONLY the CAS-2191 hunks
//     (isolated via `git format-patch c15cbf0 | patch` so later CAS-2194/2208 changes are
//      NOT shipped prematurely — verified 0 later-change markers).
//   • sim/world.js, sim/sim.js, strings.js = HEAD blobs (their live→HEAD drift == CAS-2191 only).
//   • assets/pixellab/city/{cobble_street_tileset,house_red,depot,temple,street_lamp}.png = HEAD
//     (cobble tileset = CAS-2206 GREY regen, byte-id to AD sign-off).
//   • render/render.js NOT overlaid — CAS-2191 render code already LIVE (13/13 markers).
// Reversible = revert the commit + redeploy. Mirror of cas2202-deploy.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// path -> blob sha already present in the object DB (patched blobs were `git hash-object -w`'d;
// HEAD/asset blobs resolved below).
const OVERLAY = {
  "render/sprites.js": "93b4f1bcdd52a186f046443639a9868de2304aab", // live + CAS-2191 hunks
  "sim/config.js":     "62ca7133fc730abeb06e990943e89da868a7db15", // live + CAS-2191 hunks
  "sim/world.js":                                        "HEAD",
  "sim/sim.js":                                          "HEAD",
  "strings.js":                                          "HEAD",
  "assets/pixellab/city/cobble_street_tileset.png":      "HEAD",
  "assets/pixellab/city/house_red.png":                  "HEAD",
  "assets/pixellab/city/depot.png":                      "HEAD",
  "assets/pixellab/city/temple.png":                     "HEAD",
  "assets/pixellab/city/street_lamp.png":                "HEAD",
};

const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const gitStr = (...a) => git(...a).toString().trim();
git("fetch", "origin", "gh-pages", "--quiet");

// resolve "HEAD" sentinels to actual blob shas
const shas = {};
for (const [f, s] of Object.entries(OVERLAY)) shas[f] = s === "HEAD" ? gitStr("rev-parse", `HEAD:${f}`) : s;

function computeBuild() {
  const tracked = git("ls-tree", "-r", "--name-only", "origin/gh-pages").toString().split("\n").filter(Boolean);
  const files = [...new Set([...tracked, ...Object.keys(OVERLAY), "version.json"])].filter(f => f !== "version.json").sort();
  const h = createHash("sha256");
  for (const f of files) {
    const blob = OVERLAY[f] ? git("cat-file", "blob", shas[f]) : git("show", `origin/gh-pages:${f}`);
    h.update(f); h.update("\0"); h.update(blob);
  }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

function buildAndPush() {
  const { build, files } = computeBuild();
  const version = JSON.stringify({ build, files });
  const idx = "/tmp/cas2219-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const [f, s] of Object.entries(shas)) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${s},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2219: deploy CAS-2191 city Batch-1 art to gh-pages (5 city PNGs + sprites/config/world/sim/strings loader) — fixes 404, blast-radius isolated (CAS-2194/2208 excluded) — build ${build}\n\nCo-Authored-By: Paperclip <noreply@paperclip.ing>`);
  try {
    execFileSync("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], { stdio: "pipe" });
    return { build, files, commit, pushed: true };
  } catch (e) {
    return { build, files, commit, pushed: false, err: (e.stderr || e.stdout || e.message || "").toString().slice(0, 300) };
  }
}

console.log(JSON.stringify({ overlaySha: shas, ...buildAndPush() }, null, 2));
