// CAS-2125 — QA OBSERVABLE: Tibia-style enemy nameplates (HP bar + name). Drives the REAL served
// render loop (render.js md5 == LIVE CDN, verified byte-id) desk+mobile, monkeypatching the 2D
// context so we RECORD what actually gets painted each frame:
//   • ctx.fillText  → every label drawn (text + fillStyle) ⇒ names present, outlined, rank-coloured
//   • ctx.fillRect  → every bar rect (fillStyle + width) ⇒ Tibia gradient by %HP + width == w*hpF
// Then it spawns normals (wolf/orc/skeleton), an elite pack (forceAmbush) and a golem boss, damages
// the boss through the HP bands, and asserts the observable ACs live. Serves the working tree, which
// is byte-identical to the served build (render 90eeaab5 / sim 336ee228 / config 9aeded55 == HEAD == CDN).
// Run: node tools/cas2125-nameplate-live-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Tibia HP-band palette (render.js hpTibia): verde>60% → amarillo 30-60% → naranja 12-30% → rojo<12%
const PAL = { green:"#4fd651", yellow:"#d8d43e", orange:"#e07f2a", red:"#d63a2a" };
const RANK = { normal:"#f2f4f6", elite:"#ffd84a", boss:"#ff7a3a" };
const norm = (s) => String(s||"").toLowerCase().replace(/\s+/g,"");

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }

async function bootToPlay(page, srv) {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    // Record painted primitives during capture windows (render-only observability).
    window.__cap = { on:false, texts:[], rects:[] };
    const P = CanvasRenderingContext2D.prototype;
    const ft = P.fillText, fr = P.fillRect;
    P.fillText = function (t, x, y) {
      if (window.__cap && window.__cap.on) { try { window.__cap.texts.push({ t:String(t), fill:String(this.fillStyle), x:Math.round(x), y:Math.round(y) }); } catch (e) {} }
      return ft.apply(this, arguments);
    };
    P.fillRect = function (x, y, w, h) {
      if (window.__cap && window.__cap.on) { try { window.__cap.rects.push({ fill:String(this.fillStyle), x:Math.round(x), y:Math.round(y), w:Math.round(w*100)/100, h:Math.round(h*100)/100, cy:Math.round(y) }); } catch (e) {} }
      return fr.apply(this, arguments);
    };
    // rAF fps sampler
    window.__fps = { last:0, samples:[] };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      return raf(function (ts) {
        if (window.__fps.last) { const dt = ts - window.__fps.last; if (dt > 0 && dt < 500) window.__fps.samples.push(dt); }
        window.__fps.last = ts;
        return cb(ts);
      });
    };
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const n=document.getElementById("nameInput"); if(n){ n.value="QA"; n.blur(); } window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 6000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (let i=0;i<3;i++){ const sc=await page.evaluate(()=>window.__dev.scene()); if(sc==="play")break;
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}))); await wait(200); }
  for (let i=0;i<5;i++){ const sc=await page.evaluate(()=>{try{return window.__dev.scene();}catch(e){return"?";}}); if(sc==="play")break;
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true}))); await wait(200); }
  return page.evaluate(()=>window.__dev.scene());
}

