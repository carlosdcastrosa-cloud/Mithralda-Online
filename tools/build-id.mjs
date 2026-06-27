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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";

export function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    out.push(...(statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]));
  }
  return out;
}

// Every shipped file EXCEPT version.json itself. logic.js is a platform
// manifest the server never exposes over HTTP (not a runtime module), so it is
// not part of the cache-bustable graph and is excluded from the id.
const ROOT_FILES = ["index.html", "game.js", "audio.js", "input.js", "view.js", "strings.js"];

// The exact, sorted set of files whose bytes define the build id.
export function buildFileList() {
  return [...ROOT_FILES, ...walk("sim"), ...walk("render"), ...walk("assets")].sort();
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
