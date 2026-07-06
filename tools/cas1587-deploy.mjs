// CAS-1587 deploy: fold the CAS-1586 increment (Aura Gélida — 5th frost affix — +
// Esencia tie-in) into the canonical gh-pages build. Ships only the changed runtime
// files (game.js, sim/config.js, sim/sim.js, render/render.js) + the freshly stamped
// version.json (build=eb60f87e4ca1, HEAD 0d7f24a).
//
// Safety (CTO blast-radius idiom, same as CAS-1566/1567/1570/1574/1579/1580): overlay
// ONLY served files whose HEAD-COMMITTED blob differs from what origin/gh-pages serves —
// reading COMMITTED blobs (git rev-parse), never the working tree, so uncommitted WIP
// (shots/, tools/*.mjs) can never leak live. Unsafe (space/bracket) paths are refused
// (CAS-1547). Everything else on gh-pages is preserved byte-for-byte.
//
// Pass --push to actually push; default is a dry run (prints the overlay and exits).
import { execFileSync } from "node:child_process";
import { servedFileList } from "./build-id.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const HEAD = "HEAD";
const PUSH = process.argv.includes("--push");
const g = (...a) => execFileSync("git", a, { cwd: ROOT, maxBuffer: 1 << 30 });
const gOut = (...a) => g(...a).toString("utf8").trim();
const blobSha = (ref, path) => { try { return gOut("rev-parse", `${ref}:${path}`); } catch { return null; } };

g("fetch", "origin", "gh-pages", "--quiet");
const parent = gOut("rev-parse", "origin/gh-pages");
const { files, dropped } = servedFileList();
if (dropped.length) console.log("REFUSED unsafe paths:", dropped.length);

const overlay = [];
for (const f of files) {
  const head = blobSha(HEAD, f);
  if (!head) continue;
  const live = blobSha("origin/gh-pages", f);
  if (head !== live) overlay.push({ f, head, live });
}
console.log(`overlay = ${overlay.length} changed served files (parent gh-pages ${parent.slice(0, 7)})`);
for (const o of overlay) console.log(`  ${o.live ? "M" : "A"} ${o.f}  ${o.head.slice(0, 8)}`);

// Expected deploy scope: the runtime files touched by CAS-1586 + version.json.
// game.js (frost-aura QA hook), sim/config.js (5th affix def), sim/sim.js (Aura Gélida
// resolver + Esencia tie-in), render/render.js (frost VFX), version.json (stamp).
const EXPECTED = new Set(["game.js", "sim/config.js", "sim/sim.js", "render/render.js", "version.json"]);
const unexpected = overlay.filter(o => !EXPECTED.has(o.f));
if (unexpected.length) {
  console.error("ABORT — unexpected out-of-scope served drift:", unexpected.map(o => o.f));
  process.exit(1);
}
if (!overlay.length) { console.log("nothing to deploy — gh-pages already == HEAD"); process.exit(0); }
if (!PUSH) { console.log("\nDRY RUN — re-run with --push to publish."); process.exit(0); }

const idx = "/tmp/cas1587-ghp-index";
const env = { ...process.env, GIT_INDEX_FILE: idx };
execFileSync("git", ["read-tree", "origin/gh-pages"], { cwd: ROOT, env });
for (const o of overlay) {
  const mode = gOut("ls-tree", HEAD, "--", o.f).split(/\s+/)[0] || "100644";
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `${mode},${o.head},${o.f}`], { cwd: ROOT, env });
}
const tree = execFileSync("git", ["write-tree"], { cwd: ROOT, env }).toString().trim();
const headSha = gOut("rev-parse", "HEAD");
const msg = `CAS-1587: deploy Aura Gélida (5th frost affix) + Esencia tie-in to gh-pages (build eb60f87e4ca1, HEAD ${headSha.slice(0, 7)})`;
const commit = execFileSync("git", ["commit-tree", tree, "-p", parent, "-m", msg], { cwd: ROOT, env }).toString().trim();
console.log("new gh-pages commit:", commit.slice(0, 12));

let cred = execFileSync("cat", [`${ROOT}/.git/.cas-credentials`]).toString().trim();
// .cas-credentials stores only https://<token>@github.com — append the repo path.
if (/github\.com\/?$/.test(cred)) cred = cred.replace(/\/?$/, "/carlosdcastrosa-cloud/Mithralda-Online.git");
execFileSync("git", ["push", cred, `${commit}:refs/heads/gh-pages`], { cwd: ROOT });
console.log("pushed", commit.slice(0, 12), "-> gh-pages");