async function capture(page, ms=150) {
  await page.evaluate(()=>{ window.__cap.texts=[]; window.__cap.rects=[]; window.__cap.on=true; });
  await wait(ms);
  return page.evaluate(()=>{ window.__cap.on=false; return { texts:window.__cap.texts.slice(), rects:window.__cap.rects.slice() }; });
}
// unique label → the non-black (coloured) fill it was painted with + whether a black outline pass exists
function labelColors(texts) {
  const m = {};
  for (const t of texts) {
    const k = t.t;
    if (!m[k]) m[k] = { black:false, colors:new Set() };
    const f = norm(t.fill);
    if (f==="#000000"||f==="#000"||f==="rgb(0,0,0)") m[k].black = true; else m[k].colors.add(t.fill);
  }
  return m;
}
// HP-band fills present among bar rects, + the widest such rect (the boss/widest bar)
function barStats(rects) {
  const palVals = Object.values(PAL);
  const hpRects = rects.filter(r => palVals.includes(norm(r.fill)) || palVals.includes(r.fill));
  let widest = 0, bands = new Set();
  for (const r of hpRects) { widest = Math.max(widest, r.w); for (const [b,v] of Object.entries(PAL)) if (norm(r.fill)===v) bands.add(b); }
  return { count:hpRects.length, widest, bands:[...bands], maxW:widest };
}
// Isolate the BOSS HP-bar fill: unique by height hh=7 (normal=4, elite=5, special/champ=6, boss=7).
// Returns the boss fill {w, band} for this capture (widest h≈7 PAL rect across the sampled frames).
function bossBar(rects) {
  const bandOf = (f)=>{ for (const [b,v] of Object.entries(PAL)) if (norm(f)===v) return b; return null; };
  const boss = rects.filter(r => Math.abs(r.h-7) < 0.6 && bandOf(r.fill));
  if (!boss.length) return { w:0, band:null, n:0 };
  // take the widest sample (avoids any partial-frame artefacts)
  const top = boss.reduce((a,b)=> b.w>a.w?b:a);
  return { w:top.w, band:bandOf(top.fill), n:boss.length };
}

async function fpsMeasure(page, ms=1000) {
  await page.evaluate(()=>{ window.__fps.samples=[]; window.__fps.last=0; });
  await wait(ms);
  return page.evaluate(()=>{ const s=window.__fps.samples; if(!s.length)return 0; const avg=s.reduce((a,b)=>a+b,0)/s.length; return Math.round((1000/avg)*10)/10; });
}

