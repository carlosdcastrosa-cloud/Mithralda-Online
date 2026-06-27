// ---------------------------------------------------------------------------
// CAS-58 / CAS-68 — BUILD STAMPER. Writes version.json with a content-hash
// `build` id (the hashing lives in tools/build-id.mjs, shared with the deploy
// gate so they never drift).
//
// The index.html bootstrap fetches version.json with cache:'no-store' on every
// load and routes the whole ES-module graph (and image assets) through a
// ?v=<build> import map. So the ONLY thing that has to change between deploys to
// bust every returning player's cache is this `build` id — and it changes iff a
// shipped file actually changed (deterministic content hash, no clock needed,
// so a no-op redeploy doesn't needlessly re-download the world).
//
// Run before every deploy and COMMIT the result:
//   node tools/stamp-version.mjs           (npm run stamp)
//
// Pre-deploy / pre-commit guard — fail (non-zero) if version.json is STALE vs.
// the tree, WITHOUT writing (so CI / the deploy recipe can't forget to stamp):
//   node tools/stamp-version.mjs --check   (npm run stamp:check)
//
// version.json is part of the shipped bundle, so the deploy-verify gate (CAS-37)
// byte-compares it live==master AND re-derives the id from the served tree
// (CAS-68) so a reused/stale id can never reach returning players.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";
import { computeBuildId, parseVersion } from "./build-id.mjs";

const CHECK = process.argv.slice(2).includes("--check");
const VJSON = join(ROOT, "version.json");
const { build, files } = computeBuildId();

if (CHECK) {
  const cur = existsSync(VJSON) ? parseVersion(readFileSync(VJSON, "utf8")) : null;
  if (!cur) { console.error("✖ stamp --check: version.json missing or unparseable — run `npm run stamp`."); process.exit(1); }
  if (cur.build !== build) {
    console.error(`✖ stamp --check: version.json is STALE.\n  committed build = ${cur.build}\n  tree content    = ${build}\n  → run \`npm run stamp\` and commit version.json BEFORE building the deploy zip.`);
    process.exit(1);
  }
  console.log(`✔ stamp --check: version.json build=${build} matches the tree (${files} files).`);
  process.exit(0);
}

writeFileSync(VJSON, JSON.stringify({ build, files }) + "\n");
console.log(`✔ version.json  build=${build}  (${files} files hashed)`);
