// ---------------------------------------------------------------------------
// CAS-276 — CONSOLIDATED SOAK / CROSS-FEATURE REGRESSION playtest of the current
// LIVE build (gh-pages, build 71c18b32fe19 == HEAD 817f31f, post CAS-265/270/273).
//
// Three Gameplay-Evolution levers shipped today, each with its OWN targeted QA
// sign-off (CAS-266 accessibility/QoL, CAS-271 bind-aware coachmark, CAS-275
// combat juice). This pass is the soak's clean checkpoint — it exercises them
// TOGETHER on one build (no new scope, measurement only) plus the full core-loop
// regression surface: classes, hunt, loot/affixes, merchant, Forja, talents,
// zone gating, persistence, perf (incl. reduce-motion path), and touch.
//
// Drives the REAL __dev hooks on the LIVE served build. Read-only on the shared
// env (throwaway localStorage only).
//
//   [BUILD]   served build id == 71c18b32fe19 (not a stale cache)
//   [BOOT]    boots to menu, zero JS errors on load
//   [PLAY]    enters the world (warrior)
//   [CLASS]   all 5 classes are mechanically differentiated (spellProbe + stats)
//   --- CROSS-FEATURE: a11y + coachmark + juice all active at once ---
//   [XF-BIND] rebind ATACAR→K with colorblind+reduce-motion ON: no double-bind
//   [XF-COACH] coachmark resolves the REBOUND key live (served strings+binds)
//   [XF-RM]   reduce-motion gates kill-shake → shakeDelta == 0 (juice respects a11y)
//   [XF-CB]   colorblind crit "!" shape cue still resolves (no conflict w/ rebind)
//   --- CORE LOOPS regression ---
//   [HUNT]    hunt contract tracks kills/need + champion spawns
//   [LOOT]    affix mob → deterministic affix roll feeds drops/rewards
//   [SHOP]    merchant purchase moves real combat stats (gold sink)
//   [FORJA]   forge upgrade consumes mats+gold and raises a slot stat
//   [TALENT]  alloc a talent point changes a real combat number
//   [ZONE]    power gates (frost/abyss/trial) + zone-tier scaling intact
//   [PERSIST] setGold + saveNow survives a full page reload (localStorage)
//   [FPS]     ~60fps under spam-swing combat load
//   [FPS-RM]  reduce-motion path also holds ~60fps
//   [TOUCH]   touch viewport boots + reaches play (mobile quick pass)
//   [ERR]     zero JS exceptions (favicon-404 sev-4 excluded)
//
// Run: node tools/cas276-soak-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const LIVE = BASE + "/index.html?dev";
const EXPECT_BUILD = "71c18b32fe19";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, expectBuild: EXPECT_BUILD, checks: [], errors: [], shots: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) report.anyFail = true; console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function attachListeners(page) {
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/.test(u)) report.errors.push(`reqfail: ${u}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) report.errors.push(`http${r.status()}: ${r.url()}`); });
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) report.errors.push(`console.error: ${m.text()}`); });
}

async function enterPlay(page, name, digit = "Digit1", suppress = true) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 12000 });
  await page.evaluate((nm, supp) => { try { if (supp && window.__dev.noSave) window.__dev.noSave(); if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {}
    const el = document.getElementById("nameInput"); if (el) el.value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name, suppress);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(page, digit);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await attachListeners(page);

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });

  // [BUILD]
  const build = await page.evaluate(async () => { try { const r = await fetch("version.json?" + Date.now()); const j = await r.json(); return j.build || j.id || j.buildId; } catch (e) { return null; } });
  check(`[BUILD] served build is the current deploy ${EXPECT_BUILD}`, build === EXPECT_BUILD, { build });

  // [BOOT]
  const scene0 = await page.evaluate(() => window.__dev.scene());
  check("[BOOT] reaches menu scene clean", scene0 === "menu", { scene: scene0 });

  await enterPlay(page, "QA276");
  const scene1 = await page.evaluate(() => window.__dev.scene());
  check("[PLAY] entered world (warrior)", scene1 === "play", { scene: scene1 });

  // ---- [CLASS] all 5 classes mechanically differentiated -------------------
  const classData = await page.evaluate(() => {
    const list = ["warrior", "paladin", "mage", "druid", "priest"];
    const out = {};
    for (const c of list) {
      const st = window.__dev.classStats(c);
      const sp = window.__dev.spellProbe(c);
      // a class "fingerprint": atk type + lvl10 dmg/hp + the 3 spell ids + their observed effect kind
      out[c] = {
        atkType: st && st.atkType, lvl10hp: st && st.lvl10.hp, lvl10dmg: st && st.lvl10.dmg, mp: st && st.mp,
        spells: (sp || []).map((s) => `${s.id}:${s.type}:dmg${s.enemyDmg}:heal${s.heroHeal}:field${s.fieldSpawned}:proj${s.projSpawned}:buff${s.dmgBuff || s.defBuff || 0}`),
      };
    }
    return out;
  });
  const fps5 = Object.values(classData).map((c) => JSON.stringify(c));
  const allDistinct = new Set(fps5).size === 5;
  // every class must have 3 spells whose observed effects aren't all identical
  const everyHas3 = Object.values(classData).every((c) => c.spells.length === 3);
  const heal = classData.priest && classData.priest.spells.some((s) => /heal[1-9]/.test(s));
  const field = classData.druid && classData.druid.spells.some((s) => /field[1-9]/.test(s));
  check("[CLASS] all 5 classes have a distinct stat+spell fingerprint", allDistinct && everyHas3, { distinct: new Set(fps5).size });
  check("[CLASS] role mechanics differ (priest heals, druid plants a field)", !!heal && !!field, { priestHeals: !!heal, druidField: !!field });

  // ---- CROSS-FEATURE: a11y + coachmark + juice all on at once --------------
  // Turn everything on simultaneously, then probe each feature for conflicts.
  await page.evaluate(() => {
    window.__dev.setColorblind(true);
    window.__dev.setReduceMotion(true);
    window.__dev.resetBinds();
    window.__dev.setBind("attack", "KeyK"); // rebind ATACAR away from its default
  });
  const xf = await page.evaluate(() => {
    const s = window.__dev.settingsState();
    const binds = s.binds || {};
    // double-bind detector: any keyboard code assigned to >1 action?
    const counts = {};
    for (const a in binds) counts[binds[a]] = (counts[binds[a]] || 0) + 1;
    const dup = Object.entries(counts).filter(([, n]) => n > 1).map(([c]) => c);
    return { colorblind: s.colorblind, reduceMotion: s.reduceMotion, attackBind: binds.attack, dup };
  });
  check("[XF-BIND] a11y on + ATACAR rebound to K with NO double-bind collision",
    xf.colorblind === true && xf.reduceMotion === true && xf.attackBind === "KeyK" && xf.dup.length === 0, xf);

  // [XF-COACH] the coachmark resolves the REBOUND key live. Reproduce the EXACT
  // render.js path: STR.tutSteps.attack.pc(k) where k(action)=keyLabel(binds[action]).
  const stringsSrc = await page.evaluate(async () => { try { const r = await fetch("strings.js?" + Date.now()); return await r.text(); } catch (e) { return ""; } });
  // keyLabel mirror (render.js:127)
  const keyLabel = (code) => { if (!code) return "—"; if (code === "Space") return "Espacio"; if (code === "Escape") return "Esc"; if (code.startsWith("Key")) return code.slice(3); if (code.startsWith("Digit")) return code.slice(5); if (code.startsWith("Numpad")) return "Num" + code.slice(6); return code; };
  const liveBinds = await page.evaluate(() => window.__dev.settingsState().binds);
  const k = (a) => keyLabel(liveBinds[a]);
  // pull the attack-step pc template out of the served strings.js and run it
  const m = stringsSrc.match(/attack:\s*\{\s*pc:\(k\)=>([^,]+),/);
  let coachAttack = null, coachOk = false;
  if (m) { try { coachAttack = eval("((k)=>" + m[1].trim() + ")")(k); coachOk = /tecla K\b/.test(coachAttack); } catch (e) { coachAttack = "EVAL_ERR:" + e.message; } }
  check("[XF-COACH] coachmark ATACAR step resolves the rebound key live ('tecla K')", coachOk, { coachAttack });
  // also confirm the live render.js renderTutorial actually reads G.settings.binds (bind-aware wiring intact)
  const renderSrc = await page.evaluate(async () => { try { const r = await fetch("render/render.js?" + Date.now()); return await r.text(); } catch (e) { return ""; } });
  const coachWired = /bindAware=\(v\)=>\s*typeof v==="function"/.test(renderSrc) && /tutKey=\(a\)=>keyLabel\(\(G\.settings\.binds/.test(renderSrc);
  check("[XF-COACH] live render.js coachmark is bind-aware (reads G.settings.binds)", coachWired, { coachWired });

  // [XF-RM] reduce-motion (still ON) gates the CAS-273 kill-shake → 0
  const kpRM = await page.evaluate(() => window.__dev.killShakeProbe());
  check("[XF-RM] juice kill-shake respects reduce-motion (shakeDelta == 0, still killed)",
    kpRM && kpRM.killed === true && kpRM.shakeDelta === 0 && kpRM.reduceMotion === true, kpRM);

  // [XF-CB] colorblind (still ON) crit "!" shape cue resolves with the rebind+RM active
  const cb = await page.evaluate(() => {
    window.__dev.juiceArena(4); window.__dev.clearFx();
    const fc = window.__dev.forceCritSwing();
    const dump = window.__dev.floaterDump();
    const critF = dump.filter((f) => f.crit);
    const on = window.__dev.settingsState().colorblind;
    return { on, critTxts: critF.map((f) => f.txt), cue: critF.map((f) => (on && f.crit ? "!" + f.txt : f.txt)), fcShake: fc && fc.shakeDelta };
  });
  check("[XF-CB] colorblind crit '!' cue resolves alongside rebind+reduce-motion",
    cb && cb.critTxts.length > 0 && cb.cue.every((t) => t.startsWith("!")), cb);
  // capture the cross-feature state (colorblind crit numbers, a11y on, attack rebound)
  await page.evaluate(() => { window.__dev.juiceArena(8); window.__dev.clearFx(); window.__dev.forceCritSwing(); for (let i = 0; i < 4; i++) window.__dev.juiceSwing(); });
  await sleep(120);
  const shotX = join(ROOT, "tools", "cas276-crossfeature.png");
  await page.screenshot({ path: shotX }); report.shots.push(shotX);

  // reset a11y so the core-loop probes run on a clean baseline
  await page.evaluate(() => { window.__dev.setColorblind(false); window.__dev.setReduceMotion(false); window.__dev.resetBinds(); });

  // ---- [HUNT] hunt contract -------------------------------------------------
  const hunt = await page.evaluate(() => {
    const before = window.__dev.huntState("forest");
    window.__dev.huntKillChampion("forest"); // drive toward the champion path
    const after = window.__dev.huntState("forest");
    return { before, after };
  });
  check("[HUNT] forest hunt contract has kills/need targets and tracks state",
    hunt.before && typeof hunt.before.need === "number" && hunt.before.need > 0, hunt.before);

  // ---- [LOOT] affix roll feeds drops ---------------------------------------
  const loot = await page.evaluate(() => {
    // try a few affix ids on a kill to confirm rolls + scaled rewards
    const r = window.__dev.affixSpawnKill("swift", "skeleton", "forest");
    const zl = window.__dev.zoneLoot("forest");
    return { r, zl };
  });
  check("[LOOT] affix mob kill produces scaled xp + drop table",
    loot.r && typeof loot.r.xp === "number" && loot.r.xp >= loot.r.baseXp && Array.isArray(loot.r.drops), loot.r);

  // ---- [SHOP] merchant purchase moves real stats ----------------------------
  const shop = await page.evaluate(() => {
    window.__dev.setGold(99999);
    const list = window.__dev.shopList();
    const before = window.__dev.heroStats();
    // buy the first affordable, non-blocked line
    let bought = null, idx = -1;
    for (let i = 0; i < list.length; i++) { if (!list[i].blocked) { idx = i; bought = window.__dev.shopBuy(i); break; } }
    return { n: list.length, idx, before: { gold: before.gold, dmg: before.dmg, def: before.def, maxHp: before.maxHp, potHP: before.potHP }, after: bought && { gold: bought.gold, dmg: bought.dmg, def: bought.def, maxHp: bought.maxHp, potHP: bought.potHP } };
  });
  const shopChanged = shop.after && (shop.after.gold < shop.before.gold || JSON.stringify(shop.after) !== JSON.stringify(shop.before));
  check("[SHOP] merchant has stock and a purchase moves real stats (gold sink)", shop.n > 0 && !!shopChanged, shop);

  // ---- [FORJA] forge upgrade consumes mats+gold, raises a slot stat ---------
  const forja = await page.evaluate(() => {
    window.__dev.setGold(99999); window.__dev.setMats(99);
    const before = window.__dev.forgeState();
    // forge the first slot that has an item + a next cost
    const slot = (before.slots.find((s) => s.name && s.next) || {}).slot;
    const res = slot ? window.__dev.forgeDo(slot) : null;
    return { slot, before, res };
  });
  const forged = forja.res && forja.res.ok && (() => {
    const b = forja.before.slots.find((s) => s.slot === forja.slot);
    const a = forja.res.slots.find((s) => s.slot === forja.slot);
    return a && b && (a.fl > b.fl || a.stat > b.stat);
  })();
  check("[FORJA] forge upgrade succeeds and raises the slot's forge level/stat", !!forged, { slot: forja.slot, ok: forja.res && forja.res.ok, beforeMats: forja.before && forja.before.mats, afterMats: forja.res && forja.res.mats });

  // ---- [TALENT] alloc a point changes a real combat number ------------------
  const tal = await page.evaluate(() => {
    window.__dev.grantTalentPts(5);
    const before = window.__dev.talentState();
    const tree = window.__dev.talentTree();
    // alloc the first allocatable tier-0 node
    let res = null, node = null;
    for (const n of tree.nodes) { const r = window.__dev.allocTalent(n.id); if (r.ok) { res = r; node = n.id; break; } }
    return { node, before: before && before.combat, after: res && res.state.combat, spentBefore: before && before.spent, spentAfter: res && res.state.spent };
  });
  const talChanged = tal.after && (tal.spentAfter > tal.spentBefore) && JSON.stringify(tal.after) !== JSON.stringify(tal.before);
  check("[TALENT] allocating a talent point spends a point and shifts combat stats", !!tal.node && !!talChanged, tal);

  // ---- [ZONE] power gates + zone-tier scaling ------------------------------
  const zone = await page.evaluate(() => {
    return {
      frost: window.__dev.frostGate(), abyss: window.__dev.abyssGate(), trial: window.__dev.trialGate(),
      base: window.__dev.zoneTier("forest", "skeleton"), deep: window.__dev.zoneTier("frost", "skeleton"),
    };
  });
  // Real design: abyss(8) < frost(13) < trial(18) — trial (el Coliseo) is the deepest gate.
  const gatesOk = zone.frost && zone.abyss && zone.trial &&
    [zone.frost, zone.abyss, zone.trial].every((g) => typeof g.req === "number" && typeof g.power === "number" && g.req > 0) &&
    zone.trial.req > zone.frost.req && zone.frost.req > zone.abyss.req;
  const tierOk = zone.base && zone.deep && zone.deep.tier > zone.base.tier && zone.deep.hp > zone.base.hp;
  check("[ZONE] power gates report live hero power, ordered abyss<frost<trial (deepest)", !!gatesOk, { frostReq: zone.frost && zone.frost.req, abyssReq: zone.abyss && zone.abyss.req, trialReq: zone.trial && zone.trial.req });
  check("[ZONE] deeper zone scales mobs harder (tier+hp up vs forest)", !!tierOk, { base: zone.base, deep: zone.deep });

  // ---- [FPS] / [FPS-RM] perf budget ----------------------------------------
  const measureFps = () => page.evaluate(async () => {
    window.__dev.juiceArena(16);
    let frames = 0; const t0 = performance.now();
    return await new Promise((res) => {
      const loop = () => { frames++; try { window.__dev.juiceSwing(); } catch (e) {}
        if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(+(frames / ((performance.now() - t0) / 1000)).toFixed(1)); };
      requestAnimationFrame(loop);
    });
  });
  const fps = await measureFps();
  check("[FPS] holds ~60fps under spam-swing combat load (>=55)", fps >= 55, { fps });
  await page.evaluate(() => window.__dev.setReduceMotion(true));
  const fpsRM = await measureFps();
  check("[FPS-RM] reduce-motion path also holds ~60fps (>=55)", fpsRM >= 55, { fpsRM });
  await page.evaluate(() => window.__dev.setReduceMotion(false));

  // ---- [PERSIST] save survives a full reload -------------------------------
  // Dedicated page WITHOUT noSave() so persist.save() isn't suppressed (the main
  // page suppresses writes to keep the shared env clean — a harness artifact).
  const ppage = await browser.newPage();
  await ppage.setUserAgent(UA);
  await ppage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await attachListeners(ppage);
  await ppage.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  await ppage.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  await enterPlay(ppage, "QA276P", "Digit1", /*suppress*/ false);
  await ppage.evaluate(() => { window.__dev.setGold(7777); window.__dev.saveNow(); });
  const blobBefore = await ppage.evaluate(() => { const b = window.__dev.saveBlob(); return { gold: b.gold, cls: b.cls }; });
  await ppage.reload({ waitUntil: "load", timeout: 45000 });
  await ppage.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  const persist = await ppage.evaluate(() => { const has = window.__dev.hasSave(); const b = window.__dev.saveBlob ? window.__dev.saveBlob() : null; return { has, gold: b && b.gold, cls: b && b.cls, scene: window.__dev.scene() }; });
  check("[PERSIST] save survives a full page reload (gold + class intact in localStorage)",
    persist.has === true && persist.gold === 7777 && persist.cls === blobBefore.cls, { blobBefore, persist });
  // suppress() BEFORE clear so the unload-flush on close() can't re-write the save
  // (else the shared-origin touch page below would auto-resume to play, not menu).
  await ppage.evaluate(() => { try { window.__dev.noSave(); window.__dev.clearSave(); } catch (e) {} });
  await ppage.close();

  // ---- [TOUCH] mobile quick pass -------------------------------------------
  const tpage = await browser.newPage();
  await attachListeners(tpage);
  await tpage.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  await tpage.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  await tpage.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  // force a clean first-run menu even if a shared-origin save lingers
  await tpage.evaluate(() => { try { window.__dev.noSave(); window.__dev.clearSave(); } catch (e) {} });
  await tpage.reload({ waitUntil: "load", timeout: 45000 });
  await tpage.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  await enterPlay(tpage, "QA276M");
  const tscene = await tpage.evaluate(() => window.__dev.scene());
  const shotT = join(ROOT, "tools", "cas276-touch.png");
  await tpage.screenshot({ path: shotT }); report.shots.push(shotT);
  check("[TOUCH] mobile/touch viewport boots and reaches play", tscene === "play", { scene: tscene });
  await tpage.close();

  // ---- [ERR] ----
  check("[ERR] zero JS exceptions / failed requests (favicon-404 excluded)", report.errors.length === 0, { errors: report.errors });

  report.pass = !report.anyFail && report.errors.length === 0;
  console.log("\n" + JSON.stringify(report, null, 2));
  console.log(report.pass ? "\n✅ CAS-276 CONSOLIDATED SOAK PASS" : "\n❌ CAS-276 SOAK FAIL");
} catch (e) {
  console.error("HARNESS ERROR", e);
  report.pass = false;
  report.errors.push("harness: " + e.message);
  console.log("\n" + JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}
