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
import { configure as configureSim, G, update as simUpdate, dev as simDev, serializeSave, equipBag as simEquipBag, conquestSnap, resetMeta, metaSnap, buyMetaNode, ascendMeta, castAbility as simCastAbility, castUltimate as simCastUltimate, equipLoad } from "./sim/sim.js";
import { audio } from "./audio.js";
import { view } from "./view.js";
import { uiLayout } from "./ui/layout.js"; // CAS-1613: classic-sidebar opt-in flag (default OFF)
import { io, initInput, syncMenuDom, positionNameInput, ui, topBtns, sidebarBtns } from "./input.js";
import { createRenderer } from "./render/render.js";
import { loadAllAssets, IMG } from "./render/sprites.js";
import { loadUIFont } from "./render/font.js";   // CAS-1610: pixel UI webfont (replaces Courier)
import { rarityRank } from "./sim/gear.js";
import { STAMINA, FLASK, EQUIP_LOAD, TWO_HAND, SEEDED_CHALLENGE, PIXELART } from "./sim/config.js";  // CAS-2208: PIXELART for the dev A/B toggle hook   // CAS-1841/CAS-1854/CAS-1889/CAS-1895: gated HUD feeds (vigor bar + Estus pips + banda de carga + marcador a dos manos — absent OFF ⇒ HUD byte-identical). CAS-2090: SEEDED_CHALLENGE for the UI-layer daily code (date derived HERE, never in the deterministic sim)
import * as persist from "./persist.js";
import * as settings from "./settings.js";
import { analytics } from "./analytics.js";
import { daily } from "./daily.js";
import { bestiary } from "./bestiary.js";
import { overlay } from "./overlay.js";
import { hud } from "./hud.js";

