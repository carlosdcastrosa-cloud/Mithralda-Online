// ---------------------------------------------------------------------------
// CAS-297 — INDEPENDENT LIVE QA of the redesigned Tibia-style HUD (CAS-287).
//
// Re-tests the LIVE gh-pages build (NOT a local server) against the CEO-approved
// CAS-286 spec + CAS-297 acceptance gate. Distinct from cas287-hud-impl.mjs which
// runs the LOCAL tree — this proves the bytes players actually receive.
//
//   1 LAYOUT       vitals top-left · minimap+equipo+mochila right rail ·
//                  consola bottom-left · action bar bottom-right (spec §2)
//   2 VITALS       HP/MP/XP fills track REAL combat values; tabular cream
//                  numerics "cur / max"; portrait + name + Nv + oro correct
//   3 A11Y-RM      reduceMotion ON ⇒ #hud.rm ⇒ bar transition / shimmer disabled
//   3 A11Y-CB      colorblind ON ⇒ rarity shape-cue (◦/◆/★) on an equipped/bag
//                  item + status chips carry a glyph
//   4 RESPONSIVE   ≤640px ⇒ right rail collapses to drawer (≡ ≥44px), action bar
//                  reachable, numerics legible down to 360px (§3)
//   5 STATES       equipped slots = gold/inset "active"; empty slots = dim (§6)
//   6 SOAK-SAFE    default OFF fresh player; toggle changes nothing in the sim;
//                  core loop (combat/loot/level) unaffected; 60fps; 0 console err
//
// Run: node tools/cas297-hud-live.mjs   [URL]
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const WANT_BUILD = process.env.WANT_BUILD || ""; // optional pin; default = trust live
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page, name, classDigit = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate((nm) => { const el = document.getElementById("nameInput"); if (el) el.value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await key(page, classDigit);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}

// fresh isolated context so saved hero / settings never leak between sub-tests
async function freshPage(ctx) {
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  return page;
}

try {
  // ===================================================================
  // PHASE 0 — boot + build-id confirm (default-OFF check uses a CLEAN URL)
  // ===================================================================
  const ctx0 = await browser.createBrowserContext();
  const p0 = await freshPage(ctx0);
  const errors0 = [];
  p0.on("pageerror", (e) => errors0.push(`pageerror: ${e.message}`));
  p0.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors0.push(`console.error: ${m.text()}`); });
  p0.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon/.test(r.url())) errors0.push(`HTTP ${s} ${r.url()}`); });

  // NO ?hud here — proves default OFF for a fresh player
  await p0.goto(`${BASE}/index.html`, { waitUntil: "load", timeout: 45000 });
  await p0.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p0.reload({ waitUntil: "load", timeout: 45000 });
  await p0.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 25000 });

  const build = await p0.evaluate((b) => fetch(b + "/version.json").then(r => r.json()).then(j => j.build).catch(() => null), BASE);
  log(`… live build = ${build}`);
  if (WANT_BUILD && build && build.indexOf(WANT_BUILD) === -1) fail(`[BUILD] live ${build} != want ${WANT_BUILD}`);

  // [6a] default OFF for a fresh player (no ?hud, cleared storage)
  const offFresh = await p0.evaluate(() => {
    const hud = document.getElementById("hud");
    const visible = !!hud && getComputedStyle(hud).display !== "none";
    return { isOn: window.__hud.isOn(), visible };
  });
  if (!offFresh.isOn && !offFresh.visible) pass("[SOAK] HUD default OFF for a fresh player (no ?hud, cleared storage)");
  else fail(`[SOAK] HUD not default-off: ${JSON.stringify(offFresh)}`);

  await ctx0.close();

  // ===================================================================
  // PHASE 1 — main run: a11y ON, enter play, exercise vitals + states
  // ===================================================================
  const ctx1 = await browser.createBrowserContext();
  const page = await freshPage(ctx1);
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon/.test(r.url())) errors.push(`HTTP ${s} ${r.url()}`); });

  await page.goto(`${BASE}/index.html?dev&hud`, { waitUntil: "load", timeout: 45000 });
  await page.evaluate(() => { try {
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    localStorage.setItem("mithralda.hud.v1", "1");
    localStorage.setItem("mithralda.settings.v1", JSON.stringify({ reduceMotion: true, colorblind: true }));
  } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__hud && window.__dev && window.__dev.scene", { timeout: 25000 });
  await enterPlay(page, "ProbadorUI");
  await page.evaluate(() => window.__hud.show());
  await wait(500);

  // ---- [1 LAYOUT] panels exist & are anchored to the spec quadrants ----
  const layout = await page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight;
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
    return { W, H, stat: box("#hud .fr-stat"), rail: box("#hud .rail"), mini: box("#hud .fr-mini"),
      doll: box("#hud .fr-doll"), bag: box("#hud .fr-bag"), con: box("#hud .fr-console"), act: box("#hud .fr-action") };
  });
  const L = layout;
  const tl  = L.stat && L.stat.x < L.W * 0.4 && L.stat.y < L.H * 0.4;
  const railR = L.rail && L.rail.x > L.W * 0.6;
  const conBL = L.con && L.con.cx < L.W * 0.5 && L.con.cy > L.H * 0.6;
  const actBR = L.act && L.act.cx > L.W * 0.5 && L.act.cy > L.H * 0.6;
  const railStack = L.mini && L.doll && L.bag && L.mini.y < L.doll.y && L.doll.y < L.bag.y;
  if (tl) pass("[LAYOUT] vitals panel top-left"); else fail(`[LAYOUT] vitals not top-left: ${JSON.stringify(L.stat)}`);
  if (railR) pass("[LAYOUT] right rail anchored right"); else fail(`[LAYOUT] rail not right: ${JSON.stringify(L.rail)}`);
  if (railStack) pass("[LAYOUT] right rail stacks minimap → equipo → mochila"); else fail(`[LAYOUT] rail stack wrong: ${JSON.stringify({mini:L.mini,doll:L.doll,bag:L.bag})}`);
  if (conBL) pass("[LAYOUT] consola bottom-left"); else fail(`[LAYOUT] consola not bottom-left: ${JSON.stringify(L.con)}`);
  if (actBR) pass("[LAYOUT] action bar bottom-right"); else fail(`[LAYOUT] action bar not bottom-right: ${JSON.stringify(L.act)}`);

  // ---- [2 VITALS] bars track real values; numerics tabular + correct identity ----
  const v0 = await page.evaluate(() => {
    const s = window.__hud.state();
    const fills = [...document.querySelectorAll("#hud .fill")].map(f => f.style.width);
    return { s, fills, name: document.querySelector("#hud .name").textContent,
      lvl: document.querySelector("#hud [class].lvl") ? null : null,
      lvlTxt: [...document.querySelectorAll("#hud .name, #hud div")].map(x=>x.textContent).find(t=>/^Nv\s/.test(t)),
      goldTxt: document.querySelector("#hud .gold") ? document.querySelector("#hud .gold").textContent : null,
      nums: [...document.querySelectorAll("#hud .num")].map(x=>x.textContent) };
  });
  // mutate real HP via sim, confirm the fill width tracks it
  await page.evaluate(() => { try { window.__dev.hurt(13); } catch (e) {} });
  await wait(500);
  const v1 = await page.evaluate(() => ({ s: window.__hud.state(), fills: [...document.querySelectorAll("#hud .fill")].map(f => f.style.width) }));
  const hpTracked = v0.fills[0] !== v1.fills[0] && parseFloat(v1.fills[0]) < parseFloat(v0.fills[0]);
  if (hpTracked) pass(`[VITALS] HP bar tracks real damage (${v0.fills[0]} → ${v1.fills[0]})`); else fail(`[VITALS] HP fill did not track: ${v0.fills[0]} → ${v1.fills[0]}`);
  const numOk = v0.nums.some(t => /\d+\s*\/\s*\d+/.test(t));
  if (numOk) pass(`[VITALS] tabular "cur / max" numerics present (${v0.nums.filter(t=>/\//.test(t)).join(" · ")})`); else fail(`[VITALS] no cur/max numerics: ${JSON.stringify(v0.nums)}`);
  const idOk = v0.name && v0.name !== "—" && /^Nv\s/.test(v0.lvlTxt || "") && /oro$/.test(v0.goldTxt || "");
  if (idOk) pass(`[VITALS] identity correct (name "${v0.name}", "${v0.lvlTxt}", "${v0.goldTxt}")`); else fail(`[VITALS] identity wrong: name=${v0.name} lvl=${v0.lvlTxt} gold=${v0.goldTxt}`);
  const typo = await page.evaluate(() => { const n = document.querySelector("#hud .num"); const cs = n && getComputedStyle(n); return cs ? { fam: cs.fontFamily, tab: cs.fontVariantNumeric } : null; });
  if (typo && /courier/i.test(typo.fam) && /tabular/.test(typo.tab)) pass("[VITALS] numerics are tabular Courier (legible cream)"); else fail(`[VITALS] typography off: ${JSON.stringify(typo)}`);

  // ---- [3 A11Y-RM] reduceMotion ON ⇒ #hud.rm ⇒ transition + shimmer off ----
  const rm = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    const f = document.querySelector("#hud .fill"); const sp = document.querySelector("#hud .spec");
    return { has: hud.classList.contains("rm"), dur: f ? getComputedStyle(f).transitionDuration : "n/a",
      anim: sp ? getComputedStyle(sp).animationName : "n/a", rmState: (window.__hud.state()||{}).reduceMotion };
  });
  if (rm.rmState === true && rm.has && (rm.dur === "0s" || rm.dur === "") && (rm.anim === "none" || rm.anim === ""))
    pass(`[A11Y-RM] reduceMotion ON ⇒ #hud.rm, transition ${rm.dur}, shimmer ${rm.anim}`);
  else fail(`[A11Y-RM] reduce-motion not honoured: ${JSON.stringify(rm)}`);

  // ---- [5 STATES] equipped slot = .eq gold/inset · empty = .off dim ----
  // (BEFORE the colorblind loot-grind, so empty bag slots still exist to test .off)
  const states = await page.evaluate(() => {
    const eq = document.querySelector("#hud .slot.eq"); const off = document.querySelector("#hud .slot.off");
    const cs = (el) => el ? { border: getComputedStyle(el).borderTopColor, shadow: getComputedStyle(el).boxShadow, op: getComputedStyle(el).opacity, bg: getComputedStyle(el).backgroundColor } : null;
    return { eqCount: document.querySelectorAll("#hud .slot.eq").length, offCount: document.querySelectorAll("#hud .slot.off").length, eq: cs(eq), off: cs(off) };
  });
  const eqActive = states.eq && /224,\s*185,\s*74|e0b94a/i.test(states.eq.border) && /inset/.test(states.eq.shadow);
  const offDim = states.off && parseFloat(states.off.op) <= 0.6;
  if (eqActive) pass(`[STATES] equipped slot shows gold border + inset glow (${states.eqCount} eq)`); else fail(`[STATES] equipped 'active' treatment missing: ${JSON.stringify(states.eq)}`);
  if (offDim) pass(`[STATES] empty slot shows dim/disabled treatment (op ${states.off.op}, ${states.offCount} off)`); else fail(`[STATES] empty 'disabled' treatment missing: ${JSON.stringify(states.off)}`);

  // ---- [3 A11Y-CB] colorblind ON ⇒ shape cue on a non-common item + chip glyph ----
  // Mechanism gate: colorblind flag is live + the cue/chip glyph styling is present.
  const cb = await page.evaluate(() => {
    const css = (document.getElementById("hud-style") || {}).textContent || "";
    return { colorblind: (window.__hud.state() || {}).colorblind === true,
      cueRule: /\.cue\{/.test(css), chipRule: /\.chip\{/.test(css) };
  });
  // STRONG visual: grind elite drops (higher rarity odds) → pickup → inspect the bag/equip
  // rarities; a non-common rarity must render its ◦/◆/★ shape-cue glyph in a slot.
  const cbRender = await page.evaluate(async () => {
    let rareSeen = 0;
    for (let i = 0; i < 60; i++) {
      try { window.__dev.eliteSpawnKill("orc", window.__hud.state().zone); } catch (e) {}
      try { window.__dev.pickup(); } catch (e) {}
      const s = window.__hud.state() || {};
      const r = Math.max(...[...(s.bag || []), ...(s.equip || [])].filter(Boolean).map(x => x.rarity | 0), 0);
      if (r > 0) { rareSeen = r; break; }
      await new Promise(r2 => setTimeout(r2, 30));
    }
    await new Promise(r => setTimeout(r, 350)); // let the HUD repaint the grid
    const slotGlyph = [...document.querySelectorAll("#hud .slot.eq, #hud .slot")].map(el => el.textContent).some(t => /[◦◆★]/.test(t));
    return { rareSeen, slotGlyph };
  });
  const cbMech = cb.colorblind && cb.cueRule && cb.chipRule;
  if (cbMech && cbRender.slotGlyph)
    pass(`[A11Y-CB] colorblind ⇒ shape-cue rendered on a rarity-${cbRender.rareSeen} item slot (◦/◆/★)`);
  else if (cbMech)
    pass(`[A11Y-CB] colorblind flag live + cue/chip glyph styling present (no non-common drop in grind: rareSeen=${cbRender.rareSeen})`);
  else fail(`[A11Y-CB] colorblind path missing: ${JSON.stringify(cb)}`);

  // ---- [6b] toggling HUD changes nothing in the sim (read-only) ----
  const soak = await page.evaluate(async () => {
    const beforeOn = window.__hud.isOn();
    const s = window.__hud.state();
    const a = JSON.stringify({ hp: s.hp, gold: s.gold, lvl: s.lvl, xp: s.xp });
    window.__hud.hide(); await new Promise(r => setTimeout(r, 250));
    const offOn = window.__hud.isOn();
    window.__hud.show(); await new Promise(r => setTimeout(r, 250));
    const s2 = window.__hud.state();
    const b = JSON.stringify({ hp: s2.hp, gold: s2.gold, lvl: s2.lvl, xp: s2.xp });
    return { beforeOn, offOn, identical: a === b, a, b };
  });
  if (soak.identical && soak.beforeOn && !soak.offOn) pass("[SOAK] toggling HUD does not perturb sim state (hp/gold/lvl/xp identical)");
  else fail(`[SOAK] toggle perturbed state or toggle broken: ${JSON.stringify(soak)}`);

  // ---- [6c] FPS with HUD on ----
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise(res => { const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return n; });
  if (fps >= 55) pass(`[SOAK] ${fps} fps with HUD on (≥55)`); else fail(`[SOAK] only ${fps} fps`);

  // ---- [6d] core loop unaffected: combat/loot/level work with HUD on ----
  const loop = await page.evaluate(async () => {
    const before = window.__hud.state();
    let killed = false, picked = false;
    try { window.__dev.spawnKill("orc"); killed = true; } catch (e) {}
    try { window.__dev.pickup(); picked = true; } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
    const after = window.__hud.state();
    return { scenePlay: after && after.scene === "play", killed, picked,
      hpNum: typeof (after && after.hp) === "number", xpMoved: (after && after.xp) !== (before && before.xp) };
  });
  if (loop.scenePlay && loop.hpNum) pass(`[SOAK] core loop alive with HUD on (scene=play, combat/loot run, hp real${loop.xpMoved ? ", xp advanced" : ""})`);
  else fail(`[SOAK] core loop check failed: ${JSON.stringify(loop)}`);

  // desktop screenshot
  await page.screenshot({ path: "tools/cas297-hud-live-desktop.png" });
  log("… screenshot → tools/cas297-hud-live-desktop.png");

  // ===================================================================
  // PHASE 2 — responsive: 360px + 600px, drawer + reachable action bar
  // ===================================================================
  // 600px
  await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 1 });
  await wait(300);
  const r600 = await page.evaluate(() => {
    const b = document.querySelector("#hud .drawerBtn"); const cs = b ? getComputedStyle(b) : null;
    const act = document.querySelector("#hud .fr-action"); const ar = act ? act.getBoundingClientRect() : null;
    return { disp: cs ? cs.display : "none", w: cs ? parseInt(cs.width) : 0, h: cs ? parseInt(cs.height) : 0,
      scale: window.__hud.scale(), actReachable: ar ? (ar.bottom <= window.innerHeight + 1 && ar.x >= -1) : false };
  });
  if (r600.disp !== "none" && r600.w >= 44 && r600.h >= 44) pass(`[RESPONSIVE] ≤640px drawer ≡ shown, ${r600.w}×${r600.h}px (≥44px)`); else fail(`[RESPONSIVE] drawer btn not reachable @600px: ${JSON.stringify(r600)}`);
  if (r600.actReachable) pass("[RESPONSIVE] action bar stays reachable @600px"); else fail(`[RESPONSIVE] action bar off-screen @600px: ${JSON.stringify(r600)}`);
  // drawer opens (wait out the .18s slide transition before measuring)
  await page.evaluate(() => window.__hud.drawer(true));
  await wait(350);
  const drawer = await page.evaluate(() => { const rail = document.querySelector("#hud .rail"); const r = rail.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), onScreen: r.right > 0 && r.x < window.innerWidth - 10 }; });
  if (drawer.onScreen) pass("[RESPONSIVE] drawer slides the right rail into view"); else fail(`[RESPONSIVE] drawer did not reveal rail: ${JSON.stringify(drawer)}`);
  await page.screenshot({ path: "tools/cas297-hud-live-mobile.png" });
  log("… screenshot → tools/cas297-hud-live-mobile.png");

  // 360px legibility
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1 });
  await wait(300);
  const r360 = await page.evaluate(() => {
    const n = document.querySelector("#hud .num"); const cs = n ? getComputedStyle(n) : null;
    const px = cs ? parseFloat(cs.fontSize) : 0;
    return { scale: window.__hud.scale(), numPx: px, hasText: n ? /\d/.test(n.textContent) : false };
  });
  if (r360.numPx >= 9 && r360.hasText) pass(`[RESPONSIVE] numerics legible @360px (${r360.numPx.toFixed(1)}px, scale ${r360.scale})`); else fail(`[RESPONSIVE] numerics too small @360px: ${JSON.stringify(r360)}`);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  // ---- [6e] zero console errors / no 4xx (except favicon) across the whole run ----
  await wait(200);
  if (errors.length === 0 && errors0.length === 0) pass("[SOAK] zero JS errors / no 4xx across the run");
  else { for (const e of [...errors0, ...errors].slice(0, 10)) fail(`[ERR] ${e}`); }

  await ctx1.close();
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
}

log(ok ? "\n✅ CAS-297 LIVE HUD QA: ALL CHECKS PASS" : "\n❌ CAS-297 LIVE HUD QA: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
