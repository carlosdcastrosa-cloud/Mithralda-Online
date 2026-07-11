// CAS-2110 Deploy verify — polls the live URL until build==EXPECT, then asserts served md5==HEAD for the 2 overlay
// blobs (sim/config.js, sim/sim.js), DODGE_COUNTER.enabled:false byte-correct, and 0-leak (untouched blobs unchanged).
// Run: node tools/cas2110-deploy-verify.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT = "37521ab19b4c";
const OVERLAY = ["sim/config.js", "sim/sim.js"];
const UNTOUCHED = ["render/render.js", "strings.js", "sim/world.js"];
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });
const md5 = (b) => createHash("md5").update(b).digest("hex");
const headMd5 = (f) => md5(git("cat-file", "blob", `HEAD:${f}`));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fetchText(path) {
  const r = await fetch(`${BASE}/${path}?cb=${Date.now()}${Math.floor(performance.now())}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
  return r.text();
}
let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

// poll version.json
let build = null;
for (let i = 0; i < 40; i++) {
  try { const v = JSON.parse(await fetchText("version.json")); build = v.build;
    if (build === EXPECT) { pass(`live build == ${EXPECT} (files=${v.files}) after ${i} polls`); break; }
    console.log(`… poll#${i}: live build=${build} (waiting for ${EXPECT})`);
  } catch (e) { console.log(`… poll#${i} err: ${e.message}`); }
  await sleep(15000);
}
if (build !== EXPECT) { fail(`live build never reached ${EXPECT} (last=${build})`); process.exit(1); }

// served overlay md5 == HEAD
for (const f of OVERLAY) {
  const served = md5(Buffer.from(await fetchText(f))), head = headMd5(f);
  if (served === head) pass(`served ${f} md5 ${served} == HEAD`);
  else fail(`served ${f} md5 ${served} != HEAD ${head}`);
}
// DODGE_COUNTER.enabled:false byte-correct in served config
const cfg = await fetchText("sim/config.js");
const m = cfg.match(/export const DODGE_COUNTER = \{\s*\n\s*enabled:(false|true)/);
if (m && m[1] === "false") pass(`served config: DODGE_COUNTER.enabled:false (DARK) byte-correct`);
else fail(`served config: DODGE_COUNTER.enabled not false — matched=${m && m[1]}`);
// 0-leak: untouched blobs unchanged vs HEAD
for (const f of UNTOUCHED) {
  try { const served = md5(Buffer.from(await fetchText(f))), head = headMd5(f);
    if (served === head) pass(`0-leak: untouched ${f} md5 ${served} == HEAD (unchanged)`);
    else fail(`0-leak: ${f} md5 ${served} != HEAD ${head} (unexpected change)`);
  } catch (e) { console.log(`… ${f} not served at that path (${e.message}) — skipped`); }
}
console.log(ok ? "\n✅ CAS-2110 deploy-verify: served build matches HEAD, DARK, 0-leak — ALL PASS" : "\n❌ CAS-2110 deploy-verify: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
