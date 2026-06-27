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
      enemyCount:()=>G.enemies.length,
      worldFingerprint:(seed)=>simDev.worldFingerprint(seed) };
  }
  syncMenuDom(); positionNameInput();

  return { update, render, onResize, onFocusLost, devInfo };
}
