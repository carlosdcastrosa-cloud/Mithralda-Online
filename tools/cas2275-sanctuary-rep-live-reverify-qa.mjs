// CAS-2275 — QA POST-FLIP LIVE re-verify of RENOMBRE DEL SANTUARIO / SANCTUARY REPUTATION (SANCTUARY_REP.enabled:true).
// Runs against the SERVED gh-pages build (LIVE), NOT a local server: proves the flip (CAS-2274) is real for players.
// Post-flip differentiator vs the DARK observable (CAS-2272): the flag is enabled:true from the SERVED config with NO
// __dev flip — every accrual/rank/perk/render check runs on the default-ON build the way a real player gets it.
//   1  boot LIVE, build===3a4f1d32fbc3, hooks, 0 err, 0 non-favicon 404.
//   2  served config LIVE: SANCTUARY_REP.enabled:true, repPerBounty:25, 5 ranks (flip shipped).
//   3  DEFAULT-ON (no __dev flip): sanctuary().enabled===true AND hasField===false at boot (field created only on accrual).
//   4  reversibility (1-line revert proof): in-mem enabled:false ⇒ perkXp(n)===n untouched (gainXP global intact).
//   5  ranks = pure function of the total (each threshold ⇒ config-exact rank/idx, 0-clamp Neutral).
//   6  perk bounded per rank (Neutral==input byte-id; Exaltado==round(input*1.15)>input).
//   7  DETERMINISTIC accrual via the REAL bounty route (accept→kill→claim) on DEFAULT-ON: each claim ⇒ rep += 25.
//   8  rank crosses on real accumulation (140 + 1 bounty ⇒ 165 Reconocido).
//   9  PERSISTENCE: rep survives saveNow + REAL page reload; save blob carries sanctuaryRep only when ON.
//  10  RENDER OBSERVABLE inZone: default-ON draws the non-pulsing sanctuary indicator (clean signal >> OFF control).
//  11  inZone-ONLY: outside the Santuario the indicator does NOT draw.
//  12  full-stack regression: WASD movement lands, real kill lands, Bounty Board reachable via real "End" key, Recall via
//      real "Home" key teleports, SAFEZONE regen + Rested accrual healthy — all still LIVE with SANCTUARY ON.
//  13  desktop fps ≥58 (calm inZone, median-of-3).
//  14  mobile: touch viewport boots, real bounty accrual (+25), fps ≥58, 0 err.
// Run: node tools/cas2275-sanctuary-rep-live-reverify-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "3a4f1d32fbc3";
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2275");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','play','classsel'].includes(window.__dev.scene())", { timeout: 30000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") return; // resumed from save
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 10000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  await sleep(500);
}
// dismiss any modal (curse/board) to return to real play so keyboard movement is live
async function escToPlay(page) {
  for (let i = 0; i < 6; i++) {
    if (await page.evaluate(() => window.__dev.scene() === "play")) break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await sleep(80);
  }
}
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(300); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };

