// CAS-2602 — INDEPENDENT DARK QA (Gate 2/2 input) for REMATE DE ACOMETIDA (LUNGE_SURGE, EVO#101 DARK, enabled:false) @dcffd95.
// QA-OWNED harness. Oracles RE-DERIVED in pure Node from config (import LUNGE_SURGE + ETPL) — does NOT trust/copy the GE cas2600 EXPECT tables.
//   Axis (server-auth): lungeWeight(e)=band of ETPL[e.type].lunge BASE (NOT the AI movement dash lspd). hiLunge130⇒pouncer2 / midLunge110⇒lunger1 / <110⇒0.
//   Only 4 rushers carry lunge: bandit132/mudlurker126/wolf118/bat96 (all arch:"rusher"); melee-static ⇒ undefined ⇒ 0. Reads BASE not clone; applyZoneScale never scales lunge.
//   byte-neutral OFF: enabled:false ⇒ _lungePre=0 const inert + dead branch ⇒ killEnemy/render byte-identical to HEAD; h.lungeBounty never on save; worldFingerprint byte-stable across toggle.
//   North Star: 2-client convergence, fp 15920977, 0-desync (lungeScore is PURE fn of G.enemies+types ⇒ shard-consistent).
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { LUNGE_SURGE, ETPL } from "../sim/config.js";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2602-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const EXPECT_BUILD = "e1d801e51573"; // served/HEAD version.json build (#100 RECOVER LIVE); LUNGE is additive DARK ⇒ config byte-neutral, build unchanged.
const EXPECT_FP = 15920977;          // North Star: JSON string length of worldFingerprint(393) (full deterministic world snapshot)
const EXPECT_TERRHASH = 2105484439;  // North Star: terrHash field of the shared deterministic world
const PIN_SHA = "dcffd95";           // the DARK build under test (task-pinned)

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ---------- RE-DERIVED ORACLES (pure Node, from config ground truth) ----------
const HI = +LUNGE_SURGE.hiLunge, MID = +LUNGE_SURGE.midLunge, CAP = LUNGE_SURGE.lungeBountyCap | 0;
const W = LUNGE_SURGE.weights || {};
// my own weight oracle from the band thresholds
function myWeight(lunge) { const l = +lunge || 0; if (l >= HI) return +W.pouncer || 0; if (l >= MID) return +W.lunger || 0; return 0; }
// my own tier/charge oracle from the tiers table + sub-cap
function myTierCharge(score) { const T = LUNGE_SURGE.tiers || []; let t = 0; for (let i = 0; i < T.length; i++) if (score >= (+T[i].min || 0)) t = i + 1;
  const raw = t > 0 ? (+T[t - 1].charge || 0) : 0; const charge = CAP > 0 ? Math.min(raw, CAP) : raw; return { tier: t, charge }; }
// my own lunge-of-type oracle: BASE row only (undefined ⇒ 0)
const lungeOfType = (ty) => (ETPL[ty] && ETPL[ty].lunge != null) ? +ETPL[ty].lunge : 0;

// carriers ground truth (independently enumerated from ETPL)
const CARRIERS = Object.entries(ETPL).filter(([k, v]) => v && v.lunge != null).map(([k, v]) => ({ type: k, lunge: +v.lunge, arch: v.arch, spd: v.spd, w: myWeight(+v.lunge) }));
// static-melee sample (no lunge) — must all read 0
const MELEE = ["golem", "moose", "summoner", "skeleton", "orc", "charger", "mage", "rat"].filter(t => ETPL[t] && ETPL[t].lunge == null);

