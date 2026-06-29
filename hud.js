// ===========================================================================
// hud.js — redesigned Tibia-style HUD overlay (CAS-287). SCAFFOLD stage.
//
// WHY: CAS-285 ("Mejora la UI del juego") wants a Tibia-inspired-but-better HUD.
// The final VISUAL layer (frames/borders/icons + exact layout) is owned by the
// Art Director spec CAS-286 — this file is the structural ANDAMIAJE we can land
// ahead of that spec: the overlay container, the three panel REGIONS, and the
// read-only DATA HOOKS that paint live hero/inventory numbers. When the spec +
// UI assets land, the placeholder CSS frame is swapped for the real art and the
// region children are filled in — no re-plumbing of the data path.
//
// DESIGN — same soak-safe contract as overlay.js (CAS-279):
//   • Default OFF. Opt-in via `?hud` query flag or window.__hud.toggle(); the
//     choice persists in its OWN localStorage key so it never touches the save,
//     the analytics blob or the accessibility prefs. Default hidden ⇒ ZERO change
//     to the shipped player experience and a CLEAN retention/soak signal.
//   • Pure PRESENTATION over a read-only snapshot. It NEVER touches the sim,
//     balance, tunables or input handling — `bind(getState)` receives a function
//     that READS game state and returns a plain object; the HUD only paints it.
//     The wrapper is pointer-events:none so it can never eat a tap/click (the
//     interactive equip/inventory panels arrive with the spec).
//   • Refreshes on a light interval ONLY while visible (no per-frame work, none
//     at all when hidden) — the 60fps loop is untouched. Honours CAS-265
//     reduce-motion (no transitions) and degrades gracefully to "—" when a field
//     is missing, so a partial snapshot never throws.
//   • Reversible by deleting this file + its one toggle key.
// ===========================================================================

