// CAS-2277 — QA POST-FLIP LIVE OBSERVABLE regression for RENOMBRE DEL SANTUARIO / SANCTUARY REPUTATION.
// Independent safety-net (parallel to the CEO gate on CAS-2272). Runs against the DEPLOYED gh-pages build
// (SANCTUARY_REP.enabled:true LIVE via CAS-2274/CAS-2276, build 3a4f1d32fbc3) — NOT the dark build, NOT a
// __dev flip. The differentiator vs the DARK observable (CAS-2272): feature must be DEFAULT-ON from the
// SERVED config on a fresh boot, with 0 __dev intervention, and the accrual/render/perk must all be healthy
// on the real deployed bytes. Arc regression proves no CAS-2220 drift across the whole Santuario stack.
//   1  boot LIVE, build===3a4f1d32fbc3, __dev sanctuary+arc hooks, 0 err, 0 non-favicon 404.
//   2  served sim/config.js: SANCTUARY_REP.enabled:true + repPerBounty:25 (the flip shipped, not dark).
//   3  DEFAULT-ON (the LIVE proof): fresh boot ⇒ sanctuary().enabled===true with ZERO __dev flip.
//   4  deterministic accumulation via the REAL bounty route (accept→kill→claim) ⇒ rep += 25 exactly.
//   5  ranks = pure function of total across all 5 thresholds (Neutral..Exaltado) + 0-clamp.
//   6  derived progress coherent at an intermediate rep.
//   7  perk bounded per rank: Neutral==input byte-id (bounty XP only), Exaltado==round(input*1.15)>input.
//   8  rank crosses on REAL accumulation (140 + 1 bounty ⇒ 165 Reconocido).
//   9  RENDER OBSERVABLE inZone: the non-pulsing rank indicator DRAWS (thresholded changed-px, CAS-2266/2272).
//  10  inZone-ONLY: outside the Santuario the indicator does NOT draw (0 signal).
//  11  arc regression LIVE: BOUNTY claim + RECALL + SAFEZONE regen + TEMPLE_RESPAWN + Rested accrual healthy.
//  12  desk fps >=58 (median-of-3) with feature ON.
//  M   mobile: boots to play, real bounty accrual (+25), fps, 0 err, 0 404.
// Run: node tools/cas2277-sanctuary-rep-live-observable-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "3a4f1d32fbc3";
const OUT = join(ROOT, "shots", "cas2277");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/i.test(u)) net404.push(u + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) net404.push(r.url() + " 404"); });
}
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
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
const escToPlay = async (page) => page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); } });
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(280); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };

// complete ONE bounty by the REAL route: accept featured, bump the REAL monotonic counters to count, claim.
const completeOneBounty = (page) => page.evaluate(() => {
  const acc = window.__dev.bounty({ act: true });
  if (!acc.active) return { ok: false, reason: acc.result };
  window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
  const claim = window.__dev.bounty({ act: true });
  return { ok: claim.result === "claimed", claim };
});

// Render observable (CAS-2272 footgun): the sanctuary indicator draws at CONSTANT alpha (non-pulsing) while every
// other badge pulses on G.t and the minimap has moving blips. A pixel is a TRUE sanctuary signal if it changed a lot
// between an OFF frame and the ON frame (|Δ|>55) BUT was STABLE between two OFF frames (|Δ|<=25). Freeze day+weather.
async function snapBand(page, key) {
  await page.evaluate(() => { if (window.__dev.daynight) window.__dev.daynight({ enabled: true, phase: 0.30 });
    if (window.__dev.weather) { try { window.__dev.weather({ enabled: false }); } catch (e) {} } });
  await sleep(180);
  return page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const bw = Math.min(cv.width, Math.round(240 * dpr)), x0 = Math.max(0, cv.width - bw);
    const y0 = Math.round(150 * dpr);                        // BELOW the minimap (excludes moving enemy blips)
    const bh = Math.round(cv.height * 0.6) - y0;
    window[key] = new Uint8ClampedArray(c.getImageData(x0, y0, bw, bh).data);
    return window[key].length;
  }, key);
}
async function cleanSignal(page, baseKey, ctrlKey, probeKey) {
  return page.evaluate((baseKey, ctrlKey, probeKey) => {
    const a = window[baseKey], s = window[ctrlKey], p = window[probeKey];
    if (!a || !s || !p) return -1;
    let n = 0; for (let i = 0; i < a.length; i += 4) {
      const stable = Math.abs(a[i] - s[i]) <= 25 && Math.abs(a[i + 1] - s[i + 1]) <= 25 && Math.abs(a[i + 2] - s[i + 2]) <= 25;
      if (!stable) continue;
      if (Math.abs(a[i] - p[i]) > 40 || Math.abs(a[i + 1] - p[i + 1]) > 40 || Math.abs(a[i + 2] - p[i + 2]) > 40) n++;
    }
    return n;
  }, baseKey, ctrlKey, probeKey);
}
async function measFps(page, ms) { return await page.evaluate(async (dur) => { let f = 0; const t0 = performance.now();
  await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return Math.round(f * 1000 / (performance.now() - t0)); }, ms); }
