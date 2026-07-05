// ---------------------------------------------------------------------------
// CAS-1547 — Regression test for the backup-host publish hardening.
//
// CAS-1546 froze the live GitHub Pages deploy for ~1h40m when a full-tree
// republish dumped 24 dev-only asset files whose names contain spaces/brackets.
// This test locks the guarantees that prevent a recurrence:
//   1. isSafePublishPath rejects space/bracket paths, accepts normal ones.
//   2. servedFileList() ships only the curated served scope (roots + version.json
//      + sim/render/assets/ui) and NO whole-repo dev cruft (tools/, godot/, …).
//   3. Every tracked space/bracket path under the served scope is REFUSED
//      (reported in `dropped`, absent from `files`).
//   4. No shipped path contains a space or bracket.
//
// Dependency-free, mirrors tools/determinism.mjs / tools/smoke.mjs (node script,
// exit 0/1). Run: node tools/cas1547-publish-guard-test.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
import { ROOT } from "./harness.mjs";
import { servedFileList, isSafePublishPath, UNSAFE_PUBLISH_PATH } from "./build-id.mjs";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

// 1) predicate behavior
for (const bad of ["a b.png", "x[1].png", "dir/Jump - Up.json", "y].png"]) {
  isSafePublishPath(bad) ? fail(`isSafePublishPath allowed unsafe "${bad}"`) : null;
}
for (const good of ["index.html", "sim/sim.js", "assets/tiles/wall.png", "render/render.js"]) {
  isSafePublishPath(good) ? null : fail(`isSafePublishPath rejected safe "${good}"`);
}
if (ok) pass("isSafePublishPath: rejects space/bracket, accepts normal paths");

const { files, dropped } = servedFileList();

// 2) served scope only — no whole-repo dev cruft leaks in
const forbiddenPrefixes = ["tools/", "tools-sprites/", "design/", "docs/", "godot/", "shots/", "hosting/", "art-reference/", "deploy/"];
const leaked = files.filter((f) => forbiddenPrefixes.some((p) => f.startsWith(p)));
leaked.length ? fail(`served fileset leaked ${leaked.length} dev-cruft path(s): ${leaked.slice(0, 3).join(", ")}…`)
              : pass(`served fileset is scoped (roots + version.json + sim/render/assets/ui), ${files.length} files, no dev cruft`);
["index.html", "game.js", "version.json"].forEach((f) =>
  files.includes(f) ? null : fail(`served fileset missing core file ${f}`));

// 3) every tracked space/bracket path under served scope is refused
const trackedUnsafe = execFileSync("git", ["ls-files", "-z", "--", "sim", "render", "assets", "ui"], { cwd: ROOT })
  .toString("utf8").split("\0").filter(Boolean).filter((p) => UNSAFE_PUBLISH_PATH.test(p));
const notDropped = trackedUnsafe.filter((p) => !dropped.includes(p));
notDropped.length ? fail(`${notDropped.length} tracked unsafe path(s) NOT refused: ${notDropped.slice(0, 2).join(", ")}…`)
                  : pass(`all ${trackedUnsafe.length} tracked space/bracket path(s) under served scope refused`);

// 4) nothing shippable contains a space/bracket
const shippedUnsafe = files.filter((f) => !isSafePublishPath(f));
shippedUnsafe.length ? fail(`${shippedUnsafe.length} shipped path(s) still unsafe: ${shippedUnsafe.slice(0, 2).join(", ")}`)
                     : pass(`0 shipped paths contain a space/bracket (Pages-freeze-safe)`);

console.log(ok ? "\n✅ CAS-1547 publish-guard test PASS" : "\n❌ CAS-1547 publish-guard test FAIL");
process.exit(ok ? 0 : 1);