export const hud = (()=>{
  const KEY="mithralda.hud.v1";   // own key — never the save / settings / analytics blob
  const REFRESH_MS=250;           // light cadence; only ticks while visible
  let root=null, on=false, timer=0, booted=false, getState=null;
  const nodes={};                 // cached references to the live-data spans

  function readPref(){ try{ return localStorage.getItem(KEY)==="1"; }catch(e){ return false; } }
  function writePref(v){ try{ localStorage.setItem(KEY, v?"1":"0"); }catch(e){} }

  // ---- placeholder pixel-frame styling -----------------------------------
  // Neutral dark-fantasy frame stand-in. The Art Director (CAS-286) ships the
  // real marcos/bordes/iconos; these vars are the single swap point for them.
  const FRAME = {
    bg:"rgba(14,17,23,0.9)", border:"#5a4632", borderLit:"#7a6342",
    ink:"#e8e0d0", inkDim:"#9d927c", hp:"#b5403a", mp:"#3f6fb5", xp:"#caa64a",
  };
  function panelCss(extra){
    return [
      "background:"+FRAME.bg,
      "border:2px solid "+FRAME.border,
      "border-radius:4px",
      "box-shadow:inset 0 0 0 1px rgba(0,0,0,0.6)",
      "padding:6px 8px",
      "color:"+FRAME.ink,
      "font:11px/1.4 'Courier New',monospace",
      "pointer-events:none",
    ].concat(extra||[]).join(";");
  }
  function mk(tag, css, parent){ const e=document.createElement(tag); if(css) e.style.cssText=css; if(parent) parent.appendChild(e); return e; }
  function label(txt, parent){ const e=mk("div","color:"+FRAME.inkDim+";font-size:9px;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:3px", parent); e.textContent=txt; return e; }

  function bar(parent, color){
    const wrap=mk("div","position:relative;height:12px;background:rgba(0,0,0,0.55);border:1px solid "+FRAME.border+";border-radius:2px;overflow:hidden;margin:2px 0", parent);
    const fill=mk("div","position:absolute;left:0;top:0;bottom:0;width:0%;background:"+color, wrap);
    const num=mk("div","position:absolute;left:0;right:0;top:0;text-align:center;font-size:9px;line-height:12px;text-shadow:0 1px 0 #000", wrap);
    return { fill, num };
  }

  // ---- DOM scaffold: 3 regions (Tibia-like, modernised) -------------------
  function build(){
    if(root || typeof document==="undefined") return root;
    const reduce = !!(getState && (getState()||{}).reduceMotion);
    root=mk("div", [
      "position:fixed","inset:0","z-index:55","display:none","pointer-events:none",
      reduce?"":"transition:opacity .12s linear",
    ].join(";"));
    root.id="hud";
    root.setAttribute("aria-hidden","true"); // decorative scaffold until the spec wires real a11y semantics

    // ---- sup-izq: retrato + HP/MP + nivel/XP ----
    const tl=mk("div", panelCss(["position:absolute","left:8px","top:8px","min-width:168px"]), root);
    const head=mk("div","display:flex;gap:8px;align-items:center", tl);
    nodes.portrait=mk("div","width:34px;height:34px;flex:0 0 34px;background:rgba(0,0,0,0.5);border:1px solid "+FRAME.borderLit+";border-radius:3px", head); // class portrait slot (CAS-226 clshero_<cls>)
    const idCol=mk("div","flex:1", head);
    nodes.name=mk("div","font-size:11px;font-weight:bold", idCol); nodes.name.textContent="—";
    nodes.cls=mk("div","font-size:9px;color:"+FRAME.inkDim, idCol); nodes.cls.textContent="—";
    nodes.hp=bar(tl, FRAME.hp);
    nodes.mp=bar(tl, FRAME.mp);
    const xpRow=mk("div","display:flex;justify-content:space-between;font-size:9px;margin-top:2px", tl);
    nodes.lvl=mk("span",null,xpRow); nodes.lvl.textContent="Nv —";
    nodes.gold=mk("span","color:"+FRAME.xp,xpRow); nodes.gold.textContent="0 oro";
    nodes.xp=bar(tl, FRAME.xp);

    // ---- lateral der: minimapa -> paper-doll equipo -> grid inventario ----
    const rs=mk("div", ["position:absolute","right:8px","top:8px","width:148px","display:flex","flex-direction:column","gap:8px"].join(";"), root);
    const mini=mk("div", panelCss(["height:110px"]), rs); label("Minimapa", mini);
    nodes.minimap=mk("div","color:"+FRAME.inkDim+";font-size:9px", mini); nodes.minimap.textContent="(pendiente spec)";
    const equip=mk("div", panelCss([]), rs); label("Equipo", equip);
    nodes.equip=mk("div","display:grid;grid-template-columns:repeat(3,1fr);gap:3px", equip); // paper-doll — reuse CAS b16a74ae/7365d767
    const inv=mk("div", panelCss([]), rs); label("Mochila", inv);
    nodes.inv=mk("div","display:grid;grid-template-columns:repeat(4,1fr);gap:3px", inv);

    // ---- inferior: hotkeys 1-0 + consola chat/log ----
    const bottom=mk("div", ["position:absolute","left:50%","bottom:8px","transform:translateX(-50%)","display:flex","flex-direction:column","gap:6px","align-items:center","max-width:min(96vw,560px)"].join(";"), root);
    nodes.hotkeys=mk("div", panelCss(["display:flex","gap:3px"]), bottom);
    for(let i=1;i<=10;i++){ const k=mk("div","width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:9px;color:"+FRAME.inkDim+";background:rgba(0,0,0,0.5);border:1px solid "+FRAME.border+";border-radius:3px", nodes.hotkeys); k.textContent=String(i%10); }
    nodes.log=mk("div", panelCss(["width:100%","height:46px","overflow:hidden","font-size:9px","color:"+FRAME.inkDim]), bottom); nodes.log.textContent="Consola de combate · (pendiente spec)";

    document.body.appendChild(root);
    return root;
  }

  // ---- paint: pure reads off the bound snapshot --------------------------
  function fillBar(b, cur, max){ if(!b) return; max=Math.max(1, max||0); const p=Math.max(0,Math.min(100, Math.round((cur||0)/max*100)));
    b.fill.style.width=p+"%"; b.num.textContent=(Math.round(cur||0))+" / "+(Math.round(max)); }

  function paint(){
    if(!on||!root) return;
    let s=null; try{ s=getState?getState():null; }catch(e){ s=null; }
    if(!s){ // graceful default — no hero yet (menu): show placeholders, never throw
      nodes.name.textContent="—"; nodes.cls.textContent="—"; nodes.lvl.textContent="Nv —"; nodes.gold.textContent="0 oro";
      fillBar(nodes.hp,0,1); fillBar(nodes.mp,0,1); fillBar(nodes.xp,0,1); return; }
    nodes.name.textContent=s.name||"Héroe";
    nodes.cls.textContent=s.cls||"—";
    nodes.lvl.textContent="Nv "+(s.lvl||1);
    nodes.gold.textContent=(s.gold|0)+" oro";
    fillBar(nodes.hp, s.hp, s.maxHp);
    fillBar(nodes.mp, s.mp, s.maxMp);
    fillBar(nodes.xp, s.xp, s.xpNext);
    // equip paper-doll + bag grid — counts only at scaffold stage (icons land with spec)
    paintSlots(nodes.equip, s.equip||[], 3);
    paintSlots(nodes.inv, s.bag||[], s.bagCap||16);
  }
  function paintSlots(host, items, n){
    if(!host) return;
    n=Math.max(items.length, n||0);
    while(host.childElementCount<n) mk("div","aspect-ratio:1;min-height:18px;background:rgba(0,0,0,0.45);border:1px solid "+FRAME.border+";border-radius:2px;font-size:8px;color:"+FRAME.inkDim+";display:flex;align-items:center;justify-content:center", host);
    const kids=host.children;
    for(let i=0;i<kids.length;i++){ kids[i].textContent = items[i]? (items[i].label||"·") : ""; }
  }

  function show(){ build(); if(!root) return; on=true; root.style.display="block"; paint();
    if(!timer) timer=setInterval(paint, REFRESH_MS); writePref(true); }
  function hide(){ on=false; if(root) root.style.display="none";
    if(timer){ clearInterval(timer); timer=0; } writePref(false); }
  function toggle(){ on?hide():show(); }

  // boot(getState): getState is a READ-ONLY snapshot accessor injected by game.js.
  // Default OFF; opt-in via `?hud` query flag or a restored localStorage pref. The
  // HUD never reads input or mutates anything — it is safe to leave wired in a soak.
  function boot(getStateFn){
    if(booted || typeof window==="undefined") return; booted=true;
    getState = typeof getStateFn==="function" ? getStateFn : (()=>null);
    let flag=false; try{ flag=new URLSearchParams(location.search).has("hud"); }catch(e){}
    if(flag || readPref()) show();
    // dev/QA hook — toggle + read the same snapshot the HUD paints, headlessly.
    window.__hud={ show, hide, toggle, isOn:()=>on, state:()=>{ try{ return getState(); }catch(e){ return null; } }, KEY };
  }

  return { boot, show, hide, toggle, isOn:()=>on, KEY };
})();