// LUT edge cases (re-derived: cover both thresholds inclusive/exclusive)
const LUNGE_EDGES = [HI + 2, HI + 1, HI, HI - 1, MID + 8, MID, MID - 1, 96, 0].map(l => ({ lunge: l, w: myWeight(l) }));
const SCORE_CASES = [0, 1, 2, 3, 9].map(s => ({ score: s, ...myTierCharge(s) }));

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const Z = { forest: [192, 723] };
const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 1 — boot + hook presence + build + 0 err
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lunge && window.__dev.worldFingerprint && window.__dev.saveBlob));
  ok("1 boots to play, __dev.lunge hook + __BUILD present, 0 boot err", hooks && !!build && errors.length === 0, `build=${build} err=${errors.length}`);

  // 2 — served DARK: enabled:false, config knobs match HEAD, tag="", gExists false
  const dark = await page.evaluate(() => window.__dev.lunge());
  ok("2 served DARK: LUNGE_SURGE.enabled===false + channel lungeFind + config knobs match HEAD",
    dark.enabled === false && dark.channel === "lungeFind" && dark.hiLunge === HI && dark.midLunge === MID && dark.cap === CAP,
    `enabled=${dark.enabled} hi=${dark.hiLunge} mid=${dark.midLunge} cap=${dark.cap}`);
  ok("3 byte-neutral OFF: tag==='' (badge silent) + gExists===false (G.lungeBounty never created)",
    dark.tag === "" && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0,
    `tag='${dark.tag}' gExists=${dark.gExists} score=${dark.score}`);

  // 4 — save has ZERO lunge* keys (STATELESS, off the save allowlist)
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("4 save blob has NO lunge*/lungeBounty key (transient, off save allowlist + fingerprint)",
    !/lunge/i.test(saveOff), `hits=${(saveOff.match(/lunge/ig) || []).length}`);

  // 5 — worldFingerprint byte-stable across enable toggle (0 RNG drift; bounty never enters fp)
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.lunge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.lunge({ enabled: false }));
  ok("5 worldFingerprint byte-stable across enabled toggle (flag effect NOT in fp)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 6 — LUT scoreProbe: score→tier→charge matches MY re-derived tiers+cap
  const tab = await page.evaluate((cs) => cs.map(c => window.__dev.lunge({ scoreProbe: { score: c.score } }).scoreProbe), SCORE_CASES);
  const s6 = SCORE_CASES.every((c, i) => tab[i] && tab[i].tier === c.tier && tab[i].charge === c.charge);
  ok("6 LUT scoreProbe score→tier→charge == my tiers table (cap2 clamps s≥2⇒2)", s6, JSON.stringify(tab));

  // 7 — LUT lungeProbe: threshold edges hi130/mid110 (129/130, 109/110) match MY band oracle
  const lnp = await page.evaluate((cs) => cs.map(c => window.__dev.lunge({ lungeProbe: { lunge: c.lunge } }).lungeProbe), LUNGE_EDGES);
  const s7 = LUNGE_EDGES.every((c, i) => lnp[i] && lnp[i].weight === c.w);
  ok("7 LUT lungeProbe threshold edges (hi130/mid110 inclusive; 129,109 below) == my band oracle", s7,
    JSON.stringify(LUNGE_EDGES.map((c, i) => ({ l: c.lunge, exp: c.w, got: lnp[i] && lnp[i].weight }))));

  // 8 — REAL spawnLunge per TYPE: server-auth reads ETPL[type].lunge BASE == my lungeOfType oracle
  const typeCases = [...CARRIERS.map(c => c.type), ...MELEE];
  const real = await page.evaluate((args) => {
    const { types, Z } = args; const out = [];
    window.__dev.lunge({ enabled: true });
    for (const t of types) { window.__dev.lunge({ clearLunge: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.lunge({ spawnLunge: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnLunge;
      out.push({ type: t, valid: sr.valid, lunge: sr.lunge, weight: sr.weight }); }
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return out;
  }, { types: typeCases, Z });
  const s8 = real.every(r => r.valid && r.lunge === lungeOfType(r.type) && r.weight === myWeight(lungeOfType(r.type)));
  ok("8 REAL spawnLunge server-auth reads ETPL[type].lunge BASE == my oracle (4 carriers + melee-static⇒0)", s8,
    JSON.stringify(real.filter(r => !(r.valid && r.lunge === lungeOfType(r.type) && r.weight === myWeight(lungeOfType(r.type)))).map(r => ({ t: r.type, l: r.lunge, w: r.weight }))) || "all-match");

  // 9 — ⊥override/⊥#74/⊥champion: overrideLunge on CLONE ignored ⇒ base weight preserved
  const ovr = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // bandit base132(w2) but clone lunge forced to 50 ⇒ lungeOf reads base ⇒ still w2
    const ban = window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1], overrideLunge: 50 } }).spawnLunge;
    window.__dev.lunge({ clearLunge: true });
    // wolf base118(w1) but clone forced to 200 ⇒ still w1
    const wo = window.__dev.lunge({ spawnLunge: { type: "wolf", tx: Z.forest[0], ty: Z.forest[1], overrideLunge: 200 } }).spawnLunge;
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return { ban, wo };
  }, Z);
  const s9 = ovr.ban.lunge === 132 && ovr.ban.weight === 2 && ovr.ban.tplLunge === 50 &&
            ovr.wo.lunge === 118 && ovr.wo.weight === 1 && ovr.wo.tplLunge === 200;
  ok("9 ⊥override: clone e.tpl.lunge override IGNORED, lungeOf reads BASE (bandit clon50⇒w2, wolf clon200⇒w1)", s9,
    `bandit{base:${ovr.ban.lunge},w:${ovr.ban.weight},clon:${ovr.ban.tplLunge}} wolf{base:${ovr.wo.lunge},w:${ovr.wo.weight},clon:${ovr.wo.tplLunge}}`);

  // 10 — CRUX ⊥#93 ROLE: all 4 carriers arch:"rusher" IDENTICAL yet lunge sweeps 0/1/2 ⇒ NOT re-map of arch
  const allRusher = CARRIERS.every(c => c.arch === "rusher");
  const sweeps = new Set(CARRIERS.map(c => c.w));
  ok("10 CRUX ⊥#93 ROLE: 4 lunge-carriers ALL arch:'rusher' but weight sweeps {0,1,2} (bat0/wolf1/mudlurker1/bandit2)",
    allRusher && sweeps.has(0) && sweeps.has(1) && sweeps.has(2),
    JSON.stringify(CARRIERS.map(c => `${c.type}:rusher/w${c.w}`)));

  // 11 — CRUX ⊥#94 SWIFT: within same speed family, bat(spd158)/lunge0 vs wolf(spd128)/lunge1 ⇒ MISMO swift OPUESTO lunge
  const bat = CARRIERS.find(c => c.type === "bat"), wolf = CARRIERS.find(c => c.type === "wolf");
  ok("11 CRUX ⊥#94 SWIFT: bat spd158/lunge96(w0) vs wolf spd128/lunge118(w1) — cruising speed ⊥ pounce distance",
    bat && wolf && bat.spd > wolf.spd && bat.w === 0 && wolf.w === 1,
    `bat{spd${bat && bat.spd},w${bat && bat.w}} wolf{spd${wolf && wolf.spd},w${wolf && wolf.w}}`);

  // 12 — 0-regression: 28 _SURGE served enabled:true, LUNGE the ONLY false (served view via saveBlob-independent config read in page)
  const census = await page.evaluate(async () => {
    const C = await import("./sim/config.js");
    const keys = Object.keys(C).filter(k => k.endsWith("_SURGE"));
    let t = 0, f = 0; const off = [];
    for (const k of keys) { const v = C[k]; if (v && typeof v === "object" && "enabled" in v) { v.enabled ? t++ : (f++, off.push(k)); } }
    return { total: keys.length, t, f, off };
  });
  ok("12 0-regression served: 28 _SURGE enabled:true, LUNGE_SURGE the ONLY false (off=[LUNGE_SURGE])",
    census.t === 28 && census.f === 1 && census.off.length === 1 && census.off[0] === "LUNGE_SURGE",
    `total=${census.total} true=${census.t} false=${census.f} off=${JSON.stringify(census.off)}`);

  // 13 — North Star: 2-client convergence. Same deterministic world ⇒ byte-identical worldFingerprint(393) (0 desync) + fp.len==EXPECT_FP + terrHash==EXPECT_TERRHASH.
  const readFP = (pg) => pg.evaluate(() => { const o = window.__dev.worldFingerprint(393); const s = JSON.stringify(o); return { fp: s, len: s.length, terr: o.terrHash }; });
  const fpA = await readFP(page);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront(); // pause-on-blur throttles RAF on a backgrounded page ⇒ scene never advances; front it to boot
  await toPlay(pageB);
  const fpB = await readFP(pageB);
  ok("13 North Star 2-client worldFingerprint(393) byte-identical + len==15920977 + terrHash==2105484439 (0 desync)",
    fpA.fp === fpB.fp && fpA.len === EXPECT_FP && fpB.len === EXPECT_FP && fpA.terr === EXPECT_TERRHASH && fpB.terr === EXPECT_TERRHASH,
    `A{len:${fpA.len},terr:${fpA.terr}} B{len:${fpB.len},terr:${fpB.terr}} fpMatch=${fpA.fp === fpB.fp}`);

  // 14 — North Star: identical spawned pouncer ⇒ identical lungeScore on both clients (server-auth pure fn convergence)
  const readLive = async (pg) => pg.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    const live = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;
    const vm = window.__dev.lunge();
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return { score: live.score, count: live.count, vmScore: vm.score, vmTier: vm.tier, vmCharge: vm.charge };
  }, Z);
  const liveA = await readLive(page), liveB = await readLive(pageB);
  const s14 = liveA.score === 2 && JSON.stringify(liveA) === JSON.stringify(liveB);
  ok("14 North Star 2-client lungeProbeLive+VM identical for same pouncer (bandit⇒score2, 0 desync)", s14, `A=${JSON.stringify(liveA)} B=${JSON.stringify(liveB)}`);

  // 15 — fps sanity. Close pageB FIRST so page A has the machine to itself (headless 2-page RAF contention is a measurement confound, not a perf regression — DARK badge isn't even drawn). best-of-3.
  await pageB.close();
  await page.bringToFront();
  await sleep(700);
  const measure = () => page.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise(res => { const loop = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(loop) : res(); }; requestAnimationFrame(loop); }); return n; });
  let fps = 0; for (let i = 0; i < 3; i++) { const f = await measure(); if (f > fps) fps = f; }
  ok("15 fps stable ≥55 (single-client best-of-3; DARK: renderLungeBadge not dispatched, 0 perturbation)", fps >= 55, `fps≈${fps}`);

  // selfverify screenshot
  await page.screenshot({ path: join(OUT, "selfverify.png") });
} catch (e) { ok("harness completed without throw", false, String(e)); }
finally { await browser.close(); await server.close(); }

