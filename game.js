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
import { configure as configureSim, G, update as simUpdate, dev as simDev, serializeSave } from "./sim/sim.js";
import { audio } from "./audio.js";
import { view } from "./view.js";
import { io, initInput, syncMenuDom, positionNameInput, ui } from "./input.js";
import { createRenderer } from "./render/render.js";
import { loadAllAssets } from "./render/sprites.js";
import { rarityRank } from "./sim/gear.js";
import * as persist from "./persist.js";
import * as settings from "./settings.js";
import { analytics } from "./analytics.js";
import { daily } from "./daily.js";
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
  const MENU_SCENES=new Set(["inventory","talents","mastery","shop","bounty","pause","dialogue"]);
  let prevScene=G.scene;
  function update(dtMs){ simUpdate(dtMs); persist.tick(dtMs/1000); analytics.tick(dtMs, G); daily.tick(); syncMenuDom();
    const s=G.scene; if(s!==prevScene){
      const into=MENU_SCENES.has(s), from=MENU_SCENES.has(prevScene);
      if(into&&!from) audio.sfx.uiOpen(); else if(from&&!into) audio.sfx.uiClose();
      // CAS-277: fire the CAS-132 funnel event when the end-of-run recap first appears,
      // so its "one more run" impact is measurable (retry events fire from input.js).
      if(s==="dead") analytics.event("recap_shown");
      prevScene=s; } }
  function render(alpha){ renderer.render(alpha); }
  function onResize(w,h){ view.VW=w; view.VH=h; if(G.scene==="menu") positionNameInput(); }
  function onFocusLost(){ if(G.scene==="play") G.scene="pause"; }
  function devInfo(){ return "ent:"+G.enemies.length+" fx:"+G.fx.length+" scene:"+G.scene; }

  // boot
  loadAllAssets();
  // CAS-265: load persisted accessibility / QoL settings (reduce-motion, colour-blind
  // cues, screen-shake, key rebindings) BEFORE input + the first frame so a returning
  // player's preferences are live from frame 0. Separate localStorage key from the save,
  // so wiping a character never resets accessibility prefs. Defaults preserve behaviour.
  settings.boot();
  // CAS-113: rehydrate a saved run BEFORE the menu DOM syncs — a valid save jumps
  // straight into play (skipping name/class); no/invalid save leaves the menu flow.
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
    }, a11y);
  }
  hud.boot(hudSnapshot);
  // Read API for the analytics.html dashboard + QA harness (own anonymous device data).
  if(typeof window!=="undefined"){ window.__analytics=analytics.dev; window.__daily=daily.dev; }
  if(typeof location!=="undefined" && location.search.indexOf("dev")>=0){
    window.__dev={ spawn:(type,dx,dy)=>simDev.spawn(type,dx,dy), tp:(tx,ty)=>simDev.tp(tx,ty),
      // introspection contract consumed by tools/smoke.mjs (read-only views of sim state)
      scene:()=>G.scene,
      hero:()=>G.hero?{cls:G.hero.cls,x:G.hero.x,y:G.hero.y}:null,
      // CAS-92: read-only hero animation state, used by tools/hero-anim-shot.mjs
      heroAnim:()=>G.hero?{state:G.hero.animState,rolling:!!G.hero.rolling,atk:G.hero.atkAnim>0,hurtAnim:+(G.hero.hurtAnim||0).toFixed(3),specialAnim:+(G.hero.specialAnim||0).toFixed(3)}:null,
      enemyCount:()=>G.enemies.length,
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
      equipBag:(i)=>simDev.equipBag(i),
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
      // CAS-120 active-skill-bar contract consumed by tools/cas120-skills.mjs — additive
      skillBar:(cls)=>simDev.skillBar(cls), skillProbe:(cls,slot)=>simDev.skillProbe(cls,slot),
      // CAS-123 Stage-1 finale/win-condition contract consumed by tools/cas123-finale.mjs — additive
      stage1State:()=>simDev.stage1State(), armFinalBoss:()=>simDev.armFinalBoss(), ackVictory:()=>simDev.ackVictory(),
      // CAS-132 analytics funnel QA: drive the real hero-death path (additive, dev-only)
      killHero:()=>simDev.killHero(),
      // CAS-277 end-of-run recap contract consumed by tools/cas277-recap.mjs — additive
      recapState:()=>simDev.recapState(), runBase:()=>simDev.runBase(),
      retryRun:()=>simDev.retryRun(), returnToHub:()=>simDev.returnToHub(),
      recapRects:()=>(ui.deadRects||[]).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,act:r.act})),
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
      playMusic:(t)=>audio.playMusic(t) };
  }
  syncMenuDom(); positionNameInput();

  return { update, render, onResize, onFocusLost, devInfo };
}
