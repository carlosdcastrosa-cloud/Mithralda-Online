// ---------------------------------------------------------------------------
// CAS-120 QA — LIVE probe for the ACTIVE SKILL BAR on the DEPLOYED build (inside
// the Higgsfield iframe). Drives the SAME __dev hooks the game runs to prove the
// skill-bar layer shipped live (not a stale cache) and works end-to-end against
// every acceptance gate:
//   1) BAR per class (AC1): each of the 5 classes exposes ≥2 active skills with an
//      MP cost + a cooldown, ≥1 carrying a CAS-118 status.
//   2) STATUS per class (AC2): casting the status skill lands that effect (DoT/slow/
//      stun) on a struck enemy through the unified applyStatus engine + feedback.
//   3) BUILD modifies a skill (AC3): a +daño talent raises a skill's damage; a cdr
//      talent shortens its cooldown — observable.
//   4) COOLDOWN gates spam (AC4): a freshly-cast skill is on cooldown after casting.
//   5) SURVIVES RELOAD (AC6): the bar + cooldown semantics re-arm after a real reload.
//   6) 60fps over a live pack + 0 JS errors live — AC5.
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas120-skills-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas120-skills-live.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterAs(fr, digit = "Digit1", name = "SkillQA") {
  await fr.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await fr.waitForFunction("window.__dev.scene()==='menu' || window.__dev.scene()==='play'", { timeout: 20000 });
  if (await fr.evaluate(() => window.__dev.scene()) === "play") return;
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), digit);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
const STATUS_SKILL = {
  warrior: { slot: 1, status: "stun",  kind: "stun" },
  paladin: { slot: 1, status: "burn",  kind: "dot"  },
  mage:    { slot: 1, status: "burn",  kind: "dot"  },
  druid:   { slot: 1, status: "stun",  kind: "stun" },
  priest:  { slot: 3, status: "stun",  kind: "stun" },
};

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  let fr = await gameFrame(page);
  await enterAs(fr, "Digit1");
  check("entered play live as warrior", true);

  const hooksOk = await fr.evaluate(() => !!(window.__dev.skillBar && window.__dev.skillProbe));
  check("CAS-120 skill-bar dev hooks present on live build", hooksOk);

  // (1) BAR per class
  const bars = await fr.evaluate((cs) => Object.fromEntries(cs.map((c) => [c, window.__dev.skillBar(c)])), CLASSES);
  let barOk = true;
  for (const c of CLASSES) { const b = bars[c];
    const costed = b ? b.filter((s) => s.cost > 0 && s.cd > 0).length : 0;
    const hasStatus = b ? b.some((s) => s.status) : false;
    if (!(b && b.length >= 2 && costed >= 2 && hasStatus)) barOk = false;
  }
  check("AC1: 5 classes each expose ≥2 active skills (cost+cd) incl. ≥1 status skill", barOk,
    Object.fromEntries(CLASSES.map((c) => [c, (bars[c] || []).map((s) => `${s.id}${s.status ? ":" + s.status : ""}`)])));

  // (2) STATUS per class — cast lands the effect on a struck enemy.
  const statusResults = {};
  for (const c of CLASSES) {
    const spec = STATUS_SKILL[c];
    const r = await fr.evaluate((cc, s) => window.__dev.skillProbe(cc, s), c, spec.slot);
    let landed = false;
    if (spec.kind === "dot") landed = !!(r && r.dots[spec.status] && r.dots[spec.status].t > 0);
    else if (spec.kind === "slow") landed = !!(r && r.enemySlowT > 0);
    else if (spec.kind === "stun") landed = !!(r && r.enemyStun > 0);
    statusResults[c] = { id: r && r.id, status: spec.status, landed, dmg: r && r.dmg };
    if (!landed) check(`AC2 ${c}: ${r && r.id} did NOT apply ${spec.status}`, false, r);
  }
  check("AC2: every class skill landed its CAS-118 status on a struck enemy", Object.values(statusResults).every((x) => x.landed), statusResults);

  // (3a) +daño talent raises a skill's damage (mage fireball, mA1 ×3).
  const dmgScale = await fr.evaluate(() => {
    const d = window.__dev; d.setClass("mage"); d.respecTalents();
    const before = d.skillProbe("mage", 1).dmg;
    d.setClass("mage"); d.grantTalentPts(3);
    d.allocTalent("mA1"); d.allocTalent("mA1"); d.allocTalent("mA1");
    const after = d.skillProbe("mage", 1).dmg;
    return { before, after };
  });
  check("AC3 dmg: a +daño talent raises a skill's damage", dmgScale.after > dmgScale.before, dmgScale);

  // (3b) cdr talent shortens a skill's cooldown (paladin consecration, pC1 ×2).
  const cdScale = await fr.evaluate(() => {
    const d = window.__dev; d.setClass("paladin"); d.respecTalents();
    const before = d.skillProbe("paladin", 1).cdmax;
    d.setClass("paladin"); d.grantTalentPts(2);
    d.allocTalent("pC1"); d.allocTalent("pC1");
    const after = d.skillProbe("paladin", 1).cdmax;
    return { before, after };
  });
  check("AC3 cdr: a cdr talent shortens a skill's cooldown", cdScale.after < cdScale.before - 0.01, cdScale);

  // (4) COOLDOWN gates spam.
  const cd = await fr.evaluate(() => { const d = window.__dev; d.setClass("warrior"); d.respecTalents(); return d.skillProbe("warrior", 1); });
  check("AC4: a freshly-cast skill is on cooldown (spam blocked)", cd.cd > 0, { cd: cd.cd, cdmax: cd.cdmax });

  // (5) SURVIVES RELOAD — re-enter and confirm the bar + status semantics re-arm.
  await fr.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  fr = await gameFrame(page);
  await enterAs(fr, "Digit3"); // mage
  const afterReload = await fr.evaluate(() => { const b = window.__dev.skillBar("mage"); const r = window.__dev.skillProbe("mage", 1); return { bar: b.length, fireballBurn: !!(r.dots.burn), cd: r.cd }; });
  check("AC6 reload: skill bar + status + cooldown re-arm after a real reload", afterReload.bar >= 2 && afterReload.fireballBurn && afterReload.cd > 0, afterReload);

  // (6) FPS over a live pack + screenshot the HUD skill bar.
  await fr.evaluate(() => {
    window.__dev.tpZone("abyss");
    ["orc", "wraith", "mage", "wolf", "bandit", "bat"].forEach((t, i) => window.__dev.spawn(t, 70 * Math.cos(i), 70 * Math.sin(i)));
  });
  await sleep(200);
  const fps = await fr.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(tick); }));
  check("AC5 fps: held ≥58 over a live pack with the skill bar up", fps >= 58, { fps });

  await sleep(120);
  await page.screenshot({ path: SHOT });
  check("HUD skill-bar screenshot saved", true, SHOT);

  check("AC5 zero JS errors live", report.errors.length === 0, report.errors);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check("harness threw", false, String(e && e.stack || e));
} finally {
  await browser.close();
}
console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END===");
console.log(report.pass ? "\n✓ CAS-120 LIVE skill-bar probe PASSED." : "\n✗ CAS-120 LIVE skill-bar probe FAILED.");
process.exit(report.pass ? 0 : 1);
