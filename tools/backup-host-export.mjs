// ---------------------------------------------------------------------------
// CAS-177 — Export an upload-ready bundle for the backup static host.
//
// Mirrors the Higgsfield deploy recipe's "ship only tracked files" rule
// (git archive HEAD) so a concurrent agent's untracked WIP never leaks into the
// backup deploy. Output lands in deploy/backup-host/ (gitignored). The caller
// then uploads that folder to Cloudflare Pages / Netlify / nginx (see
// hosting/README.md). Asserts version.json is present AND its build-id equals
// the freshly computed content hash, so we never publish a stale-stamped tree.
//
// Run: node tools/backup-host-export.mjs   (or: npm run backup-host-export)
// ---------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";
import { computeBuildId, parseVersion } from "./build-id.mjs";

const OUT = join(ROOT, "deploy", "backup-host");

// 1) clean output
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 2) export tracked HEAD only (no untracked WIP), preserving paths
//    git archive HEAD | tar -x -C OUT
const archive = execFileSync("git", ["archive", "HEAD"], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
execFileSync("tar", ["-x", "-C", OUT], { input: archive });

// 3) strip non-shipped dev cruft that happens to be tracked (tools/, design/, docs/, *.md)
for (const dir of ["tools", "tools-sprites", "design", "docs", "art-reference"]) {
  rmSync(join(OUT, dir), { recursive: true, force: true });
}
for (const f of ["package.json", "package-lock.json", "ARCHITECTURE.md", "README.md", ".gitignore"]) {
  rmSync(join(OUT, f), { force: true });
}

// 4) integrity gate: version.json present and build matches actual content hash
const vPath = join(OUT, "version.json");
if (!existsSync(vPath)) {
  console.error("✖ version.json missing from export — run `npm run stamp` and commit first.");
  process.exit(1);
}
const stamped = parseVersion(readFileSync(vPath, "utf8"));
const computed = computeBuildId();
if (!stamped || stamped.build !== computed.build) {
  console.error(`✖ stale stamp: version.json build=${stamped?.build} but tree hashes to ${computed.build}.`);
  console.error("  Run `npm run stamp`, commit version.json, then re-export.");
  process.exit(1);
}

const fileCount = execFileSync("bash", ["-c", `find ${OUT} -type f | wc -l`]).toString().trim();
console.log(`✔ backup-host bundle exported -> ${OUT}`);
console.log(`  build=${computed.build}  shipped files=${fileCount}`);
console.log(`  Upload this folder to the backup host (see hosting/README.md).`);
