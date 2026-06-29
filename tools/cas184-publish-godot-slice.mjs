// ---------------------------------------------------------------------------
// CAS-184 — Publish the Godot slice (godot/build, commit 58dd793) to a NON-PUBLIC
// test subpath of the backup host so we can measure real browser/mobile numbers.
//
//   https://<owner>.github.io/<repo>/godot-slice/
//
// It is *additive*: it clones the existing gh-pages tree (the prod backup bundle)
// and only writes the `godot-slice/` subdir on top, then pushes. The prod bundle
// is preserved byte-for-byte. Not linked anywhere public; never touches the live
// Higgsfield game_id. Measurement only — feeds the G0→G1 gate of CAS-182.
//
// NOTE: a later `npm run backup-host-publish` force-pushes a fresh tree that does
// NOT contain godot-slice/, so this measurement URL is intentionally ephemeral.
// Re-run this script to restore it. Run: node tools/cas184-publish-godot-slice.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ROOT } from "./harness.mjs";

const BUILD = join(ROOT, "godot", "build");
const BRANCH = "gh-pages";
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });

if (!existsSync(join(BUILD, "index.wasm"))) {
  console.error(`✖ ${BUILD}/index.wasm missing — build the Godot web export first (see godot/README.md).`);
  process.exit(1);
}

// resolve origin + credential, exactly like backup-host-publish.mjs
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

const stage = mkdtempSync(join(tmpdir(), "godot-slice-"));
try {
  console.log(`· cloning ${BRANCH} (preserving prod backup bundle)…`);
  sh("git", ["clone", "-q", "--depth", "1", "--branch", BRANCH, pushUrl, stage]);
  const slice = join(stage, "godot-slice");
  rmSync(slice, { recursive: true, force: true });
  cpSync(BUILD, slice, { recursive: true });
  const git = (...a) => sh("git", ["-C", stage, ...a]);
  git("config", "user.name", "Paperclip CTO");
  git("config", "user.email", "noreply@paperclip.ing");
  git("add", "-A");
  const head = sh("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]).trim();
  git("commit", "-q", "-m", `CAS-184: publish Godot slice to /godot-slice/ test subpath (from ${head})`);
  console.log(`· pushing ${BRANCH}…`);
  git("push", "-q", pushUrl, `${BRANCH}:${BRANCH}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

console.log(`\n✅ Godot slice published.`);
console.log(`   URL: https://${owner}.github.io/${repo}/godot-slice/`);
