// ===========================================================================
// MITHRALDA — El Reino Pixelado  (single-player ARPG, HTML5 canvas, no build)
//
// game.js is the THIN ORCHESTRATOR. It wires the deterministic simulation core
// to the renderer, audio sink and input controller, then exposes the tiny
// surface index.html drives (update / render / onResize / onFocusLost / devInfo).
//
// Module boundary (Stage-2-ready):
//   sim/    — authoritative state + update(dt) + collision + RNG. NO ctx/DOM.
//   render/ — all drawing. Reads sim state + interpolation alpha, mutates nothing.
//   input.js / audio.js / view.js — the client I/O the sim consumes via injection.
//
// A Stage-2 networking layer wraps sim/ by feeding intents per tick and ignoring
// render/audio/view — no rewrite of the gameplay logic required.
// ===========================================================================
import { configure as configureSim, G, update as simUpdate, dev as simDev } from "./sim/sim.js";
import { audio } from "./audio.js";
import { view } from "./view.js";
import { io, initInput, syncMenuDom, positionNameInput } from "./input.js";
import { createRenderer } from "./render/render.js";
import { loadAllAssets } from "./render/sprites.js";

export function createGame(canvas, ctx, getView){
  // wire the simulation's injected dependencies (input intents, audio, viewport)
  configureSim({ io, audio, view });
  initInput(canvas);
  const renderer = createRenderer(ctx);

  // one fixed simulation step + the menu DOM sync (the only DOM the loop touches)
  function update(dtMs){ simUpdate(dtMs); syncMenuDom(); }
  function render(alpha){ renderer.render(alpha); }
  function onResize(w,h){ view.VW=w; view.VH=h; if(G.scene==="menu") positionNameInput(); }
  function onFocusLost(){ if(G.scene==="play") G.scene="pause"; }
  function devInfo(){ return "ent:"+G.enemies.length+" fx:"+G.fx.length+" scene:"+G.scene; }

  // boot
  loadAllAssets();
  if(typeof location!=="undefined" && location.search.indexOf("dev")>=0){
    window.__dev={ spawn:(type,dx,dy)=>simDev.spawn(type,dx,dy), tp:(tx,ty)=>simDev.tp(tx,ty),
      // introspection contract consumed by tools/smoke.mjs (read-only views of sim state)
      scene:()=>G.scene,
      hero:()=>G.hero?{cls:G.hero.cls,x:G.hero.x,y:G.hero.y}:null,
      // CAS-92: read-only hero animation state, used by tools/hero-anim-shot.mjs
      heroAnim:()=>G.hero?{state:G.hero.animState,rolling:!!G.hero.rolling,atk:G.hero.atkAnim>0}:null,
      enemyCount:()=>G.enemies.length,
      worldFingerprint:(seed)=>simDev.worldFingerprint(seed),
      // gear/progression contract consumed by tools/gear.mjs (CAS-29) — additive
      tpZone:(zone)=>simDev.tpZone(zone),
      seed:(n)=>simDev.seed(n),
      gear:()=>simDev.gear(),
      spawnKill:(type)=>simDev.spawnKill(type),
      pickup:()=>simDev.pickup(),
      bag:()=>simDev.bag(),
      equipBag:(i)=>simDev.equipBag(i),
      openInv:()=>simDev.openInv(),
      // zone-difficulty contract consumed by tools/hunt.mjs (CAS-73) — additive
      zoneTier:(zone,type)=>simDev.zoneTier(zone,type),
      // hunt-contract contract consumed by tools/hunt.mjs (CAS-63) — additive
      huntState:(zone)=>simDev.huntState(zone),
      huntKillChampion:(zone)=>simDev.huntKillChampion(zone),
      // capstone-boss contract consumed by tools/hunt.mjs (CAS-65) — additive
      setChampHp:(zone,frac)=>simDev.setChampHp(zone,frac),
      poke:(zone)=>simDev.poke(zone),
      enemyProj:()=>simDev.enemyProj(),
      // Champion telegraphed-slam contract consumed by tools/hunt.mjs (CAS-109) — additive
      forceSpecial:(zone)=>simDev.forceSpecial(zone),
      // spell-identity contract consumed by tools/spells.mjs (CAS-52) — additive
      setClass:(cls)=>simDev.setClass(cls),
      // per-class base-stat contract consumed by tools/classstats.mjs (CAS-100) — additive
      classStats:(cls)=>simDev.classStats(cls),
      cast:(i)=>simDev.cast(i),
      spellProbe:(cls)=>simDev.spellProbe(cls),
      dotProbe:()=>simDev.dotProbe() };
  }
  syncMenuDom(); positionNameInput();

  return { update, render, onResize, onFocusLost, devInfo };
}
