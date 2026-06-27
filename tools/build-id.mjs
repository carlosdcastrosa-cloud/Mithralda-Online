// ---------------------------------------------------------------------------
// CAS-58 / CAS-68 — BUILD-ID: single source of truth for the cache-bust hash.
//
// The `build` id in version.json is a deterministic content hash of every
// SHIPPED runtime file (except version.json itself — avoid a hash-of-the-hash
// loop). index.html routes the whole ES-module graph + assets through a
// ?v=<build> import map, so the id is the ONLY thing that has to change between
// deploys to bust a returning player's cache — and it changes iff a shipped
// byte changed.
//
// This module is imported by BOTH:
//   • tools/stamp-version.mjs   — writes version.json (run before every deploy)
//   • tools/deploy-verify.mjs   — asserts the LIVE id == hash(deployed tree)
// so the two can never drift on WHAT gets hashed (CAS-68: the build-id must
// correspond to the served content, not just be byte-equal master==live).
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";

// CAS-83 — list the GIT-TRACKED files under the given scopes (NUL-split so
// paths with spaces survive). We deliberately walk git's index, NOT the
// filesystem: under our shared working tree, a CONCURRENT agent's UNTRACKED
// files (e.g. an asset pack landing mid-deploy) would otherwise pollute the
// tree hash and make deploy-verify FALSE-fail with a build-id mismatch + 404s
// for files that were never in the shipped zip. The Higgsfield zip ships
// exactly the tracked content, so the build id must hash exactly that.
export function gitTracked(...paths) {
  return execFileSync("git", ["ls-files", "-z", "--", ...paths], { cwd: ROOT })
    .toString("utf8").split("\0").filter(Boolean);
}

// Every shipped file EXCEPT version.json itself. logic.js is a platform
// manifest the server never exposes over HTTP (not a runtime module), so it is
// not part of the cache-bustable graph and is excluded from the id.
const ROOT_FILES = ["index.html", "game.js", "audio.js", "input.js", "view.js", "strings.js"];

// The exact, sorted set of files whose bytes define the build id — tracked only.
export function buildFileList() {
  return [...ROOT_FILES, ...gitTracked("sim", "render", "assets")].sort();
}

// Recompute the build id from the working tree. Returns { build, files }.
export function computeBuildId() {
  const files = buildFileList();
  const h = createHash("sha256");
  for (const f of files) { h.update(f); h.update("\0"); h.update(readFileSync(join(ROOT, f))); }
  return { build: h.digest("hex").slice(0, 12), files: files.length };
}

// Parse a version.json payload (string or Buffer) -> { build, files } | null.
export function parseVersion(raw) {
  try {
    const v = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
    return typeof v.build === "string" ? v : null;
  } catch { return null; }
}
