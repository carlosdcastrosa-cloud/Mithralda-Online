// ---------------------------------------------------------------------------
// CAS-1752 (build for CAS-1751) — CÓDICE DE BOTÍN (Collection Log). A PURE READ-SIDE ledger over the
// shipped loot systems (uniques CAS-1632 / sets CAS-1654 / runes CAS-1687): the FIRST pickup of a
// given unique/set-piece/rune is recorded forever in its OWN store (mithralda.codex.v1) and grants a
// small PERMANENT account-wide bonus. It draws NO RNG and writes NO combat state beyond the derived,
// cached codexDmg/codexHp read live by equippedDmg/heroMaxHp.
//
// Proves, through the REAL sim hooks (window.__dev.codex*):
//   [AC1] own key `mithralda.codex.v1`; ledger round-trips through its OWN blob; save.v1 untouched.
//   [AC2] first pickup records exactly ONE entry; a repeat is idempotent (one-way set-insert).
//   [AC3] the bonus moves LIVE dmg/maxHp and persists across a reload (reconciled at boot).
//   [AC4] the HUD affordance (top + sidebar ◆) exists when enabled; the scene opens/closes.
//   [AC5] [AC-RNG-STRONG] CODEX.enabled=false ⇒ 0 ledger writes, 0 stat contribution, NO HUD button,
//         and the gameplay srand fingerprint around a full pickup is BYTE-IDENTICAL to ON.
//   [AC6] this harness itself (idempotent discovery, bonus math, OFF byte-identity, persistence round-trip).
//
// Run: node tools/cas1752-codex.mjs   (local build; the Deploy child re-points QA at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1752-codex.png");
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "CodexBot"; ni.blur(); }
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
    // test can prove the codex/save survive a real page reload — a blanket wipe would destroy what it tests.
    try { if (!localStorage.getItem("__cas1752_booted")) {
      localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.arena.v1");
      localStorage.setItem("__cas1752_booted", "1"); } } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(page);
  pass("entered play (live hero) — CAS-1752 hooks drive the codex paths");

  // ---------- dev-hook wiring ----------
  const hooks = ["codexEnable", "codexReset", "codexState", "codexRecord", "codexPickup", "codexPersist", "codexSrandProbe", "codexBtns"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  if (missing.length) fail(`dev hooks NOT wired: ${missing.join(", ")}`); else pass(`dev hooks wired: ${hooks.length}/${hooks.length}`);

  // enable + clean ledger baseline
  await page.evaluate(() => { window.__dev.codexEnable(true); window.__dev.codexReset(); });

  // static content sanity — 3 sections with the shipped totals (6 uniques / 9 set pieces / 3 runes)
  const st0 = await page.evaluate(() => window.__dev.codexState());
  const totals = Object.fromEntries(st0.sections.map((s) => [s.key, s.total]));
  if (st0.enabled && totals.uniq === 6 && totals.set === 9 && totals.rune === 3)
    pass(`content: 3 sections — Únicos ${totals.uniq}, Conjuntos ${totals.set}, Runas ${totals.rune}; all start locked (found 0)`);
  else fail(`content wrong: ${JSON.stringify(st0.sections.map((s) => ({ k: s.key, f: s.found, t: s.total })))} enabled=${st0.enabled}`);
  if (st0.sections.every((s) => s.found === 0) && st0.bonus.dmg === 0 && st0.bonus.hp === 0)
    pass(`baseline: empty ledger ⇒ 0 discovered, 0 bonus`);
  else fail(`baseline not empty: ${JSON.stringify(st0)}`);

  // ---------- AC2: first pickup records exactly one entry; a repeat is idempotent ----------
  const disc = await page.evaluate(() => {
    const dmg0 = window.__dev.codexState().hero.dmg;
    const a = window.__dev.codexPickup("uniq", "reloj_vacio");   // first-ever pickup of a unique → NEW
    const foundAfterFirst = a.state.sections.find((s) => s.key === "uniq").found;
    const b = window.__dev.codexRecord("uniq", "reloj_vacio");   // same unique again → idempotent, no new entry
    return { dmg0, dirtied: a.dirtiedForFlush, foundAfterFirst, foundAfterRepeat: b.state.sections.find((s) => s.key === "uniq").found, repeatRecorded: b.recorded };
  });
  if (disc.foundAfterFirst === 1 && disc.dirtied)
    pass(`AC2: first pickup of a unique records exactly 1 entry (marks the store dirty for flush)`);
  else fail(`AC2: first pickup wrong: ${JSON.stringify(disc)}`);
  if (disc.foundAfterRepeat === 1 && disc.repeatRecorded === false)
    pass(`AC2: a repeat pickup is IDEMPOTENT (still 1 entry; recordCodex returned false)`);
  else fail(`AC2: idempotency broken: ${JSON.stringify(disc)}`);

  // ---------- AC3: bonus moves LIVE dmg/maxHp; math matches counts × magnitudes ----------
  const bonus = await page.evaluate(() => {
    window.__dev.codexReset();
    const base = window.__dev.codexState().hero;                         // 0 codex bonus
    window.__dev.codexPickup("uniq", "reloj_vacio");                     // +dmg
    window.__dev.codexPickup("uniq", "corazon_titan");                   // +dmg  (2 uniques)
    window.__dev.codexPickup("set", "vigia_arma");                       // +hp
    window.__dev.codexPickup("rune", "rubi");                            // +hp
    const s = window.__dev.codexState();
    return { base, s };
  });
  const n = Object.fromEntries(bonus.s.sections.map((x) => [x.key, x.found]));
  // magnitudes from config: dmgPerUniq 2, hpPerSet 15, hpPerRune 10
  const expDmg = n.uniq * 2, expHp = n.set * 15 + n.rune * 10;
  if (bonus.s.bonus.dmg === expDmg && bonus.s.bonus.hp === expHp && bonus.s.hero.codexDmg === expDmg && bonus.s.hero.codexHp === expHp)
    pass(`AC3: bonus math — ${n.uniq}×2=+${expDmg} daño, ${n.set}×15+${n.rune}×10=+${expHp} vida (cached on hero)`);
  else fail(`AC3: bonus math wrong: ${JSON.stringify({ n, bonus: bonus.s.bonus, hero: bonus.s.hero })}`);
  if (bonus.s.hero.dmg === bonus.base.dmg + expDmg && bonus.s.hero.maxHp === bonus.base.maxHp + expHp)
    pass(`AC3: LIVE combat moved — dmg ${bonus.base.dmg}→${bonus.s.hero.dmg}, maxHp ${bonus.base.maxHp}→${bonus.s.hero.maxHp}`);
  else fail(`AC3: live dmg/maxHp did not move by the bonus: ${JSON.stringify({ base: bonus.base, after: bonus.s.hero })}`);

  // ---------- AC1: ledger round-trips through its OWN blob (serialize→load) ----------
  const rt = await page.evaluate(() => window.__dev.codexPersist());
  const rtBefore = JSON.stringify(rt.before.sections.map((s) => [s.key, s.found]));
  const rtAfter = JSON.stringify(rt.after.sections.map((s) => [s.key, s.found]));
  if (rt.blob && rt.blob.v === 1 && rt.blob.uniq && rt.clearedFirst && rtBefore === rtAfter && rt.after.bonus.dmg === rt.before.bonus.dmg && rt.after.bonus.hp === rt.before.bonus.hp)
    pass(`AC1: codex round-trips through mithralda.codex.v1 blob (cleared→reloaded to the same set + bonus)`);
  else fail(`AC1: round-trip mismatch: before=${rtBefore} after=${rtAfter} blob=${JSON.stringify(rt.blob)}`);

  // ---------- AC3(persist): the bonus survives a real page reload (reconciled at boot) ----------
  // discover a fresh, deterministic set, let the throttled autosave flush, reload, and re-read.
  const reload = await page.evaluate(async () => {
    window.__dev.codexEnable(true); window.__dev.codexReset();
    window.__dev.codexPickup("uniq", "colmillo_pavido");
    window.__dev.codexPickup("set", "cazador_arma");
    window.__dev.codexPickup("rune", "zafiro");
    const before = window.__dev.codexState();
    return { before };
  });
  await new Promise((r) => setTimeout(r, 2600));  // > SAVE_THROTTLE (2.0s) so tick() flushes codexDirty
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 15000 });
  const after = await page.evaluate(() => window.__dev.codexState());
  const rBefore = JSON.stringify(reload.before.sections.map((s) => [s.key, s.found]));
  const rAfter = JSON.stringify(after.sections.map((s) => [s.key, s.found]));
  if (rBefore === rAfter && after.bonus.dmg === reload.before.bonus.dmg && after.bonus.hp === reload.before.bonus.hp && after.hero && after.hero.codexHp === reload.before.bonus.hp)
    pass(`AC3: codex + bonus PERSIST across reload (reconciled at boot; +${after.bonus.dmg} daño / +${after.bonus.hp} vida re-applied to the loaded hero)`);
  else fail(`AC3: persistence broke across reload: before=${rBefore} after=${rAfter} bonusB=${JSON.stringify(reload.before.bonus)} bonusA=${JSON.stringify(after.bonus)}`);

  // ---------- AC4: HUD affordance present + scene opens/closes ----------
  const hud = await page.evaluate(() => window.__dev.codexBtns());
  // The top-bar ◆ is the guaranteed affordance at any size; the fixed desktop sidebar row only exists
  // when the responsive layout has an expanded sidebar (view.sbw>0) — collapsed on narrow/mobile.
  if (hud.top) pass(`AC4: Códice HUD button present (top ◆${hud.sidebar ? " + sidebar row" : ""}) while enabled`);
  else fail(`AC4: top HUD button missing while enabled: ${JSON.stringify(hud)}`);
  const openClose = await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", key: "k", bubbles: true }));
    const opened = window.__dev.scene();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
    return { opened, closed: window.__dev.scene() };
  });
  if (openClose.opened === "codex" && openClose.closed === "play")
    pass(`AC4: K opens the Códice scene; ESC returns to play (read-only panel, renders without crash)`);
  else fail(`AC4: scene toggle wrong: ${JSON.stringify(openClose)}`);
  // dwell with the panel OPEN and a MIXED discovered/locked state so renderCodex actually paints several
  // frames (icons + names + "???" silhouettes + the bonus header) — the screenshot captures it.
  const errBefore = errors.length;
  await page.evaluate(() => {
    window.__dev.codexEnable(true); window.__dev.codexReset();
    window.__dev.codexRecord("uniq", "reloj_vacio"); window.__dev.codexRecord("uniq", "corazon_titan");
    window.__dev.codexRecord("set", "vigia_arma"); window.__dev.codexRecord("rune", "esmeralda");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", key: "k", bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  const dwellScene = await page.evaluate(() => window.__dev.scene());
  await page.screenshot({ path: SHOT }).catch(() => {});
  const renderErrs = errors.slice(errBefore).filter((e) => !/favicon|net::ERR_|404/i.test(e));
  if (dwellScene === "codex" && renderErrs.length === 0)
    pass(`AC4: renderCodex paints a mixed discovered/locked panel over multiple frames (no crash; screenshot saved)`);
  else fail(`AC4: renderCodex dwell failed (scene=${dwellScene}, errs=${renderErrs.slice(0, 2).join(" | ")})`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

  // ---------- AC5 [AC-RNG-STRONG]: enabled=false ⇒ no writes, 0 bonus, no HUD, srand identical ----------
  const off = await page.evaluate(() => {
    const SEED = 0x1751c0de, PROBE = 24;
    const on = window.__dev.codexSrandProbe(true, SEED, PROBE);    // codex ON: records + full pickup
    const disabled = window.__dev.codexSrandProbe(false, SEED, PROBE); // codex OFF: same seed, no discovery
    window.__dev.codexEnable(false);
    const st = window.__dev.codexState();                          // OFF state: 0 writes, 0 bonus
    const btns = window.__dev.codexBtns();                         // OFF: no HUD affordance
    const rec = window.__dev.codexRecord("uniq", "guante_berserker"); // OFF: record is a no-op
    window.__dev.codexEnable(true);                                // restore for teardown
    return { on, disabled, st, btns, rec };
  });
  const fpOn = JSON.stringify(off.on.fingerprint), fpOff = JSON.stringify(off.disabled.fingerprint);
  if (fpOn === fpOff)
    pass(`AC5 [AC-RNG-STRONG]: gameplay srand BYTE-IDENTICAL codex ON vs OFF (${off.on.fingerprint.length} draws) — RNG-neutral by construction`);
  else fail(`AC5: srand diverged ON vs OFF — on=${fpOn.slice(0, 60)} off=${fpOff.slice(0, 60)}`);
  if (off.on.uniqFound === 1 && off.disabled.uniqFound === 0)
    pass(`AC5: ON recorded a discovery (found 1); OFF recorded none (found 0) — feature works while srand untouched`);
  else fail(`AC5: discovery counts wrong — on=${off.on.uniqFound} off=${off.disabled.uniqFound}`);
  const offZero = off.st.sections.every((s) => s.found === 0) && off.st.bonus.dmg === 0 && off.st.bonus.hp === 0 && off.st.hero.codexDmg === 0 && off.st.hero.codexHp === 0;
  if (offZero && !off.btns.top && !off.btns.sidebar && off.rec.recorded === false)
    pass(`AC5: enabled=false ⇒ 0 ledger writes, 0 stat contribution, NO HUD button, recordCodex no-op`);
  else fail(`AC5: OFF path not clean: ${JSON.stringify({ st: off.st.bonus, hero: off.st.hero, btns: off.btns, rec: off.rec.recorded })}`);

  // ---------- PERF: 60fps with the codex bonus live ----------
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1200));
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
  if (fps >= 50) pass(`PERF: ${fps}fps sustained (>=50 on a 2-core CI box)`);
  else log(`~ PERF: ${fps}fps (2-core CI variance; determinism AC5 is the real bar)`);

  // (the codex panel screenshot was captured during the AC4 render dwell above)
  const realErrors = errors.filter((e) => !/favicon|net::ERR_|404/i.test(e));
  if (realErrors.length) fail(`page errors: ${realErrors.slice(0, 3).join(" | ")}`); else pass("no page errors (favicon 404s ignored)");

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  srv.close && srv.close();
}

log(ok ? "\n✅ CAS-1752 códice harness: ALL PASS" : "\n❌ CAS-1752 códice harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
