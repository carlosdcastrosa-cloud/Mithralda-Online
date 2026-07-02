// ===========================================================================
// ui/layout.js — CAS-418: user-rearrangeable HUD (board CAS-414).
//
// SINGLE OWNER of every movable panel's position:
//   • DOM panels (hud.js): vitals (statframe+caption), equip (paperdoll),
//     bag (backpack) — registered via attachDom(), dragged with pointer
//     events (mouse + touch), repositioned as position:fixed.
//   • Canvas widgets (render/render.js): minimap + spell bar — render reads
//     its draw anchor from get(), publishes the drawn rect via pub(), and
//     input.js routes play-scene pointer events through canvasDown/Move/Up.
//
// Persistence: OWN localStorage key `mithralda.uiLayout.v1` — never the save /
// settings / analytics blob (same isolation pattern as bestiary CAS-386), so
// SAVE_VERSION and the sim are untouched. Pure PRESENTATION: no sim / rng /
// balance reads or writes (Stage-2 server-authority lens — positions live in
// the view layer only). Defaults = the exact current layout: with no stored
// key this module changes NOTHING visually.
//
// Invariants:
//   • A panel can never leave the viewport: DOM panels clamp on drop, on load
//     and on window resize; canvas widgets clamp every draw (pure math, no
//     per-frame allocations — stored {x,y} objects are mutated, not recreated).
//   • Drag only starts ON a panel and only in scene "play" (isPlay injected by
//     input.js); a sub-threshold press still delivers the panel's normal click
//     (open inventory, gear …) — an actual drag suppresses the trailing click.
//   • Reset (pause menu) deletes the key and restores every panel's original
//     inline style — back to the default layout with zero reload.
// ===========================================================================
export const uiLayout = (()=>{
  const KEY="mithralda.uiLayout.v1";
  const GOLD="#e0b94a";           // §4 palette gold — drag affordance
  const THRESH=6;                 // px before a press becomes a drag
  const MARGIN=8;                 // min visible margin when clamping

  let store={};                   // {panelId:{x,y}} — only customized panels
  let isPlay=()=>true;            // injected by input.js (G.scene==="play")
  let dragId=null;                // live drag (DOM or canvas) — render draws gold
  let dragEndT=0;                 // a just-finished DOM drag eats ITS trailing click
  const panels={};                // DOM records {id,el,group,css,fixed}
  const rects={};                 // canvas widget rects {x,y,w,h,t} (mutated)
  let tick=0;                     // pub() freshness stamp (stale-rect guard)
  let cdrag=null;                 // canvas drag {id,sx,sy,ox,oy,active}

  function load(){ try{ const raw=localStorage.getItem(KEY); if(raw){ const p=JSON.parse(raw);
      if(p && typeof p==="object"){ for(const k in p){ const v=p[k];
        if(v && typeof v.x==="number" && typeof v.y==="number") store[k]={x:v.x, y:v.y}; } } } }catch(e){} }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); }catch(e){} }
  load();

  function vw(){ return (typeof innerWidth!=="undefined"?innerWidth:1280); }
  function vh(){ return (typeof innerHeight!=="undefined"?innerHeight:720); }
  function clampXY(p,w,h){ // keep the WHOLE panel on screen (corner always reachable)
    p.x=Math.round(Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, vw()-w-MARGIN)));
    p.y=Math.round(Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, vh()-h-MARGIN))); }

  // ---- DOM panels (hud.js) ------------------------------------------------
  function applyDom(rec){ const p=store[rec.id]; if(!p) return;
    // reparent to the #hud root: the mobile drawer TRANSFORMS the rail, and a
    // transformed ancestor hijacks position:fixed — root (fixed inset:0) never has one.
    const rootEl=rec.el.closest&&rec.el.closest("#hud");
    if(rootEl && rec.el.parentNode!==rootEl) rootEl.appendChild(rec.el);
    rec.el.style.position="fixed"; rec.el.style.left=p.x+"px"; rec.el.style.top=p.y+"px";
    rec.el.style.right="auto"; rec.el.style.bottom="auto"; rec.el.style.margin="0"; rec.fixed=true; }
  function clampDom(rec){ const p=store[rec.id]; if(!p) return;
    // display:none (HUD not shown yet) measures 0 → clamping now would park the
    // panel at the right/bottom edge; hud.show() re-clamps via clampAll() instead.
    if(!rec.el.offsetWidth) { applyDom(rec); return; }
    clampXY(p, rec.el.offsetWidth, rec.el.offsetHeight); applyDom(rec); }
  function clampAll(){ for(const id in panels) clampDom(panels[id]); }
  // detach every panel in the drag panel's group at its CURRENT on-screen rect.
  // Rail siblings are flex-flow: fixing one reflows the other, so SNAPSHOT every
  // member's rect FIRST, then apply — applyDom reparents and would skew later reads.
  function detachGroup(rec){ const g=rec.group; const grp=[];
    for(const id in panels){ const r=panels[id];
      if(r!==rec && (!g || r.group!==g)) continue;
      if(!r.fixed) grp.push([r, r.el.getBoundingClientRect()]); }
    for(const [r,b] of grp){
      if(!store[r.id]) store[r.id]={x:b.left, y:b.top}; else { store[r.id].x=b.left; store[r.id].y=b.top; }
      applyDom(r); } }
  function saveGroup(rec){ const g=rec.group;
    for(const id in panels){ const r=panels[id];
      if(r===rec || (g && r.group===g)) clampDom(r); }
    save(); }

  // DOM drag rides WINDOW-level listeners (registered once): element-level pointer
  // capture dies the moment applyDom reparents the panel mid-gesture, window doesn't.
  let ddrag=null; // {rec,sx,sy,ox,oy,active}
  function onDown(rec,e){
    if(!isPlay()) return; if(e.button!=null && e.button!==0) return;
    const b=rec.el.getBoundingClientRect();
    ddrag={rec, sx:e.clientX, sy:e.clientY, ox:b.left, oy:b.top, active:false};
  }
  function domMove(ev){ const d=ddrag; if(!d) return;
    const dx=ev.clientX-d.sx, dy=ev.clientY-d.sy;
    if(!d.active){ if(dx*dx+dy*dy < THRESH*THRESH) return;
      d.active=true; dragId=d.rec.id; detachGroup(d.rec);
      if(!store[d.rec.id]) store[d.rec.id]={x:d.ox, y:d.oy};
      d.rec.el.style.outline="2px solid "+GOLD; d.rec.el.style.outlineOffset="2px"; }
    const p=store[d.rec.id]; p.x=d.ox+dx; p.y=d.oy+dy; applyDom(d.rec); ev.preventDefault(); }
  let dragEndX=0, dragEndY=0;     // pointer-up spot — the trailing click lands exactly there
  function domUp(e){ const d=ddrag; if(!d) return; ddrag=null;
    if(d.active){ d.rec.el.style.outline=""; d.rec.el.style.outlineOffset="";
      saveGroup(d.rec); dragId=null; dragEndT=performance.now();
      if(e){ dragEndX=e.clientX; dragEndY=e.clientY; } } }

  function attachDom(id, el, group){
    const rec={id, el, group:group||null, css:el.style.cssText, fixed:false,
      parent:el.parentNode, next:el.nextSibling};   // original slot, for reset()
    panels[id]=rec;
    // the panel itself must catch the pointer (the #hud wrapper is pointer-events:none);
    // touch-action:none so a touch drag pans the panel, not the page.
    el.style.pointerEvents="auto"; el.style.touchAction="none";
    el.addEventListener("pointerdown",(e)=>onDown(rec,e));
    if(store[id]){ applyDom(rec); clampDom(rec); } // stored layout → restore + clamp on load
    return rec;
  }
  // a completed drag must not fire the panel's click action (open inventory / gear):
  // one window-level CAPTURE listener beats the panels' own target-phase handlers.
  if(typeof window!=="undefined"){
    window.addEventListener("pointermove",domMove,{passive:false});
    window.addEventListener("pointerup",domUp,true);
    window.addEventListener("pointercancel",domUp,true);
    // a drag's trailing click must not fire the panel action (open inventory …).
    // Match TIME + PLACE of the pointer-up (the synthetic click lands exactly there):
    // reparenting mid-gesture can swallow that click entirely, so a sticky boolean
    // would eat the NEXT legitimate click; a fresh click elsewhere must pass.
    window.addEventListener("click",(e)=>{ if(dragEndT && e.timeStamp-dragEndT<350
      && Math.abs(e.clientX-dragEndX)<8 && Math.abs(e.clientY-dragEndY)<8){
      dragEndT=0; e.stopPropagation(); e.preventDefault(); } }, true);
    window.addEventListener("resize",clampAll);
  }

  // ---- canvas widgets (render/render.js + input.js) -----------------------
  function frame(){ tick++; }                       // render calls once per HUD pass
  function get(id){ return store[id]||null; }       // returns the stored ref (no alloc)
  function pub(id,x,y,w,h){ let r=rects[id];        // publish the rect actually drawn
    if(!r){ r=rects[id]={x:0,y:0,w:0,h:0,t:0}; }
    r.x=x; r.y=y; r.w=w; r.h=h; r.t=tick; }
  // clamp a canvas anchor at draw time (covers load + resize with zero listeners)
  function cx(id,def,w){ const p=store[id]; if(!p) return def;
    return Math.min(Math.max(MARGIN,p.x), Math.max(MARGIN, vw()-w-MARGIN)); }
  function cy(id,def,h){ const p=store[id]; if(!p) return def;
    return Math.min(Math.max(MARGIN,p.y), Math.max(MARGIN, vh()-h-MARGIN)); }

  function canvasDown(x,y){ if(!isPlay()) return false;
    for(const id in rects){ const r=rects[id];
      if(r.t!==tick && r.t!==tick-1) continue;      // widget not drawn (touch / suppressed)
      if(x>=r.x-2 && x<=r.x+r.w+2 && y>=r.y-2 && y<=r.y+r.h+2){
        cdrag={id, sx:x, sy:y, ox:r.x, oy:r.y, active:false};
        return true; } }                             // consume: a UI press never attacks
    return false; }
  function canvasMove(x,y){ if(!cdrag) return false;
    const dx=x-cdrag.sx, dy=y-cdrag.sy;
    if(!cdrag.active){ if(dx*dx+dy*dy < THRESH*THRESH) return true; cdrag.active=true; dragId=cdrag.id;
      if(!store[cdrag.id]) store[cdrag.id]={x:cdrag.ox, y:cdrag.oy}; }
    const p=store[cdrag.id]; p.x=cdrag.ox+dx; p.y=cdrag.oy+dy;
    return true; }
  function canvasUp(){ if(!cdrag) return false;
    if(cdrag.active){ const r=rects[cdrag.id], p=store[cdrag.id];
      if(r&&p) clampXY(p, r.w, r.h);
      save(); dragId=null; }
    cdrag=null; return true; }

  // ---- reset (pause menu) --------------------------------------------------
  function reset(){
    store={}; try{ localStorage.removeItem(KEY); }catch(e){}
    dragId=null; cdrag=null;
    for(const id in panels){ const r=panels[id];   // registration order restores rail order
      if(r.parent && r.el.parentNode!==r.parent){
        if(r.next && r.next.parentNode===r.parent) r.parent.insertBefore(r.el, r.next);
        else r.parent.appendChild(r.el); }
      r.el.style.cssText=r.css;                     // exact pre-attach inline style
      r.el.style.pointerEvents="auto"; r.el.style.touchAction="none"; r.fixed=false; }
  }

  const api={ attachDom, clampAll, setPlayCheck:(fn)=>{ if(typeof fn==="function") isPlay=fn; },
    frame, get, pub, cx, cy, canvasDown, canvasMove, canvasUp, reset,
    dragging:()=>dragId, KEY,
    // QA hooks — read/seed the layout headlessly (presentation only)
    _store:()=>store, _set:(id,x,y)=>{ store[id]={x,y}; save(); const r=panels[id]; if(r){ applyDom(r); clampDom(r); } } };
  try{ if(typeof window!=="undefined") window.__uiLayout=api; }catch(e){}
  return api;
})();
