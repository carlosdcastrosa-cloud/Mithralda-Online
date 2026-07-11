// CAS-2029 post-flip go-live verifier (CAS-2023 NG+ / Nueva Partida Plus).
// The DARK harnesses (cas2023-ngplus / cas2026-ngplus-smoke / cas2022-fullbuild) each hardcode a
// pre-flip expectation (NG_PLUS.enabled===false, ngDark, or the old Onboarding build hash) and so
// each emits exactly ONE inverted-DARK false-fail post-flip while every positive/behavior/boot/fps
// assertion stays green. This fresh verifier asserts the LIVE state directly — the config-only flip
// pattern (Summon/Onboarding, CAS-2002/CAS-2021): only the `enabled` byte changed, the 3 behavior
// blobs MUST stay byte-identical to the QA-proven build (CAS-2026 PASS×2), so live == QA-observable.
// Force https (CAS-2018 lesson). Run: node tools/cas2029-postflip-verify.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const md5 = (b) => createHash("md5").update(b).digest("hex");
const git = (...a) => execFileSync("git", a, { maxBuffer: 256 * 1024 * 1024 });

// QA-proven build (CAS-2026 PASS×2 OBSERVABLE): 3 behavior blobs that MUST stay byte-identical post-flip.
const QA_PROVEN = {
  "sim/sim.js":       "ae06da7aa909108ea2428f2e7ef911b8",
  "render/render.js": "d43085ad46547b07329b2250cc925e1f",
  "strings.js":       "e1158435c6433377a02c2f5c0ed31091",
};
const DARK_BUILD = "d949871cc9b0"; // the pre-flip DARK build the flip supersedes.

let fails = 0;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { console.log("✖ " + m); fails++; };

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { redirect: "error" });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, buf, text: buf.toString("utf8") };
}

// 1) LIVE config.js == HEAD, http200, NG_PLUS.enabled:true byte-correct.
const headConfig = git("show", "HEAD:sim/config.js");
const headConfigMd5 = md5(headConfig);
const c = await get("sim/config.js");
if (c.status === 200) pass(`[HTTP] served sim/config.js http200`); else fail(`[HTTP] served sim/config.js http=${c.status}`);
if (md5(c.buf) === headConfigMd5) pass(`[BYTE] served config == HEAD md5 ${headConfigMd5}`); else fail(`[BYTE] served config md5 ${md5(c.buf)} != HEAD ${headConfigMd5}`);
const enabledLine = c.text.split("\n").find((l) => /enabled:\s*true/.test(l) && /LIVE|Flipped|CEO gate GO/.test(l));
if (/NG_PLUS\s*=\s*\{[\s\S]*?enabled:\s*true/.test(c.text)) pass(`[FLIP] served NG_PLUS.enabled:true byte-correct — ${enabledLine ? enabledLine.trim() : ""}`);
else fail(`[FLIP] served NG_PLUS.enabled is NOT true`);

// 2) The 3 behavior blobs served byte-identical to QA-proven ⇒ live == QA-observable (only enabled byte changed).
for (const [f, want] of Object.entries(QA_PROVEN)) {
  const r = await get(f);
  const got = md5(r.buf);
  if (r.status === 200 && got === want) pass(`[BEHAVIOR] served ${f} http200 byte-id QA-proven ${want}`);
  else fail(`[BEHAVIOR] served ${f} http=${r.status} md5=${got} != QA-proven ${want}`);
}

// 3) version.json flipped off the DARK build, files:799 (config-only overlay = 0 new files).
const v = await get("version.json");
let vj = {};
try { vj = JSON.parse(v.text); } catch {}
if (v.status === 200) pass(`[VERSION] version.json http200 build=${vj.build} files=${vj.files}`); else fail(`[VERSION] version.json http=${v.status}`);
if (vj.build && /^[0-9a-f]{12}$/.test(vj.build) && vj.build !== DARK_BUILD) pass(`[VERSION] build flipped off DARK ${DARK_BUILD} → ${vj.build}`);
else fail(`[VERSION] build=${vj.build} did NOT flip off DARK ${DARK_BUILD}`);
if (vj.files === 799) pass(`[VERSION] files:799 unchanged (config-only overlay = 0 new files)`); else fail(`[VERSION] files=${vj.files} != 799`);

console.log("");
if (fails === 0) console.log("CAS-2029 NG+ POST-FLIP GO-LIVE VERIFY — PASS ✔ (live == QA-observable, only the enabled byte changed)");
else console.log(`CAS-2029 NG+ POST-FLIP GO-LIVE VERIFY — FAIL ✖ (${fails})`);
process.exit(fails === 0 ? 0 : 1);
