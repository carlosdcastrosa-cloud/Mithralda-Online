// tools/cas1702-editor-smoke.mjs — CAS-1702 BUILD verification (local, headless).
// Proves, against a local static server (HEAD working tree), that:
//   1. editor.html boots with NO console/page errors and exposes a valid MapDoc.
//   2. The editor round-trips: docToMapDoc(docFromMapDoc(seed)) == seed (byte-stable JSON).
//   3. An edited MapDoc written to localStorage is PLAYED by index.html?map=local:
//      the sim builds world.fromMapDoc, the hub is the town slot, and the edited
//      zone is spawnable (mapInfo.spawners include the edited slot).
//   4. index.html WITHOUT ?map is untouched (fromMapDoc=false) — additive/RNG-neutral.
// This is the smallest check that proves the feature; the live QA gate (CAS-1704)
// repeats it against gh-pages with md5 live==HEAD.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function newPage(){
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  return { p, errs };
}

try {
  // ---- 1) editor boots ----
  {
    const { p, errs } = await newPage();
    await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });
    const info = await p.evaluate(() => {
      const d = window.__editor.doc;
      return { w:d.w, h:d.h, zones:d.zones.length, slots:d.zones.map(z=>z.slot),
        npcs:d.entities.npcs.length, chests:d.entities.chests.length, props:d.entities.props.length,
        canvasDrawn: document.getElementById("c").width>0 };
    });
    A(errs.length===0, `editor boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(info.zones>=5, `editor seed has ${info.zones} zones (>=5)`);
    A(info.slots.includes("town"), "editor seed has a town/hub slot");
    A(info.slots.includes("forest"), "editor seed has a forest spoke");
    A(info.npcs>=1 && info.props>=1, `editor seed populated (npcs=${info.npcs}, props=${info.props})`);
    A(info.canvasDrawn, "editor canvas sized/drawn");

    // ---- 2) round-trip stability ----
    const rt = await p.evaluate(() => {
      const seed = window.__editor.makeSeedMapDoc();
      const back = window.__editor.docToMapDoc(); // current doc == seed on first boot
      // build a fresh doc from seed, convert back, compare JSON
      const d2 = window.__editor.docFromMapDoc(seed);
      window.__editor.setDoc(d2);
      const md = window.__editor.docToMapDoc();
      return { stable: JSON.stringify(md.terrain.rle)===JSON.stringify(seed.terrain.rle)
        && JSON.stringify(md.zones)===JSON.stringify(seed.zones)
        && md.entities.npcs.length===seed.entities.npcs.length };
    });
    A(rt.stable, "editor MapDoc round-trip stable (rle+zones+npcs)");

    // ---- write an EDITED map to localStorage (rename a zone + move hub) to play ----
    await p.evaluate(() => {
      const d = window.__editor.docFromMapDoc(window.__editor.makeSeedMapDoc());
      d.name = "QA Editado";
      const fz = d.zones.find(z=>z.slot==="forest"); if(fz) fz.name = "Claro QA";
      window.__editor.setDoc(d);
      localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(window.__editor.docToMapDoc()));
    });
    await p.close();
  }

  // ---- 3) game PLAYS the edited map via ?map=local ----
  // The editor page (step 1) already wrote the edited MapDoc to localStorage; a new page in the
  // SAME browser/origin shares it, so index.html?map=local reads exactly what the editor exported.
  {
    const { p, errs } = await newPage();
    await p.goto(`${srv.url}/index.html?map=local&dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(errs.length===0, `game(?map=local) boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(mi.fromMapDoc===true, "game built world FROM MapDoc");
    A(mi.name==="QA Editado", `game loaded edited map name ("${mi.name}")`);
    A(!!mi.zones.town, "loaded world has a town/hub zone");
    A(!!mi.zones.forest, "loaded world has the edited forest zone");
    A(mi.spawners.some(s=>s.zone==="forest"), "edited forest zone is spawnable (has a spawner)");
    // hero spawns at the hub → its zone is town
    await p.evaluate(() => { const ni=document.getElementById("nameInput"); if(ni){ni.value="QAbot";ni.blur();}
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
    await p.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
    await p.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
    await p.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
    if (await p.evaluate(()=>window.__dev.scene())==="abilitysel")
      await p.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));
    await p.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
    const heroZone = await p.evaluate(() => window.__dev.mapInfo().heroZone);
    A(heroZone==="town", `hero spawns in the hub (heroZone=${heroZone})`);
    await p.close();
  }

  // ---- 4) default world (no ?map) is untouched ----
  // Clean first-time visitor: wipe any prior save/mapdoc so we exercise the true default path
  // (a save from the 96×72 MapDoc run would otherwise auto-resume into the default world).
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/index.html?dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(errs.length===0, `game(no ?map) boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(mi.fromMapDoc===false, "default world is NOT from a MapDoc (additive/untouched)");
    await p.close();
  }
} catch (e) {
  bad.push("EXCEPTION: " + (e && e.stack || e));
} finally {
  await browser.close(); await srv.close();
}

console.log("\n=== CAS-1702 editor build smoke ===");
for (const m of ok)  console.log("  PASS  " + m);
for (const m of bad) console.log("  FAIL  " + m);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
