// CAS-2060 (CAS-2057): Deploy — granular a11y toggles hitStop + flash to gh-pages.
// Padre CAS-2057, Build CAS-2058/CAS-2059 landed at HEAD commit e435d84 (freeze() + 3 crit/
// backstab/riposte flash floaters now gate on new G.settings.hitStop / G.settings.flash;
// defaults TRUE ⇒ runtime byte-preserved vs live). Rides mithralda.settings.v1 — NO config
// knob, NO input site, NO new save field.
//
// Standard-chain deploy (mirror cas2055/cas2048/cas2037). EXACTLY 4 served blobs change vs the
// current live build f5fa24ffe4e2/799: sim/sim.js, settings.js, render/render.js, strings.js.
// NOT config.js, NOT input.js (verified: git diff e435d84~1..e435d84 touches only these 4 +
// harness). No new files ⇒ files stays 799. version.json regenerated over the full tree.
// Rollback = redeploy prior 4 blobs (git show <parent>:<blob>); no data migration (defaults ON).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const OVERLAY = ["sim/sim.js", "settings.js", "render/render.js", "strings.js"];

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
  const idx = "/tmp/cas2060-index";
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["read-tree", "origin/gh-pages"], { env });
  for (const f of OVERLAY) execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${shas[f]},${f}`], { env });
  const vsha = execFileSync("git", ["hash-object", "-w", "--stdin"], { input: version }).toString().trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${vsha},version.json`], { env });
  const tree = execFileSync("git", ["write-tree"], { env }).toString().trim();
  const parent = gitStr("rev-parse", "origin/gh-pages");
  const commit = gitStr("commit-tree", tree, "-p", parent, "-m", `CAS-2060 (CAS-2057): Deploy granular a11y toggles hitStop+flash — 4 blobs (sim/sim.js, settings.js, render/render.js, strings.js), defaults ON byte-preserved runtime, no config/input/save change — build ${build}`);
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
