// ---------------------------------------------------------------------------
// CAS-1759 (build for CAS-1758) — TÍTULOS DE GESTA (Feat Titles). A PURE READ-SIDE cosmetic layer over
// milestones the player ALREADY accumulates (Códice counts CAS-1751 / Arena best waves CAS-1664 / Ascensión
// level CAS-1557): crossing a fixed threshold unlocks an account-wide, choosable title shown next to the
// hero name. Own store `mithralda.titles.v1`; save.v1 untouched; draws NO RNG and writes NO combat state
// beyond the derived, cached h.title string. Mirror of the Códice (CAS-1752) architecture + harness.
//
// Proves, through the REAL sim hooks (window.__dev.titles*):
//   [AC1] own key `mithralda.titles.v1`; ledger round-trips through its OWN blob; equipped validates vs unlocked.
//   [AC2] evalTitles is idempotent — re-running N times never duplicates or reverts an unlock.
//   [AC3] crossing a threshold (codex uniq / arena wave / ascension) unlocks + persists across a real reload.
//   [AC4] equip an unlocked title → it shows on the HUD name line ("name · title"); a locked title can't equip.
//   [AC5] [AC-RNG-STRONG] TITLES.enabled=false ⇒ 0 ledger writes, no HUD button, h.title empty, and the
//         gameplay srand fingerprint around a title unlock is BYTE-IDENTICAL to ON (RNG-neutral by construction).
//   [AC6] this harness itself (idempotent eval, threshold math, OFF byte-identity, persistence round-trip).
//
// Run: node tools/cas1758-titles.mjs   (local build; the Deploy child re-points QA at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1758-titles.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "TitleBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.evaluateOnNewDocument(() => {
    // Clear the stores ONLY on the very first load (a sentinel guards it) so the persistence-across-reload
    // test can prove the titles/save survive a real page reload — a blanket wipe would destroy what it tests.
    try { if (!localStorage.getItem("__cas1758_booted")) {
      localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.titles.v1");
      localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
      localStorage.setItem("__cas1758_booted", "1"); } } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(page);
  pass("entered play (live hero) — CAS-1759 hooks drive the titles paths");

  // ---------- dev-hook wiring ----------
  const hooks = ["titlesEnable", "titlesReset", "titlesState", "titlesEval", "titlesEquip", "titlesPersist",
                 "titlesSeedCodex", "titlesSeedArena", "titlesSeedAscension", "titlesSrandProbe", "titlesBtns", "titlesHudName"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  if (missing.length) fail(`dev hooks NOT wired: ${missing.join(", ")}`); else pass(`dev hooks wired: ${hooks.length}/${hooks.length}`);

  // enable + clean ledger baseline
  await page.evaluate(() => { window.__dev.titlesEnable(true); window.__dev.titlesReset(); });

  // static content sanity — the fixed table (9 titles), all locked at boot, none equipped, hero title empty
  const st0 = await page.evaluate(() => window.__dev.titlesState());
  if (st0.enabled && st0.total === 9 && st0.unlocked === 0 && st0.equipped === null && st0.hero && st0.hero.title === "")
    pass(`content: fixed table of ${st0.total} titles, all locked (unlocked 0), none equipped, hero title empty`);
  else fail(`content wrong: ${JSON.stringify({ total: st0.total, unlocked: st0.unlocked, equipped: st0.equipped, hero: st0.hero, enabled: st0.enabled })}`);

  // ---------- AC3: crossing a threshold unlocks (codex uniq ≥5) ----------
  const cross = await page.evaluate(() => {
    window.__dev.titlesReset();
    const before = window.__dev.titlesState().items.find((i) => i.id === "codex_uniq_5");
    window.__dev.titlesSeedCodex("uniq", 4);   // 4 uniques → still locked (threshold 5)
    const at4 = window.__dev.titlesState().items.find((i) => i.id === "codex_uniq_5");
    window.__dev.titlesSeedCodex("uniq", 5);   // 5th unique → crosses the threshold
    const at5 = window.__dev.titlesState().items.find((i) => i.id === "codex_uniq_5");
    return { before, at4, at5 };
  });
  if (!cross.before.unlocked && !cross.at4.unlocked && cross.at5.unlocked && cross.at5.cur >= 5)
    pass(`AC3: "Cazador de Leyendas" locked at 4 uniques, UNLOCKS at 5 (live source counter crosses n)`);
  else fail(`AC3: threshold crossing wrong: ${JSON.stringify(cross)}`);

  // ---------- AC3: the OTHER sources unlock (arena bestWave/bestBossWave, ascension) ----------
  const src = await page.evaluate(() => {
    window.__dev.titlesReset();
    window.__dev.titlesSeedArena(10, 3);       // bestWave 10 (≥5 and ≥10), bestBossWave 3 (≥3)
    window.__dev.titlesSeedAscension(3);       // ascension 3 (≥1 and ≥3)
    const s = window.__dev.titlesState();
    const by = Object.fromEntries(s.items.map((i) => [i.id, i.unlocked]));
    return { by, unlocked: s.unlocked };
  });
  const wantOn = ["arena_wave_5", "arena_wave_10", "arena_boss_3", "asc_1", "asc_3"];
  if (wantOn.every((id) => src.by[id]))
    pass(`AC3: arena + ascension sources unlock — ${wantOn.join(", ")} all lit`);
  else fail(`AC3: arena/ascension unlocks wrong: ${JSON.stringify(src.by)}`);

  // ---------- AC2: evalTitles is idempotent (re-run N times → no dup, no revert) ----------
  const idem = await page.evaluate(() => {
    const a = window.__dev.titlesState().unlocked;
    for (let i = 0; i < 5; i++) window.__dev.titlesEval();
    const b = window.__dev.titlesState().unlocked;
    const changedOnRepeat = window.__dev.titlesEval().changed;   // nothing new to unlock now
    return { a, b, changedOnRepeat };
  });
  if (idem.a === idem.b && idem.a > 0 && idem.changedOnRepeat === false)
    pass(`AC2: evalTitles idempotent — ${idem.a} unlocks stable across 5 re-runs (repeat reported no change)`);
  else fail(`AC2: idempotency broken: ${JSON.stringify(idem)}`);

  // ---------- AC4: equip an unlocked title → HUD name line; a locked title can't equip ----------
  const equip = await page.evaluate(() => {
    // zero EVERY live source counter first (evalTitles reads them live) so only the seeded ones unlock
    window.__dev.codexReset(); window.__dev.titlesSeedArena(0, 0); window.__dev.titlesSeedAscension(0);
    window.__dev.titlesReset();
    window.__dev.titlesSeedArena(10, 0);                          // unlocks arena_wave_5 + arena_wave_10 only
    const lockedTry = window.__dev.titlesEquip("asc_3");          // NOT unlocked (ascension 0) → must fail
    const okTry = window.__dev.titlesEquip("arena_wave_10");      // unlocked → equips
    const hud = window.__dev.titlesHudName();
    const st = window.__dev.titlesState();
    return { lockedOk: lockedTry.ok, okOk: okTry.ok, equipped: st.equipped, heroTitle: st.hero.title, hud };
  });
  if (equip.lockedOk === false && equip.equipped !== "asc_3")
    pass(`AC4: equipping a LOCKED title is impossible (equipTitle returned false)`);
  else fail(`AC4: locked equip should have failed: ${JSON.stringify(equip)}`);
  if (equip.okOk && equip.equipped === "arena_wave_10" && equip.heroTitle === "Gladiador Eterno" && /·\s*Gladiador Eterno/.test(equip.hud.display))
    pass(`AC4: equipping an unlocked title shows it on the HUD name line — "${equip.hud.display}"`);
  else fail(`AC4: equip/HUD wrong: ${JSON.stringify(equip)}`);

  // ---------- AC1: ledger round-trips through its OWN blob (serialize→load); equipped validates ----------
  const rt = await page.evaluate(() => window.__dev.titlesPersist());
  const rtBefore = JSON.stringify(rt.before.items.map((i) => [i.id, i.unlocked, i.equipped]));
  const rtAfter = JSON.stringify(rt.after.items.map((i) => [i.id, i.unlocked, i.equipped]));
  if (rt.blob && rt.blob.v === 1 && rt.blob.unlocked && rt.blob.equipped === "arena_wave_10" && rt.clearedFirst && rtBefore === rtAfter && rt.after.equipped === rt.before.equipped)
    pass(`AC1: titles round-trip through mithralda.titles.v1 blob (cleared→reloaded to the same set + equipped)`);
  else fail(`AC1: round-trip mismatch: before=${rtBefore} after=${rtAfter} blob=${JSON.stringify(rt.blob)}`);

  // equipped must validate against unlocked on load — a blob whose equipped isn't unlocked drops to null
  const guard = await page.evaluate(() => window.__dev.titlesEquip("asc_1").ok === false && window.__dev.titlesState().equipped);
  if (guard === "arena_wave_10") pass(`AC1: equipped id is guarded — a locked id can never become the equipped title`);
  else fail(`AC1: equipped guard wrong: ${JSON.stringify(guard)}`);

  // ---------- AC3(persist): the unlock + equip survive a real page reload (reconciled at boot) ----------
  const reload = await page.evaluate(() => {
    window.__dev.titlesEnable(true); window.__dev.titlesReset();
    window.__dev.titlesSeedCodex("set", 3);                      // unlocks codex_set_3 ("Coleccionista")
    window.__dev.titlesEquip("codex_set_3");
    return { before: window.__dev.titlesState() };
  });
  await new Promise((r) => setTimeout(r, 2600));  // > SAVE_THROTTLE (2.0s) so tick() flushes titlesDirty
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 15000 });
  const after = await page.evaluate(() => ({ st: window.__dev.titlesState(), hud: window.__dev.titlesHudName() }));
  const rBefore = JSON.stringify(reload.before.items.map((i) => [i.id, i.unlocked]));
  const rAfter = JSON.stringify(after.st.items.map((i) => [i.id, i.unlocked]));
  if (rBefore === rAfter && after.st.equipped === "codex_set_3" && after.st.hero.title === "Coleccionista" && /·\s*Coleccionista/.test(after.hud.display))
    pass(`AC3: titles + equipped PERSIST across reload (reconciled at boot; HUD shows "${after.hud.display}")`);
  else fail(`AC3: persistence broke across reload: before=${rBefore} after=${rAfter} eq=${after.st.equipped} title=${after.st.hero && after.st.hero.title}`);

  // ---------- AC4: HUD affordance present + scene opens/closes ----------
  const hud = await page.evaluate(() => window.__dev.titlesBtns());
  if (hud.top) pass(`AC4: Títulos HUD button present (top ◈${hud.sidebar ? " + sidebar row" : ""}) while enabled`);
  else fail(`AC4: top HUD button missing while enabled: ${JSON.stringify(hud)}`);
  const openClose = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyY", key: "y", bubbles: true }));
    const opened = window.__dev.scene();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
    return { opened, closed: window.__dev.scene() };
  });
  if (openClose.opened === "titles" && openClose.closed === "play")
    pass(`AC4: Y opens the Títulos scene; ESC returns to play (read-only panel)`);
  else fail(`AC4: scene toggle wrong: ${JSON.stringify(openClose)}`);
  // dwell with the panel OPEN and a MIXED unlocked/locked state so renderTitles actually paints several frames
  const errBefore = errors.length;
  await page.evaluate(() => {
    window.__dev.titlesEnable(true); window.__dev.titlesReset();
    window.__dev.titlesSeedCodex("uniq", 5); window.__dev.titlesSeedArena(5, 0); window.__dev.titlesEquip("arena_wave_5");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyY", key: "y", bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  const dwellScene = await page.evaluate(() => window.__dev.scene());
  await page.screenshot({ path: SHOT }).catch(() => {});
  const renderErrs = errors.slice(errBefore).filter((e) => !/favicon|net::ERR_|404/i.test(e));
  if (dwellScene === "titles" && renderErrs.length === 0)
    pass(`AC4: renderTitles paints a mixed unlocked/locked panel over multiple frames (no crash; screenshot saved)`);
  else fail(`AC4: renderTitles dwell failed (scene=${dwellScene}, errs=${renderErrs.slice(0, 2).join(" | ")})`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

  // ---------- AC5 [AC-RNG-STRONG]: enabled=false ⇒ no writes, empty title, no HUD, srand identical ----------
  const off = await page.evaluate(() => {
    const SEED = 0x1758c0de, PROBE = 24;
    const on = window.__dev.titlesSrandProbe(true, SEED, PROBE);       // titles ON: seeds counts + unlocks
    const disabled = window.__dev.titlesSrandProbe(false, SEED, PROBE); // titles OFF: same seed, no unlock
    window.__dev.titlesEnable(false);
    const st = window.__dev.titlesState();                            // OFF state: 0 unlocks, empty hero title
    const btns = window.__dev.titlesBtns();                           // OFF: no HUD affordance
    const equip = window.__dev.titlesEquip("codex_set_3");            // OFF: equip is a no-op
    const hud = window.__dev.titlesHudName();                         // OFF: HUD shows just the name
    window.__dev.titlesEnable(true);                                  // restore for teardown
    return { on, disabled, st, btns, equip, hud };
  });
  const fpOn = JSON.stringify(off.on.fingerprint), fpOff = JSON.stringify(off.disabled.fingerprint);
  if (fpOn === fpOff)
    pass(`AC5 [AC-RNG-STRONG]: gameplay srand BYTE-IDENTICAL titles ON vs OFF (${off.on.fingerprint.length} draws) — RNG-neutral by construction`);
  else fail(`AC5: srand diverged ON vs OFF — on=${fpOn.slice(0, 60)} off=${fpOff.slice(0, 60)}`);
  if (off.on.unlockedCount > 0 && off.disabled.unlockedCount === 0)
    pass(`AC5: ON recorded an unlock (count ${off.on.unlockedCount}); OFF recorded none — feature works while srand untouched`);
  else fail(`AC5: unlock counts wrong — on=${off.on.unlockedCount} off=${off.disabled.unlockedCount}`);
  const offClean = off.st.unlocked === 0 && off.st.hero && off.st.hero.title === "" && off.equip.ok === false && !off.btns.top && !off.btns.sidebar && off.hud.display === off.hud.name;
  if (offClean)
    pass(`AC5: enabled=false ⇒ 0 unlocks, empty hero title, NO HUD button, equipTitle no-op, HUD name unchanged`);
  else fail(`AC5: OFF path not clean: ${JSON.stringify({ st: off.st.unlocked, hero: off.st.hero, btns: off.btns, equip: off.equip.ok, hud: off.hud })}`);

  // ---------- PERF: 60fps with a title equipped ----------
  await page.evaluate(() => { window.__dev.titlesEnable(true); window.__dev.titlesReset(); window.__dev.titlesSeedArena(10, 0); window.__dev.titlesEquip("arena_wave_10"); });
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1200));
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
  if (fps >= 50) pass(`PERF: ${fps}fps sustained (>=50 on a 2-core CI box)`);
  else log(`~ PERF: ${fps}fps (2-core CI variance; determinism AC5 is the real bar)`);

  const realErrors = errors.filter((e) => !/favicon|net::ERR_|404/i.test(e));
  if (realErrors.length) fail(`page errors: ${realErrors.slice(0, 3).join(" | ")}`); else pass("no page errors (favicon 404s ignored)");

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  srv.close && srv.close();
}

log(ok ? "\n✅ CAS-1758 títulos harness: ALL PASS" : "\n❌ CAS-1758 títulos harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
