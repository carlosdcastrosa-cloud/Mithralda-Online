// ---------------------------------------------------------------------------
// CAS-180 — Publish the backup static host to GitHub Pages (Phase 0 + Phase 1).
//
// The live URL (Higgsfield) is a single point of failure: when `deploy_game` is
// down, the public game strands many commits behind master HEAD (see CAS-136 /
// CAS-154 / CAS-177). This publishes the SAME verified bundle to a host WE
// control — a free GitHub Pages project site — so a HEAD-fresh build is always
// reachable. It is $0, reversible, and never touches the live Higgsfield URL.
//
// What it does (idempotent, re-runnable = the "always carries HEAD" recipe):
//   1. Exports a fresh HEAD bundle (tools/backup-host-export.mjs; refuses a
//      stale version.json stamp — same guard the live deploy uses).
//   2. Adds a `.nojekyll` marker so GitHub Pages serves every path verbatim
//      (Jekyll otherwise drops underscore-prefixed files/dirs).
//   3. Force-pushes the bundle to the `gh-pages` branch of `origin` using the
//      repo's stored credential. gh-pages holds ONLY the servable tree, kept
//      out of master's history.
//
// One-time activation (after the first run) — enable Pages once via the API or
// repo Settings → Pages → Source: "Deploy from a branch", branch `gh-pages` /
// root. See docs/backup-static-host-CAS-177.md. After that, every run of this
// script reships HEAD.
//
// Run: npm run backup-host-publish
// ---------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ROOT } from "./harness.mjs";

const OUT = join(ROOT, "deploy", "backup-host");
const BRANCH = "gh-pages";
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });

// 1) fresh HEAD bundle (this refuses a stale stamp)
console.log("· exporting HEAD bundle…");
execFileSync("node", [join(ROOT, "tools", "backup-host-export.mjs")], { stdio: "inherit" });

const build = JSON.parse(readFileSync(join(OUT, "version.json"), "utf8")).build;
const head = sh("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]).trim();

// resolve origin + credential (the repo already authenticates pushes via this token)
const remote = sh("git", ["-C", ROOT, "remote", "get-url", "origin"]).trim();
const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) { console.error(`✖ origin is not a GitHub remote: ${remote}`); process.exit(1); }
const [, owner, repo] = m;
const credFile = join(ROOT, ".git", ".cas-credentials");
let pushUrl = `https://github.com/${owner}/${repo}.git`;
if (existsSync(credFile)) {
  const line = readFileSync(credFile, "utf8").split("\n").find((l) => l.includes("github.com"));
  const cm = line && line.match(/https:\/\/([^:]+):([^@]+)@/);
  if (cm) pushUrl = `https://${cm[1]}:${cm[2]}@github.com/${owner}/${repo}.git`;
}

// 2) stage bundle + .nojekyll in a throwaway git repo, force-push gh-pages
const stage = mkdtempSync(join(tmpdir(), "ghpages-"));
try {
  cpSync(OUT, stage, { recursive: true });
  writeFileSync(join(stage, ".nojekyll"), "");
  const git = (...a) => sh("git", ["-C", stage, ...a]);
  git("init", "-q");
  git("checkout", "-q", "-b", BRANCH);
  git("config", "user.name", "Paperclip CTO");
  git("config", "user.email", "noreply@paperclip.ing");
  git("add", "-A");
  git("commit", "-q", "-m", `backup-host: publish HEAD ${head} (build ${build})`);
  console.log(`· force-pushing ${BRANCH} (${head}, build ${build})…`);
  git("push", "-q", "-f", pushUrl, `${BRANCH}:${BRANCH}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const url = `https://${owner}.github.io/${repo}/`;
console.log(`\n✅ backup host published to ${BRANCH}  build=${build}  HEAD=${head}`);
console.log(`   URL: ${url}`);
console.log(`   (first time only: enable Pages → branch ${BRANCH} / root)`);
