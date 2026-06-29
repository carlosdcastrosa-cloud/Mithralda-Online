// ---------------------------------------------------------------------------
// CAS-287 — redesigned Tibia-style HUD (IMPLEMENTATION stage) QA harness.
//
// Verifies the build matches the CEO-APPROVED CAS-286 spec, headless on the REAL
// game. Soak-safe contract is covered by tools/cas287-hud-scaffold.mjs (OFF by
// default / read-only / pointer-events:none / persist); this asserts the SPEC:
//   [ASSETS]   the 6 PixelLab panel PNGs load (HTTP 200) and each region wires
//              them via CSS border-image (the approved iron+gold frame chrome)
//   [PALETTE]  chrome carries ONLY §4 locked hues — the old warm-wood placeholder
//              (#5a4632 / rgb(90,70,50)) is GONE; locked iron panelB is present
//   [TYPO]     numeric vitals are tabular monospace (§5) and paint "cur / max"
//   [BARS]     HP/MP/XP fills track value as a % width (§6)
//   [A11Y-RM]  reduceMotion=true ⇒ #hud.rm ⇒ bar fill transition disabled
//   [A11Y-CB]  colorblind=true ⇒ rarity shape-cue prefixes appear on equipped slots
//   [RESPONSIVE] --hud-scale drops on a narrow viewport and the mobile drawer btn
//              becomes reachable (≥44px touch target) (§3)
//   [LOG]      the read-only combat log derives a line from a snapshot delta (§G)
//   [FPS]      the 60fps loop is untouched with the HUD on
//   [ERR]      zero JS errors
//
// Run: npm run cas287-impl   (node tools/cas287-hud-impl.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 10000 });
  await page.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });

  // ---- preset a11y settings ON + clean save so we test the real a11y paths ----
  await page.goto(`${srv.url}/index.html?dev&hud`, { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => { try {
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    localStorage.setItem("mithralda.hud.v1", "1");
    localStorage.setItem("mithralda.settings.v1", JSON.stringify({ reduceMotion: true, colorblind: true }));
  } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__hud && window.__dev && window.__dev.scene", { timeout: 20000 });
  await enterPlay(page, "ProbadorUI");
  await page.evaluate(() => window.__hud.show());
  await wait(400);

  // [ASSETS] PNGs 200 + border-image wired
  const assets = ["hud_statframe.png","hud_minimap_frame.png","hud_paperdoll.png","hud_backpack_grid.png","hud_actionbar.png","hud_console.png"];
  let a200 = 0;
  for (const a of assets) { const r = await page.evaluate((u) => fetch(u).then(x=>x.status).catch(()=>0), `assets/pixellab/ui/cas286/${a}`); if (r === 200) a200++; else fail(`[ASSETS] ${a} HTTP ${r}`); }
  // CAS-299 cutover: the HUD now defers the minimap + action bar to the (functional) on-canvas
  // versions, so the .fr-mini / .fr-action stub panels are intentionally GONE. The remaining 4
  // chrome regions (stat · doll · bag · console) must still wire the approved CAS-286 art.
  const wired = await page.evaluate(() => {
    const sel = [".fr-stat",".fr-doll",".fr-bag",".fr-console"];
    return sel.filter(s => { const el = document.querySelector("#hud "+s); if (!el) return false;
      const bi = getComputedStyle(el).borderImageSource || ""; return /url\(/.test(bi) && /cas286/.test(bi); }).length;
  });
  if (a200 === assets.length) pass(`[ASSETS] all ${a200}/6 panel PNGs HTTP 200`); else fail(`[ASSETS] only ${a200}/6 PNGs 200`);
  if (wired === 4) pass("[ASSETS] all 4 retained regions wire the approved art via border-image (CAS-299: minimap/action defer to canvas)"); else fail(`[ASSETS] only ${wired}/4 regions use border-image`);

  // [PALETTE] no warm-wood placeholder; locked iron present
  const pal = await page.evaluate(() => {
    const all = [...document.querySelectorAll("#hud, #hud *")];
    let foreignWood = 0, ironB = 0;
    for (const el of all) { const cs = getComputedStyle(el);
      const blob = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderImageSource].join(" ");
      if (/rgb\(90,\s*70,\s*50\)/.test(blob) || /5a4632/i.test(blob)) foreignWood++;
      if (/rgb\(58,\s*63,\s*73\)/.test(blob)) ironB++; } // panelB #3a3f49
    return { foreignWood, ironB };
  });
  if (pal.foreignWood === 0) pass("[PALETTE] zero warm-wood placeholder (#5a4632) left in chrome"); else fail(`[PALETTE] ${pal.foreignWood} warm-wood nodes remain`);
  if (pal.ironB > 0) pass(`[PALETTE] locked iron border #3a3f49 present (${pal.ironB} nodes)`); else fail("[PALETTE] locked iron border not found");

  // [TYPO] tabular monospace numerics
  const typo = await page.evaluate(() => {
    const n = document.querySelector("#hud .num"); if (!n) return null;
    const cs = getComputedStyle(n);
    return { fam: cs.fontFamily, tab: cs.fontVariantNumeric || cs.fontFeatureSettings, txt: [...document.querySelectorAll("#hud .num")].map(x=>x.textContent).find(t=>/\d+\s*\/\s*\d+/.test(t)) };
  });
  if (typo && /courier/i.test(typo.fam) && /tabular/.test(typo.tab) && typo.txt) pass(`[TYPO] tabular Courier numerics ("${typo.txt}")`); else fail(`[TYPO] numerics not tabular-monospace: ${JSON.stringify(typo)}`);

  // [BARS] fills track a %
  const bars = await page.evaluate(() => [...document.querySelectorAll("#hud .fill")].map(f => f.style.width));
  if (bars.length >= 3 && bars.every(w => /%$/.test(w))) pass(`[BARS] HP/MP/XP fills are % widths (${bars.join(", ")})`); else fail(`[BARS] fills not %: ${JSON.stringify(bars)}`);

  // [A11Y-RM] reduce-motion kills the fill transition
  const rm = await page.evaluate(() => {
    const hud = document.getElementById("hud"); const has = hud.classList.contains("rm");
    const f = document.querySelector("#hud .fill"); const dur = f ? getComputedStyle(f).transitionDuration : "n/a";
    return { has, dur };
  });
  if (rm.has && (rm.dur === "0s" || rm.dur === "" )) pass(`[A11Y-RM] reduceMotion ⇒ #hud.rm, fill transition disabled (${rm.dur})`); else fail(`[A11Y-RM] reduce-motion not honoured: ${JSON.stringify(rm)}`);

  // [A11Y-CB] colorblind flag reaches the HUD + the rarity shape-cue mechanism is present.
  // (The deep visual — a rare drop renders ◆ — is RNG-gated and is covered by the live playtest child.)
  const cue = await page.evaluate(() => {
    const colorblind = (window.__hud.state()||{}).colorblind;
    const css = (document.getElementById("hud-style")||{}).textContent || "";
    return { colorblind, cueRule: /\.cue\{/.test(css), chipRule: /\.chip\{/.test(css) };
  });
  if (cue.colorblind === true && cue.cueRule && cue.chipRule) pass("[A11Y-CB] colorblind flag honoured + rarity/chip shape-cue styling present");
  else fail(`[A11Y-CB] colorblind path missing: ${JSON.stringify(cue)}`);

  // [RESPONSIVE] narrow viewport drops --hud-scale + exposes ≥44px drawer btn
  const wide = await page.evaluate(() => window.__hud.scale());
  await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 1 });
  await wait(250);
  const narrow = await page.evaluate(() => {
    const sc = window.__hud.scale();
    const b = document.querySelector("#hud .drawerBtn"); const cs = b ? getComputedStyle(b) : null;
    return { sc, disp: cs ? cs.display : "none", w: cs ? parseInt(cs.width) : 0 };
  });
  if (parseFloat(narrow.sc) < parseFloat(wide) && narrow.disp !== "none" && narrow.w >= 44)
    pass(`[RESPONSIVE] scale ${wide}→${narrow.sc}, drawer btn ${narrow.w}px (≥44px) shown`);
  else fail(`[RESPONSIVE] not responsive: wide=${wide} ${JSON.stringify(narrow)}`);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await wait(150);

  // [LOG] read-only combat log derives a line from a delta
  const logged = await page.evaluate(async () => {
    try { window.__dev.hurt(11); } catch (e) {}   // real sim hit → snapshot hp drops → log derives a line
    await new Promise(r => setTimeout(r, 600)); // let two refresh ticks diff
    return [...document.querySelectorAll("#hud .logln")].map(x => x.textContent);
  });
  if (logged.some(t => /daño|nivel|oro|PV/.test(t))) pass(`[LOG] combat log derived a line ("${logged.find(t=>/daño|nivel|oro|PV/.test(t))}")`);
  else fail(`[LOG] no derived log line: ${JSON.stringify(logged)}`);

  // [FPS]
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise(res => { const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return n; });
  if (fps >= 55) pass(`[FPS] ${fps} fps with HUD on (≥55)`); else fail(`[FPS] only ${fps} fps`);

  // screenshot for visual review
  await page.evaluate(() => window.__hud.show());
  await wait(300);
  await page.screenshot({ path: "tools/cas287-hud-impl.png" });
  log("… screenshot → tools/cas287-hud-impl.png");

  if (errors.length === 0) pass("[ERR] zero JS errors"); else { for (const e of errors.slice(0, 8)) fail(`[ERR] ${e}`); }
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  if (srv && srv.close) await srv.close();
}

log(ok ? "\n✅ CAS-287 HUD impl: ALL CHECKS PASS" : "\n❌ CAS-287 HUD impl: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
