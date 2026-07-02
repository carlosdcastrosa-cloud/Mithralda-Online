// CAS-417 — icon wiring QA: spell-bar icons (2 classes), inventory slot icons, HUD doll
// chip icons, Q consumable flask, icon network audit (all 200), 60fps, 0 page errors.
// Usage: node tools/cas417-icons-qa.mjs [liveURL]   (no arg → serves the working tree)
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";
import fs from "node:fs";

const ARG = process.argv[2] || null;
let server = null, base = ARG ? ARG.replace(/\/$/, "") : null;
if (!base) { server = await startServer(); base = server.url; }
fs.mkdirSync("shots/cas417", { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const results = []; let fail = 0;
const gate = (name, ok, info = "") => { results.push(`${ok ? "PASS" : "FAIL"} ${name}  ${info}`); if (!ok) fail++; };

async function runClass(clsKey, digit, deep) {
  const ctx = await b.createBrowserContext(); // fresh ctx per class — shared-save gotcha (CAS-374)
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const icons = {};
  p.on("response", (r) => { const u = r.url(); if (u.includes("assets/ui/icons/")) icons[u.split("/").pop().split("?")[0]] = r.status(); });
  await p.setViewport({ width: 1366, height: 768, deviceScaleFactor: 2 });
  await p.goto(base + "/index.html?dev", { waitUntil: "load", timeout: 60000 });
  await p.waitForFunction("window.__hud && window.__dev", { timeout: 30000 });
  await p.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "QA417";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await p.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await p.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: String(d), bubbles: true })), digit);
  await p.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await wait(1500); // let the icon PNGs land

  await p.screenshot({ path: `shots/cas417/${clsKey}-spellbar.png`, clip: { x: 1366 / 2 - 240, y: 768 - 130, width: 480, height: 130 } });
  await p.screenshot({ path: `shots/cas417/${clsKey}-full.png` });

  const st = Object.entries(icons);
  gate(`${clsKey}: icon fetches all 200`, st.length > 0 && st.every(([, s]) => s === 200),
    `n=${st.length}${st.filter(([, s]) => s !== 200).map(([k, s]) => ` ${k}:${s}`).join("")}`);
  const sp = st.filter(([k]) => k.startsWith("spell_" + clsKey));
  gate(`${clsKey}: 4 class spell icons requested`, sp.length === 4, sp.map(([k]) => k).join(","));

  const chips = await p.evaluate(() => [...document.querySelectorAll("#hud .w-doll .slot img.sic")]
    .map((im) => ({ src: (im.getAttribute("src") || "").split("?")[0].split("/").pop(), ok: !!(im.complete && im.naturalWidth) })));
  gate(`${clsKey}: 3 doll chips carry loaded slot icons`, chips.length === 3 && chips.every((c) => c.ok && /^slot_/.test(c.src)), JSON.stringify(chips));

  if (deep) {
    // doll closeup in PLAY scene (the HUD rail hides behind the inventory's dark wash)
    const doll = await p.evaluate(() => { const c = document.querySelector("#hud .p-doll").getBoundingClientRect();
      return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    await p.screenshot({ path: `shots/cas417/${clsKey}-doll.png`, clip: { x: doll.x - 6, y: doll.y - 6, width: doll.w + 12, height: doll.h + 12 } });
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI", key: "i", bubbles: true })));
    await p.waitForFunction("window.__dev.scene()==='inventory'", { timeout: 8000 });
    await wait(400);
    await p.screenshot({ path: `shots/cas417/${clsKey}-inventory.png` });
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI", key: "i", bubbles: true })));
    await p.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  }

  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(n / 3); };
    requestAnimationFrame(tick); }));
  gate(`${clsKey}: fps>=55`, fps >= 55, "fps=" + Math.round(fps));
  gate(`${clsKey}: 0 page errors`, errs.length === 0, errs.slice(0, 3).join(" | "));
  await ctx.close();
}

await runClass("warrior", 1, true);
await runClass("mage", 3, false);
await b.close(); if (server) await server.close();
console.log(results.join("\n"));
console.log(fail ? `FAIL (${fail})` : "ALL GREEN");
process.exit(fail ? 1 : 0);