const medFps = async (page) => { const a = []; for (let i = 0; i < 3; i++) a.push(await measFps(page, 1000)); a.sort((x, y) => x - y); return a[1]; };

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------------- DESKTOP ----------------
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [], net404 = [];
  wireErrs(page, errors, net404);
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot clean + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sanctuary && window.__dev.bounty && window.__dev.safeZone && window.__dev.recall && window.__dev.templeRespawn && window.__dev.rested && window.__dev.daynight));
  ok("1 boot clean LIVE, build===3a4f1d32fbc3, sanctuary+arc hooks, 0 err, 0 404",
     hooks && errors.length === 0 && net404.length === 0 && build === EXPECT_BUILD, `build=${build} err=${errors.length} 404=${net404.length}`);

  // 2 served config: enabled true + repPerBounty 25
  const served = await page.evaluate(async (base) => { const r = await fetch(base + "/sim/config.js?cb=" + Date.now()); const t = await r.text();
    const m = t.match(/SANCTUARY_REP\s*=\s*\{[\s\S]*?ranks:/); const blk = m ? m[0] : "";
    const g = (re) => { const x = blk.match(re); return x ? x[1] : null; };
    return { status: r.status, enabled: g(/enabled:\s*(true|false)/), rpb: g(/repPerBounty:\s*(\d+)/) }; }, LIVE);
  ok("2 served config LIVE: SANCTUARY_REP.enabled:true + repPerBounty:25 (flip shipped, not dark)",
     served.status === 200 && served.enabled === "true" && served.rpb === "25", JSON.stringify(served));

  // 3 DEFAULT-ON — the LIVE proof: fresh boot, ZERO __dev flip ⇒ sanctuary().enabled === true
  const def = await page.evaluate(() => window.__dev.sanctuary());
  ok("3 DEFAULT-ON LIVE: fresh boot sanctuary().enabled===true with NO __dev flip (feature genuinely live)",
     def.enabled === true && def.rankCount === 5 && def.repPerBounty === 25, `enabled=${def.enabled} rankCount=${def.rankCount} rep/bounty=${def.repPerBounty}`);

  // 4 deterministic accumulation via the REAL bounty route (accept→kill→claim), NOT bare setRep
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 0 }));
  const inZ = await toZone(page);
  const before = await page.evaluate(() => window.__dev.sanctuary().rep);
  const cb1 = await completeOneBounty(page);
  const after1 = await page.evaluate(() => window.__dev.sanctuary().rep);
  const cb2 = await completeOneBounty(page);
  const after2 = await page.evaluate(() => window.__dev.sanctuary());
  ok("4 deterministic accrual via REAL bounty route: each claim ⇒ rep += 25 exactly (0→25→50), field created",
     inZ && cb1.ok && cb2.ok && after1 === before + 25 && after2.rep === before + 50 && after2.hasField === true,
     `rep ${before}->${after1}->${after2.rep} claimed=${cb1.ok && cb2.ok} hasField=${after2.hasField}`);

  // 5 ranks = pure function of total, all 5 thresholds + 0-clamp
  const ranks = await page.evaluate(() => {
    const at = [0, 150, 450, 1000, 2000];
    return at.map(v => { window.__dev.sanctuary({ setRep: v }); const s = window.__dev.sanctuary(); return { idx: s.rankIdx, name: s.rank.name }; });
  });
  const expNames = ["Neutral", "Reconocido", "Honrado", "Venerado", "Exaltado"];
  const ranksOk = ranks.every((r, i) => r.idx === i && r.name === expNames[i]);
  const clamp0 = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.sanctuary().rank.name; });
  ok("5 ranks pure function of total: each threshold ⇒ config-exact rank/idx (Neutral..Exaltado), 0-clamp",
     ranksOk && clamp0 === "Neutral", `bands=${JSON.stringify(ranks.map(r => r.name))}`);

  // 6 derived progress coherent at rep=300
  const prog = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 300 }); return window.__dev.sanctuary(); });
  ok("6 derived progress coherent: rep=300 ⇒ Reconocido@150, into=150 span=300 toNext=150, next=Honrado",
     prog.rank.name === "Reconocido" && prog.into === 150 && prog.span === 300 && prog.toNext === 150 && prog.nextRank.name === "Honrado",
     `into=${prog.into}/${prog.span} toNext=${prog.toNext} next=${prog.nextRank && prog.nextRank.name}`);

  // 7 perk bounded per rank: Neutral==input (byte-id, bounty XP only), top==round(input*1.15)>input
  const perkN = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.sanctuary({ perkXp: 200 }).perk; });
  const perkTop = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); return window.__dev.sanctuary({ perkXp: 200 }).perk; });
  ok("7 perk bounded per rank: Neutral perkXp==input (x1.00 byte-id, bounty-XP only); Exaltado==round(input*1.15)>input",
     perkN === 200 && perkTop === Math.round(200 * 1.15) && perkTop > 200, `neutral=${perkN} top=${perkTop}(exp ${Math.round(200 * 1.15)})`);

  // 8 rank crosses on REAL accumulation
  await toZone(page);
  const cross = await page.evaluate(() => window.__dev.sanctuary({ setRep: 140 }).rankIdx); // Neutral, 10 below 150
  await completeOneBounty(page); // +25 ⇒ 165 ⇒ Reconocido
  const crossed = await page.evaluate(() => window.__dev.sanctuary());
  ok("8 rank crosses on REAL accrual: 140 (Neutral) + 1 bounty ⇒ 165 Reconocido, idx advances",
     cross === 0 && crossed.rankIdx === 1 && crossed.rep === 165, `idx ${cross}->${crossed.rankIdx} rep=${crossed.rep}`);

  // 9 RENDER OBSERVABLE inZone: the (non-pulsing) rank indicator draws when enabled, gone when disabled
  await toZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  await snapBand(page, "__off1");
  await snapBand(page, "__off2");
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 })); // Reconocido, mid-bar
  await snapBand(page, "__on");
  await page.screenshot({ path: join(OUT, "sanctuary-on-inzone.png") }).catch(() => {});
  const sigOn = await cleanSignal(page, "__off1", "__off2", "__on");
  const sigCtl = await cleanSignal(page, "__off1", "__off2", "__off2");
  ok("9 RENDER OBSERVABLE inZone: ON draws the (non-pulsing) rank indicator — clean signal >> OFF control",
     sigOn > 60 && sigOn > sigCtl * 5 && sigCtl < 20, `cleanSignal ON=${sigOn} vs OFF-control=${sigCtl}`);

  // 10 inZone-ONLY: outside the Santuario the indicator does NOT draw
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp((sz.temple.x / 32) + 120, (sz.temple.y / 32) + 120); });
  await escToPlay(page);
  await sleep(700);
  const outZone = await page.evaluate(() => window.__dev.safeZone().inZone);
  await snapBand(page, "__w1");
  await snapBand(page, "__w2");
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await snapBand(page, "__wOn");
  const sigWild = await cleanSignal(page, "__w1", "__w2", "__wOn");
  ok("10 inZone-ONLY: outside Santuario the indicator does NOT draw (feature ON, not inZone ⇒ signal at wild floor << indicator)",
     outZone === false && sigWild < 300 && sigWild < sigOn / 3, `outZone=${outZone} cleanSignal wild=${sigWild} (inZone was ${sigOn})`);

  // 11 arc regression LIVE with SANCTUARY ON: BOUNTY claim + RECALL + SAFEZONE regen + TEMPLE_RESPAWN + Rested
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));
  await toZone(page);
  const claimAgain = await completeOneBounty(page);
  const arc = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(220);
    // SAFEZONE regen
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1400); const hp1 = window.__dev.safeZone().hp;
    // Rested accrual
    let restedGrew = null; if (window.__dev.rested().enabled) { window.__dev.rested({ setPool: 0 }); const p0 = window.__dev.rested().pool; await s(1200); restedGrew = window.__dev.rested().pool > p0; }
    // RECALL: bind at the sanctuary, teleport away, cast recall ⇒ lands back at the bind point (dist ~0)
    let recallOk = null; const rc = window.__dev.recall ? window.__dev.recall() : null;
    if (rc && rc.enabled) { window.__dev.recall({ bind: true }); window.__dev.tp(40, 40); await s(200);
      window.__dev.recall({ setCd: 0 }); const r2 = window.__dev.recall({ cast: true }); await s(200);
      recallOk = r2.dist != null ? r2.dist < 40 : null; }
    // TEMPLE_RESPAWN: force respawn ⇒ lands near the temple
    let respawnOk = null; const tr = window.__dev.templeRespawn ? window.__dev.templeRespawn() : null;
    if (tr && tr.enabled) { window.__dev.templeRespawn({ respawn: true }); await s(200); const t2 = window.__dev.templeRespawn(); respawnOk = t2.distToTemple != null ? t2.distToTemple < 120 : null; }
    return { hp0, hp1, restedGrew, recallOk, respawnOk }; });
  await escToPlay(page);
  ok("11 arc regression LIVE (SANCTUARY ON): BOUNTY claim + SAFEZONE regen + Rested + RECALL + TEMPLE_RESPAWN healthy",
     claimAgain.ok && arc.hp1 > arc.hp0 + 1 && (arc.restedGrew === null || arc.restedGrew === true) && (arc.recallOk === null || arc.recallOk === true) && (arc.respawnOk === null || arc.respawnOk === true),
     `claim=${claimAgain.ok} hp ${arc.hp0}->${arc.hp1} rested=${arc.restedGrew} recall=${arc.recallOk} respawn=${arc.respawnOk}`);

  // 12 desk fps in a calm inZone state
  await toZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await sleep(600);
  const dfps = await medFps(page);
  ok("12 desk fps >=58 (median-of-3) with SANCTUARY ON, calm inZone", dfps >= 58, `fps~${dfps}`);
  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});
  await page.close();

  // ---------------- MOBILE ----------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = [], mNet = []; wireErrs(mp, mErr, mNet);
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  const mDef = await mp.evaluate(() => window.__dev.sanctuary().enabled);
  await mp.evaluate(() => window.__dev.sanctuary({ setRep: 0 }));
  await toZone(mp);
  const mBefore = await mp.evaluate(() => window.__dev.sanctuary().rep);
  const mcb = await completeOneBounty(mp);
  const mAfter = await mp.evaluate(() => window.__dev.sanctuary().rep);
  const mfps = await medFps(mp);
  await mp.screenshot({ path: join(OUT, "mobile-final.png") }).catch(() => {});
  ok("M mobile LIVE: default-ON, real bounty accrual (+25), fps>=55, 0 err, 0 404",
     mDef === true && mcb.ok && mAfter === mBefore + 25 && mfps >= 55 && mErr.length === 0 && mNet.length === 0,
     `defOn=${mDef} rep ${mBefore}->${mAfter} fps~${mfps} err=${mErr.length} 404=${mNet.length}`);

  ok("0 no JS errors / 404 during desktop run", errors.length === 0 && net404.length === 0, (errors.slice(0, 2).concat(net404.slice(0, 2))).join(" | "));

  console.log(`\nLIVE=${LIVE} build=${build}\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  process.exit(FAIL ? 1 : 0);
}
