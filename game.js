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
import { io, initInput, syncMenuDom, positionNameInput } from "./input.js";
import { createRenderer } from "./render/render.js";
import { loadAllAssets } from "./render/sprites.js";
import * as persist from "./persist.js";

export function createGame(canvas, ctx, getView){
  // wire the simulation's injected dependencies (input intents, audio, viewport)
  configureSim({ io, audio, view });
  initInput(canvas);
  const renderer = createRenderer(ctx);

  // one fixed simulation step + the menu DOM sync (the only DOM the loop touches)
  // CAS-113: throttled progression autosave rides the sim step (never per-frame).
  function update(dtMs){ simUpdate(dtMs); persist.tick(dtMs/1000); syncMenuDom(); }
  function render(alpha){ renderer.render(alpha); }
  function onResize(w,h){ view.VW=w; view.VH=h; if(G.scene==="menu") positionNameInput(); }
  function onFocusLost(){ if(G.scene==="play") G.scene="pause"; }
  function devInfo(){ return "ent:"+G.enemies.length+" fx:"+G.fx.length+" scene:"+G.scene; }

  // boot
  loadAllAssets();
  // CAS-113: rehydrate a saved run BEFORE the menu DOM syncs — a valid save jumps
  // straight into play (skipping name/class); no/invalid save leaves the menu flow.
  persist.boot();
  persist.initFlush();
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
      hitChamp:(zone)=>simDev.hitChamp(zone),
      // spell-identity contract consumed by tools/spells.mjs (CAS-52) — additive
      setClass:(cls)=>simDev.setClass(cls),
      // per-class base-stat contract consumed by tools/classstats.mjs (CAS-100) — additive
      classStats:(cls)=>simDev.classStats(cls),
      cast:(i)=>simDev.cast(i),
      // merchant-shop economic-loop contract consumed by tools/shop.mjs (CAS-112) — additive
      merchantTP:()=>simDev.merchantTP(), shopList:()=>simDev.shopList(), shopBuy:(i)=>simDev.shopBuy(i),
      heroStats:()=>simDev.heroStats(), setGold:(n)=>simDev.setGold(n),
      // CAS-114 abyss power-gate contract consumed by tools/abyss.mjs — additive
      abyssGate:()=>simDev.abyssGate(), setUpg:(d,hp,def)=>simDev.setUpg(d,hp,def), tryPortal:(to)=>simDev.tryPortal(to),
      // CAS-115 combat-archetype contract consumed by tools/archetypes.mjs — additive
      archMeta:(type)=>simDev.archMeta(type), archArena:(type,dx,dy)=>simDev.archArena(type,dx,dy),
      archSnap:()=>simDev.archSnap(), archMoveHero:(dx,dy)=>simDev.archMoveHero(dx,dy),
      spellProbe:(cls)=>simDev.spellProbe(cls),
      dotProbe:()=>simDev.dotProbe(),
      // CAS-118 status-effect contract consumed by tools/cas118-status.mjs — additive
      statusMeta:(type)=>simDev.statusMeta(type), mobInfl:(type)=>simDev.mobInfl(type),
      statusOf:(who)=>simDev.statusOf(who), applyStatusTo:(who,type,opt)=>simDev.applyStatusTo(who,type,opt),
      weaponProcs:()=>simDev.weaponProcs(), giveBurnWeapon:(amt)=>simDev.giveBurnWeapon(amt),
      statusArena:(type,dx,dy)=>simDev.statusArena(type,dx,dy), heroHit:()=>simDev.heroHit(),
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
      stage1State:()=>simDev.stage1State(), armFinalBoss:()=>simDev.armFinalBoss(), ackVictory:()=>simDev.ackVictory() };
  }
  syncMenuDom(); positionNameInput();

  return { update, render, onResize, onFocusLost, devInfo };
}
