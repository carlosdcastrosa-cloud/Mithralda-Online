// CAS-392 deploy: overlay the 5 changed runtime files onto origin/gh-pages, stamp
// version.json from the EXACT deployed fileset (not the WIP working tree — sprites.js
// is intentionally kept at the gh-pages version), and print the plumbing commands.
// Prints the computed build id + a version.json byte; the shell step does the push.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT_FILES = ["index.html","game.js","audio.js","input.js","view.js","strings.js","analytics.js","analytics.html","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js"];
const CHANGED = ["game.js","input.js","strings.js","sim/sim.js","render/render.js"]; // from HEAD; everything else from gh-pages
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });

// file list = ROOT_FILES + tracked sim/render/assets on gh-pages (sorted) — same as build-id.mjs
const tracked = git("ls-tree","-r","--name-only","origin/gh-pages","--","sim","render","assets").toString().split("\n").filter(Boolean);
const files = [...ROOT_FILES, ...tracked].sort();

const changed = new Set(CHANGED);
const h = createHash("sha256");
for (const f of files) {
  const ref = changed.has(f) ? `HEAD:${f}` : `origin/gh-pages:${f}`;
  const blob = git("show", ref); // Buffer
  h.update(f); h.update("\0"); h.update(blob);
}
const build = h.digest("hex").slice(0, 12);
const version = JSON.stringify({ build, files: files.length });
console.log(JSON.stringify({ build, files: files.length, version }));