export function createGame(canvas, ctx, getView){
  // wire the simulation's injected dependencies (input intents, audio, viewport)
  configureSim({ io, audio, view });
  initInput(canvas);
  const renderer = createRenderer(ctx);

  // one fixed simulation step + the menu DOM sync (the only DOM the loop touches)
  // CAS-113: throttled progression autosave rides the sim step (never per-frame).
  // CAS-131: a single scene-transition observer fires the UI open/close blip so the
  // SFX wiring lives in ONE place instead of scattered across every menu entry point.
  const MENU_SCENES=new Set(["inventory","talents","mastery","shop","bounty","bestiary","pause","dialogue"]);
  let prevScene=G.scene;
  function update(dtMs){ simUpdate(dtMs); persist.tick(dtMs/1000); analytics.tick(dtMs, G); daily.tick(); syncMenuDom();
    const s=G.scene; if(s!==prevScene){
      const into=MENU_SCENES.has(s), from=MENU_SCENES.has(prevScene);
      if(into&&!from) audio.sfx.uiOpen(); else if(from&&!into) audio.sfx.uiClose();
      // CAS-277: fire the CAS-132 funnel event when the end-of-run recap first appears,
      // so its "one more run" impact is measurable (retry events fire from input.js).
      if(s==="dead") analytics.event("recap_shown");
      positionChatInput(); // CAS: chat input only shows in the play scene
      prevScene=s; } }
  function render(alpha){ renderer.render(alpha); }
  // CAS: fixed Tibia-style chrome on wide screens — a sidebar on the RIGHT (SIDEBAR_W) plus a
  // bottom bar (BOTTOMBAR_H: the attacks hotbar with a chat input beneath it). The ornate DOM
  // HUD is force-hidden while active (no double UI); narrow/mobile collapses both to 0.
  const SIDEBAR_W=216, SIDEBAR_MIN=900, BOTTOMBAR_H=94;
  let chatEl=null;
  function pushChat(who,text){ if(!G.chatLog) G.chatLog=[]; G.chatLog.push({who,text}); G.chatT=G.t||0; if(G.chatLog.length>40) G.chatLog.shift(); }
  function ensureChat(){ if(chatEl || typeof document==="undefined") return;
    chatEl=document.createElement("input");
    chatEl.id="chatInput"; chatEl.maxLength=120; chatEl.autocomplete="off"; chatEl.spellcheck=false;
    chatEl.setAttribute("aria-label","Chat"); chatEl.placeholder="Escribe y pulsa Enter…";
    chatEl.style.cssText="position:fixed;display:none;z-index:30;box-sizing:border-box;font:13px 'MithraldaPixel',monospace;"
      +"color:#d8d3c4;background:#0c0e13;border:1px solid #3a3f49;border-radius:3px;outline:none;padding:5px 9px;";
    // typing must never leak to the game (WASD/hotkeys); only send on Enter, cancel on Escape.
    chatEl.addEventListener("keydown",(e)=>{ e.stopPropagation();
      if(e.key==="Enter"){ const t=chatEl.value.trim(); if(t) pushChat((G.hero&&G.hero.name)||"Tú", t); chatEl.value=""; chatEl.blur(); }
      else if(e.key==="Escape"){ chatEl.value=""; chatEl.blur(); } });
    chatEl.addEventListener("focus",()=>{ chatEl.style.borderColor="#e0b94a"; });
    chatEl.addEventListener("blur",()=>{ chatEl.style.borderColor="#3a3f49"; });
    document.body.appendChild(chatEl);
  }
  function positionChatInput(){ ensureChat(); if(!chatEl) return;
    if(view.bbh>0 && G.scene==="play"){ const m=8, w=Math.max(80,view.gw()-2*m);
      chatEl.style.display="block"; chatEl.style.left=m+"px"; chatEl.style.top=(view.VH-30)+"px";
      chatEl.style.width=w+"px"; chatEl.style.height="26px"; }
    else { chatEl.style.display="none"; if(document.activeElement===chatEl) chatEl.blur(); } }
  function applySidebar(){ const wide=view.VW>=SIDEBAR_MIN;
    // CAS-1613 (PR4): the fixed Tibia sidebar is RETIRED as the default. Only when the player
    // opts back into the classic chrome (uiLayout.sidebarOn(), OFF by default) do we reserve
    // the 216px right column + 94px bottom bar; otherwise the full width/height is game space
    // and the canvas HUD (action bar + HP/MP hombreras + XP strip) owns the vitals. On wide
    // screens the legacy DOM overlay stays force-hidden either way (canvas HUD is the sole UI);
    // narrow/mobile keeps the DOM HUD until the dedicated mobile pass.
    const on = wide && uiLayout.sidebarOn();
    view.sbw = on ? SIDEBAR_W : 0; view.bbh = on ? BOTTOMBAR_H : 0;
    try{ hud.setForcedOff(wide); }catch(e){}
    positionChatInput(); }
  // CAS-1613: flipping the sidebar flag (pause menu / __sidebar) re-applies the layout live.
  uiLayout.setRelayout(applySidebar);
  function onResize(w,h){ view.VW=w; view.VH=h; applySidebar(); if(G.scene==="menu") positionNameInput(); }
  function onFocusLost(){ if(G.scene==="play") G.scene="pause"; }
  function devInfo(){ return "ent:"+G.enemies.length+" fx:"+G.fx.length+" scene:"+G.scene; }

  // boot
  loadAllAssets();
  // CAS-1610: register the pixel UI webfont so canvas (ctx.font) + DOM chrome render it.
  // Non-blocking: the family stack falls back to system `monospace` on the first frames
  // (and for glyphs the font lacks) — never the old typewriter face. Once ready, text
  // repaints in the pixel font on the next frame (canvas redraws every frame).
  loadUIFont();
  // CAS-265: load persisted accessibility / QoL settings (reduce-motion, colour-blind
  // cues, screen-shake, key rebindings) BEFORE input + the first frame so a returning
  // player's preferences are live from frame 0. Separate localStorage key from the save,
  // so wiping a character never resets accessibility prefs. Defaults preserve behaviour.
  settings.boot();
  // CAS-113: rehydrate a saved run BEFORE the menu DOM syncs — a valid save jumps
  // straight into play (skipping name/class); no/invalid save leaves the menu flow.
  // CAS-1557: rehydrate the account-wide meta-progression (Esencia + altar nodes) from its OWN
  // store BEFORE persist.boot() rehydrates a run save — so a loaded hero's loadSave reconcile
  // reads the live meta, and a fresh createHero applies it. Independent of any character.
  persist.bootMeta();
  persist.bootArena();  // CAS-1664: rehydrate the Arena de Oleadas best wave from its OWN store (independent of any character)
  persist.bootBossRush(); // CAS-1988: rehydrate the Modo Boss Rush best round from its OWN store (mithralda.bossrush.v1 — independent of any character; never the run save)
  persist.bootSeededChallenge(); // CAS-2090: rehydrate the per-seed Desafío con Semilla records from their OWN store (mithralda.seededchallenge.v1 — independent of any character; never the run save)
  // CAS-2090: derive the shareable "daily seed" code HERE (UI layer) — the calendar date must NEVER enter the
  // deterministic sim (Date.now/new Date would break byte-determinism). Everyone playing the same calendar day gets
  // the SAME code ⇒ the SAME run. codePrefix + YYYYMMDD (local day, mirrors daily.js/analytics.js so it lines up).
  { const dt=new Date(); const ds=""+dt.getFullYear()+String(dt.getMonth()+1).padStart(2,"0")+String(dt.getDate()).padStart(2,"0");
    G.seededDailyCode = (SEEDED_CHALLENGE.codePrefix||"MITH-") + ds; }
  persist.bootCodex(); // CAS-1751: rehydrate the account-wide Códice de Botín ledger from its OWN store BEFORE persist.boot() so a loaded hero's reconcile reads the live codex bonus (account-wide, independent of any character)
  persist.bootTitles(); // CAS-1758: rehydrate the account-wide Títulos de Gesta ledger from its OWN store BEFORE persist.boot() so a loaded hero's reconcile caches the equipped title (account-wide, independent of any character)
  persist.bootPacts(); // CAS-1763: rehydrate the Pactos de Poder (Power Pacts) preference from its OWN store (account-wide, independent of any character; effects derive live in the seam each run)
  persist.bootBloodstain(); // CAS-1867: rehydrate the Mancha de Sangre (at-risk Esencia dropped at the death point) from its OWN store (mithralda.bloodstain.v1 — never the run save); gated on BLOODSTAIN.enabled ⇒ OFF leaves G.bloodstain null (byte-id)
  persist.bootHints(); // CAS-1996: rehydrate the seen CONTEXT-HINTS ledger from its OWN store (mithralda.hints.v1 — never the run save); harmless read even when COMBAT_CODEX is dark (fireHint gates writes ⇒ store never created)
  persist.boot();
  persist.initFlush();
  // CAS-132: privacy-light retention/funnel analytics. boot() opens the anonymous
  // session + records the `boot` funnel step; initFlush() finalizes session duration
  // on tab hide/unload. Pure observer — analytics.tick(dt,G) in update() only READS G.
  analytics.boot();
  analytics.initFlush();
  // CAS-134: the daily return loop (daily contracts + login streak). boot() loads/rolls
  // the day's deterministic contracts + streak chain; daily.tick() in update() observes
  // contract progress READ-ONLY off G; initFlush() persists on tab hide/unload. Pure
  // client-side, fork-neutral — reversible by deleting daily.js + its one localStorage key.
  daily.boot();
  daily.initFlush();
  // CAS-386: the Bestiary/Codex collection meta-goal. Boot loads its own localStorage
  // claimed-tier store; it READS counts live from the save's killsByType (CAS-375) and
  // needs no per-frame tick (no delta accumulation) — a pure observer + claim seam,
  // reversible by deleting bestiary.js + its one key.
  bestiary.boot();
  // CAS-279: opt-in retention telemetry overlay (F9, default OFF). Pure read-only HUD over
  // analytics.js / daily.js so QA can read accumulated retention numbers off a live playtest.
  // Touches no sim/balance/input — toggling it changes nothing in the game itself.
  overlay.boot();
  // CAS-287/CAS-299: redesigned Tibia-style HUD overlay — now DEFAULT-ON (board-approved
  // cutover a35ddd26). render.js suppresses the legacy on-canvas vitals while it is active so
  // there is a single coherent UI (no double-UI). hudSnapshot() is a PURE READ-ONLY view of
  // G.hero used only to paint the overlay; it touches no sim/balance/input, so the cutover is
  // presentation-only and soak-safe. Escape hatch: `?nohud` / `__hud.hide()`. Visual layer +
  // UI assets come from the Art Director spec (CAS-286).
  function hudSnapshot(){
    const a11y={ reduceMotion:!!(G.settings&&G.settings.reduceMotion), colorblind:!!(G.settings&&G.settings.colorblind) };
    const h=G.hero; if(!h) return Object.assign({ scene:G.scene, zone:G.zone||G.scene }, a11y);
    return Object.assign({
      scene:G.scene, zone:G.zone||G.scene, name:h.name, cls:h.cls, lvl:h.lvl|0, gold:h.gold|0,
      // CAS-1758: equipped Título de Gesta (derived h.title). Empty/absent ⇒ HUD shows just the name (aditivo).
      title:h.title||"",
      hp:h.hp, maxHp:h.maxHp, mp:h.mp, maxMp:h.maxMp, xp:h.xp, xpNext:h.xpNext,
      // CAS-297: rarity is a STRING key ("common"/"uncommon"/"rare"/"epic") in the sim, but the
      // HUD's colour-blind shape-cue (hud.js cue()) keys off a NUMERIC rank. Resolve it here via
      // rarityRank() so the ◦/◆/★ glyphs actually render (a raw string|0 collapsed every item to 0).
      equip:["weapon","body","shield"].map(sl=>{ const lbl={weapon:"Arma",body:"Cuerpo",shield:"Escudo"}[sl]; const it=h.equip&&h.equip[sl]; return it?{slot:sl,label:lbl,rarity:rarityRank(it&&it.rarity)}:{slot:sl,label:lbl,rarity:0,empty:true}; }),
      bag:(h.bag||[]).map(b=>({ label:"", rarity:rarityRank(b&&b.rarity) })), bagCap:16,
      // CAS-299: status afflictions for the HUD chip row — parity with the on-canvas chips the
      // cutover now suppresses (h.dots = DoTs keyed by type; slowT / stun are scalar timers).
      status:(()=>{ const out=[]; if(h.dots) for(const k in h.dots){ const d=h.dots[k]; if(d) out.push({type:k, dur:d.t}); }
        if(h.slowT>0) out.push({type:"slow", dur:h.slowT}); if(h.stun>0) out.push({type:"stun", dur:h.stun}); return out; })(),
      // CAS-450: Conquista/World-Tier read-only view for the HUD trophy chips (hud.js paintConquest)
      conquest:conquestSnap(),
      // CAS-1841: vigor feed for the HUD bar — ONLY when STAMINA.enabled, so with the knob OFF these keys are
      // absent ⇒ hud.js never creates the bar ⇒ the snapshot + DOM are byte-identical to HEAD.
      ...(STAMINA.enabled ? { stam:h.stam, stamMax:STAMINA.max, stamFlash:h._stamFlash } : null),
      // CAS-1854: Estus feed para los pips + tinte del HUD — ONLY when FLASK.enabled, so con el knob OFF estas claves
      // están ausentes ⇒ hud.js nunca crea el widget ⇒ el snapshot + DOM son byte-idénticos a HEAD.
      ...(FLASK.enabled ? { flaskCharges:h.flaskCharges, flaskMax:FLASK.charges, flaskDrinkT:h.flaskDrinkT, flaskDrinkMax:FLASK.drinkMs/1000 } : null),
      // CAS-1889: banda de carga de equipo para el tinte de la barra de vigor (la barra ES el recurso de esquiva). ONLY when
      // EQUIP_LOAD.enabled ⇒ con el knob OFF la clave está ausente ⇒ hud.js no tinta ⇒ snapshot + DOM byte-idénticos a HEAD.
      ...(EQUIP_LOAD.enabled ? { equipBand:equipLoad(h).band } : null),
      // CAS-1895: marcador de EMPUÑADURA A DOS MANOS para el HUD DOM — ONLY when TWO_HAND.enabled, so con el knob OFF la
      // clave está ausente ⇒ hud.js no marca ⇒ snapshot + DOM byte-idénticos a HEAD. La banda de vigor YA se re-tinta sola
      // (equipLoad excluye el escudo a dos manos ⇒ el drop de banda es visible), esto añade el marcador explícito.
      ...(TWO_HAND.enabled ? { twoHand:!!h.twoHand } : null),
    }, a11y);
  }
  // CAS-336/CAS-337 — make the HUD panels FUNCTIONAL (board CAS-335: "no tiene funciones").
  // A presentation→intent BRIDGE: panel clicks drive the SAME scene/equip flows a key press
  // or canvas tap already does. It mutates only G.scene (a UI mode) and calls the existing
  // sim equipBag() — no new sim/balance/tunable logic, so determinism and the soak signal
  // stay intact (a click here == pressing I / Esc / equipping in the inventory).
  const hudActions = {
    // backpack / paperdoll → toggle the interactive inventory scene (KeyI equivalent)
    openInventory(){ const h=G.hero; if(!h) return; if(G.scene==="play") G.scene="inventory"; else if(G.scene==="inventory") G.scene="play"; },
    // gear button → the pause/settings hub (Escape equivalent)
    openSettings(){ const h=G.hero; if(!h) return; if(G.scene==="play"||G.scene==="inventory") G.scene="pause"; else if(G.scene==="pause") G.scene="play"; },
    // click a filled backpack cell → equip/swap that item via the existing sim command
    equipBag(i){ const h=G.hero; if(!h||!h.bag||h.bag[i|0]==null) return; try{ simEquipBag(i|0); }catch(e){} },
    // is a panel-driven action currently meaningful? (hero present, not in a blocking menu)
    active(){ return !!(G.hero && (G.scene==="play"||G.scene==="inventory"||G.scene==="pause")); },
  };
  hud.boot(hudSnapshot, hudActions);
  // Read API for the analytics.html dashboard + QA harness (own anonymous device data).
  if(typeof window!=="undefined"){ window.__analytics=analytics.dev; window.__daily=daily.dev; window.__bestiary=bestiary.dev;
    // CAS-1557: meta-progression QA/dev hooks — read the account meta (essence + node levels)
    // and wipe it back to zero, mirroring the run-reset globals. buy() is exposed for harness
    // scripting of the altar; the human path is the on-screen Altar panel.
    // CAS-1565: __metaBuy accepts t2_* keys (buyMetaNode gates them on t2Unlock); __metaReset now
    // also clears Tier-2 + ascension; __metaAscend performs the opt-in prestige (full-max guarded).
    window.__meta=()=>metaSnap(); window.__metaReset=()=>resetMeta(); window.__metaBuy=(k)=>buyMetaNode(k); window.__metaAscend=()=>ascendMeta();
    // CAS-1649: meta-v3 legacy hooks — codex, eligible pool, and grant (deterministic, 0 RNG).
    window.__metaLegacy=()=>simDev.metaLegacy(); window.__legacyPool=()=>simDev.legacyPool(); window.__legacyChoose=(k)=>simDev.legacyChoose(k);
    // CAS-1613 (PR4): read/flip the classic-sidebar opt-in flag headlessly (default OFF). Flipping
    // re-applies the layout live (view.sbw/bbh + DOM-HUD force-off) — presentation only, RNG-neutral.
    window.__sidebar=(v)=>{ if(v!==undefined) uiLayout.setSidebar(v); return { on:uiLayout.sidebarOn(), sbw:view.sbw, bbh:view.bbh }; }; }
  if(typeof location!=="undefined" && location.search.indexOf("dev")>=0){
    window.__dev={ spawn:(type,dx,dy)=>simDev.spawn(type,dx,dy), tp:(tx,ty)=>simDev.tp(tx,ty),
      // introspection contract consumed by tools/smoke.mjs (read-only views of sim state)
      scene:()=>G.scene,
      // CAS-1562: read-only load state of the altar node PNG icons — proves renderAltar
      // takes the PNG branch (not glyph fallback). Consumed by tools/cas1562-altar-icons-live.mjs
      altarIcons:()=>["hpmax","dmg","movespd","reroll","startgold"].map(k=>{const im=IMG["assets/ui/icons/altar_"+k+".png"];return{k,loaded:!!(im&&im.complete&&im.naturalWidth),w:im?im.naturalWidth:0,h:im?im.naturalHeight:0};}),
      hero:()=>G.hero?{cls:G.hero.cls,x:G.hero.x,y:G.hero.y}:null,
      // CAS-92: read-only hero animation state, used by tools/hero-anim-shot.mjs
      heroAnim:()=>G.hero?{state:G.hero.animState,rolling:!!G.hero.rolling,atk:G.hero.atkAnim>0,hurtAnim:+(G.hero.hurtAnim||0).toFixed(3),specialAnim:+(G.hero.specialAnim||0).toFixed(3),facing:+(G.hero.facing||0).toFixed(4),moved:!!G.hero.moved}:null, // CAS-347: read-only facing/moved for the facing-follows-movement QA harness
      // CAS-1619: read-only dash-streak orientation so QA can prove the dash VFX follows the real
      // dash vector in all 8 directions (streak angle == atan2(rollY,rollX); dir8 bucket 0=E..7=NE).
      dashStreak:()=>{const h=G.hero; if(!h||!h.rolling||!(h.rollX||h.rollY))return{active:false}; const ang=Math.atan2(h.rollY,h.rollX); return {active:true, ang:+ang.toFixed(4), dx:+(h.rollX||0).toFixed(4), dy:+(h.rollY||0).toFixed(4), dir8:((Math.round(ang/(Math.PI/4))%8)+8)%8, rollT:+(h.rollT||0).toFixed(4)};},
      enemyCount:()=>G.enemies.length,
      // CAS-2208: read/flip the PIXELART master A/B kill-switch headlessly (render-only, RNG-neutral).
      // pixelart() reads; pixelart(false) forces procedural for hero/enemies/VFX/tiles; pixelart(true)
      // restores sprites. Same-page A/B: flip and re-screenshot the identical seed with zero reload.
      pixelart:(v)=>{ if(v!==undefined) PIXELART.spritesEnabled=!!v; return PIXELART.spritesEnabled; },
      // CAS-2230: día/noche + farolas OBSERVABLE hook (DARK). daynight() lee {enabled,phase,tint,glow,lamps};
      // daynight(p) fija un override de fase 0..1 (p=null vuelve al reloj compartido) para screenshots QA.
      daynight:(p)=>renderer.daynight(p),
      // CAS-2231: clima (lluvia/niebla) OBSERVABLE hook (DARK). weather() lee {enabled,phase,rain,fog,state,drops};
      // weather(p) fija un override de fase 0..1 (p=null vuelve al reloj compartido) o {enabled,phase} para QA.
      weather:(p)=>renderer.weather(p),
      // CAS-2234: banner de zona/región OBSERVABLE hook (DARK). zone() lee {enabled,current,banner,regions};
      // zone("Templo") fuerza un banner; zone(null) lo limpia; zone({enabled:true}) flip runtime IN-MEMORY para QA.
      zone:(p)=>renderer.zone(p),
      // CAS-2242: Zona Segura / Santuario de Ciudad OBSERVABLE hook (DARK). safeZone() lee estado AUTORITATIVO (sim):
      // {enabled,inZone,nearTemple,ratePctPerSec,regenHpPerSec,hp,maxHp,pauseT,bbox,temple,...}. Escrituras QA:
      // safeZone({enabled:true}) flip runtime IN-MEMORY (afecta sim tick + afordancia render, mismo módulo config);
      // safeZone({pause:s}) fuerza la pausa post-daño; safeZone({setHp:n}) fija HP para observar el regen determinista.
      safeZone:(p)=>simDev.safeZone(p),
      // CAS-2245: HOME-TEMPLE RESPAWN OBSERVABLE hook (DARK). templeRespawn() lee {enabled,point,temple,offsetY,
      // inSafeZone,nearTemple,distToTemple,hero}; templeRespawn({enabled:true}) flip runtime IN-MEMORY (sim, mismo
      // módulo config); templeRespawn({respawn:true}) mata (si vivo) + ejecuta respawn() ⇒ aterriza en el Templo.
      templeRespawn:(p)=>simDev.templeRespawn(p),
      // CAS-2250: SANTUARIO NO-AGGRO OBSERVABLE hook (DARK). noAggro() lee {enabled,noAggro,heroInZone,enemies:[{state,dist,
      // eInZone,hostile}]}; noAggro({noAggro:true}) flip runtime IN-MEMORY (sim, mismo módulo config); noAggro({spawn,dx,dy})
      // spawnea un mob YA en persecución cerca del héroe para observar el leash al entrar éste a la Zona Segura.
      noAggro:(p)=>simDev.noAggro(p),
      // CAS-2255: RESTED XP / BONO DE DESCANSO OBSERVABLE hook (DARK). rested() lee {enabled,inZone,pool,cap,pct,xpMult,
      // accrualPerSec,willSpend,hasField,xp,lvl}; rested({enabled:true}) flip runtime IN-MEMORY (sim, mismo módulo config);
      // rested({setPool:n}) fija el pool; rested({addXp:n}) aplica gainXP vía el ÚNICO chokepoint (observa bonus + drenado).
      rested:(p)=>simDev.rested(p),
      // CAS-2266: RECALL / PIEDRA DE VÍNCULO OBSERVABLE hook (DARK). recall() lee {enabled,inZone,bound,bindPoint,sanctuary,
      // cooldownSec,recallCD,ready,channelSec,channelT,hasField,dist,hero}; recall({enabled:true}) flip runtime IN-MEMORY (sim,
      // mismo módulo config); recall({bind:true}) fuerza el vínculo al Santuario; recall({setCd:n}) fija el CD; recall({cast:true})
      // dispara tryRecall() por el chokepoint real (teleport a bindPoint + arranque del cooldown).
      recall:(p)=>simDev.recall(p),
      // CAS-2269: TABLÓN DE RECOMPENSAS / BOUNTY BOARD OBSERVABLE hook (DARK). bounty() lee {enabled,inZone,active,progress,
      // complete,featured,bountyIdx,hasField,kills,gold,lvl,hero}; bounty({enabled:true}) flip runtime IN-MEMORY (sim, mismo
      // módulo config); bounty({act:true}) dispara tryBounty() por el chokepoint real (acepta/reclama/no-op); bounty({setIdx:n})
      // fija el destacado; bounty({clear:true}) limpia el contrato activo.
      bounty:(p)=>simDev.bounty(p),
      // CAS-2272: RENOMBRE DEL SANTUARIO / SANCTUARY REPUTATION OBSERVABLE hook (DARK). sanctuary() lee {enabled,rep,rankIdx,rank,
      // nextRank,into,span,toNext,xpMult,hasField,lvl,xp,hero}; sanctuary({enabled:true}) flip runtime IN-MEMORY (sim, mismo módulo
      // config); sanctuary({setRep:n})/{addRep:n} fijan/suman rep para observar cruces de rango; sanctuary({perkXp:n}) devuelve la
      // XP de bounty con el perk del rango actual aplicado.
      sanctuary:(p)=>simDev.sanctuary(p),
      // CAS-2278: INTENDENTE DEL SANTUARIO / SANCTUARY QUARTERMASTER OBSERVABLE hook (DARK). quartermaster() lee {enabled,inZone,
      // rankIdx,rewards:[{id,rank,name,kind,value,unlocked,claimed}],claimedIds,title,effects,recallCdSec,restedCap,hasField,hero};
      // quartermaster({enabled:true}) flip runtime IN-MEMORY; quartermaster({grantRep:n}) suma rep para observar desbloqueos;
      // quartermaster({claim:true}) reclama por el chokepoint REAL (tryQuartermaster).
      quartermaster:(p)=>simDev.quartermaster(p),
      // CAS-2284: TOQUE DE GUERRA / SANCTUARY WARHORN OBSERVABLE hook (DARK, WORLD_EVENT). warhorn() lee {enabled,periodSec,
      // windowSec,now:<estado derivado del reloj compartido: active/phase/remainingSec/nextInSec/xpMult/repPerKill/rally>,hero};
      // warhorn({enabled:true}) flip runtime IN-MEMORY; warhorn({nowMs}) inyecta el reloj compartido para observar idle/ventana/
      // pico sin esperar minutos reales; warhorn({nowMs,kill:true}) simula un kill de mundo abierto (observa +XP/+RENOMBRE).
      warhorn:(p)=>simDev.warhorn(p),
      // CAS-2292: EMISARIO DEL SANTUARIO / SANCTUARY EMISSARY OBSERVABLE hook (DARK, SANCTUARY_EMISSARY). emissary() lee {enabled,
      // periodSec,inZone,schedule:<rotación compartida del reloj: period/nextInSec/def>,active:<emisario aceptado>,progress,complete,
      // hasField,kills,gold,rep,hero}; emissary({enabled:true}) flip runtime IN-MEMORY; emissary({nowMs})/{setPeriod:n} fija la
      // rotación compartida sin esperar minutos reales; emissary({kill:{type,n}}) bump los contadores monótonos; emissary({act:true})
      // dispara tryEmissary() por el chokepoint real (acepta/entrega/no-op; observa oro+RENOMBRE+rol de period).
      emissary:(p)=>simDev.emissary(p),
      // CAS-2295: JURAMENTO DEL SANTUARIO / SANCTUARY OATH OBSERVABLE hook (DARK, SANCTUARY_OATH). oath() lee {enabled,order,orderName,
      // tag,orders,effect,minRank,rankOk,canSwitch,killsToSwitch,recallCdSec,restedCap,hasField,hero}; oath({enabled:true}) flip runtime
      // IN-MEMORY; oath({grantRep:n}) suma rep para observar el gate de rango; oath({kill:{n}}) bump kills para el cooldown de cambio;
      // oath({pledge:"dawn"}) jura/cambia por el chokepoint REAL (tryPledgeOath). Elección desde la UI del Tablón (0 hotkey nuevo).
      oath:(p)=>simDev.oath(p),
      // CAS-2300: LIBRO DE LA ORDEN / ORDER LEDGER OBSERVABLE hook (DARK, SANCTUARY_LEDGER). ledger() lee {enabled,periodSec,goal,
      // schedule:<ventana semanal del reloj compartido: period/frac/nextInSec>,heroOrder,contribution,total,unlocked,orders:[{id,kind,
      // value,baseline,total,unlocked}],ledgerMul*,recallCdSec,restedCap,hasField,hero}; ledger({enabled:true}) flip runtime IN-MEMORY;
      // ledger({nowMs}) inyecta el reloj compartido para observar el marcador semanal sin esperar días; ledger({pledge:"dawn"}) fija la
      // orden del héroe (tryPledgeOath); ledger({grantRep:n})/{kill:{n}} contribuyen al marcador colectivo por los contadores monótonos.
      ledger:(p)=>simDev.ledger(p),
      // CAS-2305: CLASIFICACIÓN DE ÓRDENES / ORDER STANDINGS OBSERVABLE hook (DARK, ORDER_STANDINGS). standings() lee {enabled,leadKind,
      // leadValue,schedule:<period/frac del reloj compartido>,leader,heroOrder,mineLeading,order:[{id,name,tag,rank,total,isLeader,isMine}],
      // standingsMulRestedMult,restedXpMult,gExists,hero}; standings({enabled:true}) flip runtime IN-MEMORY; standings({nowMs}) inyecta el
      // reloj compartido para observar qué orden LIDERA la semana (convergencia, mismo ranking en N clientes) sin esperar días;
      // standings({pledge:"dawn"}) fija la orden del héroe (tryPledgeOath) para observar el pasivo de la orden líder. SOLO lectura (0 hotkey).
      standings:(p)=>simDev.standings(p),
      // CAS-2310: DOMINIO DE ÓRDENES / ORDER TERRITORY OBSERVABLE hook (DARK, ORDER_TERRITORY). territory() lee {enabled,controlKind,
      // controlValue,standingsEnabled,leadKind,controller,banner:{order,name,tag},heroOrder,mineControls,inZone,territoryMulSafeRegen,
      // safeRegenMul,precedenceInert,gStandingsExists,hero}; territory({enabled:true}) flip runtime IN-MEMORY; territory({standings:true})
      // flip de ORDER_STANDINGS (territory DEPENDE del liderazgo server-auth); territory({nowMs}) inyecta el reloj compartido para observar
      // qué orden CONTROLA la semana (convergencia, mismo controlador en N clientes); territory({pledge:"dawn"}) fija la orden del héroe
      // (tryPledgeOath) para observar su pasivo de DOMINIO (gateado a inSafeZone). SOLO lectura (0 hotkey — control derivado read-only).
      territory:(p)=>simDev.territory(p),
      // CAS-2313: ASALTO AL SANTUARIO / SANCTUARY CONTEST OBSERVABLE hook (DARK, ORDER_CONTEST). contest() lee {enabled,windowFrac,active,
      // iw,nextInSec,controller,challenger,effective,flipped,progress,controllerTotal,challengerTotal,surge,territoryController,banner,
      // precedence,gStandings,hero}; contest({enabled:true}) flip runtime IN-MEMORY; contest({nowMs}) inyecta el reloj compartido para
      // observar la VENTANA de asalto y el flip de esa semana (convergencia, misma ventana/flip en N clientes); contest({pledge:"iron"})
      // fija la orden del héroe (tryPledgeOath) para observar mineChallenging/mineControls. SOLO lectura (0 hotkey — asalto derivado read-only).
      contest:(p)=>simDev.contest(p),
      // CAS-2316: COMPAÑEROS DE RUTA / WAYFARERS' FELLOWSHIP OBSERVABLE hook (DARK, FELLOWSHIP_BOND). fellowship() lee {enabled,periodSec,size,
      // schedule,band,bond,tierIdx,tierName,forged,forgeTierName,nextTierName,nextAt,bondKind,bondValue,fellowMulXp,xpGainMul,gExists,hasField,
      // hero}; fellowship({enabled:true}) flip runtime IN-MEMORY; fellowship({nowMs}) inyecta el reloj compartido para observar la BANDA de esa
      // semana (convergencia, misma banda en N clientes); fellowship({kill:{n}}) profundiza el vínculo. SOLO lectura (0 hotkey — vínculo derivado).
      fellowship:(p)=>simDev.fellowship(p),
      // CAS-2322: VÍNCULO DE MENTOR / MENTORSHIP BOND OBSERVABLE hook (DARK, MENTOR_BOND). mentor() lee {enabled,periodSec,gapThreshold,schedule,
      // partner,role,gap,bound,dwell,tierIdx,tierName,bindTierName,nextTierName,nextAt,boostKind,boost,mentorMulRested,restedXpMult,standingsMulRested,
      // fellowForged,tag,precedence,gExists,hasField,hero}; mentor({enabled:true}) flip runtime IN-MEMORY; mentor({nowMs}) inyecta el reloj compartido
      // para observar el COMPAÑERO asignado de esa semana (convergencia, mismo compañero en N clientes); mentor({lvl:N}) fija el nivel del héroe para
      // observar el ROL mentor(alto)/protégé(bajo); mentor({kill:{n}}) profundiza el DWELL. SOLO lectura (0 hotkey — rol derivado read-only).
      mentor:(p)=>simDev.mentor(p),
      // CAS-2325: VESTIGIO DEL CAÍDO / FALLEN WAYFARER'S VESTIGE OBSERVABLE hook (DARK, SOUL_RECOVERY). soul() lee {enabled,periodSec,liveFrac,
      // radius,dwellSec,schedule,vestige,live,role,heroIdx,dwellMs,dwellNeed,dwellFrac,recovered,respawnActive,soulMulRested,restedXpMult,
      // standingsMulRested,mentorMulRested,tag,precedence,gExists,hasAt,hasGot,hasFell,hero}; soul({enabled:true}) flip runtime IN-MEMORY;
      // soul({nowMs}) inyecta el reloj compartido para observar el VESTIGIO ambiental de ese momento (convergencia, mismo vestigio en N clientes)
      // + acumula el dwell; soul({heroIdx:n}) fija la identidad para observar el ROL fallen/recoverer; soul({toVestige}) proximidad de prueba;
      // soul({recover}) chokepoint REAL de recuperación; soul({die}) seams de muerte/respawn (buff del caído); soul({kill:{n}}) desvanece el buff.
      // Recuperación por proximidad+dwell (SIN hotkey — rol/vestigio derivados, read-only salvo drivers de PRUEBA gateados).
      soul:(p)=>simDev.soul(p),
      // CAS-2329: PULSO DEL MUNDO / WORLD PULSE OBSERVABLE hook (DARK, WORLD_PULSE). pulse() lee {enabled,periodSec,liveFrac,zones,schedule,zone,live,
      // inZone,heroZone,boostKind,boost,pulseMulRested,restedXpMult,standingsMulRested,mentorMulRested,soulMulRested,tag,precedence,gExists,hero};
      // pulse({enabled:true}) flip runtime IN-MEMORY; pulse({nowMs}) inyecta el reloj compartido para observar la zona-en-Pulso de ese momento
      // (convergencia, MISMA zona/fase en N clientes); pulse({toZone}) teleporta a la zona-en-Pulso VIVA (observa el passive compartido); pulse({leave})
      // aleja de toda zona. SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL derivado del reloj, sin input.js).
      pulse:(p)=>simDev.pulse(p),
      // CAS-2332: CONGREGACIÓN / GATHERING DENSITY OBSERVABLE hook (DARK, CONGREGATION). congregation() lee {enabled,zones,tiers,zone,congable,count,
      // tier,boostKind,boost,congMulRested,restedXpMult,standings/mentor/soul/pulseMulRested,tag,precedence,counts,gExists,hero}; congregation({enabled:true})
      // flip runtime IN-MEMORY; congregation({counts:{zona:n}}) el server EMPUJA el snapshot de presencia server-authoritative ⇒ el cliente lo REFLEJA
      // (convergencia byte-a-byte, MISMO tier/cuenta/buff en N clientes con el MISMO snapshot); congregation({toZone:"forest"}) teleporta a esa zona (observa
      // el passive compartido); congregation({leave}) aleja de toda zona. SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL, sin input.js).
      congregation:(p)=>simDev.congregation(p),
      // CAS-2335: SENDERO TRILLADO / WELL-TRODDEN PATH OBSERVABLE hook (DARK, WAYFARER_TRAIL). wayfarer() lee el tread server-authoritative por celda coarse +
      // DECAY determinista + sendero/pasivo derivados; wayfarer({enabled}) flip in-memory; wayfarer({nowMs}) fija el reloj compartido (decay); wayfarer({push})
      // el server empuja el snapshot {celda→{tread,atMs}}; wayfarer({tread,atMs}) empuja en la celda ACTUAL del héroe; wayfarer({toZone}) teleporta; wayfarer({leave})
      // aleja de toda celda; wayfarer({clear}) limpia el snapshot. Convergencia byte-a-byte (MISMO snapshot+reloj ⇒ MISMO sendero/pasivo en N clientes). SOLO lectura /
      // drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL de traversal, sin input.js).
      wayfarer:(p)=>simDev.wayfarer(p),
      // CAS-2338: CONFLUENCIA / DIVERSE COMPANY OBSERVABLE hook (DARK, DIVERSE_COMPANY). confluence() lee la composición server-authoritative { zona → { clase →
      // cuenta } } + diversidad (clases distintas)/tier/passive derivados; confluence({enabled}) flip in-memory; confluence({rosters}) el server EMPUJA el snapshot
      // de composición ⇒ el cliente lo REFLEJA (convergencia byte-a-byte, MISMA diversidad/tier/buff en N clientes con el MISMO snapshot); confluence({toZone})
      // teleporta a esa zona (observa el passive compartido); confluence({leave}) aleja de toda zona; confluence({clear}) limpia el snapshot. SOLO lectura /
      // drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL de composición, sin input.js).
      confluence:(p)=>simDev.confluence(p),
      // CAS-2341: VIGILIA / LONG WATCH OBSERVABLE hook (DARK, LONG_WATCH). longWatch() lee la continuidad temporal server-authoritative { zona → { streak, atMs, present } }
      // + tier/passive derivados; longWatch({enabled}) flip in-memory; longWatch({nowMs}) fija el reloj compartido (subida/decay/ruptura); longWatch({push}) el server empuja
      // el snapshot por zona; longWatch({zone,streak,present}) empuja UNA zona; longWatch({toZone}) teleporta; longWatch({leave}) aleja; longWatch({clear}) limpia. Convergencia
      // byte-a-byte (MISMO snapshot+reloj ⇒ MISMO streak/tier/passive en N clientes). SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL de continuidad, sin input.js).
      longWatch:(p)=>simDev.longWatch(p),
      // CAS-2347: EXPEDICIÓN / FRONTIER SPREAD OBSERVABLE hook (DARK, FRONTIER_SPREAD). frontier() lee la cobertura server-authoritative por zona (nº de sub-celdas coarse
      // DISTINTAS ocupadas) + tier/passive derivados; frontier({enabled}) flip in-memory; frontier({nowMs}) fija el reloj compartido (decay); frontier({push}) el server empuja
      // el snapshot {zona→{cover,atMs}}; frontier({occupants:{zona:[[x,y],...]}}) el server agrupa posiciones en sub-celdas ⇒ cover=|distintas| (casos borde: amontonados⇒1,
      // repartidos⇒K); frontier({zone,cover,atMs}) empuja UNA zona; frontier({toZone}) teleporta; frontier({leave}) aleja; frontier({clear}) limpia. Convergencia byte-a-byte
      // (MISMO snapshot+reloj ⇒ MISMA cobertura/passive en N clientes). SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL de dispersión, sin input.js).
      frontier:(p)=>simDev.frontier(p),
      // CAS-2352: AFLUENCIA / INFLUX SURGE OBSERVABLE hook (DARK, INFLUX_SURGE). influx() lee el surge server-authoritative por zona (llegadas acumuladas EDGE-triggered) +
      // tier/passive derivados; influx({enabled}) flip in-memory; influx({nowMs}) fija el reloj compartido (decay); influx({push}) el server empuja el snapshot {zona→{surge,atMs}};
      // influx({arrivals:{zona:N}}) registra N llegadas (acumula sobre el surge proyectado); influx({transition:{zona:{prev,now}}}) cuenta llegadas de borde (casos borde: prev==now⇒0,
      // todos nuevos⇒|now|); influx({zone,surge,atMs}) empuja UNA zona; influx({toZone}) teleporta; influx({leave}) aleja; influx({clear}) limpia. Convergencia byte-a-byte (MISMO
      // snapshot+reloj ⇒ MISMO surge/passive en N clientes). SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL de afluencia, sin input.js).
      influx:(p)=>simDev.influx(p),
      // CAS-2355: SINCRONÍA DE BATALLA / BATTLE SYNCHRONY OBSERVABLE hook (DARK, BATTLE_SYNC). sync() lee la coordinación server-authoritative por zona (nº de jugadores DISTINTOS con
      // gesta/kill en la ventana deslizante corta) + tier/passive derivados; sync({enabled}) flip in-memory; sync({nowMs}) fija el reloj compartido (ventana); sync({push}) el server empuja
      // el snapshot {zona→{id→últimoKillMs}}; sync({kills:{zona:{ids,atMs}}}) registra la gesta de cada jugador; sync({kill:{zone,id,atMs}}) UNA gesta; sync({toZone}) teleporta; sync({leave})
      // aleja; sync({clear}) limpia. Convergencia byte-a-byte (MISMO snapshot+reloj ⇒ MISMA sincronía/passive en N clientes). SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL de coordinación, sin input.js).
      sync:(p)=>simDev.sync(p),
      // CAS-2356: MARCHA / CONVOY MARCH OBSERVABLE hook (DARK, CONVOY_MARCH). convoy() lee el `march` sostenido server-authoritative por zona (coherencia direccional de los vectores de
      // velocidad de los presentes en movimiento) + tier/passive derivados; convoy({enabled}) flip in-memory; convoy({nowMs}) fija el reloj compartido (decay); convoy({push}) el server empuja
      // el snapshot {zona→{march,atMs}}; convoy({movement:{zona:{vels,dt}}}) el server computa la coherencia (convoyCoherence) y acumula/decae (diferenciadores: quietos/opuestos⇒0);
      // convoy({coherenceProbe:{vels}}) devuelve la función PURA; convoy({march,zone,atMs}) empuja UNA zona; convoy({toZone}) teleporta; convoy({leave}) aleja; convoy({clear}) limpia.
      // Convergencia byte-a-byte (MISMO snapshot+reloj ⇒ MISMO march/passive en N clientes). SOLO lectura / drivers de PRUEBA gateados (0 hotkey — passive AMBIENTAL emerge del movimiento, sin input.js).
      convoy:(p)=>simDev.convoy(p),
      ward:(p)=>simDev.ward(p),  // CAS-2362: Cordón de Guardia OBSERVABLE hook (DARK, WARDING_RING — canal FRESCO wardRegen + eje cobertura angular)
      kinship:(p)=>simDev.kinship(p),  // CAS-2361: Camaradería OBSERVABLE hook (DARK, KINSHIP_BOND — canal FRESCO goldFind + eje persistencia de vínculo/proximidad pareada SOSTENIDA)
      wayfarerRoam:(p)=>simDev.wayfarerRoam(p),  // CAS-2369: Trotamundos OBSERVABLE hook (DARK, WAYFARER_ROAM — canal FRESCO oocMitigation + eje amplitud de exploración individual/roaming breadth)
      focus:(p)=>simDev.focus(p),  // CAS-2370: Fuego Concentrado OBSERVABLE hook (DARK, FOCUS_FIRE — canal goldFind reusado + eje concentración de objetivo; de-stack máximo-único con KINSHIP)
      trailcraft:(p)=>simDev.trailcraft(p),  // CAS-2377: Sendero OBSERVABLE hook (DARK, TRAILCRAFT — canal FRESCO lootQuality/rareza + eje diversidad de terreno/variedad cualitativa; OPUESTO a Wayfarer amplitud)
      delve:(p)=>simDev.delve(p),  // CAS-2380: Descenso OBSERVABLE hook (DARK, DELVE — canal FRESCO critChance/precisión con CAP DURO + eje profundidad/descenso vertical/bandas distintas; ORTOGONAL a Trailcraft diversidad de tipos)
      erudition:(p)=>simDev.erudition(p),  // CAS-2381: Erudición OBSERVABLE hook (DARK, ERUDITION — canal REUSADO xpGain con de-stack a FELLOWSHIP + eje diversidad de PRESAS/bestiary breadth; OPUESTO a Focus concentración en 1 objetivo)
      nocturne:(p)=>simDev.nocturne(p),  // CAS-2393/2394: Cazador Nocturno OBSERVABLE hook (DARK, NOCTURNE_HUNT — canal REUSADO `vamp`/lifesteal con SHARE-CAP vs Vampírico + eje FASE TEMPORAL/caza nocturna; OPUESTO a Erudition — cuenta CUÁNDO matas, no a QUIÉN)
      cadence:(p)=>simDev.cadence(p),  // CAS-2400: Cadencia / Ímpetu de Combate OBSERVABLE hook (DARK, CADENCE_RUSH — canal REUSADO critChance con SHARE-CAP vs Delve + eje TEMPO/cadencia de matanza; DISTINTO a Nocturne CUÁNDO / Delve DÓNDE / Focus A QUIÉN — mide CUÁN RÁPIDO EN SUCESIÓN matas)
      tempest:(p)=>simDev.tempest(p),  // CAS-2404: Vendaval / Tempestad OBSERVABLE hook (DARK, TEMPEST_SURGE — canal REUSADO lootQuality con SHARE-CAP vs Trailcraft + eje CONDICIÓN METEOROLÓGICA world-CONDITION shard-wide; DISTINTO a Cadence meter-personal / Nocturne fase-noche — gatea por CONDICIÓN de tormenta + EXPOSICIÓN de zona)
      lastStand:(p)=>simDev.lastStand(p),  // CAS-2409: Última Resistencia / Aguante OBSERVABLE hook (DARK, LAST_STAND — canal REUSADO wardRegen con SHARE-CAP vs Warding Ring + eje RATIO DE FUERZA / SUPERADO EN NÚMERO; DISTINTO a Cadence meter-personal / Nocturne-Tempest reloj / Kinship aliados / Focus objetivo-único — cuenta ENEMIGOS que te enganchan AHORA)
      firmFooting:(p)=>simDev.firmFooting(p),  // CAS-2415: Terreno Firme / Pisada Firme OBSERVABLE hook (DARK, FIRM_FOOTING — canal FRESCO atkspd bajo el techo global ATKSPD_TOTAL_CAP con share-cap/de-stack automático + eje ESPACIAL MATERIAL DE TERRENO server-auth bajo el héroe; DISTINTO a los gates de zona-región — lee el MATERIAL fino del tile, que CRUZA zonas; ⊥ tiempo/clima/tempo/densidad/aliados/profundidad/conocimiento)
      shadowStalk:(p)=>simDev.shadowStalk(p),  // CAS-2426: Acecho / Sigilo OBSERVABLE hook (DARK, SHADOW_STALK — canal FRESCO detectRadius [radio de detección del mob, NINGUNA flag previa lo toca] con sub-cap stealthStalkCap + eje SIGILO/LÍNEA-DE-VISIÓN server-auth: LOS mob→héroe por raycast de grid sobre world.wallSet/blockSet [capa OCLUSORA]; DISTINTO a #70 que lee el MATERIAL del tile DEL HÉROE; ⊥ force-ratio/clima/tiempo/tempo/social/territorial)
      scarcity:(p)=>simDev.scarcity(p),  // CAS-2432: Presión por Escasez de Recursos OBSERVABLE hook (DARK, SCARCITY_EDGE — canal FRESCO essenceFind [multiplicador de recompensa de esencia por forrajeo, NINGUNA flag previa lo toca] con sub-cap scarcityEssCap + eje ESCASEZ/AGOTAMIENTO del mundo compartido server-auth: depletion(zona)=1-mobsVivosNoJefe/Σsp.max [el MISMO estado del loop de spawn count<sp.max]; DISTINTO a #69 que cuenta enemigos ENGANCHADOS [esto cuenta AUSENCIA vs capacidad de la ZONA]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial)
      apex:(p)=>simDev.apex(p),  // CAS-2439: Proximidad a Amenaza Apex OBSERVABLE hook (DARK, APEX_PROXIMITY — canal FRESCO matFind [multiplicador de recompensa de MENA/forja por forrajeo, NINGUNA flag previa lo toca] con sub-cap apexMatCap + eje PROXIMIDAD A UN DEPREDADOR APEX server-auth: apexNearestDist(hero)=min hypot(hero−apexVivo) sobre G.enemies [isBoss/champion/champElite]; INVERSO a #72 [PRESENCIA de un apex vs AUSENCIA de mobs]; DISTINTO a #69 que cuenta ENGANCHADOS [esto=distancia a UN apex]; ⊥ escasez/sigilo/terreno/clima/tiempo/tempo/social/territorial)
      affixDanger:(p)=>simDev.affixDanger(p),  // CAS-2445: Peligro por Afijo de Mob OBSERVABLE hook (DARK, MOB_AFFIX_DANGER — canal FRESCO flaskPotency [recompensa de cargas de Estus por forrajeo amid-danger, NINGUNA flag previa lo toca] con sub-cap dangerFlaskCap + eje CALIDAD/PELIGRO DE AFIJO server-auth: affixDangerScore(hero)=Σ affixWeights[id] sobre mobAffixes(e) de los mobs VIVOS en radio; ⊥ #73 [apex=distancia a UN jefe sin afijo vs SUMA DE PESO DE AFIJOS de mobs en radio]; ⊥ #69 [ENGANCHADOS]; ⊥ #72 [AUSENCIA de mobs vs PRESENCIA de mobs de alta calidad]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial)
      zoneEvent:(p)=>simDev.zoneEvent(p),  // CAS-2450: Participación en Evento de Zona OBSERVABLE hook (DARK, ZONE_EVENT_SURGE — canal FRESCO gemFind [recompensa de esquirlas de gema por forrajeo DENTRO de un evento activo, NINGUNA flag previa lo toca] con sub-cap eventGemCap + eje ESTADO DE EVENTO DE ZONA ACTIVO server-auth: zoneEventScore(hero)=Σ eventWeights[type] sobre los POIs state==="active" de G.zoneEvents.pois en radio; ⊥ #74 [afijo=CALIDAD de mob individual vs ESTADO DE EVENTO de la zona independiente de qué mobs haya]; ⊥ #73 [apex=distancia a UN jefe vs presencia de POIs de evento activos]; ⊥ #72 [AUSENCIA de mobs vs PRESENCIA de un evento dinámico]; ⊥ #69 [ENGANCHADOS]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial)
      variantSurge:(p)=>simDev.variantSurge(p),  // CAS-2456: Variante de Encuentro Activa OBSERVABLE hook (DARK, ENCOUNTER_VARIANT_SURGE — canal FRESCO socketFind [recompensa de reagentes de engarce por forrajeo DENTRO de un encuentro de variante, NINGUNA flag previa lo toca] con sub-cap variantSocketCap + eje PRESENCIA/TIPO DE VARIANTE DE COMPORTAMIENTO server-auth: variantSurgeScore(hero)=Σ variantWeights[e.variant] sobre los mobs VIVOS con variante de G.enemies en radio [subsistema ENCOUNTER_VARIANTS/CAS-2071]; ⊥ #75 [evento=POIs de zona vs modificador de comportamiento sobre los mobs]; ⊥ #74 [afijo=CALIDAD estática de UN mob (mobAffixes, MOB_AFFIX) vs PATRÓN DINÁMICO del encuentro (e.variant, ENCOUNTER_VARIANTS), id-set disjunto, sin solape de portador]; ⊥ #73 [apex=distancia a UN jefe vs presencia de variantes]; ⊥ #72 [AUSENCIA de mobs vs PRESENCIA de un patrón de variante]; ⊥ #69 [ENGANCHADOS]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial)
      hazardSurge:(p)=>simDev.hazardSurge(p),  // CAS-2464: Hazard de Arena Activo OBSERVABLE hook (DARK, ARENA_HAZARD_SURGE — canal FRESCO healPotency [recompensa de brasas restaurativas por forrajeo DENTRO de un hazard de arena activo, NINGUNA flag previa lo toca] con sub-cap hazardMoteCap + eje PRESENCIA/TIPO/INTENSIDAD DE HAZARD DE ARENA ACTIVO server-auth: hazardSurgeScore(hero)=Σ hazardWeights[hz.type] sobre los hazards en fase `active` de G.hazards en radio [subsistema ARENA_HAZARDS/CAS-2094]; ⊥ #76 [variante=modificador de comportamiento sobre los MOBS (e.variant) vs PELIGRO AMBIENTAL de la arena (G.hazards) independiente de los mobs]; ⊥ #75 [evento=POIs de zona vs hazard telegrafiado]; ⊥ #74 [afijo=CALIDAD de un mob; un hazard NO es un mob]; ⊥ #73 [apex=distancia a UN jefe]; ⊥ #72 [AUSENCIA de mobs vs PRESENCIA de un peligro de arena]; ⊥ #69 [ENGANCHADOS]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial)
      spoilsField:(p)=>simDev.spoilsField(p),  // CAS-2477: Campo de Botín Denso OBSERVABLE hook (DARK, SPOILS_FIELD_SURGE — canal FRESCO salvageFind [recompensa de esquirlas de chatarra por rematar dentro de un campo de botín denso, NINGUNA flag previa lo toca] con sub-cap spoilsSalvageCap + eje PRESENCIA/DENSIDAD DE UN CAMPO DE BOTÍN EN EL SUELO server-auth: spoilsFieldScore(hero)=Σ spoilsWeights[d.kind] sobre los drops NO recogidos (!d.taken) de G.drops en radio; ⊥ #78 [furia=estado de fase de un jefe (e.enraged) vs OBJETOS DE LOOT en el suelo (G.drops)]; ⊥ #75 [evento=POIs de zona (G.zoneEvents.pois) vs objetos de loot en G.drops, contenedor distinto]; ⊥ lootQuality #63/#68 [=CALIDAD de la próxima tirada vs DENSIDAD de los objetos ya en el suelo]; ⊥ #74 [afijo=calidad de un mob]; ⊥ #73 [apex=distancia a un jefe]; ⊥ #72 [AUSENCIA de mobs vs PRESENCIA de despojos]; ⊥ #69 [ENGANCHADOS]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: score muestreado en TOP de killEnemy (_spoilsPre) antes de que el kill suelte sus drops.
      carnageField:(p)=>simDev.carnageField(p),  // CAS-2481: Campo de Carnicería OBSERVABLE hook (DARK, CARNAGE_FIELD_SURGE — canal FRESCO boneFind [recompensa de fichas de osario por rematar dentro de un campo de cadáveres denso, NINGUNA flag previa lo toca] con sub-cap carnageBoneCap + eje PRESENCIA/DENSIDAD DE UN CAMPO DE CADÁVERES RECIÉN CAÍDOS server-auth: carnageFieldScore(hero)=Σ carnageWeights[rango] sobre los cadáveres de G.corpses en radio [poblados DETERMINISTA en killEnemy, envejecidos en updateCorpses, CORPSE_LIFE=2.6s]; ⊥ #79 [botín=OBJETOS DE LOOT recogibles (G.drops) que persisten hasta d.taken vs CUERPOS (G.corpses) NO recogibles que despawnan, otro contenedor y otro ciclo de vida]; ⊥ #78 [furia=jefe VIVO enfurecido (e.enraged) vs mobs MUERTOS (G.corpses)]; ⊥ #72 [escasez=AUSENCIA de mobs VIVOS (G.enemies count) vs PRESENCIA de mobs MUERTOS (G.corpses count), DIVERGEN]; ⊥ #77 [hazard=peligro ambiental (G.hazards); un cadáver NO es un hazard]; ⊥ #76 [variante=e.variant sobre mobs vivos]; ⊥ #75 [evento=POIs (G.zoneEvents.pois)]; ⊥ #74 [afijo=calidad de un mob]; ⊥ #73 [apex=distancia a un jefe vivo]; ⊥ #69 [ENGANCHADOS]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: score muestreado en TOP de killEnemy (_carnagePre) antes de que el kill empuje su propio cadáver.
      blightHarvest:(p)=>simDev.blightHarvest(p),  // CAS-2497: Cosecha de Plaga OBSERVABLE hook (DARK, BLIGHT_HARVEST_SURGE — canal FRESCO blightFind [recompensa de esencias de plaga por cosechar en medio de un pack enfermo, NINGUNA flag previa lo toca] con sub-cap blightHarvestCap + eje PRESENCIA/DENSIDAD DE AFLICCIONES DE ESTADO (DoT) ACTIVAS sobre los MOBS VIVOS de la vecindad server-auth: blightHarvestScore(hero)=Σ blightAfflict(e) sobre los mobs de G.enemies en radio [aflicciones DoT leídas de e.dots={poison?,burn?}, pobladas por applyStatus (afijo Ardiente/boon/resina/enemigo), tickeadas/borradas por updateEnemies/tickDots; un mob con veneno+quemadura pesa 2]. PRE-FLIGHT GATE: el eje recomendado del issue (HIGH_GROUND/elevación/z server-auth) NO existe replicado (grep elevation|altitude|.z=0, ya documentado en FIRM_FOOTING #70) ⇒ pivote justificado a e.dots. ⊥ #82 [vorágine=ZONAS DE NEGACIÓN estáticas (G.fields) vs AFLICCIONES DoT sobre los MOBS (e.dots) — mago sembrando zonas en suelo vacío=alta vorágine/cero plaga; pack envenenado sin campos=cero vorágine/alta plaga, DIVERGEN]; ⊥ #81 [fragor=PROYECTILES EN VUELO (G.projectiles); una aflicción NO es una bala]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses); la plaga cuenta mobs VIVOS afligidos]; ⊥ #79 [botín=OBJETOS (G.drops)]; ⊥ #78 [furia=FASE de un JEFE (e.enraged) — jefe enfurecido sin veneno=alta furia/cero plaga; pack de trash envenenado sin jefe=cero furia/alta plaga, DIVERGEN]; ⊥ #77 [hazard=zona ambiental (G.hazards)]; ⊥ #76 [variante=e.variant, modificador de SPAWN]; ⊥ #74 [afijo=CALIDAD ESTÁTICA (e.affix) horneada al spawn vs estado DINÁMICO (e.dots) aplicado por combate — mob 'vampiric' recién spawneado=alto afijo/cero plaga hasta que lo enveneno]; ⊥ #73 [apex=distancia a un jefe vivo]; ⊥ #72 [AUSENCIA de mobs vivos]; ⊥ #69 [ENGANCHADOS]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: blightAfflict filtra !e.dead ⇒ en el TOP de killEnemy el mob a rematar (e.dead=true ya fijado) NO auto-cuenta su plaga; score muestreado en TOP (_blightPre) + TABLA exige score≥2.
      skirmishLine:(p)=>simDev.skirmishLine(p),  // CAS-2504: Línea de Escaramuza OBSERVABLE hook (DARK, SKIRMISH_LINE_SURGE — canal FRESCO skirmishFind [recompensa de marcas de escaramuza por rematar en medio de una línea de hostigamiento a-distancia, NINGUNA flag previa lo toca] con sub-cap skirmishMarkCap + eje COMPOSICIÓN DE ARQUETIPO DE ALCANCE (a-distancia) del pack de MOBS VIVOS de la vecindad server-auth: skirmishLineScore(hero)=Σ skirmishWeight(e) sobre los mobs A-DISTANCIA de G.enemies en radio [clase de alcance leída de e.tpl.ranged/e.tpl.range, propiedad del template ETPL horneada al spawn, leída ya por IA kite/cast y el pool de afijos; skirmishWeight=0 si melee, else long(range≥longR 240)?2:1 — una pieza de artillería de largo alcance pesa 2]. PRE-FLIGHT GATE: el eje recomendado del issue (DENSIDAD/FORMACIÓN DE ALIADOS/INVOCACIONES, G.allies/G.summons/party server-auth) NO existe como CONTENEDOR de MÚLTIPLES aliados (sólo un ÚNICO G._spirit + summonAdds enemigos) ⇒ tope 1 ⇒ pivote justificado a e.tpl.ranged. ⊥ #83 [plaga=AFLICCIONES DoT DINÁMICAS (e.dots) aplicadas en combate vs CLASE DE ALCANCE ESTÁTICA (e.tpl.ranged) del template — archer sin veneno=alta escaramuza/cero plaga; rusher envenenado=cero escaramuza/alta plaga, DIVERGEN]; ⊥ #82 [vorágine=ZONAS DE NEGACIÓN (G.fields); una clase de mob NO es un campo]; ⊥ #81 [fragor=PROYECTILES EN VUELO (G.projectiles); escaramuza cuenta el SHOOTER-mob aunque NO haya disparado — archer sin tirar=0 fragor/alta escaramuza; saeta del HÉROE=alto fragor/0 escaramuza (no es un mob), DIVERGEN]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses); escaramuza cuenta mobs VIVOS a-distancia]; ⊥ #79 [botín=OBJETOS (G.drops)]; ⊥ #78 [furia=FASE de un JEFE (e.enraged)]; ⊥ #77 [hazard=zona ambiental (G.hazards)]; ⊥ #76 [variante=e.variant, modificador de comportamiento de SPAWN {stalker,bastion,glass} vs CLASE DE ALCANCE del template base — mob melee 'stalker'=alta variante/cero escaramuza]; ⊥ #74 [afijo=CALIDAD ESTÁTICA (e.affix) {swift,armored,vampiric,volatile,frost} horneada al spawn vs CLASE DE ALCANCE del arquetipo — rusher melee 'swift'=alto afijo/cero escaramuza]; ⊥ #73 [apex=distancia a un jefe vivo]; ⊥ #72 [AUSENCIA de mobs vivos]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee SIN filtro de arquetipo; escaramuza IGNORA melee (peso 0) y sólo cuenta a-distancia — 5 rushers melee=alto LAST_STAND/cero escaramuza; 3 arqueros kiteando sin engancharse=bajo LAST_STAND/alta escaramuza, DIVERGEN]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: skirmishWeight filtra !e.dead ⇒ en el TOP de killEnemy el mob a rematar (e.dead=true ya fijado) NO auto-cuenta; score muestreado en TOP (_skirmPre) + TABLA exige score≥2.
      packHarvest:(p)=>simDev.packHarvest(p),  // CAS-2521: Siega de Manada OBSERVABLE hook (DARK, PACKHARVEST_SURGE — canal FRESCO packFind [recompensa de cargas de siega por rematar en medio de una MANADA APIÑADA/jauría, NINGUNA flag previa lo toca] con sub-cap packBountyCap + eje COHESIÓN/EMPAQUETAMIENTO INTER-MOB (clustering mob↔mob) sobre los MOBS VIVOS de la vecindad server-auth: packHarvestScore(hero)=Σ packWeight(e) sobre los mobs apiñados de G.enemies en radio [cohesión = nº de OTROS mobs VIVOS en cohesionR de CADA mob, derivada de POSICIONES replicadas; NÚCLEO ≥coreN vecinos ⇒ peso 2, AGRUPADO ≥looseN ⇒ peso 1, rezagado ⇒ 0]. PRE-FLIGHT GATE: el eje RECOMENDADO del issue (LONGEVIDAD/EDAD del mob, tiempo-vivo server-auth edad=tickActual−e.spawnT) FALLA — NO existe marca de aparición server-auth determinista por mob (spawnEnemy sim.js:2258 NO estampa e.spawnT/e.bornAt; NO hay contador entero determinista de tick; world-events usan nowMs=wall-clock no determinista ⇒ rompería 0-desync) ⇒ pivote justificado al eje alterno FRESCO cohesión de manada (clustering mob↔mob), health-agnóstico ⇒ ⊥#86 limpio (NINGUNA flag lee proximidad INTER-MOB como SCORE). ⊥ #86 [siega-de-heridos=FRACCIÓN DE VIDA propia (e.hp/e.maxHp) cuán-muerto vs PROXIMIDAD INTER-MOB (clustering) cuán-apiñado — mob a plena vida en jauría tupida=alta manada/cero siega; rezagado moribundo suelto=cero manada/alta siega, DISJUNTOS]; ⊥ #85 [control=ESTADO de CC (e.stun/e.slowT)]; ⊥ #84 [escaramuza=CLASE DE ALCANCE (e.tpl.ranged)]; ⊥ #83 [plaga=DoT (e.dots)]; ⊥ #82 [vorágine=ZONAS (G.fields)]; ⊥ #81 [fragor=PROYECTILES (G.projectiles)]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses); manada cuenta mobs VIVOS apiñados]; ⊥ #79 [botín=OBJETOS (G.drops)]; ⊥ #78 [furia=BOOLEANO (e.enraged)]; ⊥ #77 [hazard=(G.hazards)]; ⊥ #76 [variante=e.variant]; ⊥ #74 [afijo=e.affix]; ⊥ #73 [apex=DISTANCIA hero→jefe/campeón vs DISTANCIA mob↔mob (clustering), geometría DISTINTA]; ⊥ #72 [escasez=AUSENCIA/CONTEO crudo vs AGREGACIÓN ESPACIAL — 5 dispersos=baja manada pese a nº alto]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee con el HÉROE (hero-céntrico) vs clustering mob↔mob INDEPENDIENTE del héroe — 5 rodeando disperso=alto LAST_STAND/baja manada; jauría apiñada de lado sin enganchar=bajo LAST_STAND/alta manada, DIVERGEN]; ⊥ CADENCE #67/FRENZY [racha/tempo]; ⊥ lootQuality #63/#68; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: packWeight/packNeighbors filtran !e.dead && e.hp>0 (sujeto Y vecino) ⇒ en el TOP de killEnemy el mob a rematar (e.dead=true ya fijado) NO auto-cuenta su cohesión NI infla la de vecinos; score muestreado en TOP (_packPre) + TABLA exige score≥2.
      longshot:(p)=>simDev.longshot(p),  // CAS-2527: Remate a Distancia OBSERVABLE hook (DARK, LONGSHOT_SURGE — canal FRESCO reachFind [recompensa de fichas de puntería por REMATAR DE LEJOS, NINGUNA flag previa lo toca] con sub-cap reachBountyCap + eje DISTANCIA/RANGO DEL GOLPE DE REMATE (snapshot GEOMÉTRICO hero↔víctima en el instante del kill) server-auth: el score del kill = reachWeight(dist hero↔víctima) muestreado en el TOP de killEnemy con la posición VIVA del mob [far ≥farR 210 ⇒ 2 (sniper), near ≥midR 110 ⇒ 1 (stand-off), point-blank <midR ⇒ 0 (melee)]; la señal VIVA del badge = longshotScore(hero)=MAX reachWeight sobre los mobs VIVOS en radio (el mejor long-shot disponible). PRE-FLIGHT GATE: el eje RECOMENDADO del issue (SWIFTNESS/VELOCIDAD del mob rematado, |v| de e.vx/e.vy) FALLA — los enemigos NO tienen VECTOR de velocidad server-auth: e.vx/e.vy existen en la entidad pero son INERTES para enemigos (documentado sim.js:8543 'e.vx/e.vy NO se integra en el movimiento enemigo'; el movimiento enemigo = dir-de-persecución × ESCALAR e.tpl.spd + integración de knockX/knockY); la ÚNICA señal de rapidez es el ESCALAR ESTÁTICO del template e.tpl.spd, cuyos ÚNICOS modificadores DINÁMICOS son enrage (#78 FURIA — e.enrageSpd hornea a e.tpl.spd) y slow (#85 CONTROL — e.slowT) ⇒ 'mob veloz' = enfurecido (#78) O no-ralentizado (#85) ⇒ AMBOS extremos del eje YA son ejes reclamados ⇒ NO ⊥29 ⇒ pivote justificado al alterno FRESCO #1 del board: DISTANCIA de remate. ⊥ #87 [manada=DISTANCIA mob↔mob (clustering INTER-mob) vs DISTANCIA hero↔víctima ÚNICA]; ⊥ #86 [siega=FRACCIÓN DE VIDA e.hp/e.maxHp]; ⊥ #85 [control=ESTADO CC e.stun/e.slowT]; ⊥ #84 [escaramuza=CLASE DE ALCANCE del MOB e.tpl.ranged (stat del ENEMIGO) vs GEOMETRÍA hero↔víctima del remate (posición del HÉROE) — melee-hero rematando de cerca a un arquero=alta escaramuza/cero remate; ranged-hero abatiendo de lejos a un orco melee suelto=cero escaramuza/alto remate, DIVERGEN]; ⊥ #83 [plaga=DoT e.dots]; ⊥ #82 [vorágine=ZONAS G.fields]; ⊥ #81 [fragor=PROYECTILES G.projectiles]; ⊥ #80 [carnicería=CUERPOS MUERTOS G.corpses]; ⊥ #79 [botín=OBJETOS G.drops]; ⊥ #78 [furia=BOOLEANO e.enraged]; ⊥ #77 [hazard=G.hazards]; ⊥ #76 [variante=e.variant]; ⊥ #74 [afijo=e.affix]; ⊥ #73 [apex=DISTANCIA hero→un JEFE/CAMPEÓN vivo (blanco ESPECIAL, premia CERCANÍA, estado PERSISTENTE de pie) vs DISTANCIA hero→la VÍCTIMA REAL cualquiera en el INSTANTE del kill (premia LEJANÍA), conjunto-blanco/signo/timing distintos]; ⊥ #72 [escasez=AUSENCIA/CONTEO crudo]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee (todos de cerca) — el remate premia lo OPUESTO: abatir DE LEJOS]; ⊥ CADENCE #67/FRENZY [racha/tempo]; ⊥ lootQuality #63/#68; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). STATELESS: h.reachBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_reachPre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD).
      interrupt:(p)=>simDev.interrupt(p),  // CAS-2532: Remate de Interrupción OBSERVABLE hook (DARK, INTERRUPT_SURGE — canal FRESCO interruptFind [recompensa de fichas de interrupción por rematar MID-ACCIÓN, NINGUNA flag previa lo toca] con sub-cap interruptBountyCap + eje ESTADO-DE-ACCIÓN-EN-PROGRESO DEL MOB al instante del kill server-auth: interruptWeight(víctima) muestreado en el TOP de killEnemy con la acción VIVA del mob [habilidad PESADA en curso (canal shield/Freeze Nova, special slam/lunge e.specialNow, cast warlock e.castNow) ⇒ 2; ataque NORMAL comprometido (e.state windup/strike) ⇒ 1; ocioso/persiguiendo/recover/flee/stun-frozen ⇒ 0]; la señal VIVA del badge = interruptScore(hero)=MAX interruptWeight sobre los mobs VIVOS en radio (la mejor interrupción disponible). PRE-FLIGHT GATE PASA: el eje RECOMENDADO (INTERRUPT / estado-de-acción del mob) EXISTE server-auth determinista — la máquina de estados de updateEnemies (e.state ∈ {idle,wander,chase,windup,strike,recover,shield,flee} + e.st decrementado a paso-fijo e.st-=dt, sim.js:8010+; e.specialNow/e.castNow = el ataque comprometido es special/cast); DINÁMICO, server-auth (paso-fijo, NO wall-clock, NO interp de cliente), y NINGUNA de las 30 flags #59-#88 lo lee como SCORE (los únicos lectores de e.state son gates de IA/anim/engage/wantCombat + harness). CRUX ⊥ CC #85: #85 PUNTÚA e.stun/e.slowT = estado IMPUESTO SOBRE el mob (negación PASIVA que el héroe aplicó); interrupt PUNTÚA la ACCIÓN PROPIA del mob (windup/strike/shield) siendo DENEGADA al matarlo, COMPLEMENTO EXACTO — interruptWeight EXCLUYE a los stun-frozen (e.stun>0⇒0, gate 7942 congela la IA) mientras #85 los premia (⇒2); un mob castea sin estar CC'd (interrupt≥1/CC 0) y un mob CC'd está congelado sin ejecutar (CC 2/interrupt 0) ⇒ DISJUNTOS. ⊥ #88 [remate=DISTANCIA magnitud hero↔víctima (geometría) vs ESTADO DE ACCIÓN categórico (sin geometría)]; ⊥ #87 [manada=clustering mob↔mob]; ⊥ #86 [siega=FRACCIÓN DE VIDA e.hp/e.maxHp]; ⊥ #84 [escaramuza=CLASE DE ALCANCE ESTÁTICA e.tpl.ranged (stat de spawn) vs ACCIÓN DINÁMICA en curso — arquero ocioso=alta escaramuza/cero interrupt; orco melee mid-slam=cero escaramuza/alto interrupt, DIVERGEN]; ⊥ #83 [plaga=DoT e.dots]; ⊥ #82 [vorágine=G.fields]; ⊥ #81 [fragor=G.projectiles]; ⊥ #80 [carnicería=G.corpses]; ⊥ #79 [botín=G.drops]; ⊥ #78 [furia=BOOLEANO e.enraged (fase de jefe); enrage MODULA la duración del windup pero el eje es la fase, no 'está-ejecutando' — mob no-enfurecido mid-windup puntúa, enfurecido ocioso no]; ⊥ #77 [hazard=G.hazards]; ⊥ #76 [variante=e.variant]; ⊥ #74 [afijo=e.affix]; ⊥ #73 [apex=DISTANCIA a jefe/campeón]; ⊥ #72 [escasez=AUSENCIA/CONTEO crudo]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee]; ⊥ CADENCE #67/FRENZY [racha/tempo]; ⊥ backstab/facing [ángulo geométrico hero↔mob]; ⊥ lootQuality #63/#68; ⊥ velocidad/sigilo/terreno/clima/tiempo/tempo/social/territorial. STATELESS: h.interruptBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_interruptPre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD). El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate).
      bulk:(p)=>simDev.bulk(p),  // CAS-2546: Remate de Mole OBSERVABLE hook (DARK, BULK_SURGE — canal FRESCO bulkFind [recompensa de fichas de mole por rematar a un mob VOLUMINOSO, NINGUNA de las 33 flags #59-#91 lo toca] con sub-cap bulkBountyCap + eje BANDA DE TAMAÑO/HITBOX FÍSICO del mob TYPE server-auth: bulkWeight(víctima)=banda de ETPL[e.type].size (TAMAÑO BASE INMUTABLE del TIPO) muestreado en el TOP de killEnemy [mole grande (moose/charger/golem/dragon, size≥hiSize 24) ⇒ 2; mole media (wolf/skeleton/orc/mage, size≥midSize 18) ⇒ 1; alimaña menuda (rat/bat/volatile, size<midSize) ⇒ 0]; la señal VIVA del badge = bulkScore(hero)=MAX bulkWeight sobre los mobs VIVOS en radio. PRE-FLIGHT GATE: el eje RECOMENDADO (CHALLENGE-RATING mobLvl−heroLvl) FALLA — ETPL (config.js:288) NO tiene campo `lvl` y spawnEnemy (sim.js:2258) NO hornea nivel de mob ⇒ mobLvl−heroLvl NO computable ⇒ pivote justificado al alterno FRESCO sancionado TAMAÑO/HITBOX (`.size`, escalar entero determinista por template, NINGUNA flag previa lo lee como SCORE). CLAVE ⊥#74/⊥champion: lee ETPL[e.type].size BASE, NO e.tpl.size (afijo A.sizeMul/campeón C.sizeMul inflan el CLON, jamás la fila base ⇒ mole desacoplada por construcción). CRUX ⊥33 TAMAÑO FÍSICO ESTÁTICO: ⊥ #91 [zone-tier=dificultad del ÁREA (terreno); mole=tamaño del MOB (entidad) — rata sz15⇒0 en abismo=2 en #91/0 mole; alce sz26⇒2 en prado=0 #91/2 mole; applyZoneScale NUNCA escala size]; ⊥ #86 [siega=e.hp/e.maxHp DINÁMICO; mole=tamaño ESTÁTICO — rata sana 0/golem 5% 2, DISJUNTOS]; ⊥ #74 [afijo=e.affix; mole=ETPL[type].size BASE — rata 'swift' sizeMul infla clon pero mole lee BASE⇒0]; ⊥ #73 [apex=DISTANCIA a jefe; mole=tamaño sin distancia]; ⊥ #76 [variante=e.variant]; ⊥ #90 [embestida=DIRECCIÓN]; ⊥ #89 [interrupt=estado de acción]; ⊥ #88 [remate=DISTANCIA hero↔víctima]; ⊥ #87 [manada=clustering mob↔mob]; ⊥ #85 [CC=e.stun/e.slowT]; ⊥ #84 [escaramuza=e.tpl.ranged]; ⊥ #78 [furia=e.enraged]; ⊥ velocidad [murciélago menudo veloz sz14/spd158 vs golem lento sz36/spd46 — mole lee TAMAÑO no rapidez]; ⊥ nivel(inexistente)/edad/sigilo/terreno/clima/tiempo/tempo/social/territorial. STATELESS: h.bulkBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_bulkPre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD). El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate/#91 zona).
      swift:(p)=>simDev.swift(p),  // CAS-2556: Remate de Presa Veloz OBSERVABLE hook (DARK, SWIFT_SURGE — canal FRESCO swiftFind [recompensa de fichas de acoso por rematar a una PRESA ESCURRIDIZA, NINGUNA de las 35 flags #59-#93 lo toca] con sub-cap swiftBountyCap + eje VELOCIDAD DE MOVIMIENTO BASE del mob TYPE server-auth: swiftWeight(víctima)=banda de ETPL[e.type].spd (VELOCIDAD BASE INMUTABLE del TIPO) muestreado en el TOP de killEnemy [escurridiza (bat/volatile/rat/wolf, spd≥hiSpd 120) ⇒ 2; ágil (mudlurker/bandit/revenant, spd≥midSpd 90) ⇒ 1; plúmbeo (casters/brutes/chargers/summoners, spd<midSpd) ⇒ 0]; la señal VIVA del badge = swiftScore(hero)=MAX swiftWeight sobre los mobs VIVOS en radio. DEDUP: gemelo EVO#94 CAS-2557 WORTH_SURGE (xp-worth) SUPERSEDIDO — xp-worth FALLA ⊥#72 (SCARCITY_EDGE LIVE recompensa esencia = round(scarcityMul(zone)*tpl.xp) ∝ tpl.xp ⇒ CO-MONÓTONO con banda-por-xp); VELOCIDAD BASE no la lee ningún seam de recompensa. PRE-FLIGHT GATE: el eje RECOMENDADO (KILL-EFFORT / Nº de golpes) FALLA (sin contador determinista de golpes-por-mob; nº-golpes=hp/dmg entrelazado con DPS del héroe ⇒ NO ⊥ cadence#67/frenzy/combo); los alternos sancionados fallan (xp-worth NO ⊥#72; daño-total DINÁMICO acoplado a defensa del héroe; edad sin timestamp horneado) ⇒ pivote justificado al eje FRESCO ESTÁTICO más limpio VELOCIDAD BASE (`spd`, escalar entero determinista por template, NINGÚN *Weight/seam de recompensa lo lee). CLAVE ⊥#74/⊥#85/⊥zona/⊥champion: lee ETPL[e.type].spd BASE, NO e.spd/e.tpl.spd (afijo A.spdMul 'Veloz'/'Acorazado', zona z.spdMul, frost-slow e.slowT escalan el CLON/entidad viva, jamás la fila base ⇒ velocidad desacoplada por construcción — magmabrute 'Veloz' sigue swift0, bat congelado sigue swift2). CRUX ⊥35 VELOCIDAD BASE ESTÁTICA: ⊥ #93 [role=FUNCIÓN de IA arch; velocidad=MAGNITUD de rapidez — wolf rusher(rol0) swift2 vs summoner enabler(rol2) swift0, DIAMÉTRICAMENTE OPUESTOS]; ⊥ WORTH [xp-worth CAS-2557 supersedido; wolf spd128 swift2/xp12 worth0 vs summoner spd60 swift0/xp34 worth1 DISJUNTOS]; ⊥ #92 [bulk=TAMAÑO ETPL[type].size; bat sz14 bulk0/spd158 swift2 vs moose sz26 bulk2/spd82 swift0 OPUESTOS]; ⊥ #91 [zone-tier=ÁREA/terreno; z.spdMul escala e.spd VIVO pero swift lee BASE]; ⊥ #90 [embestida=DIRECCIÓN signo m·u magnitud-independiente; velocidad=MAGNITUD dirección-independiente]; ⊥ #89 [interrupt=ESTADO DE ACCIÓN e.state]; ⊥ #88 [remate=DISTANCIA hero↔víctima]; ⊥ #87 [manada=clustering]; ⊥ #86 [siega=e.hp/e.maxHp DINÁMICO; velocidad ESTÁTICA]; ⊥ #85 [CC=e.stun/e.slowT ralentiza la entidad viva; velocidad lee spd BASE ⇒ bat congelado sigue swift2]; ⊥ #84 [escaramuza=e.tpl.ranged; TODOS los ranged son lentos swift0 pero swift0 MEZCLA melee orc + ranged mage ⇒ la banda NO determina alcance]; ⊥ #74 [afijo=A.spdMul infla el CLON; swift lee BASE]; ⊥ #73 [apex=DISTANCIA a jefe]; ⊥ #78 [furia=e.enraged]; ⊥ #72 [escasez=CONTEO + recompensa ∝ tpl.xp; velocidad lee spd NO xp ni conteo]; ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]; ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial. STATELESS: h.swiftBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_swiftPre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD). El eje ES la víctima propia (⊥ auto-conteo N/A, como #93 rol/#92 mole/#88 remate).
      role:(p)=>simDev.role(p),  // CAS-2551: Remate de Cabecilla OBSERVABLE hook (DARK, ROLE_SURGE — canal FRESCO roleFind [recompensa de fichas de cabecilla por rematar a un mob de ALTO VALOR TÁCTICO (habilitador/pieza clave del pack), NINGUNA de las 34 flags #59-#92 lo toca] con sub-cap roleBountyCap + eje ROL/ARQUETIPO DE COMBATE del mob TYPE server-auth: roleWeight(víctima)=banda de ETPL[e.type].arch (ROL BASE INMUTABLE del TIPO) via LUT data-driven roleTier, muestreado en el TOP de killEnemy [HABILITADOR (summoner/necromancer + healer/médico, force-multiplier dmg:0) ⇒ 2; DISRUPTOR (warlock/volatile/punisher, mecánica especial) ⇒ 1; peleador estándar (brute/charger/rusher/caster) ⇒ 0]; la señal VIVA del badge = roleScore(hero)=MAX roleWeight sobre los mobs VIVOS en radio. PRE-FLIGHT GATE: el eje RECOMENDADO (KILL-EFFORT / Nº de golpes para matar) FALLA — NO existe contador entero determinista de golpes-por-mob (hitEnemy sim.js:5668 hace e.hp-=dmg sin e.hits; spawnEnemy sim.js:2258 NO estampa contador) Y nº-de-golpes=hp/dmgPorGolpe-del-héroe ⇒ ENTRELAZADO con DPS/tempo del héroe ⇒ NO ⊥ cadence#67/frenzy/combo ⇒ pivote justificado al alterno FRESCO sancionado ARQUETIPO/ROL (`arch`, categórico estático por template, NINGUNA flag previa lo lee como SCORE). CLAVE ⊥#73/⊥champion: lee ETPL[e.type].arch BASE, NO e.tpl.arch (campeón sim.js:6318 LIMPIA el CLON arch=undefined, jamás la fila base ⇒ rol desacoplado por construcción). CRUX ⊥34 ROL/FUNCIÓN DE COMBATE ESTÁTICO: ⊥ #92 [bulk/mole=BANDA DE TAMAÑO físico ETPL[type].size; rol=FUNCIÓN de IA arch — summoner sz20 mole-media 1 pero ENABLER rol 2; moose sz26 mole-grande 2 pero BRUTE rol 0, DISJUNTOS]; ⊥ #91 [zone-tier=dificultad del ÁREA (terreno); rol=arquetipo del MOB (entidad)]; ⊥ #86 [siega=e.hp/e.maxHp DINÁMICO; rol=categórico ESTÁTICO]; ⊥ #85 [CC=e.stun/e.slowT]; ⊥ #84 [escaramuza=CLASE DE ALCANCE e.tpl.ranged; rol=CAMPO arch DISTINTO — enabler NO-ranged⇒2/#84 0, caster ranged⇒rol 0/#84 2 OPUESTOS, disruptor MEZCLA ranged warlock + melee volatile/punisher ⇒ ninguna banda rastrea ranged]; ⊥ #76 [variante=e.variant; rol lee arch BASE]; ⊥ #74 [afijo=e.affix; rol lee arch BASE]; ⊥ #73 [apex=DISTANCIA a jefe]; ⊥ #90 [embestida=DIRECCIÓN]; ⊥ #89 [interrupt=ESTADO DE ACCIÓN DINÁMICO e.state — un caster ocioso interrupt 0 vs casteando interrupt 2 con el MISMO arch; rol=identidad ESTÁTICA]; ⊥ #88 [remate=DISTANCIA hero↔víctima]; ⊥ #87 [manada=clustering mob↔mob]; ⊥ #78 [furia=e.enraged]; ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]; ⊥ velocidad [summoner lento spd60 vs volatile veloz spd152 pero AMBOS con rol propio]; ⊥ nivel(inexistente)/edad/sigilo/terreno/clima/tiempo/social/territorial. STATELESS: h.roleBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_rolePre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD). El eje ES la víctima propia (⊥ auto-conteo N/A, como #92 mole/#88 remate).
      zonetier:(p)=>simDev.zonetier(p),  // CAS-2541: Remate en Zona Peligrosa OBSERVABLE hook (DARK, ZONETIER_SURGE — canal FRESCO tierFind [recompensa de fichas de frontera por rematar en una zona de alto tier, NINGUNA de las 32 flags #59-#90 lo toca] con sub-cap tierBountyCap + eje DIFICULTAD/TIER de la ZONA GEOGRÁFICA server-auth donde MUERE el mob: tierWeight(víctima)=banda de dificultad de zoneOf(world,e.x,e.y)→ZONE_TIER.tier muestreado en el TOP de killEnemy con la POSICIÓN VIVA del mob [zona endgame/peligrosa (arena/ciénaga/abismo/caldera/cripta/coliseo, tier≥hiTier 4) ⇒ 2; zona intermedia (ruinas/cuevas, tier≥midTier 2) ⇒ 1; zona inicial/segura (prado tier-1/ciudad/campo) ⇒ 0]; la señal VIVA del badge = tierScore(hero)=MAX tierWeight sobre los mobs VIVOS en radio. PRE-FLIGHT GATE PASA: zoneOf(world,x,y) resuelve la zona por CONTENCIÓN DE RECTÁNGULO del mundo (world.js:607) + ZONE_TIER[zone].tier mapea la BANDA 1..7 (config.js:620); mismo mapa/seed ⇒ mismos rects ⇒ misma zona en N clientes (NO wall-clock, NO estado de cliente, NO RNG), y NINGUNA de las 32 flags previas lo lee como SCORE (ZONE_TIER sólo escala stats en applyZoneScale). CRUX ⊥32 GEOGRÁFICO ESTÁTICO: ⊥ #72 [escasez=CONTEO de mobs (temporal); zone-tier=DÓNDE, MISMA tile igual con 1 o 5 mobs]; ⊥ #70 [FIRM_FOOTING=material del TILE bajo los pies; zone-tier NO lee material — lee zoneOf (rect)]; ⊥ #82 [vorágine=zonas de hechizo DINÁMICAS G.fields; zone-tier=región ESTÁTICA]; ⊥ #73 [apex=DISTANCIA a jefe; zone-tier=dificultad del ÁREA sin blanco]; ⊥ #88 [remate=DISTANCIA hero↔víctima; zone-tier=en qué ZONA cae]; ⊥ #90 [embestida=DIRECCIÓN; zone-tier=geografía estática]. STATELESS: h.tierBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_tierPre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD). El eje ES la víctima propia (⊥ auto-conteo N/A, como #88/#89/#90).
      heading:(p)=>simDev.heading(p),  // CAS-2537: Remate de Embestida OBSERVABLE hook (DARK, HEADING_SURGE — canal FRESCO headingFind [recompensa de fichas de embestida por rematar a un mob que CARGA HACIA el héroe, NINGUNA de las 31 flags #59-#89 lo toca] con sub-cap headingBountyCap + eje RUMBO/HEADING DEL MOB relativo al héroe al instante del kill server-auth: headingWeight(víctima)=signo del producto punto m·u entre la intención-de-paso del mob (m, derivada de la MISMA rama de IA de updateEnemies — NO e.vx/e.vy INERTES #88) y hero→mob (u) muestreado en el TOP de killEnemy con el rumbo VIVO del mob [paso HACIA el héroe (cargando de frente) ⇒ 2; paso ~perpendicular (lateral/interceptando) ⇒ 1; paso alejándose (huyendo) o estacionario/comprometido ⇒ 0]; la señal VIVA del badge = headingScore(hero)=MAX headingWeight sobre los mobs VIVOS en radio (la embestida más peligrosa disponible). PRE-FLIGHT GATE PASA: el eje RECOMENDADO (HEADING / rumbo de movimiento del mob) EXISTE server-auth determinista — la intención de paso se deriva de la rama de IA que aplica el moveEnt (chase & NO-kite & d>range ⇒ cierra hacia el héroe sim.js:8036; chase caster/summoner/healer d<kite ⇒ kitea alejándose 8028; flee ⇒ alejándose; idle/wander ⇒ deriva e.wx/e.wy; windup/strike/recover/shield ⇒ estacionario); DINÁMICO, paso-fijo (NO wall-clock, NO interp de cliente), y NINGUNA de las 31 flags previas lo lee como SCORE. CRUX ⊥ #89 INTERRUPT: #89 puntúa la ACCIÓN comprometida (categoría de e.state windup/strike/shield); heading puntúa la DIRECCIÓN de MOVIMIENTO (geometría del paso). NO es re-mapeo de los mismos buckets: DENTRO del único estado `chase`, heading vale 2 (orco cerrando d>range) O 0 (mago kiteando caster+d<kite) según ARQUETIPO+GEOMETRÍA — MISMO e.state, heading OPUESTO, mientras INTERRUPT colapsa TODO chase a 0; y un mob mid-windup tiene INTERRUPT≥1 pero heading=0 (plantado) ⇒ DISJUNTOS. ⊥ backstab/facing [heading=dirección de TRASLACIÓN; facing=ORIENTACIÓN/ángulo — un mob puede HUIR mientras el héroe lo golpea de frente]. ⊥ #88 [remate=DISTANCIA MAGNITUD |hero-mob| sin dirección — mob a 300px cargando=2, a 300px huyendo=0, MISMA magnitud, DIVERGEN]; ⊥ #87 [manada=clustering mob↔mob]; ⊥ #86 [siega=FRACCIÓN DE VIDA]; ⊥ #85 [control=e.stun/e.slowT]; ⊥ #84 [escaramuza=CLASE DE ALCANCE ESTÁTICA e.tpl.ranged]; ⊥ #83 [plaga=DoT e.dots]; ⊥ #82 [vorágine=G.fields]; ⊥ #81 [fragor=G.projectiles]; ⊥ #80 [carnicería=G.corpses]; ⊥ #79 [botín=G.drops]; ⊥ #78 [furia=BOOLEANO e.enraged]; ⊥ #77 [hazard=G.hazards]; ⊥ #76 [variante=e.variant]; ⊥ #74 [afijo=e.affix]; ⊥ #73 [apex=DISTANCIA a jefe/campeón]; ⊥ #72 [escasez=CONTEO crudo]; ⊥ #69 [LAST_STAND=CONTEO enganchados]; ⊥ CADENCE #67/FRENZY [racha/tempo]; ⊥ lootQuality #63/#68; ⊥ velocidad(|v| e.vx/e.vy INERTES)/sigilo/terreno/clima/tiempo/tempo/social/territorial. STATELESS: h.headingBounty transitorio fuera del save + fingerprint. GATED enabled:false ⇒ byte-neutral OFF (_headingPre=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD). El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate/#89 interrupt).
      bloodHarvest:(p)=>simDev.bloodHarvest(p),  // CAS-2516: Siega de Heridos OBSERVABLE hook (DARK, BLOODHARVEST_SURGE — canal FRESCO bloodFind [recompensa de cargas de siega por rematar en medio de un campo de HERIDOS, NINGUNA flag previa lo toca] con sub-cap bloodChargeCap + eje DENSIDAD DE MOBS VIVOS ENSANGRENTADOS (fracción de vida baja e.hp/e.maxHp) sobre los MOBS VIVOS de la vecindad server-auth: bloodHarvestScore(hero)=Σ bloodWeight(e) sobre los mobs heridos de G.enemies en radio [fracción de vida leída de e.hp/e.maxHp, propiedad DINÁMICA poblada por el daño acumulado en combate, tickeada en updateEnemies, ya leída por IA/enrage; A-PUNTO-DE-CAER ≤critFrac ⇒ peso 2, HERIDO ≤bloodiedFrac ⇒ peso 1, sano ⇒ 0]. PRE-FLIGHT GATE: el eje RECOMENDADO del issue (RACHA/COMBO de kills temporal, kill-streak server-auth) FALLA ⊥27 — CADENCE_RUSH #67 YA es un combo-meter rodante server-auth scoreado por TEMPO DE MATANZA (bumpPerKill/kill, decae) + FRENZY (CAS-1773) + COMBO (comboCount) ocupan el contenedor racha/kill-streak ⇒ pivote justificado al eje alterno FRESCO e.hp/e.maxHp (fracción de vida, NINGUNA flag lo lee como SCORE). ⊥ #85 [control=ESTADO de CC (e.stun/e.slowT) NEGACIÓN-de-acción vs FRACCIÓN DE VIDA (e.hp/e.maxHp) cuán-muerto — mob SANO aturdido=alto control/cero siega; mob HERIDO libre=cero control/alta siega, DISJUNTOS]; ⊥ #84 [escaramuza=CLASE DE ALCANCE ESTÁTICA (e.tpl.ranged) vs fracción de vida dinámica]; ⊥ #83 [plaga=AFLICCIONES DoT ACTIVAS (e.dots) vs fracción de vida (RESULTADO acumulado del daño) — mob a plena vida ardiendo=alta plaga/cero siega; mob moribundo sin dots=cero plaga/alta siega]; ⊥ #82 [vorágine=ZONAS (G.fields)]; ⊥ #81 [fragor=PROYECTILES (G.projectiles)]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses); siega cuenta mobs VIVOS heridos]; ⊥ #79 [botín=OBJETOS (G.drops)]; ⊥ #78 [furia=BOOLEANO de FASE de jefe (e.enraged) fijado UNA vez al cruzar el umbral vs FRACCIÓN CONTINUA de TODO mob vivo incluida la basura — jefe enfurecido en enrageAt frac 0.5>bloodiedFrac 0.4=alta furia/cero siega; trash al 0.3=cero furia/alta siega, DIVERGEN]; ⊥ #77 [hazard=zona ambiental (G.hazards)]; ⊥ #76 [variante=e.variant, modificador de SPAWN]; ⊥ #74 [afijo=CALIDAD ESTÁTICA (e.affix) horneada al spawn vs daño ACUMULADO — mob 'armored' a plena vida=alto afijo/cero siega]; ⊥ #73 [apex=DISTANCIA a un jefe vivo]; ⊥ #72 [AUSENCIA de mobs vivos]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee SIN filtro de vida — 5 rushers a plena vida enganchados=alto LAST_STAND/cero siega; 3 moribundos a distancia=bajo LAST_STAND/alta siega, DIVERGEN]; ⊥ CADENCE #67/FRENZY [racha/tempo de kills]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: bloodWeight filtra !e.dead && e.hp>0 ⇒ en el TOP de killEnemy el mob a rematar (e.dead=true + e.hp≤0 ya fijados) NO auto-cuenta su herida; score muestreado en TOP (_bloodPre) + TABLA exige score≥2.
      controlHarvest:(p)=>simDev.controlHarvest(p),  // CAS-2510: Cosecha de Sometimiento OBSERVABLE hook (DARK, CONTROL_HARVEST_SURGE — canal FRESCO controlFind [recompensa de cargas de sometimiento por rematar en medio de un pack SOMETIDO por CC, NINGUNA flag previa lo toca] con sub-cap controlChargeCap + eje DENSIDAD DE ESTADO DE CONTROL DE MULTITUD (CC) sobre los MOBS VIVOS de la vecindad server-auth: controlHarvestScore(hero)=Σ controlWeight(e) sobre los mobs bajo CC de G.enemies en radio [estado de control leído de e.stun (AI-freeze DURO ⇒ peso 2) / e.slowT (frost slow BLANDO ⇒ peso 1), propiedad DINÁMICA poblada por combate (POISE stagger / carapace shatter / applyStatus stun|slow), tickeada en updateEnemies; stun+slow ⇒ 2 MAX]. PRE-FLIGHT GATE: el eje RECOMENDADO del issue (TIER CAMPEÓN/ÉLITE, sistema CHAMPION e.champion/e.champElite) FALLA ⊥26 — #73 APEX_PROXIMITY YA lee ese contenedor EXACTO vía apexIsThreat(e)=(e.isBoss||e.champion||e.champElite) ⇒ pivote justificado al eje alterno FRESCO e.stun/e.slowT (estado de control server-auth, NINGUNA flag lo lee). ⊥ #84 [escaramuza=CLASE DE ALCANCE ESTÁTICA (e.tpl.ranged) del template vs ESTADO DINÁMICO de CC (e.stun/e.slowT) del combate — archer suelto sin aturdir=alta escaramuza/cero control; rusher aturdido=cero escaramuza/alto control, DIVERGEN]; ⊥ #83 [plaga=AFLICCIONES DoT (e.dots) DAÑO-en-el-tiempo vs ESTADO de CC (e.stun/e.slowT) NEGACIÓN-de-acción — mob envenenado corriendo libre=alta plaga/cero control; mob aturdido sin veneno=cero plaga/alto control, contenedores DISJUNTOS]; ⊥ #82 [vorágine=ZONAS (G.fields)]; ⊥ #81 [fragor=PROYECTILES EN VUELO (G.projectiles)]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses); control cuenta mobs VIVOS sometidos]; ⊥ #79 [botín=OBJETOS (G.drops)]; ⊥ #78 [furia=FASE de un JEFE (e.enraged)]; ⊥ #77 [hazard=zona ambiental (G.hazards)]; ⊥ #76 [variante=e.variant, modificador de SPAWN]; ⊥ #74 [afijo=CALIDAD ESTÁTICA (e.affix) horneada al spawn vs estado DINÁMICO de CC del combate — mob 'swift' recién spawneado=alto afijo/cero control hasta que lo aturdo]; ⊥ #73 [apex=DISTANCIA a un jefe/campeón vivo (e.champion/e.champElite/e.isBoss) vs DENSIDAD de mobs SOMETIDOS — el eje CHAMPION recomendado colisionaría, por eso pivoté]; ⊥ #72 [AUSENCIA de mobs vivos]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee SIN filtro de estado; control cuenta mobs bajo CC estén o no enganchados — 5 rushers enganchados sin aturdir=alto LAST_STAND/cero control; 3 mobs aturdidos a distancia=bajo LAST_STAND/alto control, DIVERGEN]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: controlWeight filtra !e.dead ⇒ en el TOP de killEnemy el mob a rematar (e.dead=true ya fijado) NO auto-cuenta su propio CC; score muestreado en TOP (_ctrlPre) + TABLA exige score≥2.
      maelstromField:(p)=>simDev.maelstromField(p),  // CAS-2493: Vorágine de Zonas de Área OBSERVABLE hook (DARK, MAELSTROM_FIELD_SURGE — canal FRESCO maelstromFind [recompensa de cargas de vorágine por rematar en medio de una vorágine densa de zonas de negación de área, NINGUNA flag previa lo toca] con sub-cap maelstromChargeCap + eje PRESENCIA/DENSIDAD DE UN CAMPO DE ZONAS DE NEGACIÓN DE ÁREA server-auth: maelstromFieldScore(hero)=Σ maelstromWeights[tamaño] sobre las zonas de negación de G.fields cuyo centro cae en radio [pobladas en el caso "field" de castSpell, tickeadas/filtradas en updateFields; una zona GRANDE (f.r≥largeR) pesa 2, una pequeña 1]. PRE-FLIGHT GATE: el candidato líder del issue (G.props/destructibles) NO existe replicado ⇒ pivote justificado a G.fields. ⊥ #81 [fragor=PROYECTILES EN VUELO (G.projectiles) con velocidad vs ZONAS ESTÁTICAS de negación (G.fields) fijas que tickean en su sitio — tiroteo=muchos proyectiles/cero campos; mago carbonizando el suelo=muchas zonas/cero proyectiles, DIVERGEN]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses) vs zona de negación VIVA]; ⊥ #79 [botín=OBJETOS DE LOOT recogibles (G.drops) vs zona no recogible]; ⊥ #78 [furia=jefe VIVO enfurecido (e.enraged)]; ⊥ #77 [hazard=zona ambiental (G.hazards) GATEADA por jefe/élite vivo vs campos de HECHIZO del héroe (G.fields) NO gateados por jefe — jefe con hazards sin campos=alto hazard/cero vorágine; mago sembrando zonas sin jefe=cero hazard/alta vorágine, DIVERGEN]; ⊥ #76 [variante=e.variant sobre mobs vivos]; ⊥ #75 [evento=POIs (G.zoneEvents.pois)]; ⊥ #74 [afijo=calidad de un mob]; ⊥ #73 [apex=distancia a un jefe vivo]; ⊥ #72 [AUSENCIA de mobs vivos]; ⊥ #69 [ENGANCHADOS]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: score muestreado en TOP de killEnemy (_maelPre) + TABLA exige score≥2 (una sola zona pequeña incidental NO forrajea).
      crossfireFray:(p)=>simDev.crossfireFray(p),  // CAS-2488: Fragor de Fuego Cruzado OBSERVABLE hook (DARK, CROSSFIRE_FRAY_SURGE — canal FRESCO frayFind [recompensa de ascuas de fragor por rematar en medio de un fuego cruzado denso, NINGUNA flag previa lo toca] con sub-cap frayEmberCap + eje PRESENCIA/DENSIDAD DE UN CAMPO DE PROYECTILES EN VUELO server-auth: crossfireFrayScore(hero)=Σ frayWeights[lado] sobre los proyectiles de G.projectiles en radio [poblados en los spawns de combate, avanzados/filtrados en updateProjectiles; el fuego ENTRANTE del enemigo (p.enemy) pesa 2, el propio 1]; ⊥ #80 [carnicería=CUERPOS MUERTOS (G.corpses) estáticos vs PROYECTILES EN VUELO (G.projectiles) con velocidad — campo tras masacre melee = muchos cadáveres/cero fragor; tiroteo EN CURSO = lluvia de proyectiles/cero cadáveres, DIVERGEN]; ⊥ #79 [botín=OBJETOS DE LOOT recogibles (G.drops) vs munición EN VUELO NO recogible]; ⊥ #78 [furia=jefe VIVO enfurecido (e.enraged) vs proyectiles inanimados]; ⊥ #77 [hazard=zona ambiental PERSISTENTE (G.hazards); un proyectil con velocidad NO es un hazard estático]; ⊥ #76 [variante=e.variant sobre mobs vivos]; ⊥ #75 [evento=POIs (G.zoneEvents.pois)]; ⊥ #74 [afijo=calidad de un mob]; ⊥ #73 [apex=distancia a un jefe vivo]; ⊥ #72 [AUSENCIA de mobs vivos]; ⊥ #69 [ENGANCHADOS]; ⊥ lootQuality #63/#68 [calidad de la próxima tirada]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial). ANTI-AUTO-CONTEO: score muestreado en TOP de killEnemy (_frayPre) + TABLA exige score≥2 (una sola bala tuya NO forrajea).
      enrageSurge:(p)=>simDev.enrageSurge(p),  // CAS-2468: Fase de Enfurecimiento de Jefe OBSERVABLE hook (DARK, BOSS_ENRAGE_SURGE — canal FRESCO trophyFind [recompensa de trofeos de guerra por forrajeo mientras un jefe está ENFURECIDO, NINGUNA flag previa lo toca] con sub-cap enrageTrophyCap + eje PRESENCIA/INTENSIDAD DE FASE DE ENFURECIMIENTO DE JEFE server-auth: enrageSurgeScore(hero)=Σ enrageWeights[kind] sobre los jefes/campeones VIVOS ENFURECIDOS (e.enraged) de G.enemies en radio [subsistema cambio-de-fase-capstone/CAS-65]; ⊥ #77 [hazard=peligro ambiental (G.hazards) vs estado de fase de un JEFE (e.enraged)]; ⊥ #76 [variante=modificador horneado al spawn sobre mobs naturales (e.variant) vs transición de fase por-daño de un capstone (e.enraged), sin solape de portador]; ⊥ #74 [afijo=CALIDAD estática de un mob vs estado dinámico de fase-2]; ⊥ #73 [apex=DISTANCIA al jefe sea cual sea su fase vs PRESENCIA de la fase enfurecida, ejes ortogonales sobre el mismo cuerpo]; ⊥ #72 [AUSENCIA de mobs vs PRESENCIA de una furia]; ⊥ #69 [ENGANCHADOS]; ⊥ sigilo/terreno/clima/tiempo/tempo/social/territorial)
      // CAS-2225: door open/close + interior-warp OBSERVABLE hooks (DARK). doorList reads every carved
      // door + its open state + threshold collision; doorInteract fires the REAL interact→toggle; doorEnter
      // /doorExit drive the threshold warp in/out; probeSolid maps the walkable gap. Empty ([]) with the
      // DOORS_INTERIORS flag OFF ⇒ no OBSERVABLE surface until CEO flips it.
      doorList:()=>simDev.doorList(),
      doorInteract:(id)=>simDev.doorInteract(id),
      doorEnter:(id)=>simDev.doorEnter(id),
      doorExit:(id)=>simDev.doorExit(id),
      probeSolid:(x,y,r)=>simDev.probeSolid(x,y,r),
      // CAS-441: positional enemy snapshot (read-only) so the swamp harness can prove the
      // zone spawner populates the rect from its pool — consumed by tools/cas441-swamp.mjs.
      // CAS-442 adds animState/arch/champion fields (still read-only) so the swamp-family
      // harness can watch the richAnim strip states cycle in vivo — tools/cas442-swamp-mobs.mjs
      enemies:()=>G.enemies.map(e=>({x:Math.round(e.x),y:Math.round(e.y),type:e.type,
        animState:e.animState||null,arch:e.tpl.arch||null,champion:!!e.champion,specialNow:!!e.specialNow})),
      mapInfo:()=>simDev.mapInfo(), // CAS-1702: read-only Map-Editor / MapDoc load probe for QA
      customImgReady:(id)=>renderer.customImgReady(id), // CAS-1716: true once a custom uploaded sprite's Image has decoded (QA headless probe)
      customDeco:()=>simDev.customDeco(), // CAS-1729: read-only custom deco snapshot incl. sliced-cell sub-rect (sx..sh)
      bossAnim:()=>simDev.bossAnim(), // CAS-317: dracónic boss 6-anim QA observer
      hitBoss:(n)=>simDev.hitBoss(n), // CAS-317: deterministic hurt/death driver for QA

      worldFingerprint:(seed)=>simDev.worldFingerprint(seed),
      // gear/progression contract consumed by tools/gear.mjs (CAS-29) — additive
      tpZone:(zone)=>simDev.tpZone(zone),
      // CAS-116 loot-loop contract consumed by tools/cas116-loot.mjs — additive
      zoneLoot:(zone)=>simDev.zoneLoot(zone),
      seed:(n)=>simDev.seed(n),
      gear:()=>simDev.gear(),
      spawnKill:(type)=>simDev.spawnKill(type),
      pickup:()=>simDev.pickup(),
      bag:()=>simDev.bag(),
      // CAS-1579: read-only proof each backpack row resolves a real slot-icon PNG (the same
      // asset the equip slots use) rather than falling to a text glyph — iconKey mirrors the
      // renderInventory row draw. Consumed by tools/cas1579-inv-icons-live.mjs.
      invIcons:()=>(((G.hero&&G.hero.bag)||[]).map((it,idx)=>{const im=it?IMG["icon_slot_"+it.slot]:null;return{idx,slot:it?it.slot:null,name:it?it.id:null,iconLoaded:!!(im&&im.complete&&im.naturalWidth)};})),
      equipBag:(i)=>simDev.equipBag(i),
      moveBag:(from,to)=>simDev.moveBag(from,to), // CAS-419 DnD seam, consumed by tools/cas419-dnd-qa.mjs
      // CAS-117 affix/equip-decision contract consumed by tools/cas117-affix.mjs — additive
      equipPreview:(i)=>simDev.equipPreview(i),
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
      // CAS-121 frost-biome carapace contract consumed by tools/cas121-frost.mjs — additive
      forceCarapace:(zone)=>simDev.forceCarapace(zone), frostGate:()=>simDev.frostGate(),
      trialGate:()=>simDev.trialGate(), // CAS-196 — el Coliseo Eterno gate probe
      hitChamp:(zone)=>simDev.hitChamp(zone),
      // spell-identity contract consumed by tools/spells.mjs (CAS-52) — additive
      setClass:(cls)=>simDev.setClass(cls),
      // per-class base-stat contract consumed by tools/classstats.mjs (CAS-100) — additive
      classStats:(cls)=>simDev.classStats(cls),
      cast:(i)=>simDev.cast(i),
      // CAS-256 hit-react contract consumed by tools/cas256-anims.mjs — additive
      hurt:(n)=>simDev.hurt(n), clearSpellCD:()=>simDev.clearSpellCD(),
      // merchant-shop economic-loop contract consumed by tools/shop.mjs (CAS-112) — additive
      merchantTP:()=>simDev.merchantTP(), shopList:()=>simDev.shopList(), shopBuy:(i)=>simDev.shopBuy(i),
      // CAS-319 Maren rest-heal end-to-end probe consumed by tools/cas319-heal.mjs — additive
      fountainHealProbe:(off)=>simDev.fountainHealProbe(off),
      // CAS-134 daily-return-loop contract consumed by tools/cas134-daily.mjs — additive
      bountyTP:()=>simDev.bountyTP(),
      // CAS-386 bestiary contract consumed by tools/cas386-bestiary.mjs — additive
      codexTP:()=>simDev.codexTP(),
      heroStats:()=>simDev.heroStats(), setGold:(n)=>simDev.setGold(n),
      // CAS-192 combat-consumable contract consumed by tools/cas192-consumables.mjs — additive
      // CAS-237 forja contract consumed by tools/forge.mjs — additive
      forgeState:()=>simDev.forgeState(), forgeDo:(slot)=>simDev.forgeDo(slot), setMats:(n)=>simDev.setMats(n), openForge:()=>simDev.openForge(),
      consumState:()=>simDev.consumState(), selectConsum:(i)=>simDev.selectConsum(i),
      useConsum:()=>simDev.useConsum(), atkCadence:()=>simDev.atkCadence(),
      setConsum:(id,n)=>simDev.setConsum(id,n), setHeroHp:(n)=>simDev.setHeroHp(n), clearConsumCD:()=>simDev.clearConsumCD(),
      // CAS-197 balance-cohesion contract consumed by tools/cas196-trial.mjs (B5) — additive
      atkspdTotal:()=>simDev.atkspdTotal(), giveAtkspdWeapon:(amt)=>simDev.giveAtkspdWeapon(amt), setTTAtkspd:(v)=>simDev.setTTAtkspd(v),
      // CAS-114 abyss power-gate contract consumed by tools/abyss.mjs — additive
      abyssGate:()=>simDev.abyssGate(), setUpg:(d,hp,def)=>simDev.setUpg(d,hp,def), tryPortal:(to)=>simDev.tryPortal(to),
      // CAS-115 combat-archetype contract consumed by tools/archetypes.mjs — additive
      archMeta:(type)=>simDev.archMeta(type), archArena:(type,dx,dy)=>simDev.archArena(type,dx,dy),
      archSnap:()=>simDev.archSnap(), archMoveHero:(dx,dy)=>simDev.archMoveHero(dx,dy),
      // CAS-210 punisher-combo + riposte contract consumed by tools/cas210-combat.mjs — additive
      riposteSnap:()=>simDev.riposteSnap(), armRiposte:()=>simDev.armRiposte(),
      hitProbe:(r,d)=>simDev.hitProbe(r,d),
      // CAS-126 new-archetype + zone-identity contract consumed by tools/cas126-archetypes.mjs — additive
      zonePools:()=>simDev.zonePools(), enemyCount:()=>simDev.enemyCount(), broodCount:()=>simDev.broodCount(),
      summonProbe:()=>simDev.summonProbe(), healProbe:()=>simDev.healProbe(), archAllyHp:()=>simDev.archAllyHp(),
      // CAS-146 enemy-variety + elite-ambush contract consumed by tools/cas146-variety.mjs — additive
      volatileProbe:(dx)=>simDev.volatileProbe(dx), volatileSnap:()=>simDev.volatileSnap(),
      forceAmbush:()=>simDev.forceAmbush(), ambushSnap:()=>simDev.ambushSnap(), eliteSpawnKill:(type,zone)=>simDev.eliteSpawnKill(type,zone),
      // CAS-247 elite-affix contract consumed by tools/cas247-affixes.mjs — additive
      affixMeta:()=>simDev.affixMeta(), affixRollRate:(n,type)=>simDev.affixRollRate(n,type),
      affixArena:(id,type,dx)=>simDev.affixArena(id,type,dx), affixSnap:()=>simDev.affixSnap(),
      affixHit:(d)=>simDev.affixHit(d), affixKill:()=>simDev.affixKill(), affixSpawnKill:(id,type,zone)=>simDev.affixSpawnKill(id,type,zone),
      // CAS-1586 Aura Gélida (frost) + Esencia tie-in — consumed by tools/cas1586-frost-live.mjs (additive)
      affixAura:(type,dist)=>simDev.affixAura(type,dist), affixEssence:(id,type)=>simDev.affixEssence(id,type),
      // CAS-1590 Élite Campeón — consumed by tools/cas1590-champion.mjs (additive)
      championMeta:()=>simDev.championMeta(), setChampRate:(r)=>simDev.setChampRate(r),
      championRollRate:(n,type)=>simDev.championRollRate(n,type), championArena:(a,b,type,dx)=>simDev.championArena(a,b,type,dx),
      championKill:(zone,a,b)=>simDev.championKill(zone,a,b),
      // CAS-1632 Ítems Únicos/Legendarios — consumed by tools/cas1632-uniques.mjs (additive)
      legendaryMeta:()=>simDev.legendaryMeta(), setLegRate:(r)=>simDev.setLegRate(r), uniqTotals:()=>simDev.uniqTotals(),
      equipUnique:(id)=>simDev.equipUnique(id), uniqSnap:()=>simDev.uniqSnap(),
      forceLegendary:(id,zone)=>simDev.forceLegendary(id,zone), legendaryRollRate:(n)=>simDev.legendaryRollRate(n),
      uniqPersist:(id)=>simDev.uniqPersist(id), dropStream:(n,s)=>simDev.dropStream(n,s),
      // CAS-1654 CONJUNTOS DE OBJETOS (Item Sets) contract consumed by tools/cas1653-sets.mjs — additive
      setMeta:()=>simDev.setMeta(), setSetRate:(r)=>simDev.setSetRate(r), setTotals:()=>simDev.setTotals(), setCounts:()=>simDev.setCounts(),
      equipSet:(p)=>simDev.equipSet(p), setSnap:()=>simDev.setSnap(),
      setCritProbe:(d)=>simDev.setCritProbe(d), setReflectProbe:(d)=>simDev.setReflectProbe(d),
      forceSetPiece:(id,zone)=>simDev.forceSetPiece(id,zone), setRollRate:(n)=>simDev.setRollRate(n), setPersist:(p)=>simDev.setPersist(p),
      // CAS-149 Elite-Mastery progression contract consumed by tools/cas149-progression.mjs — additive
      masterySnap:()=>simDev.masterySnap(), setEliteKills:(n)=>simDev.setEliteKills(n), bumpMastery:()=>simDev.bumpMastery(),
      masteryTrackSnap:()=>simDev.masteryTrackSnap(), // CAS-150 reward-track panel/harness read-out
      dmgVsTarget:(elite)=>simDev.dmgVsTarget(elite), // CAS-150 deterministic melee-damage probe
      spellProbe:(cls)=>simDev.spellProbe(cls),
      dotProbe:()=>simDev.dotProbe(),
      // CAS-118 status-effect contract consumed by tools/cas118-status.mjs — additive
      statusMeta:(type)=>simDev.statusMeta(type), mobInfl:(type)=>simDev.mobInfl(type),
      statusOf:(who)=>simDev.statusOf(who), applyStatusTo:(who,type,opt)=>simDev.applyStatusTo(who,type,opt),
      weaponProcs:()=>simDev.weaponProcs(), giveBurnWeapon:(amt)=>simDev.giveBurnWeapon(amt),
      statusArena:(type,dx,dy)=>simDev.statusArena(type,dx,dy), heroHit:()=>simDev.heroHit(),
      // CAS-383 inter-zone boon-draft contract consumed by tools/cas383-*.mjs — additive
      boons:()=>simDev.boons(), openDraft:()=>simDev.openDraft(), pickBoon:(i)=>simDev.pickBoon(i), grantBoon:(id)=>simDev.grantBoon(id),
      // CAS-392 draft reroll/banish contract consumed by tools/cas392-*.mjs — additive
      rerollDraft:()=>simDev.rerollDraft(), banishDraft:(i)=>simDev.banishDraft(i), draftCharges:()=>simDev.draftCharges(),
      // CAS-394 opt-in zone-modifier ("Maldición") contract consumed by tools/cas394-*.mjs — additive
      curseState:()=>simDev.curseState(), offerCurse:(z)=>simDev.offerCurse(z), acceptCurse:()=>simDev.acceptCurse(),
      skipCurse:()=>simDev.skipCurse(), setCurse:(z,m)=>simDev.setCurse(z,m), openDraftZone:(z)=>simDev.openDraftZone(z), resetHunts:()=>simDev.resetHunts(),
      // CAS-450 Conquista/World-Tier contract consumed by tools/cas450-*.mjs — additive
      conquestState:()=>simDev.conquestState(), setConquest:(t,d)=>simDev.setConquest(t,d),
      acceptAscend:()=>simDev.acceptAscend(), declineAscend:()=>simDev.declineAscend(),
      ascendRects:()=>(ui.ascendRects||[]).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,act:r.act})),
      // CAS-169 character-customization contract consumed by tools/cas169-customize.mjs — additive
      customizeState:()=>simDev.customizeState(), setPartColor:(s,c)=>simDev.setPartColor(s,c),
      cycleVariation:(k,d)=>simDev.cycleVariation(k,d), resetCustomize:()=>simDev.resetCustomize(),
      defaultPalette:(cls)=>simDev.defaultPalette(cls),
      // CAS-113 persistence contract consumed by tools/persist.mjs — additive
      saveBlob:()=>serializeSave(), saveNow:()=>persist.save(),
      hasSave:()=>persist.hasSave(), clearSave:()=>persist.clear(),
      noSave:()=>persist.suppress(), resetGame:()=>persist.resetGame(),
      // CAS-119 talent-tree contract consumed by tools/cas119-talents.mjs — additive
      talentState:()=>simDev.talentState(), talentTree:(cls)=>simDev.talentTree(cls),
      grantTalentPts:(n)=>simDev.grantTalentPts(n), allocTalent:(id)=>simDev.allocTalent(id),
      respecTalents:()=>simDev.respecTalents(), canAlloc:(id)=>simDev.canAlloc(id),
      // CAS-1601 level-gate hooks consumed by QA (lockReason "level:N" + set hero level)
      lockReason:(id)=>simDev.lockReason(id), setLevel:(n)=>simDev.setLevel(n), setLvl:(n)=>simDev.setLevel(n),
      // CAS-1602 spell-empower probe (ENTREGABLE 1↔2 bridge; copy-on-write per class)
      empowerProbe:(cls)=>simDev.empowerProbe(cls),
      // CAS-120 active-skill-bar contract consumed by tools/cas120-skills.mjs — additive
      skillBar:(cls)=>simDev.skillBar(cls), skillProbe:(cls,slot)=>simDev.skillProbe(cls,slot),
      // CAS-1570 active-abilities QA contract (tools/cas1570-*.mjs) — additive
      abilityPool:()=>simDev.abilityPool(), abilityBar:()=>simDev.abilityBar(),
      loadout:()=>simDev.loadout(), setLoadout:(ids)=>simDev.setLoadout(ids),
      castAbility:(slot)=>simCastAbility(slot), abilityProbe:(id)=>simDev.abilityProbe(id),
      // CAS-1659 HABILIDAD DEFINITIVA (Ultimate) contract consumed by tools/cas1659-ultimate.mjs — additive.
      // MUST wire the passthroughs HERE (curated game.js wrapper), not only in sim.js dev, else "not a function" (cas1654).
      ultMeta:()=>simDev.ultMeta(), ultimateState:()=>simDev.ultimateState(),
      setUltId:(id)=>simDev.setUltId(id), fillUltimate:()=>simDev.fillUltimate(), setUltRate:(x)=>simDev.setUltRate(x),
      ultOffer:()=>simDev.ultOffer(), castUltimate:()=>simCastUltimate(),
      ultCastProbe:(id)=>simDev.ultCastProbe(id), ultPersist:(id,c)=>simDev.ultPersist(id,c), ultLoadLegacy:()=>simDev.ultLoadLegacy(),
      ultChargeStream:(n,s,id)=>simDev.ultChargeStream(n,s,id), ultDraftNeutral:(d,n,s)=>simDev.ultDraftNeutral(d,n,s),
      // CAS-1664 ARENA DE OLEADAS contract consumed by tools/cas1664-arena.mjs — additive. MUST wire the
      // passthroughs HERE (curated wrapper), not only in sim.js dev, else "not a function" (cas1654/1659).
      arenaState:()=>simDev.arenaState(), arenaStart:()=>simDev.arenaStart(), arenaSpawnWave:(n)=>simDev.arenaSpawnWave(n),
      arenaClearWave:()=>simDev.arenaClearWave(), arenaSetAffixRate:(r)=>simDev.arenaSetAffixRate(r), arenaBest:()=>simDev.arenaBest(),
      arenaClearReward:()=>simDev.arenaClearReward(), arenaPersist:(b)=>simDev.arenaPersist(b),
      // CAS-1670 boss-wave telegraph + scaled payoff (tools/cas1670-bosswaves.mjs) — MUST wire HERE (curated wrapper)
      arenaSetWave:(n)=>simDev.arenaSetWave(n), arenaForceBossWave:()=>simDev.arenaForceBossWave(),
      arenaSetBossBonus:(x)=>simDev.arenaSetBossBonus(x), arenaLastPayoff:()=>simDev.arenaLastPayoff(),
      arenaKillBossWave:(k)=>simDev.arenaKillBossWave(k), arenaBossSrandProbe:(k,s,p)=>simDev.arenaBossSrandProbe(k,s,p),
      // CAS-1675 persistent Arena records (tools/cas1675-arena-records.mjs) — MUST wire HERE (curated wrapper)
      arenaGetRecords:()=>simDev.arenaGetRecords(), arenaSetRecords:(bw,bb)=>simDev.arenaSetRecords(bw,bb),
      arenaRecordsPersist:(bw,bb)=>simDev.arenaRecordsPersist(bw,bb), arenaLastRecordPayoff:()=>simDev.arenaLastRecordPayoff(),
      arenaRunBossWave:(k)=>simDev.arenaRunBossWave(k), arenaDeathPersistRecord:()=>simDev.arenaDeathPersistRecord(),
      arenaRecordSrandProbe:(s,p)=>simDev.arenaRecordSrandProbe(s,p),
      // CAS-1681 Eventos de Zona (tools/cas1681-events.mjs) — MUST wire HERE (curated wrapper)
      eventSetEnabled:(b)=>simDev.eventSetEnabled(b), eventSetDensity:(x)=>simDev.eventSetDensity(x),
      eventState:()=>simDev.eventState(), eventListPOIs:()=>simDev.eventListPOIs(),
      eventForceSpawn:(t,dx,dy)=>simDev.eventForceSpawn(t,dx,dy), eventSeedZone:(z,s)=>simDev.eventSeedZone(z,s),
      eventActivateShrine:(id)=>simDev.eventActivateShrine(id), eventKillGuard:(id)=>simDev.eventKillGuard(id),
      eventReachGoblin:(id)=>simDev.eventReachGoblin(id), eventEscapeGoblin:(id)=>simDev.eventEscapeGoblin(id),
      eventLastPayoff:()=>simDev.eventLastPayoff(), eventRngProbe:(n,s)=>simDev.eventRngProbe(n,s),
      eventGenProbe:(en,d,s,p)=>simDev.eventGenProbe(en,d,s,p),
      // CAS-1687 Runas y Engarces (sockets) (tools/cas1687-sockets.mjs) — MUST wire HERE (curated wrapper)
      socketMeta:()=>simDev.socketMeta(), socketSetEnabled:(b)=>simDev.socketSetEnabled(b), setSocketRate:(r)=>simDev.setSocketRate(r),
      socketTotals:()=>simDev.socketTotals(), grantSocketGear:(sl,n)=>simDev.grantSocketGear(sl,n), grantRune:(t)=>simDev.grantRune(t),
      forceSocketRune:(t,z)=>simDev.forceSocketRune(t,z), socketRune:(i)=>simDev.socketRune(i), removeSocketRune:(sl)=>simDev.removeSocketRune(sl),
      socketSnap:()=>simDev.socketSnap(), socketPersist:(sl,t)=>simDev.socketPersist(sl,t),
      socketRngProbe:(n,s)=>simDev.socketRngProbe(n,s), socketGenProbe:(en,r,s,p)=>simDev.socketGenProbe(en,r,s,p),
      // CAS-1692 Nuevos MOBS — dev probes consumed by tools/cas1692-mobs-live-qa.mjs — additive
      newMobsMeta:()=>simDev.newMobsMeta(),
      setNewMobsEnabled:(b)=>simDev.setNewMobsEnabled(b),
      newMobsGenProbe:(en,s,p)=>simDev.newMobsGenProbe(en,s,p),
      spawnNewMob:(type,zone)=>simDev.spawnNewMob(type,zone),
      newMobSpawnKill:(type)=>simDev.newMobSpawnKill(type),
      newMobImgLoaded:(type)=>{ const key="enemy_"+type; const im=IMG[key]; return { type, key, loaded:!!(im&&im.complete&&im.naturalWidth), w:im?im.naturalWidth:0, h:im?im.naturalHeight:0 }; },
      // CAS-1751 CÓDICE DE BOTÍN — dev probes consumed by tools/cas1752-codex.mjs — additive, drive REAL paths
      codexEnable:(on)=>simDev.codexEnable(on), codexReset:()=>simDev.codexReset(), codexState:()=>simDev.codexState(),
      codexRecord:(cat,id)=>simDev.codexRecord(cat,id), codexPickup:(cat,id)=>simDev.codexPickup(cat,id),
      codexPersist:()=>simDev.codexPersist(), codexSrandProbe:(en,s,p)=>simDev.codexSrandProbe(en,s,p),
      codexBtns:()=>{ const t=topBtns(), s=sidebarBtns(); return { top:!!(t&&t.cdx), sidebar:!!(s&&s.cdx) }; }, // CAS-1751: prove the HUD affordance appears (enabled) / is absent (disabled)
      // CAS-1758 TÍTULOS DE GESTA — dev probes consumed by tools/cas1758-titles.mjs — additive, drive REAL paths
      titlesEnable:(on)=>simDev.titlesEnable(on), titlesReset:()=>simDev.titlesReset(), titlesState:()=>simDev.titlesState(),
      titlesEval:()=>simDev.titlesEval(), titlesEquip:(id)=>simDev.titlesEquip(id), titlesPersist:()=>simDev.titlesPersist(),
      titlesSeedCodex:(cat,n)=>simDev.titlesSeedCodex(cat,n), titlesSeedArena:(w,b)=>simDev.titlesSeedArena(w,b), titlesSeedAscension:(l)=>simDev.titlesSeedAscension(l),
      titlesSrandProbe:(en,s,p)=>simDev.titlesSrandProbe(en,s,p),
      titlesBtns:()=>{ const t=topBtns(), s=sidebarBtns(); return { top:!!(t&&t.ttl), sidebar:!!(s&&s.ttl) }; }, // CAS-1758: prove the HUD affordance appears (enabled) / is absent (disabled)
      titlesHudName:()=>{ const s=hudSnapshot(); return { name:s.name||"", title:s.title||"", display: s.title ? (s.name+" · "+s.title) : (s.name||"") }; }, // CAS-1758: the HUD name line (name · title)
      // CAS-1763 PACTOS DE PODER — dev probes consumed by tools/cas1763-pacts.mjs — additive, drive REAL paths
      pactsEnable:(on)=>simDev.pactsEnable(on), pactsReset:()=>simDev.pactsReset(), pactsState:()=>simDev.pactsState(),
      pactsSetRank:(id,r)=>simDev.pactsSetRank(id,r), pactsCycle:(id)=>simDev.pactsCycle(id), pactsPersist:()=>simDev.pactsPersist(),
      pactMobScale:(t,z)=>simDev.pactMobScale(t,z), pactEssence:(l,e)=>simDev.pactEssence(l,e), pactsSrandProbe:(en,rk,s,p)=>simDev.pactsSrandProbe(en,rk,s,p),
      pactsBtns:()=>{ const t=topBtns(), s=sidebarBtns(); return { top:!!(t&&t.pct), sidebar:!!(s&&s.pct) }; }, // CAS-1763: prove the ⚔ HUD affordance appears (enabled) / is absent (disabled)
      // CAS-123 Stage-1 finale/win-condition contract consumed by tools/cas123-finale.mjs — additive
      stage1State:()=>simDev.stage1State(), armFinalBoss:()=>simDev.armFinalBoss(), ackVictory:()=>simDev.ackVictory(),
      // CAS-342 zone-capstone arming (any hunt zone) consumed by tools/cas342-dragon-capstone.mjs — additive
      armHunt:(zone)=>simDev.armHunt(zone),
      // CAS-132 analytics funnel QA: drive the real hero-death path (additive, dev-only)
      killHero:()=>simDev.killHero(),
      // CAS-1565 meta-v2 QA: grant Esencia to bankroll Tier-2 + Ascensión (additive, dev-only)
      metaGrant:(n)=>simDev.metaGrant(n),
      // CAS-277 end-of-run recap contract consumed by tools/cas277-recap.mjs — additive
      recapState:()=>simDev.recapState(), runBase:()=>simDev.runBase(),
      retryRun:()=>simDev.retryRun(), returnToHub:()=>simDev.returnToHub(),
      recapRects:()=>(ui.deadRects||[]).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,act:r.act})),
      // CAS-1565 meta-v2 QA: read-only altar hit-rects (buy keys + back/ascend acts) so the
      // live harness can drive Tier-2 buys + the Ascensión flow by tapping (mirrors recapRects).
      altarRects:()=>(ui.altarRects||[]).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,act:r.act||null,key:r.key||null})),
      altarConfirmOpen:()=>!!ui.altarAscendConfirm,
      // CAS-1649 meta-v3 QA: legacy codex + eligible pool + choose hook, plus the live legacy-choice
      // modal state (rects + open flag) so the harness can drive the ascension→choose flow by tapping.
      metaLegacy:()=>simDev.metaLegacy(), legacyPool:()=>simDev.legacyPool(), legacyChoose:(k)=>simDev.legacyChoose(k),
      legacyRects:()=>(ui.legacyRects||[]).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,key:r.key||null})),
      legacyChooseOpen:()=>!!ui.legacyChoose,
      // CAS-127 game-feel/juice contract consumed by tools/cas127-juice.mjs — additive
      juiceState:()=>simDev.juiceState(), floaterDump:()=>simDev.floaterDump(), setReduceMotion:(v)=>simDev.setReduceMotion(v),
      clearFx:()=>simDev.clearFx(), juiceArena:(n)=>simDev.juiceArena(n), juiceSwing:()=>simDev.juiceSwing(),
      forceCritSwing:()=>simDev.forceCritSwing(),
      // CAS-273 juice polish (kill-shake escalado por muerte + damage-number anti-overlap) — additive
      killShakeProbe:()=>simDev.killShakeProbe(),
      // CAS-128 onboarding/tutorial contract consumed by tools/cas128-onboarding.mjs — additive
      tutState:()=>simDev.tutState(), tutArm:(v)=>simDev.tutArm(v), tutStart:()=>simDev.tutStart(),
      tutSkip:()=>simDev.tutSkip(), tutSetStep:(i)=>simDev.tutSetStep(i), tutSeen:()=>persist.tutSeen(),
      clearTutSeen:()=>persist.clearTutSeen(),
      setSound:(v)=>audio.setEnabled(v),
      // CAS-265 accessibility/QoL contract consumed by tools/cas265-accessibility.mjs — additive
      settingsState:()=>({shake:G.settings.shake, crt:G.settings.crt, rollAim:G.settings.rollAim,
        reduceMotion:G.settings.reduceMotion, colorblind:G.settings.colorblind, binds:Object.assign({},G.settings.binds)}),
      setColorblind:(v)=>{ G.settings.colorblind=!!v; settings.save(); },
      setReduceMotionPref:(v)=>{ G.settings.reduceMotion=!!v; if(v) G.shake=0; settings.save(); },
      setBind:(a,c)=>settings.setBind(a,c), resetBinds:()=>settings.resetBinds(),
      settingsSaved:()=>{ try{ return JSON.parse(localStorage.getItem("mithralda.settings.v1")||"null"); }catch(e){ return null; } },
      // CAS-131 audio/soundscape contract consumed by tools/cas131-audio.mjs — additive
      audioState:()=>audio.state(), setMaster:(v)=>audio.setMaster(v), setMusic:(v)=>audio.setMusic(v),
      setSfx:(v)=>audio.setSfx(v), setMuted:(v)=>audio.setMuted(v), setAmbient:(z)=>audio.setAmbient(z),
      playMusic:(t)=>audio.playMusic(t),
      // CAS-1594/1595 inventory 30-slot grid + scroll — consumed by tools/cas1595-invgrid.mjs (additive, dev-only).
      // Read-only grid state (scroll is ROW-based, per CTO reconciliation) + a clamped scroll setter +
      // a deterministic bag filler (NO seed RNG — hand-built instances) so QA can exercise a full backpack.
      invGrid:()=>{ const g=ui.invGrid||{}; return {slots:30, cols:g.cols||0, visibleRows:g.visRows||0,
        scroll:(G.invScrollRow||0), scrollMax:(g.maxScrollRow||0), rects:(ui.invRects||[]).length,
        filled:(G.hero&&G.hero.bag?G.hero.bag.length:0)}; },
      setInvScroll:(n)=>{ const mx=(ui.invGrid&&ui.invGrid.maxScrollRow)||0; G.invScrollRow=Math.max(0,Math.min(mx,n|0)); },
      fillBag:(n)=>{ const h=G.hero; if(!h) return 0;
        const DEFS=[["weapon","w_iron"],["body","a_leather"],["shield","s_iron"],["weapon","w_steel"],
          ["body","a_plate"],["weapon","w_rune"],["shield","s_tower"],["body","a_wyrm"]];
        const RAR=["common","rare","epic"], AFX=["dmg","hp","atkspd","movespd"];
        h.bag.length=0; const c=Math.max(0,Math.min(30, n==null?16:(n|0)));
        for(let i=0;i<c;i++){ const d=DEFS[i%DEFS.length]; const inst={slot:d[0],defId:d[1],rarity:RAR[i%RAR.length]};
          if(i%2===0) inst.affixes=[{id:AFX[i%AFX.length],amt:3}]; h.bag.push(inst); }
        if(G.invSel!=null) G.invSel=Math.min(G.invSel, Math.max(0,h.bag.length-1)); return h.bag.length; } };
  }
  syncMenuDom(); positionNameInput();

  return { update, render, onResize, onFocusLost, devInfo };
}