async function runViewport(browser, srv, vp, tag) {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message.slice(0,160)));
  await page.setViewport(vp);
  const scene = await bootToPlay(page, srv);
  const R = { tag, scene, errs, ac:{} };
  if (scene !== "play") { R.fatal = "did not reach play scene ("+scene+")"; await page.close(); return R; }

  // ---- spawn spread: normals + elite pack + boss ----
  await page.evaluate(() => { __dev.spawn("wolf",-70,20); __dev.spawn("orc",70,10); __dev.spawn("skeleton",-10,60); __dev.spawn("golem",0,-80); });
  const ambush = await page.evaluate(() => { try { return __dev.forceAmbush(); } catch(e){ return {err:String(e)}; } });
  await wait(400);
  R.ambush = ambush;
  R.enemyCount = await page.evaluate(()=>__dev.enemyCount());

  // ---- AC0: names present (outlined) + rank colours; AC2 anchoring (name y above bar y) ----
  const cap0 = await capture(page, 180);
  const lc = labelColors(cap0.texts);
  const names = Object.keys(lc);
  const hasName = (n)=>names.some(k => norm(k).includes(norm(n)));
  const colorOf = (n)=>{ const k=names.find(x=>norm(x).includes(norm(n))); return k?[...lc[k].colors]:[]; };
  const outlinedOf = (n)=>{ const k=names.find(x=>norm(x).includes(norm(n))); return k?lc[k].black:false; };
  // rank is authoritative by COLOUR (render.js paints name in rank colour). elite label = ⚔ + a mob
  // name (no digits ⇒ excludes the "⚔ Maestría 0 0/3" HUD string), painted in RANK.elite yellow.
  const colouredWith = (hex)=> names.filter(k => [...lc[k].colors].map(norm).includes(hex));
  R.ac.AC0 = {
    normalsNamed: ["Lobo","Orco","Esqueleto"].map(n=>({ n, present:hasName(n), colors:colorOf(n), outlined:outlinedOf(n) })),
    bossNamed: colouredWith(RANK.boss),                                             // labels painted orange-red ⇒ boss rank
    eliteNamed: colouredWith(RANK.elite).filter(k=>/^⚔ /.test(k) && !/[0-9]/.test(k)), // ⚔ + mob name, yellow
    allLabels: names.slice(0,24),
  };
  R.ac.AC0.pass = ["Lobo","Orco","Esqueleto"].every(n => hasName(n) && outlinedOf(n) && colorOf(n).map(norm).includes(RANK.normal))
    && R.ac.AC0.bossNamed.length>0
    && R.ac.AC0.eliteNamed.length>0;

  // AC2: nameplate anchored to the TOP of the sprite. Coords here are WORLD-space (drawn under the
  // camera translate/scale ⇒ bars & names pan/zoom WITH the sprites automatically). Prove per-entity
  // anchoring: pair the boss NAME (centre x, painted RANK.boss) with its BAR fill (left = x-w/2) and
  // assert the name sits a small, consistent gap ABOVE the bar (name.y < bar.y, gap in px range).
  const bossNameT = cap0.texts.find(t=>norm(t.fill)===RANK.boss && /GÓLEM|Coloso|Tirano|Guardián|Avatar/i.test(t.t));
  const bossFillR = cap0.rects.filter(r=>Math.abs(r.h-7)<0.6 && Object.values(PAL).includes(norm(r.fill)))
    .sort((a,b)=>b.w-a.w)[0]; // widest h=7 PAL rect = boss fill at ~full
  let anchor = null;
  if (bossNameT && bossFillR) {
    const barCenterX = bossFillR.x + 66/2;                 // fill left = x-w/2 ⇒ centre = x + w/2
    anchor = { nameX:bossNameT.x, barCenterX:Math.round(barCenterX), dx:Math.round(bossNameT.x-barCenterX),
      nameY:bossNameT.y, barY:bossFillR.y, gap:bossFillR.y-bossNameT.y };
  }
  // also: EVERY on-screen mob is named (AC0/AC2 legibility with many mobs) — count named vs bars
  const namedCount = names.filter(k=>!/^[0-9!:]/.test(k) && k.length>1).length;
  R.ac.AC2 = { anchor, namedLabels:namedCount,
    nameAboveBar: !!(anchor && anchor.gap>0 && anchor.gap<=24),
    nameCentredOnBar: !!(anchor && Math.abs(anchor.dx)<=6) };
  R.ac.AC2.pass = R.ac.AC2.nameAboveBar && R.ac.AC2.nameCentredOnBar;

  // ---- AC1: damage boss through the bands; observe fill colour transition + width shrink LIVE ----
  const first = await page.evaluate(()=>__dev.hitBoss(1));
  const approxMax = (first.hpAfter||640) + 1;
  const sweep = [];
  const capB0 = await capture(page, 120); sweep.push({ stage:"~100%", boss:bossBar(capB0.rects) });
  async function toFrac(f){ let guard=0; while(guard++<200){ const r=await page.evaluate(()=>__dev.hitBoss(18)); if(r.dead||r.hpAfter/approxMax<=f) break; } }
  await toFrac(0.55); const capB1 = await capture(page,120); sweep.push({ stage:"~50%", boss:bossBar(capB1.rects) });
  await toFrac(0.25); const capB2 = await capture(page,120); sweep.push({ stage:"~20%", boss:bossBar(capB2.rects) });
  await toFrac(0.08); const capB3 = await capture(page,120); sweep.push({ stage:"~8%", boss:bossBar(capB3.rects) });
  R.ac.AC1 = { sweep };
  const bandSeq = sweep.map(s=>s.boss.band);
  const sawGreen  = sweep[0].boss.band==="green";
  const sawYellow = bandSeq.includes("yellow");
  const sawOrange = bandSeq.includes("orange");
  const sawRed    = bandSeq.includes("red");
  const widthShrank = sweep[0].boss.w > sweep[sweep.length-1].boss.w && sweep[sweep.length-1].boss.w > 0;
  // band order must be non-brightening as HP drops (green→yellow→orange→red)
  const ORDER = ["green","yellow","orange","red"];
  const idxs = bandSeq.map(b=>ORDER.indexOf(b));
  const monotoneBand = idxs.every((v,i)=> i===0 || v>=idxs[i-1]);
  R.ac.AC1.pass = sawGreen && sawYellow && sawOrange && sawRed && widthShrank && monotoneBand;
  R.ac.AC1.summary = { bandSeq, w0:sweep[0].boss.w, wEnd:sweep[sweep.length-1].boss.w, sawGreen, sawYellow, sawOrange, sawRed, widthShrank, monotoneBand };

  // ---- AC3: boss bar distinctive (unique tall h=7 track) vs normals (h=4); no duplicate boss bar ----
  // boss track/border rects: NAMEPLATE.track "rgba(12,14,18,0.72)" at h=7 (fill), h+2=9 (border).
  const cap3 = await capture(page, 100);
  const trackN = norm("rgba(12,14,18,0.72)");
  const bossTracks = cap3.rects.filter(r => Math.abs(r.h-7) < 0.6 && norm(r.fill)===trackN); // boss track (one per frame, boss drifts)
  const normalTracks = cap3.rects.filter(r => Math.abs(r.h-4) < 0.6 && norm(r.fill)===trackN); // normal basics h=4
  // cluster boss tracks by proximity (boss AI drifts a few px/frame ⇒ one moving boss, not a dup bar)
  const clusters = [];
  for (const r of bossTracks) { let c = clusters.find(k => Math.abs(k.x - r.x) < 60 && Math.abs(k.y - r.y) < 30); if (!c) clusters.push({ x:r.x, y:r.y }); }
  R.ac.AC3 = {
    bossTrackTall7: bossTracks.length>0,           // boss owns the unique TALL (h=7) bar
    normalTrackShort4: normalTracks.length>0,      // normals get the short (h=4) bar ⇒ distinctive
    bossBarClusters: clusters.length,              // must be 1 ⇒ single boss bar, no duplicated legacy bar
    eliteMarkerPresent: R.ac.AC0.eliteNamed.length>0,
    bossLabelColoured: cap0.texts.some(t=>norm(t.fill)===RANK.boss && /GÓLEM|Coloso|Tirano|Guardián|Avatar/i.test(t.t)),
  };
  R.ac.AC3.pass = R.ac.AC3.bossTrackTall7 && R.ac.AC3.normalTrackShort4 && R.ac.AC3.bossBarClusters===1 && R.ac.AC3.eliteMarkerPresent && R.ac.AC3.bossLabelColoured;

  // ---- AC5: fps with the full mob cluster on screen ----
  R.ac.AC5 = { fps: await fpsMeasure(page, 1000) };
  R.ac.AC5.pass = R.ac.AC5.fps >= 55;

  // screenshot evidence
  try { await page.screenshot({ path: `tools/cas2125-nameplate-${tag}.png` }); } catch(e){}
  R.pageErrs = errs;
  await page.close();
  return R;
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const results = {};
try {
  results.desktop = await runViewport(browser, srv, { width:960, height:600, deviceScaleFactor:2 }, "desk");
  results.mobile  = await runViewport(browser, srv, { width:414, height:820, deviceScaleFactor:2, isMobile:true, hasTouch:true }, "mob");
} finally { await browser.close(); await srv.close(); }

function verdict(R) {
  const acs = ["AC0","AC1","AC2","AC3","AC5"];
  const pass = acs.every(a => R.ac[a] && R.ac[a].pass) && (!R.fatal);
  return { tag:R.tag, pass, scene:R.scene, enemies:R.enemyCount, fatal:R.fatal||null,
    per:Object.fromEntries(acs.map(a=>[a, R.ac[a]?R.ac[a].pass:null])), errs:(R.pageErrs||[]).length };
}
const out = { desktop:verdict(results.desktop), mobile:verdict(results.mobile) };
console.log("\n==== CAS-2125 OBSERVABLE VERDICT ====");
console.log(JSON.stringify(out, null, 2));
console.log("\n---- desktop detail ----");
console.log(JSON.stringify(results.desktop.ac, null, 1).slice(0, 4000));
console.log("\n---- mobile AC1 sweep ----");
console.log(JSON.stringify(results.mobile.ac.AC1 && results.mobile.ac.AC1.summary));
const allPass = out.desktop.pass && out.mobile.pass;
console.log("\nALLPASS=", allPass);
process.exit(allPass ? 0 : 1);
