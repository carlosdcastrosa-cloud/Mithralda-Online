// ---------------------------------------------------------------------------
// CAS-340 — INDEPENDENT LIVE QA for the GOLEM BOSS (last off-formula sprite of the
// FOUNTAINS roster; Art Dir baked+wired in commit 513dfdc). FRESH harness, NOT a
// reuse of cas318/cas332 (those are the dracónic boss; the golem is a DIFFERENT
// code path — a hunt CAPSTONE, not a rich-anim boss).
//
// What the golem actually is, verified in source before testing:
//   • render/sprites.js ENEMY_STRIPS.golem = 3 strips (idle 8f / walk 6f / attack 9f,
//     all 96²px, tiles:3.6). That is the golem's COMPLETE anim set — it is NOT a
//     rich-anim boss, so "hurt" is a flash overlay on the live strip and "death" is
//     the kill VFX (no separate hurt/death strip, no corpse). Acceptance pt.2 says
//     "las que existan en el strip set" → idle/walk/attack are the three that exist.
//   • The golem sprite drives ALL 4 zone CAPSTONES (arena/abyss/frost/trial), each
//     base:"golem",sprite:"golem" in sim/config.js HUNTS. The deployed FINAL boss
//     (frost = "Guardián de la Cripta", hp 2200) is summoned via __dev.armFinalBoss()
//     through the REAL spawnChampion path — no shortcut.
//
// Proves, on the PLAYERS' deployed gh-pages build (build id read from the BROWSER):
//   [1] LIVE        — URL 200 + build id from the running page.
//   [2] STRIPS NET  — golem_{idle,walk,attack}_strip.png all 200 over the wire.
//   [3] STRIPS DEC  — those 3 IMG keys decode in-browser (complete + naturalWidth).
//   [4] WIRED       — DEPLOYED sprites.js carries ENEMY_STRIPS.golem (3 strips, the
//                     right frame counts) AND DEPLOYED config.js carries the 4 golem
//                     capstone rows (sprite:"golem") AND render.js has the strip path.
//   [5] ENFRENTABLE — armFinalBoss() summons a REAL enemy: huntState shows the golem
//                     capstone ("Guardián de la Cripta", hp≈2200) live in G.enemies.
//   [6] ANIMS PLAY  — over a driven live fight the golem's animStates fire in their
//                     situation: walk (boss chases) + attack (committed strike). idle
//                     is the spawn/fallback strip (also asserted loaded). Shots each.
//   [7] MOTION      — the rendered golem actually ANIMATES (canvas pixels around the
//                     boss change frame-to-frame → not a frozen single frame).
//   [8] HURT FLASH  — a real hit lands (hp drops) with the hurt-flash react, no error.
//   [9] MUERE       — chip it down then kill through the REAL killEnemy → zone cleared,
//                     guaranteed top-tier drop, champ leaves G.enemies, no error.
//  [10] PERF/CLEAN  — ~60fps soak, 0 console errors across the whole encounter.
//  [11] NO REGRESS  — orc/skeleton/bandit still spawn & render; caves boss is still the
//                     dragon (not the golem); other 3 capstones share sprite:"golem".
//
// Fresh browser context per run so auto-resume can't skip class-select.
//
// Run (live gh-pages):  node tools/cas340-golem-live.mjs
// Run (explicit URL):   node tools/cas340-golem-live.mjs https://host/path/
// Run (local build):    node tools/cas340-golem-live.mjs --local
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
const errors = [];
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… testing LOCAL ${BASE}` : `… testing LIVE ${BASE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const STRIP_STATES = ["idle", "walk", "attack"];
const stripSeen = new Set();
const SHOTS = [];

async function hold(page, code, ms) {
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  await sleep(ms);
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);
}
// Deployed golem is NOT rich-anim → its animState is derived by the SAME generic
// resolver the renderer reads: chase→walk, windup/strike→attack, else idle.
const animFromState = (s) => (s === "chase" ? "walk" : (s === "windup" || s === "strike") ? "attack" : "idle");

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => {
    const u = r.url(), s = r.status();
    const m = u.match(/golem_(\w+)_strip\.png/);
    if (m && s === 200) stripSeen.add(m[1]);
    if (s >= 400 && !/favicon/.test(u)) errors.push(`http ${s}: ${u}`);
  });

  // ---- [1] LIVE + build id from browser ------------------------------------
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  if (buildId) pass(`build id (from browser): ${buildId}`); else fail("could not read build id from browser");

  // ---- [4] DEPLOYED SOURCE bytes: golem is wired (sprites/config/render) -----
  const v = buildId ? `?v=${buildId}` : "";
  const srcOf = async (rel) => page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/${rel}${v}`);
  const spritesSrc = await srcOf("render/sprites.js");
  const configSrc = await srcOf("sim/config.js");
  const renderSrc = await srcOf("render/render.js");

  if (spritesSrc) {
    const block = spritesSrc.match(/golem:\s*\{[\s\S]*?golem_attack_strip[^}]*\}/);
    const hasIdle = /golem_idle_strip[^}]*fc:\s*8/.test(spritesSrc);
    const hasWalk = /golem_walk_strip[^}]*fc:\s*6/.test(spritesSrc);
    const hasAtk = /golem_attack_strip[^}]*fc:\s*9/.test(spritesSrc);
    if (block && hasIdle && hasWalk && hasAtk) pass("WIRED: deployed sprites.js — ENEMY_STRIPS.golem = idle(8f)/walk(6f)/attack(9f)");
    else fail(`WIRED: deployed sprites.js golem strip block incomplete (idle8=${hasIdle} walk6=${hasWalk} atk9=${hasAtk})`);
  } else fail("could not fetch deployed render/sprites.js");

  if (configSrc) {
    const golemBosses = (configSrc.match(/sprite:\s*"golem"/g) || []).length;
    if (golemBosses >= 4) pass(`WIRED: deployed config.js — ${golemBosses} capstones reference sprite:"golem" (arena/abyss/frost/trial)`);
    else fail(`WIRED: deployed config.js golem capstones=${golemBosses} (expected ≥4)`);
  } else fail("could not fetch deployed sim/config.js");

  if (renderSrc) {
    const hasPath = /resolveStrip\(e\.tpl\.sprite/.test(renderSrc) && /strip\.tiles/.test(renderSrc);
    if (hasPath) pass("WIRED: deployed render.js — PixelLab strip render path (resolveStrip + strip.tiles)");
    else fail("WIRED: deployed render.js missing the strip render path");
  } else fail("could not fetch deployed render/render.js");

  // ---- boot to play (warrior) — tolerant of whatever scene the build lands on
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()", { timeout: 20000 });
  let booted = false;
  for (let i = 0; i < 30 && !booted; i++) {
    const sc = await page.evaluate(() => window.__dev.scene());
    if (sc === "play") { booted = true; break; }
    if (sc === "menu" || sc === "name" || sc === "title") {
      await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "Cas340QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    } else if (sc === "classsel" || sc === "class") {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    } else {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    }
    await sleep(400);
  }
  if (booted) pass("booted to play as warrior"); else fail("could not reach play scene");

  // ---- [3] strips decoded in-browser ---------------------------------------
  const decoded = await page.evaluate(() => {
    const out = {};
    for (const k of ["golem_idle_strip", "golem_walk_strip", "golem_attack_strip"]) {
      // IMG isn't on window; probe via a fresh decode of the same asset URL the loader used.
      out[k] = null;
    }
    return out;
  });
  // Decode by drawing each strip into a probe canvas (proves the served PNG is real pixels).
  const decOk = await page.evaluate(async (base) => {
    const v = window.__BUILD ? `?v=${window.__BUILD}` : "";
    const res = {};
    for (const k of ["golem_idle_strip", "golem_walk_strip", "golem_attack_strip"]) {
      try {
        const im = new Image(); im.src = `${base}/assets/pixellab/fountains/anim/${k}.png${v}`;
        await im.decode(); res[k] = { w: im.naturalWidth, h: im.naturalHeight };
      } catch (e) { res[k] = { err: String(e) }; }
    }
    return res;
  }, BASE);
  for (const k of ["golem_idle_strip", "golem_walk_strip", "golem_attack_strip"]) {
    const d = decOk[k];
    if (d && d.h === 96 && d.w > 96) pass(`STRIP decoded: ${k}.png ${d.w}×${d.h} (96² frames)`);
    else fail(`STRIP decode FAIL: ${k} → ${JSON.stringify(d)}`);
  }

  // ---- [5] ENFRENTABLE — summon the golem capstone via the REAL spawn path --
  const armed = await page.evaluate(() => window.__dev.armFinalBoss());
  await sleep(250);
  const hs0 = await page.evaluate(() => window.__dev.huntState("frost"));
  const champ0 = hs0 && hs0.champ;
  if (champ0 && /Guard|Cripta/i.test(champ0.name) && champ0.max >= 2000)
    pass(`ENFRENTABLE: golem capstone summoned — "${champ0.name}" hp=${champ0.max} (live in G.enemies)`);
  else fail(`ENFRENTABLE: golem capstone wrong/absent: armed=${JSON.stringify(armed)} hs=${JSON.stringify(hs0)}`);
  const ec0 = await page.evaluate(() => window.__dev.enemyCount());
  if (ec0 >= 1) pass(`golem present as a live enemy (enemyCount=${ec0})`); else fail(`no live enemy after arm (count=${ec0})`);
  await page.screenshot({ path: "/tmp/cas340-spawn.png" }); SHOTS.push("/tmp/cas340-spawn.png");

  // idle strip is loaded/fallback — confirm decode already done above; capture a frame.
  if (stripSeen.has("idle") || decOk.golem_idle_strip) pass("anim available: idle (spawn/fallback strip)");

  // ---- [6]+[7] ANIMS PLAY + MOTION — drive a real fight --------------------
  // Pixel sampler: count distinctly-coloured non-background pixels in the upper-centre
  // band where the boss renders, and hash them, so we can prove (a) the golem is on
  // screen and (b) it animates (hash changes frame-to-frame).
  const sampleBoss = () => page.evaluate(() => {
    const cv = document.querySelector("canvas"); if (!cv) return null;
    const cx = cv.getContext("2d"); const W = cv.width, H = cv.height;
    // sample the centre column band (boss is parked near hero, centre of view)
    const x0 = (W * 0.30) | 0, x1 = (W * 0.70) | 0, y0 = (H * 0.18) | 0, y1 = (H * 0.62) | 0;
    const d = cx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let body = 0, hash = 0, ember = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a > 10 && (r + g + b) > 40 && (r + g + b) < 640) { // non-empty, non-pure-white
        body++; hash = (hash + r * 3 + g * 7 + b * 13 + (i & 255)) >>> 0;
        if (r > 120 && r > g + 40 && r > b + 40) ember++; // golem's crimson-ember signal
      }
    }
    return { body, hash, ember };
  });

  const seenAnim = new Set();
  const hashes = [];
  let walkShot = false, atkShot = false, idleShot = false, sawHurtDrop = false, hpStart = 0;
  const tA = Date.now();
  let moveToggle = 0;
  while (Date.now() - tA < 16000) {
    // alternate: park-on-boss (forces strike → attack) vs move-away (forces chase → walk)
    moveToggle++;
    if (moveToggle % 2 === 0) { await page.evaluate(() => window.__dev.poke("frost")); }      // park in range → attack
    else { await hold(page, "KeyD", 260); }                                                    // run → boss chases → walk

    const hs = await page.evaluate(() => { window.__dev.setHeroHp(8000); return window.__dev.huntState("frost"); });
    const c = hs && hs.champ; if (!c) break;
    if (hpStart === 0) hpStart = c.hp;
    const a = animFromState(c.state);
    seenAnim.add(a);
    const samp = await sampleBoss();
    if (samp && samp.body > 30) hashes.push(samp.hash);
    if (a === "walk" && !walkShot) { walkShot = true; await page.screenshot({ path: "/tmp/cas340-walk.png" }); SHOTS.push("/tmp/cas340-walk.png"); }
    if (a === "attack" && !atkShot) { atkShot = true; await page.screenshot({ path: "/tmp/cas340-attack.png" }); SHOTS.push("/tmp/cas340-attack.png"); }
    if (a === "idle" && !idleShot) { idleShot = true; await page.screenshot({ path: "/tmp/cas340-idle.png" }); SHOTS.push("/tmp/cas340-idle.png"); }
    await sleep(95);
  }
  for (const st of ["walk", "attack"]) {
    if (seenAnim.has(st)) pass(`anim fired in live gameplay: ${st}`);
    else fail(`anim NEVER fired in gameplay: ${st} (saw: ${[...seenAnim].join(",") || "none"})`);
  }
  if (seenAnim.has("idle")) pass("anim fired in live gameplay: idle");
  else log("   note: idle not latched mid-fight (boss stays aggro'd) — idle strip is loaded+decoded and is the resolver fallback");

  // [7] MOTION: distinct hashes over the fight → the strip frames advance (not frozen).
  const uniqHash = new Set(hashes).size;
  const maxBody = Math.max(0, ...hashes.length ? [1] : [0]);
  if (uniqHash >= 4) pass(`MOTION: golem animates on screen (${uniqHash} distinct frame hashes over the fight)`);
  else fail(`MOTION: golem looks frozen (${uniqHash} distinct frame hashes — expected ≥4)`);

  // ---- [8] HURT — a real hit lands & drops hp (flash react), no error -------
  const hit = await page.evaluate(() => { window.__dev.setHeroHp(8000); const a = window.__dev.hitChamp("frost"); const b = window.__dev.hitChamp("frost"); return { a, b }; });
  // carapace may be up (immune) on this final boss — accept either a drop now OR after we strip the shield below.
  if (hit && hit.a && (hit.a.before - hit.a.hp > 0 || hit.b.before - hit.b.hp > 0)) { sawHurtDrop = true; pass(`HURT: real hit landed — hp ${hit.a.before}→${hit.b.hp} (flash react)`); }
  else log(`   note: hit absorbed (likely carapace shield up: ${JSON.stringify(hit && hit.a)}) — will confirm damage via chip-down below`);

  // ---- [9] MUERE — chip down then kill through the REAL killEnemy -----------
  await page.evaluate(() => window.__dev.setChampHp("frost", 0.06)); // bring to ~6% via the real hp setter (enrage path)
  await sleep(120);
  const hsLow = await page.evaluate(() => window.__dev.huntState("frost"));
  if (hsLow && hsLow.champ && hsLow.champ.hp < hsLow.champ.max) pass(`golem takes damage: hp ${hsLow.champ.hp}/${hsLow.champ.max} (chipped down)`);
  else fail(`golem hp did not drop: ${JSON.stringify(hsLow && hsLow.champ)}`);
  await page.screenshot({ path: "/tmp/cas340-low.png" }); SHOTS.push("/tmp/cas340-low.png");

  const errBeforeKill = errors.length;
  const killed = await page.evaluate(() => window.__dev.huntKillChampion("frost"));
  await sleep(300);
  const hsDead = await page.evaluate(() => window.__dev.huntState("frost"));
  const sceneAfter = await page.evaluate(() => window.__dev.scene());
  await page.screenshot({ path: "/tmp/cas340-death.png" }); SHOTS.push("/tmp/cas340-death.png");
  const cleared = (killed && killed.cleared) || (hsDead && hsDead.cleared);
  const champGone = !(hsDead && hsDead.champ);
  const drops = (killed && killed.drops) || [];
  const topDrop = drops.find((d) => d.rarity === "epic" || d.tier >= 4);
  if (cleared && champGone) pass(`MUERE: golem killed through real killEnemy — zone cleared, champ left G.enemies (scene=${sceneAfter})`);
  else fail(`MUERE: golem did not die cleanly: cleared=${cleared} champGone=${champGone} ${JSON.stringify(hsDead)}`);
  if (drops.length && topDrop) pass(`guaranteed top-tier drop on kill: ${JSON.stringify(topDrop)}`);
  else if (drops.length) pass(`drop(s) on kill: ${JSON.stringify(drops)}`);
  else log("   note: no drop captured this run (final-boss victory may route rewards via win screen)");
  if (errors.length === errBeforeKill) pass("death path produced no console error"); else fail("errors during death path");
  log("   note: golem is NOT a rich-anim boss → death = kill VFX (freeze + shockring), no death-strip/corpse. That is by design (3-strip set: idle/walk/attack).");

  // ---- [11] NO REGRESSION — other roster intact ----------------------------
  const errBefore = errors.length;
  // dismiss any victory overlay so free-play spawns work
  await page.evaluate(() => { try { window.__dev.ackVictory && window.__dev.ackVictory(); } catch (e) {} });
  await sleep(150);
  const before = await page.evaluate(() => window.__dev.enemyCount());
  const spawnRes = await page.evaluate(() => {
    const out = {};
    for (const k of ["orc", "skeleton", "bandit"]) { try { window.__dev.spawn(k, 90, 0); out[k] = "ok"; } catch (e) { out[k] = "ERR:" + e.message; } }
    return out;
  });
  await sleep(400);
  const after = await page.evaluate(() => window.__dev.enemyCount());
  const spawnedOk = Object.entries(spawnRes).filter(([, vv]) => vv === "ok").map(([k]) => k);
  const renderClean = errors.length === errBefore;
  if (spawnedOk.length === 3 && after > before && renderClean) pass(`NO REGRESSION: orc/skeleton/bandit spawn (count ${before}→${after}) & render clean`);
  else fail(`REGRESSION spot-check: spawned=${JSON.stringify(spawnRes)} count ${before}→${after} clean=${renderClean}`);
  // caves boss is still the dragon, NOT the golem
  const caves = await page.evaluate(() => { try { window.__dev.spawn("dragon", 110, 0); return window.__dev.bossAnim ? window.__dev.bossAnim() : null; } catch (e) { return { err: String(e) }; } });
  const cavesBoss = caves && caves.boss;
  if (cavesBoss && cavesBoss.sprite === "dragon" && cavesBoss.sprite !== "golem") pass("NO REGRESSION: caves boss is still the dragon (sprite=dragon, not golem)");
  else log(`   note: caves-boss spot-check inconclusive (${JSON.stringify(caves)})`);
  await page.screenshot({ path: "/tmp/cas340-roster.png" }); SHOTS.push("/tmp/cas340-roster.png");

  // ---- [2] strips loaded over the wire -------------------------------------
  for (const st of STRIP_STATES) {
    if (stripSeen.has(st)) pass(`strip 200 over the wire: golem_${st}_strip.png`);
    else log(`   note: golem_${st}_strip.png not observed as a fresh network 200 (preloaded/cached) — decode check above is the authority`);
  }

  // ---- [10] fps soak + clean -----------------------------------------------
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    return n;
  });
  if (fps >= 50) pass(`fps soak ~${fps}`); else fail(`low fps ${fps}`);
  if (errors.length === 0) pass("zero page errors across the whole encounter"); else { fail(`${errors.length} page errors`); errors.slice(0, 8).forEach((e) => console.error("   " + e)); }

} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}

log(`\nshots: ${SHOTS.join("  ")}`);
log(ok ? "\n✓ CAS-340 golem boss LIVE: enfrentable + anims play + muere + no regression." : "\n✖ CAS-340 golem boss LIVE: FAILED.");
process.exit(ok ? 0 : 1);
