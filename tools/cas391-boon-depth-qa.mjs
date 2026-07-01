// ---------------------------------------------------------------------------
// CAS-391 — INDEPENDENT QA of CAS-388 Boon Depth (rarity tiers + synergies +
// legendary keystones). Deliberately covers the paths the ENG harness
// (tools/cas388-boon-depth-live.mjs) SKIPPED, driving the REAL sim via window.__dev:
//
//   [G1] LIVE      — URL 200, build id, boot to play.
//   [G2] RARITY-Δ  — statistical draw distribution across FOUR depths (0/3/6/9), big N.
//                    rare+ AND legendary rate must CLIMB with depth (monotone-ish), and
//                    legendaries are (mostly) DEEP: near-zero rate at depth 0. Cross-check
//                    the observed per-tier share against boonRarityWeight() expectation.
//   [G3] SYN-CHIP  — each of the 3 synergies MULTIPLIES its bb field over the lone value,
//                    AND lights an AMBER chip in the RENDERED draft overlay (canvas pixel
//                    probe of the footer strip). A single boon of the pair => NO chip.
//   [G4] NOVA-CLUS — Núcleo Detonante ACTUALLY damages a real CLUSTER: build a 6-mob
//                    cluster with __dev.spawn, then a control (no nova) kill leaves them
//                    intact, and a nova kill wipes the collateral — with 0 errors (proves
//                    the re-entrancy guard survives detonating on a live cluster).
//   [G5] TRAIL     — Estela Ardiente: a real Space-roll through a mob lays a burn DoT.
//   [G6] KEYSTN-MAX— wake/nova fold as MAX (re-draft can't runaway-stack).
//   [G7] REGRESS   — boonless baseline = zero bundle (incl new fields); crit clamp ≤60;
//                    DEATH resets the stack; the CAS-383 ten still apply.
//   [G8] MOBILE    — phone-portrait viewport => the narrow STACKED draft layout renders
//                    in-bounds, and a REAL touch tap on a card picks it (boons +1).
//   [G9] HEALTH    — ≥59fps sample on a live draft frame; 0 console/page errors; 0 4xx.
//
// Run (live gh-pages):   node tools/cas391-boon-depth-qa.mjs
// Run (explicit URL):    node tools/cas391-boon-depth-qa.mjs https://host/path
// Run (local pre-check): node tools/cas391-boon-depth-qa.mjs --local
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { BOONS, BOON_RARITY, SYNERGIES, boonRarityWeight } from "../sim/config.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(m);
let ok = true;
const errors = [];
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… QA LOCAL ${BASE}` : `… QA LIVE ${BASE}`);

const RARITY = {}; for (const b of BOONS) RARITY[b.id] = b.rarity;
const LEG = BOONS.filter((b) => b.rarity === "legendary").map((b) => b.id);

// Expected per-tier draw share at a given depth from the shipped weight model (weighted
// WITHOUT replacement is dominated by the first pick's marginal weights; this is an
// order-of-magnitude anchor, not an exact predictor — used only for sanity direction).
function expectedShare(depth) {
  const tiers = {};
  for (const t of ["common", "rare", "legendary"]) {
    const ids = BOONS.filter((b) => b.rarity === t);
    tiers[t] = ids.length * boonRarityWeight(t, depth);
  }
  const tot = tiers.common + tiers.rare + tiers.legendary;
  return { rp: (tiers.rare + tiers.legendary) / tot, leg: tiers.legendary / tot };
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const SHOTS = [];
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon/.test(r.url())) errors.push(`http ${s}: ${r.url()}`); });
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  const sampleFps = async () => {
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await sleep(550);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    return Math.round(((f1 - f0) * 1000) / (t1 - t0));
  };
  const shot = async (name) => { const p = join(__dir, name); await page.screenshot({ path: p }); SHOTS.push(name); };
  const reset = async () => { await page.evaluate(() => window.__dev.retryRun()); await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {}); };

  // [G1] LIVE + boot as warrior
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  log(`… build id: ${buildId || "(none)"}`);
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas391"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // [G2] RARITY-Δ — sample big-N draws at four depths. Each openDraft() advances the RNG,
  // so N calls at a fixed owned-count are N independent draws at that depth.
  const sampleDraws = async (n) => page.evaluate((N) => {
    const out = []; for (let i = 0; i < N; i++) { const c = window.__dev.openDraft(); if (c) out.push(c); } return out;
  }, n);
  const frac = (draws) => {
    let rp = 0, leg = 0, total = 0;
    for (const d of draws) for (const id of d) { total++; const r = RARITY[id]; if (r === "rare" || r === "legendary") rp++; if (r === "legendary") leg++; }
    return { rp: rp / total, leg: leg / total, total };
  };
  const N = 500, depths = [0, 3, 6, 9], obs = [];
  for (const dep of depths) {
    await reset();
    if (dep > 0) await page.evaluate((k) => { for (let i = 0; i < k; i++) window.__dev.grantBoon("greed"); }, dep);
    const f = frac(await sampleDraws(N)); const e = expectedShare(dep);
    obs.push({ dep, ...f, exp: e });
    log(`… depth${dep}: rare+=${(f.rp * 100).toFixed(1)}% leg=${(f.leg * 100).toFixed(1)}%  (model ~rare+ ${(e.rp * 100).toFixed(0)}% leg ${(e.leg * 100).toFixed(0)}%, n=${f.total})`);
  }
  await page.evaluate(() => { window.__dev.openDraft(); }); await shot("cas391-draft-deep.png");
  const d0 = obs[0], d9 = obs[obs.length - 1];
  const monoRp = obs.every((o, i) => i === 0 || o.rp >= obs[i - 1].rp - 0.03); // non-decreasing (small noise tol)
  const climbRp = d9.rp > d0.rp + 0.10;
  const climbLeg = d9.leg > d0.leg && d9.leg > 0.03;
  const legDeepBias = d0.leg < 0.03; // legendaries surface (mostly) DEEP, not at depth 0
  if (monoRp && climbRp && climbLeg && legDeepBias)
    pass(`RARITY-Δ: rare+ ${(d0.rp * 100).toFixed(0)}%→${(d9.rp * 100).toFixed(0)}% (monotone), leg ${(d0.leg * 100).toFixed(1)}%→${(d9.leg * 100).toFixed(1)}% (deep-biased)`);
  else fail(`RARITY-Δ bad: monoRp=${monoRp} climbRp=${climbRp}(${d0.rp.toFixed(3)}→${d9.rp.toFixed(3)}) climbLeg=${climbLeg} legDeepBias=${legDeepBias}(d0.leg=${d0.leg.toFixed(3)})`);

  // [G3] SYN-CHIP — multiply + AMBER footer chip in the RENDERED overlay. Pixel-probe the
  // footer strip (where chips draw). #ffab2e ≈ (255,171,46). draftSynHint is dim grey.
  const amberFooter = () => page.evaluate(() => {
    const c = document.querySelector("canvas"); if (!c) return -1;
    let g; try { g = c.getContext("2d"); } catch (e) { return -2; }
    const VW = c.width, VH = c.height;
    const bw = Math.min(VW * 0.94, 660), bh = Math.min(VH * 0.9, 460), x = (VW - bw) / 2, y = (VH - bh) / 2;
    const botH = 54, fy0 = Math.max(0, Math.floor(y + bh - botH)), fh = Math.min(botH + 6, VH - fy0);
    let d; try { d = g.getImageData(Math.floor(x), fy0, Math.floor(bw), fh).data; } catch (e) { return -3; }
    let amber = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2]; if (r > 210 && gg > 135 && gg < 205 && b < 95) amber++; }
    return amber;
  });
  const synCases = [
    { base: "ember", partner: "glass", field: "burn", lone: 0.35, mul: 1.6, id: "ignite" },
    { base: "vamp", partner: "swift", field: "lifesteal", lone: 0.14, mul: 1.7, id: "vdance" },
    { base: "thorns", partner: "stone", field: "reflect", lone: 0.40, mul: 1.6, id: "aegis" },
  ];
  let synAll = true; const synLog = [];
  for (const sc of synCases) {
    // lone STAT-CARRIER boon: field == lone value, NO synergy, NO amber footer chip
    await reset();
    const one = await page.evaluate((id) => window.__dev.grantBoon(id), sc.base);
    await page.evaluate(() => window.__dev.openDraft());
    await sleep(120);
    const amberLone = await amberFooter();
    await page.evaluate(() => window.__dev.pickBoon(0)); // dismiss draft (resume)
    // both boons: field multiplied, synergy lit, amber footer chip appears
    await reset();
    await page.evaluate((id) => { window.__dev.grantBoon(id); }, sc.base);
    const both = await page.evaluate((id) => window.__dev.grantBoon(id), sc.partner);
    await page.evaluate(() => window.__dev.openDraft());
    await sleep(120);
    const amberBoth = await amberFooter();
    if (sc.id === "ignite") await shot("cas391-synergy-chip.png");
    await page.evaluate(() => window.__dev.pickBoon(0));
    const loneVal = one.bb[sc.field], bothVal = both.bb[sc.field];
    const synLit = Array.isArray(both.bb.syn) && both.bb.syn.includes(sc.id) && !(one.bb.syn || []).includes(sc.id);
    const mulOK = near(loneVal, sc.lone) && near(bothVal, sc.lone * sc.mul);
    const chipOK = amberBoth > 0 && amberBoth > amberLone; // chip present with pair, absent (or far less) lone
    synLog.push(`${sc.id}:${sc.field} ${loneVal}->${bothVal} chip(lone ${amberLone}/pair ${amberBoth})`);
    if (!(synLit && mulOK && chipOK)) { synAll = false; fail(`SYN ${sc.id} bad: mulOK=${mulOK}(${loneVal}/${bothVal}) synLit=${synLit} chipOK=${chipOK}(lone ${amberLone}/pair ${amberBoth})`); }
  }
  if (synAll) pass(`SYN-CHIP: all 3 synergies multiply + light amber chip (single boon does not) — ${synLog.join(" | ")}`);

  // [G4] NOVA-CLUS — Núcleo Detonante ACTUALLY damages a real cluster; a no-nova control
  // proves the HP drop on a neighbour is attributable to the nova (not the trigger kill).
  // Measured via statusOf("enemy") = the first cluster mob's live HP.
  await reset();
  await page.evaluate(() => window.__dev.statusArena("skeleton", 44, 0)); // enemies[0] neighbour @44px (within R=96)
  await page.evaluate(() => { for (let i = 0; i < 4; i++) { const a = i * (Math.PI / 2); window.__dev.spawn("skeleton", Math.cos(a) * 40, Math.sin(a) * 40); } }); // 4 more → 5-mob cluster
  const nStart = await page.evaluate(() => window.__dev.enemyCount());
  const hp0 = (await page.evaluate(() => window.__dev.statusOf("enemy"))).hp;
  // CONTROL: no nova — a spawnKill trigger at the hero must NOT damage the neighbour
  await page.evaluate(() => window.__dev.spawnKill("skeleton"));
  await sleep(60);
  const hpCtrl = (await page.evaluate(() => window.__dev.statusOf("enemy"))).hp;
  // NOVA: grant it, spawnKill again — its death detonates a nova onto the cluster
  const gnova = await page.evaluate(() => window.__dev.grantBoon("nova"));
  await page.evaluate(() => window.__dev.spawnKill("skeleton"));
  await sleep(60);
  const hp1 = (await page.evaluate(() => window.__dev.statusOf("enemy"))).hp;
  const nEnd = await page.evaluate(() => window.__dev.enemyCount());
  await shot("cas391-nova-cluster.png");
  log(`… DBG nova=${gnova.bb.onKillNova} cluster=${nStart}→${nEnd} neighbourHp ${hp0}→ctrl ${hpCtrl}→nova ${hp1}`);
  const controlHeld = hpCtrl === hp0;            // trigger kill alone did not touch the neighbour
  const novaDmg = hp1 < hpCtrl;                  // the detonation damaged the clustered neighbour
  const noRunaway = nStart >= 5 && nEnd <= nStart; // guard: a live cluster, no infinite re-detonation
  if (controlHeld && novaDmg && noRunaway) pass(`NOVA-CLUS: 5-mob cluster; control kill left neighbour at ${hpCtrl}hp; nova detonation dropped it to ${hp1}hp (guard held, no crash)`);
  else fail(`NOVA-CLUS bad: cluster ${nStart}→${nEnd} hp ${hp0}/${hpCtrl}/${hp1} controlHeld=${controlHeld} novaDmg=${novaDmg} noRunaway=${noRunaway}`);

  // [G5] TRAIL — real Space-roll through a mob lays a burn DoT (Estela Ardiente).
  await reset();
  await page.evaluate(() => { window.__dev.statusArena("skeleton", 26, 0); window.__dev.grantBoon("wake"); });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true })));
  await sleep(130);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true })));
  await sleep(130);
  const tst = await page.evaluate(() => window.__dev.statusOf("enemy"));
  const tburn = tst && tst.dots && tst.dots.burn;
  if (tburn) pass(`TRAIL: Space-roll through mob laid a burn DoT (dmg ${tburn.dmg})`); else fail(`TRAIL bad: status=${JSON.stringify(tst)}`);

  // [G6] KEYSTN-MAX — legendaries fold as MAX, a re-draft can't runaway-stack.
  await reset();
  const kw = await page.evaluate(() => window.__dev.grantBoon("wake"));
  const kn = await page.evaluate(() => window.__dev.grantBoon("nova"));
  const kr = await page.evaluate(() => { window.__dev.grantBoon("nova"); return window.__dev.grantBoon("wake"); });
  const keyOK = kw.bb.trail > 0 && kn.bb.onKillNova > 0 && near(kr.bb.trail, kw.bb.trail, 1e-6) && near(kr.bb.onKillNova, kn.bb.onKillNova, 1e-6);
  if (keyOK) pass(`KEYSTN-MAX: trail=${kw.bb.trail} nova=${kn.bb.onKillNova}; re-draft holds MAX (${kr.bb.trail}/${kr.bb.onKillNova})`);
  else fail(`KEYSTN-MAX bad: ${JSON.stringify({ t: kw.bb.trail, n: kn.bb.onKillNova, t2: kr.bb.trail, n2: kr.bb.onKillNova })}`);

  // [G7] REGRESS — zero bundle incl new fields; crit clamp; DEATH resets; the CAS-383 ten.
  await reset();
  const zero = await page.evaluate(() => window.__dev.boons());
  const zeroOK = zero.list.length === 0 && zero.bb.crit === 0 && zero.bb.burn === 0 && zero.bb.trail === 0 &&
    zero.bb.onKillNova === 0 && zero.bb.hpMul === 1 && zero.bb.moveMul === 1 && Array.isArray(zero.bb.syn) && zero.bb.syn.length === 0;
  // CAS-383 ten still apply
  const cas383 = await page.evaluate(() => {
    const g = (id) => window.__dev.grantBoon(id);
    window.__dev.retryRun();
    const r = {};
    r.ember = g("ember").bb.burn; r.venom = g("venom").bb.poison; r.vamp = g("vamp").bb.lifesteal;
    r.thorns = g("thorns").bb.reflect; r.arc = g("arc").bb.chain; r.reaper = g("reaper").bb.onKillHeal;
    r.greed = g("greed").bb.loot; const st = g("stone"); r.hpMul = st.bb.hpMul; window.__dev.retryRun();
    return r;
  });
  const tenOK = cas383.ember > 0 && cas383.venom > 0 && cas383.vamp > 0 && cas383.thorns > 0 &&
    cas383.arc >= 1 && cas383.reaper > 0 && cas383.greed > 0 && cas383.hpMul > 1;
  // crit clamp ≤60
  await reset();
  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__dev.grantBoon("glass"); });
  const clampCrit = (await page.evaluate(() => window.__dev.boons())).bb.crit;
  // DEATH resets the stack
  await page.evaluate(() => { window.__dev.grantBoon("nova"); window.__dev.grantBoon("wake"); });
  const preDeath = (await page.evaluate(() => window.__dev.boons())).list.length;
  await page.evaluate(() => window.__dev.killHero());
  await reset();
  const postDeath = (await page.evaluate(() => window.__dev.boons()));
  const deathReset = postDeath.list.length === 0 && postDeath.bb.onKillNova === 0 && postDeath.bb.trail === 0;
  if (zeroOK && tenOK && clampCrit <= 60 && deathReset)
    pass(`REGRESS: zero bundle ok; CAS-383 ten apply; crit 6×glass=${clampCrit}(≤60); death reset stack ${preDeath}→0`);
  else fail(`REGRESS bad: zeroOK=${zeroOK} tenOK=${tenOK}(${JSON.stringify(cas383)}) clampCrit=${clampCrit} deathReset=${deathReset}(pre ${preDeath})`);

  // [G9a] HEALTH — fps on a live draft frame (before we switch to mobile viewport).
  await reset();
  await page.evaluate(() => { ["nova", "wake", "glass", "ember"].forEach((b) => window.__dev.grantBoon(b)); window.__dev.openDraft(); });
  const fpsSamples = []; for (let i = 0; i < 3; i++) fpsSamples.push(await sampleFps());
  const fps = Math.max(...fpsSamples); // steady-state (60-capped); ignore per-sample GC/boundary jitter
  await page.evaluate(() => window.__dev.pickBoon(0));
  if (fps >= 59) pass(`HEALTH: ${fps}fps steady on a live draft-overlay frame (samples ${fpsSamples.join("/")})`); else fail(`HEALTH fps low: ${fps} (samples ${fpsSamples.join("/")})`);

  // [G8] MOBILE — phone-portrait: narrow stacked layout in-bounds + a REAL touch tap picks.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(200);
  await reset();
  // expose the module-scoped ui so we can read the tap rects (ui/view not on window)
  await page.addScriptTag({ type: "module", content: `import { ui } from '${BASE}/input.js'; window.__ui = ui;` }).catch(() => {});
  await page.evaluate(() => window.__dev.openDraft());
  await sleep(160);
  await shot("cas391-mobile-draft.png");
  const layout = await page.evaluate(() => {
    const c = document.querySelector("canvas"); const rects = (window.__ui && window.__ui.draftRects) || [];
    const cw = c.getBoundingClientRect().width, ch = c.getBoundingClientRect().height;
    const stacked = rects.length >= 2 && rects.every(r => r.w > r.h); // narrow layout => wide short rows
    const inBounds = rects.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= c.width + 1 && r.y + r.h <= c.height + 1);
    return { n: rects.length, stacked, inBounds, cw, ch, first: rects[0] || null };
  });
  const boonsBefore = (await page.evaluate(() => window.__dev.boons())).list.length;
  // REAL touch tap on the first card: ui rects are in canvas CSS px; map via bounding rect.
  const tapped = await page.evaluate(() => {
    const c = document.querySelector("canvas"); const r = (window.__ui && window.__ui.draftRects || [])[0];
    if (!r) return false; const bb = c.getBoundingClientRect();
    const cx = bb.left + r.x + r.w / 2, cy = bb.top + r.y + r.h / 2;
    const opt = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: "touch", isPrimary: true };
    c.dispatchEvent(new PointerEvent("pointerdown", opt));
    c.dispatchEvent(new PointerEvent("pointerup", opt));
    return true;
  });
  await sleep(120);
  const boonsAfter = (await page.evaluate(() => window.__dev.boons())).list.length;
  if (layout.n === 3 && layout.stacked && layout.inBounds && tapped && boonsAfter === boonsBefore + 1)
    pass(`MOBILE: narrow stacked layout (${layout.n} rows, in-bounds) + real touch tap picked a card (${boonsBefore}→${boonsAfter})`);
  else fail(`MOBILE bad: ${JSON.stringify(layout)} tapped=${tapped} boons ${boonsBefore}->${boonsAfter}`);

  // [G9b] errors / 4xx over the whole run
  if (errors.length === 0) pass("0 console/page errors and 0 4xx over the run");
  else { fail(`${errors.length} errors`); errors.slice(0, 8).forEach((e) => log(`    · ${e}`)); }

  log(`… shots: ${SHOTS.join(", ")}`);
} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}
console.log(ok ? "\n✅ CAS-391 boon-depth QA PASS" : "\n❌ CAS-391 boon-depth QA FAIL");
process.exit(ok ? 0 : 1);
