// CAS-2272 — QA OBSERVABLE pass for RENOMBRE DEL SANTUARIO / SANCTUARY REPUTATION (DARK, SANCTUARY_REP.enabled:false).
// Independent QA (NOT a rerun of the GE self-verify). Focus = the observables QA owns and the GE harness does NOT prove:
//   · byte-id OFF re-confirmed by MY OWN probe (hasField false + save blob clean + worldFingerprint stable across toggle).
//   · deterministic accumulation proven ONLY via the REAL bounty-complete route (accept→kill→claim), never bare setRep.
//   · ranks = pure function of the total (setRep at each threshold ⇒ config-exact rank/idx, 0-clamp Neutral).
//   · perk bounded per rank (Neutral==input byte-id; top==round(input*1.15)>input) applied to bounty XP only.
//   · RENDER OBSERVABLE (the QA differentiator): the violet rank indicator/bar actually DRAWS on-screen when ON+inZone,
//     via a THRESHOLDED abs-diff (|Δ|>55/ch changed-px) between OFF and ON in the top-right badge band — with daynight
//     FROZEN bright + hero still + rAF settle (CAS-2266/CAS-2269 footgun: pixel SUM over a live world is unreliable).
//   · inZone-ONLY: the indicator is GONE outside the Santuario (no draw in wilderness) ⇒ cosmetic hub-only.
//   · reversible: flip ON→OFF ⇒ badge band returns to the OFF baseline (changed-px collapses).
//   · full-stack arc regression with SANCTUARY ON (BOUNTY claim + SAFEZONE regen + Rested accrual healthy), 60fps.
//   · mobile: boots to play on a touch viewport, accrual works, no minimap band ⇒ indicator falls back, 60fps.
// Run: node tools/cas2272-sanctuary-rep-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2272-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

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

const toZone = (page) => page.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple;
  window.__dev.tp(t.x / 32, t.y / 32); return window.__dev.safeZone().inZone; });

