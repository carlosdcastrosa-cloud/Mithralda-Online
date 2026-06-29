// ---------------------------------------------------------------------------
// CAS-187 — Publish the Godot G1 export (godot/build-g1) to a NON-PUBLIC test
// subpath of the backup host so we can measure real browser/mobile numbers:
//
//   https://<owner>.github.io/<repo>/godot-g1/
//
// Additive: clones the existing gh-pages tree (prod backup bundle preserved
// byte-for-byte) and writes only the `godot-g1/` subdir on top, then pushes.
// Not linked anywhere public; never touches the live Higgsfield game_id.
// Measurement only — feeds the G1 go/no-go gate of CAS-182. Mirrors
// cas184-publish-godot-slice.mjs. Re-run to restore (a later prod publish
// force-pushes a tree without godot-g1/, so this URL is intentionally ephemeral).
// ---------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ROOT } from "./harness.mjs";

const BUILD = join(ROOT, "godot", "build-g1");
const BRANCH = "gh-pages";
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });

if (!existsSync(join(BUILD, "index.wasm"))) {
  console.error(`✖ ${BUILD}/index.wasm missing — export the Godot G1 web build first (see godot/README.md).`);
  process.exit(1);
}

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

const stage = mkdtempSync(join(tmpdir(), "godot-g1-"));
try {
  console.log(`· cloning ${BRANCH} (preserving prod backup bundle)…`);
  sh("git", ["clone", "-q", "--depth", "1", "--branch", BRANCH, pushUrl, stage]);
  const dst = join(stage, "godot-g1");
  rmSync(dst, { recursive: true, force: true });
  cpSync(BUILD, dst, { recursive: true });
  const git = (...a) => sh("git", ["-C", stage, ...a]);
  git("config", "user.name", "Paperclip CTO");
  git("config", "user.email", "noreply@paperclip.ing");
  git("add", "-A");
  const head = sh("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"]).trim();
  git("commit", "-q", "-m", `CAS-187: publish Godot G1 export to /godot-g1/ test subpath (from ${head})`);
  console.log(`· pushing ${BRANCH}…`);
  git("push", "-q", pushUrl, `${BRANCH}:${BRANCH}`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

console.log(`\n✅ Godot G1 export published.`);
console.log(`   URL: https://${owner}.github.io/${repo}/godot-g1/`);
