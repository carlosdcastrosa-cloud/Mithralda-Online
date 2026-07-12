// CAS-2222 SEV-1 deploy gate: for the LIVE served module graph, every identifier any
// module imports FROM sim/config.js MUST appear as an export in the LIVE served config.js.
// Set-difference must be EMPTY for every importer (prevents whack-a-mole to next symbol).
//
// Ground truth for config's exports = dynamic import() of the served file (config.js is a
// leaf module, no imports), so Object.keys(namespace) is authoritative — no regex guessing.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const cb = () => "?_=" + Date.now() + Math.floor(Math.random() * 1e6);
const get = async p => (await fetch(`${BASE}/${p}${cb()}`, { cache: "no-store" })).text();

const cfgSrc = await get("sim/config.js");
const tmp = `/tmp/cas2222-live-config-${Date.now()}.mjs`;
writeFileSync(tmp, cfgSrc);
const ns = await import(pathToFileURL(tmp).href);
const exp = new Set(Object.keys(ns));

const MODS = ["game.js","audio.js","view.js","input.js","strings.js","analytics.js","overlay.js","hud.js","daily.js","bestiary.js","persist.js","settings.js",
  "sim/sim.js","sim/config.js","sim/math.js","sim/rng.js","sim/world.js","sim/mapdoc.js","sim/gear.js","sim/talents.js",
  "render/render.js","render/sprites.js","render/palette.js","render/customize.js"];

let fail = false;
const report = [];
for (const mod of MODS) {
  const src = await get(mod);
  const re = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*config\.js['"]/g;
  for (const m of src.matchAll(re)) {
    const names = m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const missing = names.filter(n => !exp.has(n));
    report.push({ mod, imported: names.length, missing });
    if (missing.length) fail = true;
  }
}
console.log(JSON.stringify({ liveBuild: JSON.parse(await get("version.json")).build, configExports: exp.size, importers: report, GATE: fail ? "FAIL" : "PASS" }, null, 2));
process.exit(fail ? 1 : 0);
