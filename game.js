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
import { STAMINA, FLASK, EQUIP_LOAD, TWO_HAND } from "./sim/config.js";   // CAS-1841/CAS-1854/CAS-1889/CAS-1895: gated HUD feeds (vigor bar + Estus pips + banda de carga + marcador a dos manos — absent OFF ⇒ HUD byte-identical)
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
  persist.bootCodex(); // CAS-1751: rehydrate the account-wide Códice de Botín ledger from its OWN store BEFORE persist.boot() so a loaded hero's reconcile reads the live codex bonus (account-wide, independent of any character)
  persist.bootTitles(); // CAS-1758: rehydrate the account-wide Títulos de Gesta ledger from its OWN store BEFORE persist.boot() so a loaded hero's reconcile caches the equipped title (account-wide, independent of any character)
  persist.bootPacts(); // CAS-1763: rehydrate the Pactos de Poder (Power Pacts) preference from its OWN store (account-wide, independent of any character; effects derive live in the seam each run)
  persist.bootBloodstain(); // CAS-1867: rehydrate the Mancha de Sangre (at-risk Esencia dropped at the death point) from its OWN store (mithralda.bloodstain.v1 — never the run save); gated on BLOODSTAIN.enabled ⇒ OFF leaves G.bloodstain null (byte-id)
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
