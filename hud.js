// ===========================================================================
// hud.js — redesigned Tibia-style HUD overlay (CAS-287). IMPLEMENTATION stage.
//
// WHY: CAS-285 ("Mejora la UI del juego") wants a Tibia-inspired-but-better HUD.
// The visual layer is owned by the Art Director spec CAS-286 (CEO-APPROVED,
// `design/CAS-286-hud-spec.md`, commit 3db5569): the LAYOUT MAP (§2), the locked
// FOUNTAINS PALETTE (§4 — zero new hues), TYPOGRAPHY (§5), INTERACTION STATES
// (§6) and the 7 PixelLab UI panels under assets/pixellab/ui/cas286/. This file
// implements that spec.
//
// CHROME vs CONTENT — the technique:
//   The 7 PixelLab PNGs are FRAMES with ornate iron+gold trim on every edge and a
//   DECORATIVE baked interior (the statframe even bakes full HP/MP/XP bars + a
//   skull). A live HUD must show DYNAMIC vitals, so we cannot blit the baked art
//   wholesale. Instead each panel uses the approved PNG as a `border-image`
//   9-slice — this takes ONLY the clean iron+gold EDGES (the part players read as
//   "the frame") and discards the baked center — and the live interior (bars,
//   numerics, slots, log) is drawn in CSS strictly from the §4 palette. Result:
//   the approved frame art, dynamic content, no new colours. (CTO note in CAS-287.)
//
// DESIGN — same soak-safe contract as overlay.js (CAS-279):
//   • Default OFF. Opt-in via `?hud` query flag or window.__hud.toggle(); the
//     choice persists in its OWN localStorage key — never the save / settings /
//     analytics blob — so the shipped player experience and the Stage-1 retention
//     soak signal are UNCHANGED.
//   • Pure PRESENTATION over a read-only snapshot. NEVER touches sim / balance /
//     tunables / input. The wrapper is pointer-events:none so it cannot eat a
//     tap/click (the interactive equip/inventory panels stay in render.js / CAS-226).
//   • Refreshes on a light interval ONLY while visible; the 60fps loop is untouched.
//   • Honours CAS-265 accessibility: `reduceMotion` (no transitions / frozen) and
//     `colorblind` (rarity + status SHAPE cues), plus `prefers-reduced-motion`.
//   • Degrades to "—" when a field is missing; a partial snapshot never throws.
//   • Reversible by deleting this file + its one toggle key.
// ===========================================================================