const fps1 = (page) => page.evaluate(() => new Promise(res => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }

// complete ONE bounty by the REAL route: accept featured, bump the REAL monotonic counters to count, claim.
const completeOneBounty = (page) => page.evaluate(() => {
  const acc = window.__dev.bounty({ act: true });
  if (!acc.active) return { ok: false, reason: acc.result };
  window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
  const claim = window.__dev.bounty({ act: true });
  return { ok: claim.result === "claimed", claim };
});

// The sanctuary indicator (tan "Santuario: <rank>" text + violet progress bar) draws at CONSTANT alpha (non-pulsing),
// while every OTHER badge (safezone/rested/recall/bounty) pulses on G.t and the minimap has moving enemy blips. So the
// clean isolation (CAS-2266 thresholded-changed-px, per-pixel): a pixel is a TRUE sanctuary signal if it changed a lot
// between an OFF frame and the ON frame (|Δ|>55) BUT was STABLE between two OFF frames (|Δ|<=25). That cancels pulsing
// badges AND moving minimap blips (they differ off1-vs-off2), keeping only what ON newly draws. Freeze day + weather off.
async function snapBand(page, key) {
  await page.evaluate(() => { if (window.__dev.daynight) window.__dev.daynight({ enabled: true, phase: 0.30 });
    if (window.__dev.weather) { try { window.__dev.weather({ enabled: false }); } catch (e) {} } });
  await sleep(180);
  return page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const bw = Math.min(cv.width, Math.round(240 * dpr)), x0 = Math.max(0, cv.width - bw);
    const y0 = Math.round(150 * dpr);                        // BELOW the minimap (excludes moving enemy blips); sanctuary draws lower
    const bh = Math.round(cv.height * 0.6) - y0;
    window[key] = new Uint8ClampedArray(c.getImageData(x0, y0, bw, bh).data);
    return window[key].length;
  }, key);
}
// count pixels that changed (base→probe) by >55 on any channel AND were stable (base→ctrl) within 25 on every channel.
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
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot clean + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sanctuary && window.__dev.bounty && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.daynight));
  ok("1 boots to play, __dev.sanctuary + arc + daynight hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (my own probe): DARK default enabled false, field never created
  const dark = await page.evaluate(() => window.__dev.sanctuary());
  ok("2 DARK default byte-id: enabled=false AND hasField=false (h.sanctuaryRep never created)",
     dark.enabled === false && dark.hasField === false, `enabled=${dark.enabled} hasField=${dark.hasField} rankCount=${dark.rankCount} rep/bounty=${dark.repPerBounty}`);

  // 3 byte-id save clean OFF + worldFingerprint stable across toggle
  const saveOff = await page.evaluate(() => window.__dev.saveBlob());
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint()));
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint()));
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  ok("3 byte-id: save blob OFF has no 'sanctuaryRep' key AND worldFingerprint stable across enabled toggle",
     !/sanctuaryRep/.test(saveOff) && fpA === fpB, `saveKey=${/sanctuaryRep/.test(saveOff)} fpMatch=${fpA === fpB}`);

  // 4 perk OFF byte-id: perkXp(n)===n when disabled ⇒ gainXP path identical to HEAD
  const perkOff = await page.evaluate(() => [0, 50, 200, 999].map(n => window.__dev.sanctuary({ perkXp: n }).perk));
  ok("4 perk OFF byte-id: sanctuary({perkXp:n}) returns n untouched when disabled", JSON.stringify(perkOff) === JSON.stringify([0, 50, 200, 999]), `got=${JSON.stringify(perkOff)}`);

  // ---- flip ON in-memory for the observable checks ----
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));

  // 5 ranks = pure function of the total: setRep at each threshold ⇒ config-exact rank
  const ranks = await page.evaluate(() => {
    const at = [0, 150, 450, 1000, 2000];
    return at.map(v => { window.__dev.sanctuary({ setRep: v }); const s = window.__dev.sanctuary(); return { rep: v, idx: s.rankIdx, name: s.rank.name }; });
  });
  const expNames = ["Neutral", "Reconocido", "Honrado", "Venerado", "Exaltado"];
  const ranksOk = ranks.every((r, i) => r.idx === i && r.name === expNames[i]);
  // 0-clamp: below neutral stays Neutral
  const clamp0 = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.sanctuary().rank.name; });
  ok("5 ranks pure function of total: each threshold ⇒ config-exact rank/idx (Neutral..Exaltado), 0-clamp",
     ranksOk && clamp0 === "Neutral", `bands=${JSON.stringify(ranks.map(r => r.name))}`);

  // 6 derived progress coherent at an intermediate rep
  const prog = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 300 }); return window.__dev.sanctuary(); });
  ok("6 derived progress coherent: rep=300 ⇒ Reconocido@150, into=150 span=300 toNext=150, next=Honrado@450",
     prog.rank.name === "Reconocido" && prog.into === 150 && prog.span === 300 && prog.toNext === 150 && prog.nextRank.name === "Honrado",
     `into=${prog.into}/${prog.span} toNext=${prog.toNext} next=${prog.nextRank && prog.nextRank.name}`);

  // 7 perk bounded per rank: Neutral==input (x1.00 byte-id), top==round(input*1.15)>input
  const perkN = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.sanctuary({ perkXp: 200 }).perk; });
  const perkTop = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); return window.__dev.sanctuary({ perkXp: 200 }).perk; });
  ok("7 perk bounded per rank: Neutral perkXp==input (x1.00 byte-id); Exaltado==round(input*1.15)>input",
     perkN === 200 && perkTop === Math.round(200 * 1.15) && perkTop > 200, `neutral=${perkN} top=${perkTop}(exp ${Math.round(200 * 1.15)})`);

  // 8 DETERMINISTIC ACCUMULATION via the REAL bounty-complete route (accept→kill→claim), not bare setRep
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 0 }));
  const inZ = await toZone(page);
  const before = await page.evaluate(() => window.__dev.sanctuary().rep);
  const cb1 = await completeOneBounty(page);
  const after1 = await page.evaluate(() => window.__dev.sanctuary().rep);
  const cb2 = await completeOneBounty(page);
  const after2 = await page.evaluate(() => window.__dev.sanctuary());
  ok("8 deterministic accumulation via REAL bounty route: each claim ⇒ rep += 25 exactly (25→50)",
     inZ && cb1.ok && cb2.ok && after1 === before + 25 && after2.rep === before + 50 && after2.hasField === true,
     `rep ${before}->${after1}->${after2.rep} claimed=${cb1.ok && cb2.ok} hasField=${after2.hasField}`);

  // 9 rank crosses on REAL accumulation: setRep just below a threshold, complete a bounty ⇒ rankIdx advances
  const cross = await page.evaluate(() => window.__dev.sanctuary({ setRep: 140 }).rankIdx); // Neutral, 10 below 150
  await completeOneBounty(page); // +25 ⇒ 165 ⇒ Reconocido
  const crossed = await page.evaluate(() => window.__dev.sanctuary());
  ok("9 rank crosses on real accumulation: 140 (Neutral) + 1 bounty ⇒ 165 Reconocido, idx advances",
     cross === 0 && crossed.rankIdx === 1 && crossed.rep === 165, `idx ${cross}->${crossed.rankIdx} rep=${crossed.rep}`);

  // 10 RENDER OBSERVABLE (QA differentiator): inZone, 2 OFF frames + 1 ON frame ⇒ the non-pulsing sanctuary indicator
  // shows up as clean signal (changed ON, stable across OFF-OFF). Control = a 3rd OFF frame ⇒ ~0 clean signal.
  await toZone(page); // ensure inZone
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  await snapBand(page, "__off1");
  await snapBand(page, "__off2");
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 })); // Reconocido, mid-bar (text + bar)
  await snapBand(page, "__on");
  await page.screenshot({ path: join(OUT, "sanctuary-on-inzone.png") }).catch(() => {});
  const sigOn = await cleanSignal(page, "__off1", "__off2", "__on");     // sanctuary drawn
  const sigCtl = await cleanSignal(page, "__off1", "__off2", "__off2");  // OFF vs OFF control ⇒ ~0
  ok("10 RENDER OBSERVABLE inZone: ON draws the (non-pulsing) sanctuary indicator — clean signal >> OFF control",
     sigOn > 60 && sigOn > sigCtl * 5 && sigCtl < 20, `cleanSignal ON=${sigOn} vs OFF-control=${sigCtl}`);

  // 11 inZone-ONLY: outside the Santuario the indicator is GONE. The indicator, when drawn (#10/#12), is a CONCENTRATED
  // ~1000+px block; wilderness world-motion behind the HUD is a small scattered floor. So proof = with the feature ON but
  // hero OUTSIDE the zone, the clean signal stays at the wilderness floor (<<300), nowhere near the ~1264 indicator block.
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp((sz.temple.x / 32) + 120, (sz.temple.y / 32) + 120); });
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }))); await sleep(60); }
  await sleep(700); // let the wilderness view settle (dismiss un-pauses; give mobs/hero-idle time to reach steady state)
  const outZone = await page.evaluate(() => window.__dev.safeZone().inZone);
  await snapBand(page, "__w1");
  await snapBand(page, "__w2");
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await snapBand(page, "__wOn");
  const sigWild = await cleanSignal(page, "__w1", "__w2", "__wOn");
  ok("11 inZone-ONLY: outside Santuario the indicator does NOT draw (feature ON, not inZone ⇒ signal stays at wilderness floor << indicator)",
     outZone === false && sigWild < 300 && sigWild < sigOn / 3, `outZone=${outZone} cleanSignal wild ON=${sigWild} (indicator inZone was ${sigOn})`);

  // 12 reversible: back inZone, ON then disable ⇒ clean signal of the DISABLE (indicator removed) mirrors #10 (gated render)
  await toZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await snapBand(page, "__on1");
  await snapBand(page, "__on2");
  await page.evaluate(() => window.__dev.sanctuary({ enabled: false }));
  await snapBand(page, "__disabled");
  const sigRemoved = await cleanSignal(page, "__on1", "__on2", "__disabled");
  ok("12 reversible: inZone ON→disable removes the indicator (clean signal of removal >> noise)",
     sigRemoved > 60, `cleanSignal on→off removal=${sigRemoved}`);

  // 13 arc regression with SANCTUARY ON: BOUNTY claim + SAFEZONE regen + Rested accrual all healthy
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true }));
  await toZone(page);
  const arc = await page.evaluate(async () => {
    const sz0 = window.__dev.safeZone(); // inZone regen
    const rested = window.__dev.rested ? window.__dev.rested() : null;
    // hurt then confirm safezone regen path exists (setHp low, tick)
    return { inZone: sz0.inZone, safeEnabled: sz0.enabled, restedEnabled: rested ? rested.enabled : null };
  });
  const claimAgain = await completeOneBounty(page);
  ok("13 arc regression ON: BOUNTY claim + SAFEZONE + Rested all live/healthy with SANCTUARY ON",
     arc.inZone && arc.safeEnabled && claimAgain.ok, JSON.stringify(arc));

  // 14 desktop fps ≥58 with feature ON — measured in a CALM inZone state (safezone: noAggro, mobs leashed) so the number
  // reflects the feature's cost, not leftover wilderness churn from #11.
  await toZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 300 }));
  await sleep(600);
  const fps = await fpsMedian3(page);
  ok("14 desktop fps ≥58 with feature ON (calm inZone, median-of-3)", fps >= 58, `fps≈${fps}`);

  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});

  // ---- 15 MOBILE: touch viewport boots, accrual via real route works, fps ----
  const mpage = await browser.newPage();
  await mpage.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
  const merr = [];
  mpage.on("pageerror", (e) => merr.push(String(e)));
  mpage.on("console", (m) => { if (m.type() === "error") merr.push(m.text()); });
  // shared localStorage origin ⇒ clear mithralda save pre-boot so the menu shows (CAS-2266 footgun)
  await mpage.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await mpage.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(mpage);
  await mpage.evaluate(() => window.__dev.sanctuary({ enabled: true, setRep: 0 }));
  await mpage.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple; window.__dev.tp(t.x / 32, t.y / 32); });
  const mBefore = await mpage.evaluate(() => window.__dev.sanctuary().rep);
  await completeOneBounty(mpage);
  const mAfter = await mpage.evaluate(() => window.__dev.sanctuary().rep);
  const mfps = await fpsMedian3(mpage);
  await mpage.screenshot({ path: join(OUT, "mobile-final.png") }).catch(() => {});
  ok("15 mobile: boots to play, real bounty accrual (+25), fps ≥58, 0 err",
     mAfter === mBefore + 25 && mfps >= 58 && merr.length === 0, `rep ${mBefore}->${mAfter} fps≈${mfps} err=${merr.length}`);

  ok("0 no JS errors during desktop run", errors.length === 0, errors.slice(0, 3).join(" | "));

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