const fps1 = (page) => page.evaluate(() => new Promise(res => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }

const completeOneBounty = (page) => page.evaluate(() => {
  const acc = window.__dev.bounty({ act: true });
  if (!acc.active) return { ok: false, reason: acc.result };
  window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
  const claim = window.__dev.bounty({ act: true });
  return { ok: claim.result === "claimed", claim };
});

async function snapBand(page, key) {
  await page.evaluate(() => { if (window.__dev.daynight) window.__dev.daynight({ enabled: true, phase: 0.30 });
    if (window.__dev.weather) { try { window.__dev.weather({ enabled: false }); } catch (e) {} } });
  await sleep(180);
  return page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const bw = Math.min(cv.width, Math.round(240 * dpr)), x0 = Math.max(0, cv.width - bw);
    const y0 = Math.round(150 * dpr);
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
      if (Math.abs(a[i] - p[i]) > 55 || Math.abs(a[i + 1] - p[i + 1]) > 55 || Math.abs(a[i + 2] - p[i + 2]) > 55) n++;
    }
    return n;
  }, baseKey, ctrlKey, probeKey);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  // console "Failed to load resource: 404" has no URL ⇒ can't filter favicon there; net404 (with URL) is authoritative for real 404s
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) net404.push(`${r.status()} ${r.url()}`); });
  // clear shared localStorage ONCE (first document only, guarded by sessionStorage) so a real reload keeps the save (persistence test #9)
  await page.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem("__qa_booted")) { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); sessionStorage.setItem("__qa_booted", "1"); } } catch (e) {} });
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot clean + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sanctuary && window.__dev.bounty && window.__dev.safeZone && window.__dev.rested && window.__dev.recall && window.__dev.hero && window.__dev.saveNow && window.__dev.saveBlob));
  ok("1 boot LIVE, build===3a4f1d32fbc3, sanctuary+arc+save hooks, 0 err, 0 non-favicon 404",
     build === EXPECT_BUILD && hooks && errors.length === 0 && net404.length === 0, `build=${build} hooks=${hooks} err=${errors.length} 404=${net404.length}`);

  // 2 served config LIVE
  const cfg = await page.evaluate(async (LIVE) => {
    const t = await (await fetch(`${LIVE}/sim/config.js?cb=${Date.now()}`)).text();
    const start = t.indexOf("export const SANCTUARY_REP"); // anchor on the export, not the comment mention
    const blk = t.slice(start, start + 900);              // the SANCTUARY_REP object body (enabled + repPerBounty + 5-row ranks)
    const g = (re) => (blk.match(re) || [])[1];
    return { enabled: g(/enabled:\s*(true|false)/), rpb: g(/repPerBounty:\s*(\d+)/), rankCount: (blk.match(/xpMult:\s*\d/g) || []).length }; // value assignments only (not the comment word)
  }, LIVE);
  ok("2 served config LIVE: SANCTUARY_REP.enabled:true, repPerBounty:25, 5 ranks",
     cfg.enabled === "true" && cfg.rpb === "25" && cfg.rankCount === 5, `enabled=${cfg.enabled} rpb=${cfg.rpb} ranks=${cfg.rankCount}`);

  // 3 DEFAULT-ON, no __dev flip: enabled true AND hasField false at boot (field created only on accrual)
  const boot = await page.evaluate(() => window.__dev.sanctuary());
  ok("3 DEFAULT-ON (no flip): enabled=true AND hasField=false at boot (h.sanctuaryRep created only on accrual)",
     boot.enabled === true && boot.hasField === false, `enabled=${boot.enabled} hasField=${boot.hasField} rep=${boot.rep}`);

  // 4 reversibility: in-mem disable ⇒ perkXp identity (revert proof, gainXP global intact)
  const perkOff = await page.evaluate(() => { window.__dev.sanctuary({ enabled: false }); const r = [0, 50, 200, 999].map(n => window.__dev.sanctuary({ perkXp: n }).perk); window.__dev.sanctuary({ enabled: true }); return r; });
  ok("4 reversibility (1-line revert): disable ⇒ perkXp(n)===n untouched (gainXP global intact)",
     JSON.stringify(perkOff) === JSON.stringify([0, 50, 200, 999]), `got=${JSON.stringify(perkOff)}`);

  // 5 ranks pure function of total
  const ranks = await page.evaluate(() => [0, 150, 450, 1000, 2000].map(v => { window.__dev.sanctuary({ setRep: v }); const s = window.__dev.sanctuary(); return { idx: s.rankIdx, name: s.rank.name }; }));
  const expNames = ["Neutral", "Reconocido", "Honrado", "Venerado", "Exaltado"];
  const ranksOk = ranks.every((r, i) => r.idx === i && r.name === expNames[i]);
  const clamp0 = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.sanctuary().rank.name; });
  ok("5 ranks pure function of total: each threshold ⇒ config-exact rank/idx, 0-clamp Neutral",
     ranksOk && clamp0 === "Neutral", `bands=${JSON.stringify(ranks.map(r => r.name))}`);

  // 6 perk bounded per rank
  const perkN = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.sanctuary({ perkXp: 200 }).perk; });
  const perkTop = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); return window.__dev.sanctuary({ perkXp: 200 }).perk; });
  ok("6 perk bounded per rank: Neutral perkXp==input (x1.00 byte-id); Exaltado==round(input*1.15)>input",
     perkN === 200 && perkTop === Math.round(200 * 1.15) && perkTop > 200, `neutral=${perkN} top=${perkTop}`);

  // 7 deterministic accrual via REAL bounty route on DEFAULT-ON
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 0 }));
  const inZ = await toZone(page);
  const before = await page.evaluate(() => window.__dev.sanctuary().rep);
  const cb1 = await completeOneBounty(page);
  const after1 = await page.evaluate(() => window.__dev.sanctuary().rep);
  const cb2 = await completeOneBounty(page);
  const after2 = await page.evaluate(() => window.__dev.sanctuary());
  ok("7 deterministic accrual via REAL bounty route (default-ON): each claim ⇒ rep += 25 (25→50), hasField true",
     inZ && cb1.ok && cb2.ok && after1 === before + 25 && after2.rep === before + 50 && after2.hasField === true,
     `rep ${before}->${after1}->${after2.rep} claimed=${cb1.ok && cb2.ok} hasField=${after2.hasField}`);

  // 8 rank crosses on real accumulation
  const cross = await page.evaluate(() => window.__dev.sanctuary({ setRep: 140 }).rankIdx);
  await completeOneBounty(page);
  const crossed = await page.evaluate(() => window.__dev.sanctuary());
  ok("8 rank crosses on real accumulation: 140 (Neutral) + 1 bounty ⇒ 165 Reconocido",
     cross === 0 && crossed.rankIdx === 1 && crossed.rep === 165, `idx ${cross}->${crossed.rankIdx} rep=${crossed.rep}`);

  // 9 PERSISTENCE across a REAL page reload
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 275 }));
  const blob = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob() || {})); // serializeSave returns an OBJECT, not a string
  await page.evaluate(() => window.__dev.saveNow());
  const repPre = await page.evaluate(() => window.__dev.sanctuary().rep);
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(page);
  const post = await page.evaluate(() => window.__dev.sanctuary());
  ok("9 persistence: sanctuaryRep in save blob + survives REAL reload (275 restored, hasField true)",
     /sanctuaryRep/.test(blob) && repPre === 275 && post.rep === 275 && post.hasField === true,
     `blobHasKey=${/sanctuaryRep/.test(blob)} pre=${repPre} post=${post.rep} hasField=${post.hasField}`);

  // 10 RENDER OBSERVABLE inZone (default-ON draws the indicator)
  await toZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  await snapBand(page, "__off1");
  await snapBand(page, "__off2");
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await snapBand(page, "__on");
  await page.screenshot({ path: join(OUT, "sanctuary-on-inzone.png") }).catch(() => {});
  const sigOn = await cleanSignal(page, "__off1", "__off2", "__on");
  const sigCtl = await cleanSignal(page, "__off1", "__off2", "__off2");
  ok("10 RENDER OBSERVABLE inZone: sanctuary indicator draws (clean signal >> OFF control)",
     sigOn > 60 && sigOn > sigCtl * 5 && sigCtl < 20, `cleanSignal ON=${sigOn} vs OFF-control=${sigCtl}`);

  // 11 inZone-ONLY
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
  ok("11 inZone-ONLY: outside Santuario the indicator does NOT draw (signal stays at wilderness floor)",
     outZone === false && sigWild < 300 && sigWild < sigOn / 3, `outZone=${outZone} wild=${sigWild} (inZone was ${sigOn})`);

  // 12 FULL-STACK REGRESSION with SANCTUARY ON: movement, combat, bounty reachable via real "End", recall via "Home", safezone regen, rested
  // 12a WASD movement from an OPEN spawn (avoid prop-collision false-negative: capture open spawn, tp back)
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));
  const spawn = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  await page.evaluate((s) => window.__dev.tp(s.x / 32, s.y / 32), spawn);
  await escToPlay(page);
  const moved = await page.evaluate(async () => {
    const h0 = window.__dev.hero(); const x0 = h0.x, y0 = h0.y; let md = 0;
    for (const code of ["KeyD", "KeyS", "KeyA", "KeyW"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(3), bubbles: true }));
      await new Promise(r => setTimeout(r, 260));
      window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code.slice(3), bubbles: true }));
      const h = window.__dev.hero(); md = Math.max(md, Math.hypot(h.x - x0, h.y - y0));
    }
    return md;
  });
  // 12b combat: real kill lands via spawnKill (REAL killEnemy path bumps h.kills)
  const killed = await page.evaluate(() => { const before = window.__dev.bounty().kills | 0;
    window.__dev.spawnKill("rat"); return (window.__dev.bounty().kills | 0) - before; });
  // 12c Bounty Board reachable via REAL "End" key inZone
  await toZone(page);
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 }));
  await sleep(80);
  const preB = await page.evaluate(() => window.__dev.bounty().active);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "End", key: "End", bubbles: true })));
  await sleep(160);
  const postB = await page.evaluate(() => window.__dev.bounty().active);
  const bountyReachable = !preB && !!postB;
  await escToPlay(page);
  // 12d Recall via REAL "Home" key: bind auto-set while inZone (12c toZone), then tp to wilderness and recall back
  await page.evaluate(() => window.__dev.tp(40, 40));
  await escToPlay(page);
  const rPre = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y, inZone: window.__dev.safeZone().inZone }; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Home", key: "Home", bubbles: true })));
  await sleep(300);
  const rPost = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y, inZone: window.__dev.safeZone().inZone }; });
  const recallWorked = rPre.inZone === false && (rPost.inZone === true || Math.hypot(rPost.x - rPre.x, rPost.y - rPre.y) > 200);
  // 12e safezone regen + rested accrual healthy
  await toZone(page);
  const arc = await page.evaluate(() => { const sz = window.__dev.safeZone(); const rested = window.__dev.rested ? window.__dev.rested() : null; return { inZone: sz.inZone, safeEnabled: sz.enabled, restedEnabled: rested ? rested.enabled : null, recallEnabled: window.__dev.recall ? window.__dev.recall().enabled : null }; });
  ok("12 full-stack regression ON: WASD move + real kill + Bounty(End) reachable + Recall(Home) + SAFEZONE/Rested/Recall live",
     moved > 4 && killed >= 1 && bountyReachable && recallWorked && arc.inZone && arc.safeEnabled && arc.restedEnabled && arc.recallEnabled,
     `move=${moved.toFixed(1)} kill=${killed} bountyEnd=${bountyReachable} recall=${recallWorked} safe=${arc.safeEnabled} rested=${arc.restedEnabled} recallFlag=${arc.recallEnabled}`);

  // 13 desktop fps
  await toZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await sleep(600);
  const fps = await fpsMedian3(page);
  ok("13 desktop fps ≥58 with SANCTUARY ON (calm inZone, median-of-3)", fps >= 58, `fps≈${fps}`);
  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});

  // 14 MOBILE
  const mpage = await browser.newPage();
  await mpage.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
  const merr = [];
  mpage.on("pageerror", (e) => merr.push(String(e)));
  mpage.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) merr.push(m.text()); });
  await mpage.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await mpage.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(mpage);
  await mpage.evaluate(() => window.__dev.sanctuary({ setRep: 0 }));
  await mpage.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); });
  const mBefore = await mpage.evaluate(() => window.__dev.sanctuary().rep);
  await completeOneBounty(mpage);
  const mAfter = await mpage.evaluate(() => window.__dev.sanctuary().rep);
  const mEnabled = await mpage.evaluate(() => window.__dev.sanctuary().enabled);
  const mfps = await fpsMedian3(mpage);
  await mpage.screenshot({ path: join(OUT, "mobile-final.png") }).catch(() => {});
  ok("14 mobile: default-ON boots to play, real bounty accrual (+25), fps ≥58, 0 err",
     mEnabled === true && mAfter === mBefore + 25 && mfps >= 58 && merr.length === 0, `enabled=${mEnabled} rep ${mBefore}->${mAfter} fps≈${mfps} err=${merr.length}`);

  ok("0 no JS errors / no non-favicon 404 during desktop run", errors.length === 0 && net404.length === 0, (errors.slice(0, 2).concat(net404.slice(0, 2))).join(" | "));

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
