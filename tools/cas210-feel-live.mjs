// CAS-210 — LIVE combat-feel probe against the backup host. Measures exactly
// what players get on the CDN: punisher `revenant` served + distinct timing,
// riposte payoff, hit-stop/shake/FX feel-state, 60fps, zero JS errors.
// Captures abyss combat frames so QA can score combat-feel vs FOUNTAINS.
// Run: node tools/cas210-feel-live.mjs
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (p, buf) => { writeFileSync(join(ROOT, "tools", p), buf); return p; };
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`${c ? "OK " : "XX "} ${m}`); };

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.bringToFront();
  const build = await page.evaluate(() => fetch("version.json", { cache: "no-store" }).then(r => r.json()).then(v => v.build).catch(() => "?"));
  console.log("LIVE build:", build);

  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
  await page.evaluate(() => { try { window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAfeel";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });

  // ---- 1. Punisher served live + distinct timing -------------------------
  const m = await page.evaluate(() => window.__dev.archMeta("revenant"));
  ok(m && m.arch === "punisher" && m.combo >= 2, `punisher revenant served live (arch=${m && m.arch}, combo ${m && m.combo})`);
  ok(m && m.comboWindup < m.windup, `combo winds up FASTER each swing (${m && m.windup}->${m && m.comboWindup})`);
  ok(m && m.punishRecover > m.recover, `long punish-recover read window (${m && m.punishRecover}s > ${m && m.recover}s)`);

  // ---- 2. Punisher surfaces in deep zones --------------------------------
  const pools = await page.evaluate(() => window.__dev.zonePools());
  const zonesWith = Object.keys(pools).filter((z) => pools[z].includes("revenant"));
  ok(zonesWith.length >= 1, `punisher wired into deep-zone pools: ${zonesWith.join(", ")}`);
  await page.evaluate(() => window.__dev.tpZone("abyss"));
  await wait(500);
  await page.evaluate(() => { try { for (let i = 0; i < 4; i++) window.__dev.spawn("revenant", (i - 1.5) * 70, -10 + (i % 2) * 30); } catch (e) {} });
  await wait(900);
  const cnt = await page.evaluate(() => window.__dev.enemyCount());
  ok(cnt >= 1, `revenant punishers populate the abyss (${cnt} mobs)`);
  save("cas210-feel-abyss.png", await page.screenshot());
  console.log("[SHOT] cas210-feel-abyss.png");

  // ---- 3. Hit-feel layer: swing produces shake / hit-stop / FX ------------
  await page.evaluate(() => window.__dev.juiceArena(10));
  await page.evaluate(() => { try { window.__dev.juiceSwing(); } catch (e) {} });
  await wait(50);
  const j1 = await page.evaluate(() => window.__dev.juiceState());
  await page.evaluate(() => { try { window.__dev.forceCritSwing(); } catch (e) {} });
  await wait(40);
  const jc = await page.evaluate(() => window.__dev.juiceState());
  save("cas210-feel-combat.png", await page.screenshot());
  console.log("[SHOT] cas210-feel-combat.png");
  const shake = Math.max(j1.shake || 0, jc.shake || 0);
  const hitstop = Math.max(j1.hitstop || 0, jc.hitstop || 0);
  const fx = Math.max(j1.fx || 0, jc.fx || 0, j1.floaters || 0, jc.floaters || 0);
  ok(shake > 0, `screen-shake present on impact (shake=${shake.toFixed(2)})`);
  ok(hitstop > 0, `hit-stop / freeze present on impact (hitstop=${hitstop})`);
  ok(fx > 0, `hit FX / floaters spawned (fx/floaters=${fx})`);

  // ---- 4. Riposte payoff served live -------------------------------------
  const armed = await page.evaluate(() => window.__dev.armRiposte());
  ok(armed > 1.0, `perfect-dodge arms riposte window (${armed}s)`);
  const base = await page.evaluate(() => window.__dev.hitProbe(false, 100));
  const counter = await page.evaluate(() => window.__dev.hitProbe(true, 100));
  const mult = counter && base ? (counter.dmg / base.dmg) : 0;
  ok(counter && counter.dmg > base.dmg * 2, `riposte counter crushes (base ${base && base.dmg} -> ${counter && counter.dmg}, x${mult.toFixed(2)})`);
  ok(counter && counter.riposteAfter === 0, `riposte window consumed after the counter (now ${counter && counter.riposteAfter})`);

  // ---- 5. Performance + cleanliness --------------------------------------
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); }); return n; });
  ok(fps >= 55, `holds 60fps during punisher combat (${fps} fps)`);
  ok(errors.length === 0, `zero page errors (${errors.length})`);
  if (errors.length) console.log(errors.slice(0, 4).join("\n"));

  console.log(`\nLIVE feel probe: ${pass} pass / ${fail} fail @ build ${build}`);
} finally {
  await browser.close();
}
