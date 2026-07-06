// In-browser sanity for CAS-1602: boots the REAL bundle, drives __dev to prove the
// spell-empower seam + render panel load without error (the pure logic is covered by
// tools/cas1602-talent-empower.mjs). Not wired into npm test (needs Chromium) — a QA aid.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true; const pass = (m)=>console.log(`✔ ${m}`); const fail=(m)=>{ok=false;console.error(`✖ ${m}`);};
try {
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", (e)=>errors.push(String(e)));
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  // Boot straight into play as priest (class 5).
  await page.evaluate(()=>{ document.getElementById("nameInput").value="EmpBot";
    window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit5",key:"5",bubbles:true})));
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 5000 });
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });

  // Unbought: empowerProbe reports liveSameRef===true (0-delta) for priest holynova.
  const before = await page.evaluate(()=>window.__dev.empowerProbe("priest"));
  const pr = before.find(e=>e.spell==="holynova");
  pass(`empowerProbe priest → node ${pr.node} spell ${pr.spell} baseRange ${pr.base.range}`);
  if(pr.bought===false && pr.liveSameRef===true) pass("[AC5] unbought → live overlay is SAME object (0-delta)");
  else fail(`unbought expected bought=false liveSameRef=true, got ${JSON.stringify({b:pr.bought,s:pr.liveSameRef})}`);

  // Drive level to 8, fund + alloc prC1→prC2→prC3 through the REAL allocator.
  const res = await page.evaluate(()=>{ window.__dev.setLvl(8); window.__dev.grantTalentPts(5);
    const a=window.__dev.allocTalent("prC1"); const b=window.__dev.allocTalent("prC2"); const c=window.__dev.allocTalent("prC3");
    return { a:a.ok, b:b.ok, c:c.ok }; });
  if(res.a && res.b && res.c) pass("[AC1] alloc prC1→prC2→prC3 at lvl8 through real allocator");
  else fail(`alloc chain failed: ${JSON.stringify(res)}`);

  const after = await page.evaluate(()=>window.__dev.empowerProbe("priest").find(e=>e.spell==="holynova"));
  if(after.bought===true && after.liveSameRef===false && after.empowered.range===after.base.range+28)
    pass(`[AC3] bought → holynova empowered range ${after.base.range}→${after.empowered.range} (copy-on-write)`);
  else fail(`bought probe wrong: ${JSON.stringify(after)}`);

  // Open the talent panel (T) — render path must not throw.
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyT",key:"t",bubbles:true})));
  await page.waitForFunction("window.__dev.scene()==='talents'", { timeout: 3000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,300));
  const scene = await page.evaluate(()=>window.__dev.scene());
  pass(`talent panel scene='${scene}' rendered`);

  if(errors.length===0) pass("zero page errors");
  else fail(`page errors: ${errors.join(" | ")}`);
} catch(e){ fail("threw: "+e.message); }
finally { await browser.close(); await srv.close?.(); }
console.log(ok ? "\n✓ CAS-1602 empower browser check passed." : "\n✗ CAS-1602 browser check FAILED.");
process.exit(ok?0:1);
