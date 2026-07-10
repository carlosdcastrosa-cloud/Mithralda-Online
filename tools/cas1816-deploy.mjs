// CAS-1816 deploy (Esquiva Rodante, Build CAS-1815 — dodge roll i-frames):
// Isolated 0-leak overlay of ONLY the 3 game-core dodge blobs (HEAD == build 2d4c082)
// onto origin/gh-pages. Everything else on gh-pages stays byte-identical. version.json
// regenerated over the full served tree.
//   sim/config.js  — knob DODGE{enabled,cooldownMs:900,iframeMs:280,distance:92}, HARD-GATED.
//   sim/sim.js     — M1 doRoll derives iframe/cooldown/distance from the knob band when
//                    enabled (bb.iframeAdd+metaDashIframe+Estela Ardiente still sum); per-roll
//                    speed rides transient h.rollSpd. OFF => CFG.rollIFrame/rollCD/rollSpeed EXACT.
//   render/render.js — M2 legible cyan/white invuln aura + shimmer ring during h.rolling &&
//                    h.iframe>0, gated DODGE.enabled + !reduceMotion (0-RNG, $0). OFF => generic flicker.
// Guardrails: 0-RNG (reuses universal i-frame), rollSpd transient (NOT serialized) => save.v1 byte-id.
// NOT deployed: harness tools/cas1814-dodge.mjs. Auto-wake QA CAS-1817.
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
  const idx = "/tmp/cas1816-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-1816: deploy Esquiva Rodante (CAS-1815) — build ${build}`);
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
