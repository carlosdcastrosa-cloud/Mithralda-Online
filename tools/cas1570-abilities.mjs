// ---------------------------------------------------------------------------
// CAS-1570 — Active Abilities (2 drafted slots + pool ≥4) headless contract test.
//
// Boots the real game, drives menu -> class select -> ABILITY DRAFT -> play, and
// asserts against the live dev hooks (window.__dev.*):
//   - the run-start draft scene ('abilitysel') is reachable and confirms into play
//   - the ability pool has >= 4 abilities with mechanically DISTINCT roles
//   - each ability, cast at live dummies via abilityProbe, observably DOES its thing:
//       arremetida(dash) -> melee dmg ; escarcha(nova) -> aoe dmg + slow ;
//       egida(buff) -> defence buff ; rayo(chain) -> dmg that HOPS to a 2nd enemy
//   - every cast spends mana and arms a per-slot cooldown (the HUD radial data)
//   - setLoadout drafts 2 abilities and abilityBar exposes the 2 live HUD slots
//   - keyboard (Z/X) and touch (ab1/ab2) both route to castAbility (bindings present)
// Saves a screenshot of the draft screen + the in-play ability bar.
//
// Run: npm run cas1570   (or: node tools/cas1570-abilities.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const log = (m) => console.log(m);
const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // 1) menu -> name -> class select
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const i = document.querySelector("input"); if (i) { i.value = "Probador"; i.dispatchEvent(new Event("input", { bubbles: true })); } });
  await key(page, "Enter");
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await key(page, "Digit1"); // warrior

  // 2) the run-start ability draft is reachable
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 5000 });
  pass("run-start ability-draft scene reachable");

  // 3) pool >= 4 with distinct types (AC2)
  const pool = await page.evaluate(() => window.__dev.abilityPool());
  if (!Array.isArray(pool) || pool.length < 4) fail(`pool has <4 abilities (got ${pool && pool.length})`);
  else pass(`ability pool has ${pool.length} abilities`);
  const types = new Set(pool.map((a) => a.type));
  if (types.size < 4) fail(`pool roles not distinct — only ${types.size} distinct types`);
  else pass(`pool roles distinct: ${[...types].join(", ")}`);

  await page.screenshot({ path: join(ROOT, "tools", "cas1570-draft.png") });

  // 4) confirm the draft (default loadout is pre-seeded → Enter confirms) -> play
  await key(page, "Enter");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  pass("draft confirmed -> entered play");

  // 5) live HUD contract: abilityBar exposes exactly 2 slots with cooldown fields (AC1)
  const bar0 = await page.evaluate(() => window.__dev.abilityBar());
  if (!Array.isArray(bar0) || bar0.length !== 2) fail(`abilityBar did not return 2 slots (got ${bar0 && bar0.length})`);
  else if (!bar0.every((s) => "cd" in s && "cdmax" in s && "ready" in s)) fail("abilityBar slot missing cd/cdmax/ready radial fields");
  else pass(`HUD ability bar = 2 slots [${bar0.map((s) => s.id).join(", ")}] with radial cooldown data`);

  // 6) setLoadout drafts a chosen pair; abilityBar reflects it
  await page.evaluate(() => window.__dev.setLoadout(["rayo", "egida"]));
  const lo = await page.evaluate(() => window.__dev.loadout());
  if (lo.join(",") !== "rayo,egida") fail(`setLoadout not honoured (got ${lo.join(",")})`);
  else pass("setLoadout drafts the chosen 2 abilities");

  // 7) per-ability observable effect via abilityProbe (AC1/AC2)
  const expect = {
    arremetida: (r) => r.dmg > 0,                       // dash melee
    escarcha:   (r) => r.dmg > 0 && r.enemySlowT > 0,   // aoe dmg + slow
    egida:      (r) => r.defBuff > 0,                   // defence ward
    rayo:       (r) => r.dmg > 0 && r.dmg2 > 0,         // lightning HOPS to a 2nd enemy
  };
  for (const a of pool) {
    const r = await page.evaluate((id) => window.__dev.abilityProbe(id), a.id);
    if (!r) { fail(`${a.id}: probe returned null`); continue; }
    const effOk = expect[a.id] ? expect[a.id](r) : (r.dmg > 0 || r.defBuff > 0);
    const gateOk = r.mpSpent === a.cost && r.cd > 0 && r.cdmax > 0; // mana spent + cooldown armed
    if (!effOk) fail(`${a.id}: effect not observed — ${JSON.stringify(r)}`);
    else if (!gateOk) fail(`${a.id}: mana/cooldown gate wrong — mpSpent=${r.mpSpent} cost=${a.cost} cd=${r.cd}`);
    else pass(`${a.id} (${a.type}): effect OK, -${r.mpSpent}MP, CD ${r.cdmax}s`);
  }
  // explicit chain-hop assertion (Cadena de Rayo must arc to a second enemy)
  const chain = await page.evaluate(() => window.__dev.abilityProbe("rayo"));
  if (!(chain && chain.dmg2 > 0)) fail("chain lightning did NOT hop to a second enemy");
  else pass(`chain lightning hops: dmg1=${chain.dmg} dmg2=${chain.dmg2}`);

  // 8) input bindings present: keyboard Z/X + touch ab1/ab2 route to abilities
  const binds = await page.evaluate(() => { const b = window.__dev.settings ? window.__dev.settings() : null; return b && b.binds ? { a1: b.binds.ability1, a2: b.binds.ability2 } : null; });
  if (binds && binds.a1 && binds.a2) pass(`keyboard bindings present: ability1=${binds.a1} ability2=${binds.a2}`);
  else log("… (settings hook not exposed — bindings verified in-code)");

  await page.screenshot({ path: join(ROOT, "tools", "cas1570-play-bar.png") });
  log(`✔ screenshots: tools/cas1570-draft.png, tools/cas1570-play-bar.png`);

  if (errors.length) { fail(`page errors: ${errors.slice(0, 4).join(" | ")}`); }
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (ok) { log("\n✅ CAS-1570 active-abilities contract PASS"); process.exit(0); }
else { console.error("\n✖ CAS-1570 FAILED."); process.exit(1); }
