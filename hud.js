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
// PANEL ART — the technique (CAS-316, was a thin 9-slice border-image):
//   The board reported "no veo la UI que creaste en pixellab" — the old build
//   framed each panel with a 9-slice border-image that kept only an ~11px iron+gold
//   EDGE and discarded the ornate baked interior, so players saw plain dark boxes,
//   not the approved art. CAS-316 instead blits the WHOLE approved PNG as a
//   background-size:100% 100% fill (panel sized to its native aspect-ratio) and
//   overlays the live DYNAMIC content inside the measured interior "well":
//     • statframe — baked skull + bar tracks show; live HP/MP/XP fills pin onto
//       the 3 baked grooves; name/level/gold in a caption strip below.
//     • paperdoll — baked EQUIPMENT title + 6 slot icons show; live equip legend
//       (Arma/Cuerpo/Escudo) overlays the display area.
//     • backpack — baked 6×6 grid shows; live items light their cell.
//     • console — ornate frame shows; the baked English placeholder is masked by a
//       flat dark well and the live Spanish combat log renders on top.
//   The approved frame art is now fully visible; content stays dynamic; no new
//   colours (§4 palette). minimap/action-bar panels stay dropped (CAS-299: the
//   canvas minimap + spell bar are the single owners, no double-UI).
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
  // CAS-417: CAS-415 UI icon set (equip-slot chips + coin), same ?v= cache-bust scheme
  const ICONS="assets/ui/icons/";
  const iconV=()=> (typeof window!=="undefined"&&window.__BUILD)?("?v="+window.__BUILD):"";
  let root=null, styleEl=null, on=false, timer=0, booted=false, getState=null, reduce=false;
  let act={};                     // CAS-337 presentation→intent bridge (openInventory/openSettings/equipBag)
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

  // CAS-316 — FULL-ART panels (was: thin 9-slice border-image that discarded the
  // ornate baked interior, so the board "no veo la UI que creaste en pixellab").
  // Each panel now blits the WHOLE approved PixelLab PNG as a background-size:100%
  // 100% fill (sized to native aspect) and the live dynamic content is overlaid
  // inside the measured interior "well" (fractions from tools/cas316-measure.mjs).
  // native px so we can size each panel to its true aspect-ratio.
  const PANEL = {
    stat: {img:"hud_statframe.png",     w:688, h:256},
    doll: {img:"hud_paperdoll.png",     w:288, h:512},
    bag:  {img:"hud_backpack_grid.png", w:320, h:320},
    con:  {img:"hud_console.png",       w:512, h:256},
  };
  // interior content wells as % insets (left,top,right,bottom) inside the baked frame.
  // stat splits into the baked skull (left, untouched) + the 3-bar block (right well).
  const WELL = {
    statBars: {l:34.5, t:22, r:7,  b:18},  // right-side HP/MP/XP track block
    // CAS-416: re-measured to the TRUE dark display panel (art x118–218, y144–409 of
    // 288×512 — tools/cas416-measure2.mjs); the old r:16 inset reached past the panel's
    // right edge onto the gold frame, so the equip chips visibly overflowed the art.
    doll:     {l:42,   t:29, r:25.5, b:21},
    bag:      {l:15.6, t:15.6, r:15.9, b:14.7}, // baked 6×6 grid
    con:      {l:18,   t:23, r:18, b:24},  // baked dark text interior (inside the gold frame line)
  };

  function mk(tag, css, parent){ const e=document.createElement(tag); if(css) e.style.cssText=css; if(parent) parent.appendChild(e); return e; }

  // CAS-336: open the REAL, functional canvas inventory/equipment modal (CAS-226).
  // Prefer the game-provided intent bridge (act.openInventory — robust to key rebinds);
  // else fall back to replaying the default KeyI input the game already handles.
  // Presentation-only — the HUD never mutates the sim; the canvas modal stays the SINGLE
  // functional inventory owner (no double-UI, CAS-299).
  function openInventory(){
    try{ if(act && typeof act.openInventory==="function"){ act.openInventory(); return; } }catch(e){}
    try{ window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyI",key:"i",bubbles:true})); }catch(e){}
  }

  // ---- one <style> block: frames, interaction states (§6), bars, responsive ----
  function injectStyle(){
    if(styleEl) return;
    styleEl=document.createElement("style"); styleEl.id="hud-style";
    // CAS-299: version the panel-art URLs with the build id (same ?v= scheme as
    // render/sprites.js → window.__BUILD) so the deploy cache-bust covers HUD chrome too;
    // without it a returning player could serve a stale border-image for a fresh build.
    const V=(typeof window!=="undefined"&&window.__BUILD)?("?v="+window.__BUILD):"";
    // CAS-316: full-panel art background (whole approved PNG, native aspect via
    // width + aspect-ratio). The live interior is overlaid in an absolute .well.
    const pbg=(k)=>{ const P=PANEL[k];
      return "background:url('"+ASSET+P.img+V+"') center/100% 100% no-repeat;"
        +"image-rendering:pixelated;position:relative;aspect-ratio:"+P.w+"/"+P.h+";"; };
    const well=(k)=>{ const w=WELL[k];
      return "position:absolute;left:"+w.l+"%;top:"+w.t+"%;right:"+w.r+"%;bottom:"+w.b+"%;"; };
    styleEl.textContent = [
      // root scale var drives crisp integer-ish scaling (§3)
      "#hud{ --s:1; font-family:'Courier New',monospace; }",
      // full-art panels (CAS-316) — the ornate PixelLab PNG IS the panel
      "#hud .p-stat{ "+pbg("stat")+" width:calc(268px*var(--s)); }",
      "#hud .p-doll{ "+pbg("doll")+" width:calc(150px*var(--s)); }",
      "#hud .p-bag{ "+pbg("bag")+" width:calc(170px*var(--s)); }",
      "#hud .p-con{ "+pbg("con")+" width:calc(340px*var(--s)); }",
      "#hud .w-statBars{ "+well("statBars")+" }",
      // 3 live bars PINNED to the baked HP/MP/XP track centers (panel ~33/52/70%,
      // mapped into the well) so each fill sits exactly on its baked groove.
      "#hud .w-statBars .groove{ position:absolute; left:2%; right:3%; height:21%; margin:0; }",
      "#hud .w-statBars .groove:nth-child(1){ top:10%; }",
      "#hud .w-statBars .groove:nth-child(2){ top:43%; }",
      "#hud .w-statBars .groove:nth-child(3){ top:74%; }",
      "#hud .w-doll{ "+well("doll")+" overflow:hidden; }",
      "#hud .w-bag{ "+well("bag")+" }",
      // console well: an opaque wash masks the baked English placeholder lines while the
      // ornate PixelLab frame stays fully visible; live Spanish log renders on top.
      "#hud .w-con{ "+well("con")+" overflow:hidden; padding:3px 6px; background:#0b0c11; border-radius:1px;"
        +" display:flex; flex-direction:column; gap:1px; justify-content:flex-end; }",
      "#hud .w-con .logln{ font-size:calc(10px*var(--s)); line-height:1.35; }",
      // CAS-416: equip chips are ROW-ALIGNED to the baked slot-icon column (helmet ·
      // chest · legs · sword · shield · ring at art y-bands 131/181/225/269/308/356 of
      // 512). Each live chip sits on ITS icon's row inside the dark display panel:
      // child 1 Arma→sword row, child 2 Cuerpo→chest row, child 3 Escudo→shield row.
      "#hud .w-doll{ position:absolute; }",
      // caption strip under the stat panel (name · class · level · gold) — no baked text region exists
      "#hud .cap{ width:calc(268px*var(--s)); box-sizing:border-box; margin-top:calc(2px*var(--s)); display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;"
        +" padding:2px 6px; background:rgba(6,7,10,.72); border:1px solid "+C.panelB2+"; border-radius:3px; }",
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
      // CAS-417: slot-icon imgs inside chips (equip legend) — crisp, dimmed with empty chips
      "#hud .slot img.sic{ width:calc(12px*var(--s)); height:calc(12px*var(--s)); image-rendering:pixelated; margin-right:2px; flex:0 0 auto; }",
      "#hud .slot.off img.sic{ opacity:.45; }",
      "#hud .cap img.sic{ width:12px; height:12px; image-rendering:pixelated; align-self:center; margin-right:-3px; }",
      // CAS-316 — bag grid: empty cells transparent (baked PixelLab grid shows through);
      // a filled cell shows a small gold token, not a solid box that hides the art.
      "#hud .w-bag .slot{ background:transparent; border:0; border-radius:2px; min-width:0; color:"+C.goldL+"; font-size:calc(9px*var(--s)); }",
      "#hud .w-bag .slot.off{ background:transparent; opacity:1; }",
      "#hud .w-bag .slot.eq{ background:rgba(224,185,74,.16); border:1px solid "+C.gold+"; box-shadow:inset 0 0 4px rgba(224,185,74,.4); color:"+C.goldL+"; }",
      // equip well: chips CONTAINED in the dark panel (box-sizing keeps padding+border
      // inside width — the old content-box width:100% overflowed the art by ~10px) and
      // pinned to their baked icon rows (% of the well ← art-space icon band centers).
      "#hud .w-doll .slot{ position:absolute; left:0; right:0; box-sizing:border-box; aspect-ratio:auto; min-width:0; height:17.2%;"
        +" justify-content:flex-start; padding:0 2px;"
        +" font-size:calc(8px*var(--s)); background:rgba(6,7,10,.55); border:1px solid "+C.panelB+"; border-radius:2px; overflow:hidden; white-space:nowrap; }",
      "#hud .w-doll .slot:nth-child(1){ top:45.7%; }",  // Arma   → baked sword icon row
      "#hud .w-doll .slot:nth-child(2){ top:11.5%; }",  // Cuerpo → baked chest icon row
      "#hud .w-doll .slot:nth-child(3){ top:61.9%; }",  // Escudo → baked shield icon row
      "#hud .w-doll .slot.off{ background:rgba(6,7,10,.25); border-color:"+C.panelB2+"; }",
      "#hud .w-con .logln{ text-shadow:0 1px 2px "+C.bg+"; }",
      // status chips (§ B)
      "#hud .chip{ display:inline-flex; align-items:center; gap:3px; padding:1px 5px; margin:2px 3px 0 0; border-radius:8px;"
        +" font-size:calc(10px*var(--s)); background:"+C.bg+"; border:1px solid "+C.panelB+"; }",
      // log (§ G)
      "#hud .logln{ font-size:calc(12px*var(--s)); color:"+C.cream+"; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      "#hud .logln.old{ color:"+C.textDim+"; }",
      // CAS-337 — interactive surfaces: only .act elements catch pointer events (wrapper stays
      // pointer-events:none so the playfield is free). Hover/focus affordances make them legible.
      "#hud .act{ pointer-events:auto; cursor:pointer; }",
      "#hud .p-doll.act:hover, #hud .p-bag.act:hover{ filter:brightness(1.13); }",
      "#hud .p-doll.act:focus-visible, #hud .p-bag.act:focus-visible{ outline:2px solid "+C.gold+"; outline-offset:2px; }",
      "#hud .w-bag .slot.eq{ cursor:pointer; }",
      "#hud .gear{ margin-left:6px; color:"+C.textGold+"; font-size:calc(13px*var(--s)); line-height:1; user-select:none; }",
      "#hud .gear:hover{ color:"+C.goldL+"; }",
      // drawer toggle button (mobile)
      "#hud .drawerBtn{ position:absolute; top:8px; right:8px; width:44px; height:44px; display:none; align-items:center; justify-content:center;"
        +" pointer-events:auto; background:"+C.panel+"; border:2px solid "+C.gold+"; border-radius:4px; color:"+C.textGold+"; font-size:18px; cursor:pointer; }",
      // ---- responsive (§3) ----
      "@media (max-width:1023px){ #hud .rail{ width:128px !important; } #hud .mini{ height:96px !important; } }",
      // CAS-337 — on a TOUCH tablet the canvas top-right action buttons (inv/talents/map/pause)
      // render over the rail's top edge; drop the rail + drawer button below that ~52px button
      // row so the paperdoll/backpack frames never sit under the canvas buttons.
      "@media (pointer:coarse) and (min-width:640px){ #hud .rail{ top:64px !important; } #hud .drawerBtn{ top:64px; } }",
      "@media (max-width:639px){",
      "  #hud .stat{ min-width:0 !important; width:min(64vw,220px) !important; }",
      "  #hud .rail{ position:absolute; top:0; bottom:0; right:0; width:170px !important; transform:translateX(112%); transition:transform .18s ease;"
        +" background:rgba(6,7,10,.92); padding:108px 8px 8px !important; overflow:auto; }",
      "  #hud.draw .rail{ transform:translateX(0); }",
      // CAS-337 — clear the canvas top-right button row (~52px) so the drawer toggle never sits on it
      "  #hud .drawerBtn{ display:flex; top:60px; }",
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

    // ===== A — Vitals (top-left): full PixelLab statframe; baked skull stays, live
    //        HP/MP/XP bars overlay the right-side track block; name/level caption below.
    const tl=mk("div", ["position:absolute","left:12px","top:12px"].join(";"), root);
    const stat=mk("div",null,tl); stat.className="p-stat";
    const sw=mk("div",null,stat); sw.className="w-statBars";
    nodes.hp=bar(sw, C.hpf, C.hpb, "♥");
    nodes.mp=bar(sw, C.mpf, C.mpb, "✦");
    nodes.xp=bar(sw, C.xpf, C.xpb, "XP");
    // caption (name · class · Nv · gold) — the statframe art bakes no text region
    const cap=mk("div",null,tl); cap.className="cap";
    nodes.name=mk("span",null,cap); nodes.name.className="name"; nodes.name.textContent="—";
    nodes.cls=mk("span",null,cap); nodes.cls.className="sub"; nodes.cls.textContent="—";
    nodes.lvl=mk("span","margin-left:auto;color:"+C.textGold+";font-size:calc(12px*var(--s))",cap); nodes.lvl.textContent="Nv —";
    // CAS-417: coin icon heads the gold caption (own <img> — gold span text repaints freely)
    const coin=document.createElement("img"); coin.className="sic"; coin.alt="";
    coin.src=ICONS+"hud_coin.png"+iconV(); cap.appendChild(coin);
    nodes.gold=mk("span",null,cap); nodes.gold.className="gold"; nodes.gold.textContent="0 oro";
    // CAS-337 — settings gear: opens the pause/settings hub (Escape equivalent). Interactive.
    nodes.gear=mk("span",null,cap); nodes.gear.className="gear act"; nodes.gear.textContent="⚙";
    nodes.gear.title="Ajustes / pausa"; nodes.gear.setAttribute("role","button"); nodes.gear.setAttribute("aria-label","Abrir ajustes");
    nodes.gear.onclick=()=>{ try{ act.openSettings&&act.openSettings(); }catch(e){} };
    nodes.portrait=null; // skull portrait is baked into the panel art now

    // ===== B — Status chips (under vitals) =====
    nodes.chips=mk("div", ["position:absolute","left:12px","top:calc(150px*var(--s))","max-width:220px","pointer-events:none"].join(";"), root);

    // ===== drawer toggle (mobile only, via CSS) =====
    nodes.drawerBtn=mk("div",null,root); nodes.drawerBtn.className="drawerBtn"; nodes.drawerBtn.textContent="≡";
    nodes.drawerBtn.setAttribute("aria-label","Abrir equipo / mochila");
    nodes.drawerBtn.onclick=()=>{ drawerOpen=!drawerOpen; root.classList.toggle("draw",drawerOpen); };

    // ===== Right rail: D paper-doll (EQUIPO) · E backpack (MOCHILA) — full PixelLab panels =====
    // CAS-299 cutover: the legacy on-canvas minimap (bottom-right, with real layout + portal
    // blips) is the single minimap, so the HUD's decorative minimap STUB is dropped here to
    // avoid a double-minimap. The rail reuses ONLY the Tibia equip/inventory mirror.
    const rail=mk("div", ["position:absolute","right:12px","top:12px","width:172px","display:flex","flex-direction:column","gap:10px","align-items:flex-end"].join(";"), root);
    rail.className="rail";
    const doll=mk("div",null, rail); doll.className="p-doll act";
    nodes.equip=mk("div",null, doll); nodes.equip.className="w-doll"; // CAS-416: rows are absolutely icon-aligned via CSS
    const bag=mk("div",null, rail); bag.className="p-bag act";
    nodes.inv=mk("div","display:grid;grid-template-columns:repeat(6,1fr);grid-template-rows:repeat(6,1fr);gap:0", bag); nodes.inv.className="w-bag";
    // CAS-336 + CAS-337 — FUNCTIONAL panels (board CAS-335 "no tiene funciones / sin
    // función"): these right-rail mirrors used to be pure decoration (the wrapper is
    // pointer-events:none, so clicks fell through to the canvas and cast a spell). Now
    // paperdoll + backpack OPEN the interactive inventory scene, and a click on a FILLED
    // backpack cell equips/swaps that item. Presentation→intent only: a click drives the
    // SAME scene/equip flow a key press already does — via the act bridge, with a KeyI
    // keypress FALLBACK — so the canvas inventory stays the single functional owner (no
    // double-UI, CAS-299) and the sim/soak signal is untouched. pointer-events:auto only
    // on these two frames; the wrapper stays click-through so it never eats a move/attack
    // tap (CAS-279 soak contract). A SINGLE click handler (onclick) avoids a double-toggle.
    for(const p of [doll, bag]){ p.style.pointerEvents="auto"; p.style.cursor="pointer";
      p.setAttribute("role","button"); p.setAttribute("tabindex","0");
      p.onclick=openInventory;
      p.addEventListener("keydown",(ev)=>{ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); openInventory(); } }); }
    doll.title="Equipo — abrir inventario (I)"; doll.setAttribute("aria-label","Abrir equipo / inventario");
    bag.title="Mochila — abrir inventario · clic en un objeto para equiparlo"; bag.setAttribute("aria-label","Abrir mochila / inventario");
    // click a FILLED backpack cell → equip/swap via the existing sim command. Only consume
    // (stopPropagation) the click when the bridge is present; otherwise it bubbles to the
    // panel onclick above and opens the inventory instead (graceful degradation).
    nodes.inv.onclick=(e)=>{ const cell=e&&e.target&&e.target.closest&&e.target.closest(".slot"); if(!cell) return;
      const idx=Array.prototype.indexOf.call(nodes.inv.children, cell);
      if(idx>=0 && cell.classList.contains("eq") && act && typeof act.equipBag==="function"){
        e.stopPropagation(); try{ act.equipBag(idx); }catch(_){} paint(); } };

    // ===== Bottom-left: G console (combat log) — full PixelLab console panel =====
    // CAS-299 cutover: the legacy on-canvas SPELL BAR (bottom-centre, with real cooldowns +
    // mp costs) is the single action surface, so the HUD's decorative 1-10 action-bar STUB is
    // dropped to avoid a double action bar. Only the Tibia console remains here.
    const bottom=mk("div", ["position:absolute","left:12px","right:12px","bottom:12px","display:flex","gap:8px","align-items:flex-end","justify-content:flex-start","flex-wrap:wrap"].join(";"), root);
    bottom.className="bottom";
    const con=mk("div",null, bottom); con.className="p-con";
    nodes.log=mk("div","display:flex;flex-direction:column;gap:1px;justify-content:flex-end", con); nodes.log.className="w-con";
    if(!log.length) log.push("Bienvenido a Mithralda"); // CAS-337 — console is never blank; combat events append live

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
    // CAS-417: each cell owns a persistent <img> (slot icon) + <span> (label) so the
    // 200ms repaint only touches text/class; the img src changes ONLY when the slot
    // kind changes (no per-tick DOM churn / image re-decode).
    while(host.childElementCount<n){ const e=mk("div",null,host); e.className="slot"; e.tabIndex=-1;
      const im=document.createElement("img"); im.className="sic"; im.alt=""; im.style.display="none"; e.appendChild(im);
      e.appendChild(document.createElement("span")); }
    const kids=host.children;
    for(let i=0;i<kids.length;i++){ const it=items[i]; const el=kids[i]; const im=el.firstChild, sp=el.lastChild;
      const key=(it&&it.slot)?it.slot:null;
      if(el._ick!==key){ el._ick=key;
        if(key){ im.src=ICONS+"slot_"+key+".png"+iconV(); im.style.display=""; }
        else { im.removeAttribute("src"); im.style.display="none"; } }
      if(it && !it.empty){ el.className="slot eq"; sp.textContent=(cb?cb(it):"")+(it.label||"·"); }
      else if(it && it.empty){ el.className="slot off"; sp.textContent=it.label||""; } // labelled-but-empty (equip legend)
      else { el.className="slot off"; sp.textContent=""; } }
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
    // CAS-336: the HUD overlay is the IN-PLAY surface only. Every other scene draws its
    // OWN full-screen UI — the menu / class-select, and especially the canvas modals
    // (inventory · forge · talents · mastery · customize · shop · bounty · dialogue ·
    // pause). Leaving the overlay up there stacked the right-rail EQUIPO/MOCHILA frames
    // on top of the inventory modal → the board's "paneles sobrepuestos". Hide the whole
    // overlay unless scene==="play"; restore it the instant we return to play.
    const inPlay = !!(s && s.scene==="play");
    root.style.visibility = inPlay ? "visible" : "hidden";
    if(!inPlay){ prev = s||null; return; }
    const cb = !!(s&&s.colorblind);
    const rm = !!(s&&s.reduceMotion); root.classList.toggle("rm", rm);
    const cue = (it)=>{ const r=it&&(it.rarity|0); if(!cb||!r) return ""; const g=RARITY_CUE[Math.min(4,r)]; return g?(g+" "):""; };
    if(!s || s.hp==null){ // menu / no hero — placeholders, never throw
      nodes.name.textContent="—"; nodes.cls.textContent="—"; nodes.lvl.textContent="Nv —"; nodes.gold.textContent="0 oro";
      fillBar(nodes.hp,0,1); fillBar(nodes.mp,0,1); fillBar(nodes.xp,0,1);
      paintSlots(nodes.equip,[],3); paintSlots(nodes.inv,[],36);
      if(nodes.minimap) nodes.minimap.textContent=(s&&s.zone)?String(s.zone):"—";
      nodes.chips.textContent=""; paintLog();
      prev=s||null; return;
    }
    deriveLog(s);
    nodes.name.textContent=s.name||"Héroe";
    nodes.cls.textContent=s.cls||"—";
    nodes.lvl.textContent="Nv "+(s.lvl||1);
    nodes.gold.textContent=(s.gold|0)+" oro";
    if(nodes.portrait) nodes.portrait.textContent=(s.name||s.cls||"H").slice(0,1).toUpperCase();
    fillBar(nodes.hp, s.hp, s.maxHp);
    fillBar(nodes.mp, s.mp, s.maxMp);
    fillBar(nodes.xp, s.xp, s.xpNext);
    paintSlots(nodes.equip, s.equip||[], 3, cue);
    paintSlots(nodes.inv, s.bag||[], 36, cue);
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
  function boot(getStateFn, actions){
    if(booted || typeof window==="undefined") return; booted=true;
    getState = typeof getStateFn==="function" ? getStateFn : (()=>null);
    act = actions && typeof actions==="object" ? actions : {}; // CAS-337 click→intent bridge
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