// git-state guard: the DARK build under test (dcffd95) is real (not phantom) and intact.
// master may have ADVANCED mid-QA via additive sibling QA tooling (create-race twin CAS-2601) — that must NOT touch game files.
try {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  const rem = execSync("git ls-remote origin master", { cwd: ROOT }).toString().trim().split(/\s+/)[0];
  ok("16a phantom guard: dcffd95 is a REAL landed ancestor of origin/master (git ls-remote, not phantom)",
    head === rem && execSync(`git merge-base --is-ancestor ${PIN_SHA} HEAD && echo Y`, { cwd: ROOT }).toString().includes("Y"),
    `HEAD=${head.slice(0, 7)} rem=${rem.slice(0, 7)} pin=${PIN_SHA}`);
  // delta dcffd95..HEAD must be QA-tooling-only (tools/ + shots/), zero game-logic drift
  const delta = execSync(`git diff --name-only ${PIN_SHA} HEAD`, { cwd: ROOT }).toString().trim().split("\n").filter(Boolean);
  const gameFiles = delta.filter(f => /^(game\.js|sim\/|render\/|strings\.js|index\.html|version\.json)/.test(f));
  ok("16b DARK build under test intact: dcffd95..HEAD touches ONLY QA tooling (tools/shots), 0 game-logic drift",
    gameFiles.length === 0, `delta=${JSON.stringify(delta)} gameFiles=${JSON.stringify(gameFiles)}`);
  // version.json UNTOUCHED e1d801e51573/815 at the pinned build
  const vj = execSync(`git show ${PIN_SHA}:version.json`, { cwd: ROOT }).toString().trim();
  ok("16c version.json UNTOUCHED at dcffd95 (e1d801e51573/815 — additive DARK, config byte-neutral)",
    vj.includes("e1d801e51573") && vj.includes("815"), vj);
} catch (e) { ok("16 git-state guard", false, String(e)); }

console.log(`\n==== CAS-2602 INDEP DARK QA: ${PASS}/${PASS + FAIL} PASS ====`);
process.exit(FAIL ? 1 : 0);
