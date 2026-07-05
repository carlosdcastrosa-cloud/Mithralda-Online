// ---------------------------------------------------------------------------
// CAS-177 / CAS-1547 — Export an upload-ready bundle for the backup static host.
//
// Ships ONLY the curated served fileset (tracked roots + sim/render/assets/ui +
// version.json, from tools/build-id.mjs::servedFileList — the same fileset logic
// the live deploy hashes), NOT the whole repo tree. This is deliberate hardening
// after CAS-1546: a `git archive HEAD` whole-tree republish once dumped 24
// dev-only asset files whose names contain spaces/brackets onto gh-pages, and the
// GitHub Pages legacy builder HUNG on that tree, freezing the live deploy for
// ~1h40m. Shipping only what the game loads structurally prevents that recurrence
// AND keeps the Pages build small/fast.
//
// Guarantees (AC #1-#4 of CAS-1547):
//   • Any tracked served-scope path containing a space or "[" / "]" is REFUSED
//     and logged (the ${OUT} tree never contains one).
//   • A final guard re-scans the physical ${OUT} tree and FAILS (non-zero exit)
//     if any space/bracket filename slipped through — a bad tree can't reach
//     gh-pages via any path that runs export first.
//   • version.json is present AND its build-id equals the freshly computed content
//     hash (never publish a stale-stamped tree).
//
// Also mirrors the "ship only tracked files" rule so a concurrent agent's
// untracked WIP never leaks into the deploy. Output lands in deploy/backup-host/
// (gitignored). backup-host-publish.mjs then force-pushes it to gh-pages.
//
// Run: node tools/backup-host-export.mjs [--dry-run]
//   --dry-run reports the served fileset, the dropped special-char offenders, and
//   the computed build id WITHOUT writing ${OUT} (CAS-1547 AC #4 verification).
// ---------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";
import { computeBuildId, parseVersion, servedFileList, isSafePublishPath } from "./build-id.mjs";

const OUT = join(ROOT, "deploy", "backup-host");
const DRY_RUN = process.argv.includes("--dry-run");

// 1) resolve the curated served fileset; refuse+log any space/bracket offender
const { files, dropped } = servedFileList();
if (dropped.length) {
  console.log(`· dropped ${dropped.length} special-char dev file(s) — never publishable to gh-pages (CAS-1547):`);
  for (const f of dropped) console.log(`    ✂ ${f}`);
}
console.log(`· served fileset: ${files.length} tracked files (roots + sim/render/assets/ui + version.json)`);

// 2) integrity gate: version.json present and build matches actual content hash.
//    (computeBuildId hashes the full tracked assets graph — the served bundle is a
//    subset of it, so the id still busts caches for every file the game loads.)
const stamped = parseVersion(readFileSync(join(ROOT, "version.json"), "utf8"));
const computed = computeBuildId();
if (!stamped || stamped.build !== computed.build) {
  console.error(`✖ stale stamp: version.json build=${stamped?.build} but tree hashes to ${computed.build}.`);
  console.error("  Run `npm run stamp`, commit version.json, then re-export.");
  process.exit(1);
}

if (DRY_RUN) {
  console.log(`\n[dry-run] would export ${files.length} files -> ${OUT}`);
  console.log(`[dry-run] excluded ${dropped.length} space/bracket offender(s); build=${computed.build} (valid)`);
  process.exit(0);
}

// 3) clean output + export the exact served fileset from HEAD (tracked, no WIP)
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const archive = execFileSync("git", ["archive", "HEAD", "--", ...files], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
execFileSync("tar", ["-x", "-C", OUT], { input: archive });

// 4) GUARD: a bad tree must never reach gh-pages. Re-scan the physical ${OUT}
//    tree; fail hard if any space/bracket filename slipped through.
const listed = execFileSync("find", [OUT, "-type", "f"]).toString().split("\n").filter(Boolean).map((p) => p.slice(OUT.length + 1));
const offenders = listed.filter((p) => !isSafePublishPath(p));
if (offenders.length) {
  console.error(`✖ GUARD FAILED: ${offenders.length} space/bracket file(s) reached the export tree — refusing to publish:`);
  for (const f of offenders) console.error(`    ✖ ${f}`);
  process.exit(1);
}

console.log(`✔ backup-host bundle exported -> ${OUT}`);
console.log(`  build=${computed.build}  shipped files=${listed.length}  offenders=0`);
console.log(`  Upload this folder to the backup host (see hosting/README.md).`);