export const hud = (()=>{
  const KEY="mithralda.hud.v1";   // own key — never the save / settings / analytics blob
  const REFRESH_MS=200;           // light cadence; only ticks while visible
  const ASSET="assets/pixellab/ui/cas286/"; // CEO-approved CAS-286 panels
  let root=null, styleEl=null, on=false, timer=0, booted=false, getState=null, reduce=false;
  let drawerOpen=false;           // mobile right-rail drawer state (presentation only)
  const nodes={};                 // cached references to the live-data spans
  const log=[];                   // derived combat-log lines (presentation only)
  let prev=null;                  // previous snapshot for the read-only log diff

  function readPref(){ try{ return localStorage.getItem(KEY)==="1"; }catch(e){ return false; } }
  function writePref(v){ try{ localStorage.setItem(KEY, v?"1":"0"); }catch(e){} }

  // ---- §4 palette — locked to render/palette.js COL (FOUNTAINS). NO new hues. ----
  const C = {
    bg:"#06070a", panel:"#12141b", panelLit:"#1a1d26", panelB:"#3a3f49", panelB2:"#22262e",
    textGold:"#d8b25e", goldL:"#ffe39a", goldD:"#a87f2e", gold:"#e0b94a",
    cream:"#d8d3c4", textDim:"#8a8678",
    hpf:"#b3242a", hpb:"#2e1012", mpf:"#3f6bd0", mpb:"#101a30", xpf:"#d0aa44", xpb:"#231d0e",
    // signal hues — status chips / alerts ONLY (§4)
    poison:"#8be04a", slow:"#7fd0ff", stun:"#ffe066", burn:"#ff8a3a", heal:"#4fbf6a", rune:"#5a8aff",
  };
  // §6 rarity shape-cues (prepended only when colorblind=true)
  const RARITY_CUE=["","◦","◆","★","★"]; // 0 common · 1 uncommon · 2 rare · 3+ epic

  // border-image frame map (slice = px of iron+gold trim per edge; bw = rendered width)
  const FR = {
    stat:    {img:"hud_statframe.png",     slice:24, bw:11},
    mini:    {img:"hud_minimap_frame.png", slice:50, bw:15},
    doll:    {img:"hud_paperdoll.png",     slice:26, bw:12},
    bag:     {img:"hud_backpack_grid.png", slice:24, bw:11},
    action:  {img:"hud_actionbar.png",     slice:22, bw:10},
    console: {img:"hud_console.png",       slice:24, bw:11},
  };

  function mk(tag, css, parent){ const e=document.createElement(tag); if(css) e.style.cssText=css; if(parent) parent.appendChild(e); return e; }

  // ---- one <style> block: frames, interaction states (§6), bars, responsive ----
  function injectStyle(){
    if(styleEl) return;
    styleEl=document.createElement("style"); styleEl.id="hud-style";
    // CAS-299: version the panel-art URLs with the build id (same ?v= scheme as
    // render/sprites.js → window.__BUILD) so the deploy cache-bust covers HUD chrome too;
    // without it a returning player could serve a stale border-image for a fresh build.
    const V=(typeof window!=="undefined"&&window.__BUILD)?("?v="+window.__BUILD):"";
    const f=(k)=>"border-style:solid;border-width:"+FR[k].bw+"px;border-color:"+C.panelB+";"
      +"border-image:url('"+ASSET+FR[k].img+V+"') "+FR[k].slice+" stretch;"; // border-color = graceful fallback
    styleEl.textContent = [
      // root scale var drives crisp integer-ish scaling (§3)
      "#hud{ --s:1; font-family:'Courier New',monospace; }",
      "#hud .pnl{ background:"+C.panel+"; background-clip:padding-box; box-shadow:0 2px 6px rgba(0,0,0,.55); image-rendering:pixelated; }",
      "#hud .fr-stat{ "+f("stat")+" }",
      "#hud .fr-mini{ "+f("mini")+" }",
      "#hud .fr-doll{ "+f("doll")+" }",
      "#hud .fr-bag{ "+f("bag")+" }",
      "#hud .fr-action{ "+f("action")+" }",
      "#hud .fr-console{ "+f("console")+" }",
      // §5 typography
      "#hud .name{ color:"+C.textGold+"; font-size:calc(13px*var(--s)); letter-spacing:.5px; font-weight:bold; }",
      "#hud .sub{ color:"+C.textDim+"; font-size:calc(11px*var(--s)); }",
      "#hud .num{ color:"+C.cream+"; font-size:calc(14px*var(--s)); font-variant-numeric:tabular-nums; text-shadow:0 1px 0 "+C.bg+"; }",
      "#hud .lab{ color:"+C.textDim+"; font-size:calc(11px*var(--s)); letter-spacing:.5px; text-transform:uppercase; }",
      "#hud .gold{ color:"+C.gold+"; font-size:calc(12px*var(--s)); font-variant-numeric:tabular-nums; }",
      // bars (§6): groove + fill + 1px specular highlight; ease unless reduce-motion
      "#hud .groove{ position:relative; height:calc(13px*var(--s)); border:1px solid "+C.panelB2+"; border-radius:2px; overflow:hidden; margin:calc(3px*var(--s)) 0; }",
      "#hud .fill{ position:absolute; left:0; top:0; bottom:0; width:0%; }",
      "#hud:not(.rm) .fill{ transition:width .12s ease; }",
      "#hud .fill::after{ content:''; position:absolute; left:0; right:0; top:0; height:1px; background:rgba(255,255,255,.22); }",
      "#hud:not(.rm) .spec{ animation:hudshimmer 2.4s linear infinite; }",
      "@keyframes hudshimmer{ 0%{opacity:.10} 50%{opacity:.28} 100%{opacity:.10} }",
      "#hud .bnum{ position:absolute; right:4px; top:0; bottom:0; display:flex; align-items:center; }",
      "#hud .bicon{ position:absolute; left:3px; top:0; bottom:0; display:flex; align-items:center; font-size:calc(10px*var(--s)); }",
      // slots + §6 interaction states (defined now; HUD becomes interactive in a follow-up)
      "#hud .slot{ position:relative; aspect-ratio:1; min-width:calc(26px*var(--s)); display:flex; align-items:center; justify-content:center;"
        +" font-size:calc(11px*var(--s)); color:"+C.textDim+"; background:"+C.bg+"; border:1px solid "+C.panelB+"; border-radius:3px; }",
      "#hud .slot:hover{ border-color:"+C.textGold+"; background:"+C.panelLit+"; }",      // hover
      "#hud .slot.eq{ border-color:"+C.gold+"; box-shadow:inset 0 0 6px rgba(224,185,74,.35); color:"+C.cream+"; }", // active/equipped
      "#hud .slot.off{ background:"+C.panelB2+"; opacity:.5; }",                            // disabled / empty
      "#hud .slot:focus-visible{ outline:2px dashed "+C.gold+"; outline-offset:1px; }",     // keyboard focus ring
      "#hud .cue{ color:"+C.textGold+"; margin-right:2px; }",
      // status chips (§ B)
      "#hud .chip{ display:inline-flex; align-items:center; gap:3px; padding:1px 5px; margin:2px 3px 0 0; border-radius:8px;"
        +" font-size:calc(10px*var(--s)); background:"+C.bg+"; border:1px solid "+C.panelB+"; }",
      // log (§ G)
      "#hud .logln{ font-size:calc(12px*var(--s)); color:"+C.cream+"; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      "#hud .logln.old{ color:"+C.textDim+"; }",
      // drawer toggle button (mobile)
      "#hud .drawerBtn{ position:absolute; top:8px; right:8px; width:44px; height:44px; display:none; align-items:center; justify-content:center;"
        +" pointer-events:auto; background:"+C.panel+"; border:2px solid "+C.gold+"; border-radius:4px; color:"+C.textGold+"; font-size:18px; cursor:pointer; }",
      // ---- responsive (§3) ----
      "@media (max-width:1023px){ #hud .rail{ width:128px !important; } #hud .mini{ height:96px !important; } }",
      "@media (max-width:639px){",
      "  #hud .stat{ min-width:0 !important; width:min(64vw,220px) !important; }",
      "  #hud .rail{ position:absolute; top:0; bottom:0; right:0; width:170px !important; transform:translateX(112%); transition:transform .18s ease;"
        +" background:rgba(6,7,10,.92); padding:56px 8px 8px !important; overflow:auto; }",
      "  #hud.draw .rail{ transform:translateX(0); }",
      "  #hud .drawerBtn{ display:flex; }",
      "  #hud .bottom{ left:0 !important; right:0 !important; transform:none !important; max-width:100% !important; padding:0 6px; }",
      "  #hud .hotrow{ overflow-x:auto; justify-content:flex-start !important; }",
      "  #hud .slot{ min-width:44px; }",                 // ≥44px touch targets
      "}",
      // touch: suppress hover affordance
      "@media (pointer:coarse){ #hud .slot:hover{ border-color:"+C.panelB+"; background:"+C.bg+"; } #hud .slot{ min-width:44px; } }",
      "@media (prefers-reduced-motion:reduce){ #hud .fill{ transition:none !important; } #hud .spec{ animation:none !important; } }",
    ].join("\n");
    document.head.appendChild(styleEl);
  }

  function bar(parent, fillCol, grooveCol, icon){
    const wrap=mk("div","background:"+grooveCol, parent); wrap.className="groove";
    const fill=mk("div","background:"+fillCol, wrap); fill.className="fill";
    const spec=mk("div","position:absolute;inset:0;background:rgba(255,255,255,.06);pointer-events:none", wrap); spec.className="spec";
    const ic=mk("div",null,wrap); ic.className="bicon"; ic.textContent=icon||"";
    const num=mk("div",null,wrap); num.className="bnum num";
    return { fill, num };
  }

  // ---- DOM scaffold: §2 layout — vitals TL · minimap+paperdoll+bag right rail · action+log bottom ----
  function build(){
    if(root || typeof document==="undefined") return root;
    injectStyle();
    root=mk("div", ["position:fixed","inset:0","z-index:55","display:none","pointer-events:none"].join(";"));
    root.id="hud";
    if(reduce) root.classList.add("rm");
    root.setAttribute("aria-hidden","true"); // decorative mirror; interactive panels stay in render.js

    // ===== A — Vitals (top-left) =====
    const tl=mk("div", ["position:absolute","left:12px","top:12px","min-width:calc(196px*var(--s))","padding:8px"].join(";"), root);
    tl.className="pnl fr-stat stat";
    const head=mk("div","display:flex;gap:8px;align-items:center;margin-bottom:4px", tl);
    nodes.portrait=mk("div","width:calc(36px*var(--s));height:calc(36px*var(--s));flex:0 0 auto;background:"+C.bg+";"
      +"border:2px solid "+C.goldD+";border-radius:50%;box-shadow:inset 0 0 4px rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;"
      +"color:"+C.textGold+";font-size:calc(14px*var(--s));font-weight:bold", head);
    const idCol=mk("div","flex:1;min-width:0", head);
    nodes.name=mk("div",null,idCol); nodes.name.className="name"; nodes.name.textContent="—";
    nodes.cls=mk("div",null,idCol); nodes.cls.className="sub"; nodes.cls.textContent="—";
    nodes.lvl=mk("div","text-align:right;color:"+C.textGold+";font-size:calc(13px*var(--s))", head); nodes.lvl.textContent="Nv —";
    nodes.hp=bar(tl, C.hpf, C.hpb, "♥");
    nodes.mp=bar(tl, C.mpf, C.mpb, "✦");
    nodes.xp=bar(tl, C.xpf, C.xpb, "XP");
    const goldRow=mk("div","display:flex;justify-content:flex-end;margin-top:3px", tl);
    nodes.gold=mk("span",null,goldRow); nodes.gold.className="gold"; nodes.gold.textContent="0 oro";

    // ===== B — Status chips (under vitals) =====
    nodes.chips=mk("div", ["position:absolute","left:12px","top:calc(132px*var(--s))","max-width:220px","pointer-events:none"].join(";"), root);

    // ===== drawer toggle (mobile only, via CSS) =====
    nodes.drawerBtn=mk("div",null,root); nodes.drawerBtn.className="drawerBtn"; nodes.drawerBtn.textContent="≡";
    nodes.drawerBtn.setAttribute("aria-label","Abrir equipo / mochila");
    nodes.drawerBtn.onclick=()=>{ drawerOpen=!drawerOpen; root.classList.toggle("draw",drawerOpen); };

    // ===== Right rail: D paper-doll (EQUIPO) · E backpack (MOCHILA) =====
    // CAS-299 cutover: the legacy on-canvas minimap (bottom-right, with real layout + portal
    // blips) is the single minimap, so the HUD's decorative minimap STUB is dropped here to
    // avoid a double-minimap. The rail now reuses ONLY the Tibia equip/inventory mirror.
    const rail=mk("div", ["position:absolute","right:12px","top:12px","width:152px","display:flex","flex-direction:column","gap:8px"].join(";"), root);
    rail.className="rail";
    const doll=mk("div","padding:6px", rail); doll.className="pnl fr-doll";
    const dl=mk("div",null,doll); dl.className="lab"; dl.textContent="Equipo";
    nodes.equip=mk("div","display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px", doll);
    const bag=mk("div","padding:6px", rail); bag.className="pnl fr-bag";
    const bl=mk("div",null,bag); bl.className="lab"; bl.textContent="Mochila";
    nodes.inv=mk("div","display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:4px", bag);

    // ===== Bottom-left: G console (combat log) =====
    // CAS-299 cutover: the legacy on-canvas SPELL BAR (bottom-centre, with real cooldowns +
    // mp costs) is the single action surface, so the HUD's decorative 1-10 action-bar STUB is
    // dropped to avoid a double action bar. Only the Tibia console remains here.
    const bottom=mk("div", ["position:absolute","left:12px","right:12px","bottom:12px","display:flex","gap:8px","align-items:flex-end","justify-content:flex-start","flex-wrap:wrap"].join(";"), root);
    bottom.className="bottom";
    const con=mk("div","padding:8px;flex:0 1 360px;max-width:420px;height:74px;overflow:hidden", bottom); con.className="pnl fr-console";
    const cl=mk("div",null,con); cl.className="lab"; cl.textContent="Consola";
    nodes.log=mk("div","margin-top:3px;display:flex;flex-direction:column;gap:1px", con);

    document.body.appendChild(root);
    applyScale();
    return root;
  }

  // ---- §3 responsive scale: single --s var off viewport width, integer-ish steps ----
  function applyScale(){
    if(!root) return; let s=1;
    try{ const w=window.innerWidth||1280; s = w>=1280?1 : w>=1024?0.92 : w>=640?0.84 : 0.78; }catch(e){}
    root.style.setProperty("--s", String(s));
  }

  // ---- paint: pure reads off the bound snapshot --------------------------
  function fillBar(b, cur, max){ if(!b) return; max=Math.max(1, max||0); const p=Math.max(0,Math.min(100, Math.round((cur||0)/max*100)));
    b.fill.style.width=p+"%"; b.num.textContent=(Math.round(cur||0))+" / "+(Math.round(max)); }

  function paintSlots(host, items, n, cb){
    if(!host) return; items=items||[]; n=Math.max(items.length, n||0);
    while(host.childElementCount<n){ const e=mk("div",null,host); e.className="slot"; e.tabIndex=-1; }
    const kids=host.children;
    for(let i=0;i<kids.length;i++){ const it=items[i]; const el=kids[i];
      if(it){ el.className="slot eq"; el.textContent=(cb?cb(it):"")+(it.label||"·"); }
      else { el.className="slot off"; el.textContent=""; } }
  }

  // derive a read-only combat log by diffing successive snapshots (presentation only)
  function deriveLog(s){
    if(!prev || prev.scene!==s.scene){ prev=s; return; }
    const push=(t)=>{ log.push(t); if(log.length>5) log.shift(); };
    const dHp=(prev.hp|0)-(s.hp|0); if(dHp>0) push("Recibes "+dHp+" de daño"); else if(dHp<-1) push("Recuperas "+(-dHp)+" PV");
    if((s.lvl|0)>(prev.lvl|0)) push("¡Subes a nivel "+(s.lvl|0)+"!");
    const dG=(s.gold|0)-(prev.gold|0); if(dG>0) push("+"+dG+" oro");
    prev=s;
  }
  function paintLog(){
    if(!nodes.log) return; const n=log.length;
    nodes.log.textContent="";
    if(!n){ const e=mk("div",null,nodes.log); e.className="logln old"; e.textContent="·"; return; }
    for(let i=0;i<n;i++){ const e=mk("div",null,nodes.log); e.className="logln"+(i<n-1?" old":""); e.textContent="· "+log[i]; }
  }

  function paint(){
    if(!on||!root) return;
    let s=null; try{ s=getState?getState():null; }catch(e){ s=null; }
    const cb = !!(s&&s.colorblind);
    const rm = !!(s&&s.reduceMotion); root.classList.toggle("rm", rm);
    const cue = (it)=>{ const r=it&&(it.rarity|0); if(!cb||!r) return ""; const g=RARITY_CUE[Math.min(4,r)]; return g?(g+" "):""; };
    if(!s || s.hp==null){ // menu / no hero — placeholders, never throw
      nodes.name.textContent="—"; nodes.cls.textContent="—"; nodes.lvl.textContent="Nv —"; nodes.gold.textContent="0 oro";
      fillBar(nodes.hp,0,1); fillBar(nodes.mp,0,1); fillBar(nodes.xp,0,1);
      paintSlots(nodes.equip,[],3); paintSlots(nodes.inv,[],16);
      if(nodes.minimap) nodes.minimap.textContent=(s&&s.zone)?String(s.zone):"—";
      nodes.chips.textContent=""; paintLog();
      prev=s||null; return;
    }
    deriveLog(s);
    nodes.name.textContent=s.name||"Héroe";
    nodes.cls.textContent=s.cls||"—";
    nodes.lvl.textContent="Nv "+(s.lvl||1);
    nodes.gold.textContent=(s.gold|0)+" oro";
    nodes.portrait.textContent=(s.name||s.cls||"H").slice(0,1).toUpperCase();
    fillBar(nodes.hp, s.hp, s.maxHp);
    fillBar(nodes.mp, s.mp, s.maxMp);
    fillBar(nodes.xp, s.xp, s.xpNext);
    paintSlots(nodes.equip, s.equip||[], 3, cue);
    paintSlots(nodes.inv, s.bag||[], s.bagCap||16, cue);
    if(nodes.minimap) nodes.minimap.textContent=(s.zone||"—")+"\n◆";
    // §B status chips — data-driven; renders nothing when the hero carries no effects
    paintChips(s.status||[], cb);
    paintLog();
  }

  const CHIP_SIG={ poison:{c:C.poison,g:"☠"}, slow:{c:C.slow,g:"❄"}, stun:{c:C.stun,g:"✦"}, burn:{c:C.burn,g:"♨"}, buff:{c:C.heal,g:"✦"} };
  function paintChips(list, cb){
    if(!nodes.chips) return; nodes.chips.textContent="";
    for(const st of list){ const sig=CHIP_SIG[st.type]||{c:C.cream,g:"●"};
      const chip=mk("span",null,nodes.chips); chip.className="chip"; chip.style.color=sig.c; chip.style.borderColor=sig.c;
      chip.textContent=(cb?sig.g+" ":"")+(st.type||"")+(st.dur?(" "+Math.ceil(st.dur)+"s"):""); }
  }

  function show(){ build(); if(!root) return; on=true; root.style.display="block"; applyScale(); paint();
    if(!timer) timer=setInterval(paint, REFRESH_MS); try{ window.addEventListener("resize",applyScale); }catch(e){} writePref(true); }
  function hide(){ on=false; if(root) root.style.display="none";
    if(timer){ clearInterval(timer); timer=0; } try{ window.removeEventListener("resize",applyScale); }catch(e){} writePref(false); }
  function toggle(){ on?hide():show(); }

  // boot(getState): getState is a READ-ONLY snapshot accessor injected by game.js.
  // CAS-299 — DEFAULT-ON cutover (board-approved a35ddd26): the redesigned HUD is the
  // visible UI for every player. Precedence: an explicit URL override > a stored pref >
  // default ON. Escape hatches: `?nohud` (or `?hud=0`) force it off; `__hud.hide()` (which
  // persists "0") lets a player opt out durably. The HUD never reads input or mutates the
  // sim — only its presentation changes, so the Stage-1 retention soak signal stays clean.
  function boot(getStateFn){
    if(booted || typeof window==="undefined") return; booted=true;
    getState = typeof getStateFn==="function" ? getStateFn : (()=>null);
    try{ const s0=getState&&getState(); reduce=!!(s0&&s0.reduceMotion); }catch(e){ reduce=false; }
    let flag=null; // explicit URL override: true=force on, false=force off, null=unspecified
    try{ const p=new URLSearchParams(location.search);
      if(p.has("nohud")) flag=false;
      else if(p.has("hud")) flag=(p.get("hud")!=="0" && p.get("hud")!=="off"); }catch(e){}
    let want=true; // default-ON
    try{ const pv=localStorage.getItem(KEY); want = (flag!=null) ? flag : (pv==null ? true : pv==="1"); }
    catch(e){ want = (flag!=null) ? flag : true; }
    if(want) show();
    // dev/QA hook — toggle + read the same snapshot the HUD paints, headlessly.
    window.__hud={ show, hide, toggle, isOn:()=>on, state:()=>{ try{ return getState(); }catch(e){ return null; } },
      drawer:(v)=>{ drawerOpen=(v==null?!drawerOpen:!!v); if(root) root.classList.toggle("draw",drawerOpen); return drawerOpen; },
      scale:()=>{ try{ return getComputedStyle(root).getPropertyValue("--s").trim(); }catch(e){ return null; } }, KEY };
  }

  return { boot, show, hide, toggle, isOn:()=>on, KEY };
})();
