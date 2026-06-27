// ---------------------------------------------------------------------------
// CAS-58 — BUILD STAMPER. Writes version.json with a content-hash `build` id.
//
// The index.html bootstrap fetches version.json with cache:'no-store' on every
// load and routes the whole ES-module graph (and image assets) through a
// ?v=<build> import map. So the ONLY thing that has to change between deploys to
// bust every returning player's cache is this `build` id — and it changes iff a
// shipped file actually changed (deterministic content hash, no clock needed,
// so a no-op redeploy doesn't needlessly re-download the world).
//
// Run before every deploy and COMMIT the result:
//   node tools/stamp-version.mjs   (npm run stamp)
//
// version.json is part of the shipped bundle, so the deploy-verify gate (CAS-37)
// byte-compares it live==master like any other file.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    out.push(...(statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]));
  }
  return out;
}

// Every shipped file EXCEPT version.json itself (avoid a hash-of-the-hash loop).
const ROOT_FILES = ["index.html", "game.js", "audio.js", "input.js", "view.js", "strings.js"];
const files = [...ROOT_FILES, ...walk("sim"), ...walk("render"), ...walk("assets")].sort();

const h = createHash("sha256");
for (const f of files) { h.update(f); h.update("\0"); h.update(readFileSync(join(ROOT, f))); }
const build = h.digest("hex").slice(0, 12);

writeFileSync(join(ROOT, "version.json"), JSON.stringify({ build, files: files.length }) + "\n");
console.log(`✔ version.json  build=${build}  (${files.length} files hashed)`);
