// ===========================================================================
// render/sprites.js — procedural pixel sprites, loaded image assets + animation.
// Pure presentation: every function takes the canvas ctx as a parameter and
// only draws. No simulation state is read or mutated here.
// ===========================================================================
import { COL } from "./palette.js";

// blit a sprite grid (array of strings) using a per-sprite palette.
export function blit(ctx, rows, pal, cx, cy, px, flipX){
  const w = rows[0].length, h = rows.length;
  const ox = cx - (w*px)/2, oy = cy - (h*px)/2;
  for(let r=0;r<h;r++){
    const row = rows[r];
    for(let c=0;c<w;c++){
      const ch = row[c];
      if(ch===' '||ch==='.') continue;
      const col = pal[ch]; if(!col) continue;
      const dc = flipX ? (w-1-c) : c;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(ox+dc*px), Math.round(oy+r*px), Math.ceil(px), Math.ceil(px));
    }
  }
}
// --- sprite definitions (compact, readable, outlined) ---
export const SP = {
  hero: { pal:{o:COL.out,s:"#8a93a0",S:"#aeb6c2",d:"#5a626e",b:"#d8b894",B:"#ecd0a6",a:"#c98a3a",w:"#cdd4dc",h:"#6b4a2a",e:"#2a2f38"}, rows:[
    "...ooo...",
    "..odSdo..",
    "..oBbBo..",
    "..obebo..",
    ".oossooo.",
    "osSssSso w",
    "osSssSso w",
    "asSssSsah",
    ".dSssSd..",
    ".oss sso.",
    ".od. .do.",
    ".oo. .oo."]},
  // CAS-215 (FOUNTAINS roster regen, priority B — remaining mobs/NPCs): cold-gloom reskin
  // of every sprite the CAS-209 batch left warm/over-saturated. Geometry strings & keys are
  // untouched (byte-for-byte drop-in); only hex values shift to the locked palette roles in
  // design/palette.fountains.json. Eyes/flame stay the lone signal glow per the formula.
  wolf: { pal:{o:COL.out,g:"#454d57",G:"#5c6671",x:"#2b323b",e:"#ffcf4d",f:"#c7bc9c"}, rows:[
    "..o.....o..",
    ".oxo...oxo.",
    ".oGgo.oGgo.",
    "oggggggGggo",
    "ogGggggggGo",
    "ogeggggeggo",
    "ogggffggggo",
    ".ogggggggo.",
    "..o.gg.o...",
    "...o..o...."]},
  // CAS-209 (FOUNTAINS parity, priority B): mob procedural palettes re-skinned to
  // the board-adopted cold dark-fantasy palette. Signal colours (e=hurt flash/eye)
  // kept saturated — they are the ONLY glow per the FOUNTAINS formula.
  rat: { pal:{o:COL.out,r:"#352e28",R:"#4a413a",t:"#1e1b18",e:"#d24b4b"}, rows:[
    "...o...o..t",
    "..oRo.oRott",
    ".orRrrrRrt.",
    ".oreRRReo..",
    "orrrRRrrro.",
    ".orrrrrro..",
    "..o.rr.o..."]},
  skel: { pal:{o:COL.out,n:"#c7bc9c",N:"#d8cdb8",m:"#8f8268",e:"#7fe0d0",w:"#aab4c2"}, rows:[
    "..ooo..",
    ".onNno.",
    ".oeneo.",
    ".onnno.",
    "..ono..w",
    ".onnno w",
    "omnnnmow",
    ".onnno.",
    ".om.mo.",
    ".oo.oo."]},
  orc: { pal:{o:COL.out,q:"#26302a",Q:"#334036",u:"#19211c",e:"#b3242a",T:"#c7bc9c",c:"#2c2925"}, rows:[
    "..ooooo....",
    ".oQqqqQo...",
    ".oqeqeqo.cc",
    ".qQTTQqo.cc",
    "ouqqqquo.cc",
    "oqQqqqQqouc",
    "oqqQuQqqo..",
    ".ouqqquo...",
    "..oq.qo....",
    "..oo.oo...."]},
  golem: { pal:{o:COL.out,l:"#2e3038",L:"#3e4252",j:"#1a1c22",z:"#b3242a",Z:"#d8403f",e:"#d8403f"}, rows:[ // CAS-211 (c): cold stone + lone crimson-ember signal (was amber), FOUNTAINS war-machine
    "...oooooo...",
    "..oLllllLo..",
    ".olLzeezLlo.",
    ".oljLLLLjlo.",
    "ollzLLLLzllo",
    "olLLjzzjLLlo",
    "olljLLLLjllo",
    "ollLzllzLllo",
    ".oljllllljo.",
    ".oll o llo.",
    ".ooo. .ooo."]},
  npcBram: { pal:{o:COL.out,a:"#4a3a28",A:"#5e4a34",b:"#a87f53",h:"#3a2c1e",w:"#bdb8aa"}, rows:[
    "..ohho..",
    ".obbbbo.",
    ".obbbbo.",
    ".oaAAao.",
    "owAAAAwo",
    "owAaaAwo",
    ".oAAAAo.",
    ".oa..ao.",
    ".oo..oo."]},
  npcRolf: { pal:{o:COL.out,s:"#6b7480",S:"#8a93a0",b:"#a87f53",a:"#4a525e",p:"#5a4230"}, rows:[
    "..oSSo..p",
    ".osssso.p",
    ".obbbbo.p",
    ".oaSSao.p",
    "osSssSso.",
    "osSssSso.",
    ".oSssSo..",
    ".oa..ao..",
    ".oo..oo.."]},
  npcLina: { pal:{o:COL.out,g:"#34503a",G:"#446a4d",b:"#a87f53",h:"#293f2c"}, rows:[
    "..oGGo..",
    ".oghhgo.",
    ".ogbbgo.",
    ".oGggGo.",
    "ogGggGgo",
    "ogGggGgo",
    "ogGggGgo",
    ".oGGGGo.",
    ".oo..oo."]},
  adv: { pal:{o:COL.out,s:"#4a525e",S:"#626c78",b:"#a87f53",a:"#32373f"}, rows:[
    "..oSSo..",
    ".osbbso.",
    ".obbbbo.",
    "osSssSso",
    "osSssSso",
    ".oSssSo.",
    ".oa..ao.",
    ".oo..oo."]},
  tree: { pal:{o:COL.out,g:"#26302a",G:"#334036",d:"#19211c",t:"#3a2c1e",T:"#5a4230"}, rows:[
    "....oggo....",
    "...ogGGgo...",
    "..ogGGGGgo..",
    ".ogGGggGGgo.",
    "ogGGGGGGGGgo",
    "ogGggGGggGgo",
    ".odGGGGGGdo.",
    "..ogGGGGgo..",
    "...oddddo...",
    ".....oTo....",
    ".....oTo....",
    "....otTto..."]},
  rock: { pal:{o:COL.out,s:"#2b2f38",S:"#3a4150",d:"#1b1f26"}, rows:[
    "..oooo..",
    ".oSSSSo.",
    "oSSSSdSo",
    "oSdSSSSo",
    "oSSSdSSo",
    ".odSSdo.",
    "..oooo.."]},
  chest: { pal:{o:COL.out,w:"#2a2420",W:"#3a322a",i:"#b08c44",d:"#16130e"}, rows:[
    ".oooooo.",
    "oWiWWiWo",
    "oWWWWWWo",
    "oiiiiiio",
    "oWWWWWWo",
    "oWdWWdWo",
    ".oooooo."]},
  // --- new mob variety (CAS-60): forest flyer, ruins rogue, caves ghost ---
  bat: { pal:{o:COL.out,k:"#2c2d34",K:"#46485a",e:"#b3242a"}, rows:[
    "oo.......oo",
    "oKko...okKo",
    "oKkko.okkKo",
    "oKkkkkkkkKo",
    ".oKeKkKeKo.",
    "..okkkkko..",
    "...o.k.o..."]},
  bandit: { pal:{o:COL.out,l:"#2c2d34",L:"#3e404c",m:"#181920",e:"#ffd24d",s:"#6b7480"}, rows:[
    "..ooooo..",
    ".olLLLlo.",
    ".olmmmlo.",
    ".olmemlo.",
    ".oLLLLLo.",
    "soLLLLLos",
    "soLLLLLos",
    ".oLlllLo.",
    ".ol...lo.",
    ".oo...oo."]},
  wraith: { pal:{o:COL.out,g:"#5a6b7a",G:"#7d90a0",e:"#9be7ff",d:"#3a4650"}, rows:[
    "...ooo...",
    "..oGGGo..",
    ".oGdgdGo.",
    ".oGeGeGo.",
    ".oGgggGo.",
    "oGggggggo",
    "oGgddgdGo",
    "oGgogogGo",
    ".oGo.oGo.",
    "..o...o.."]},
  // CAS-312: dark_demon_3 (board-supplied MOB). Procedural FALLBACK only — the real art
  // is the PixelLab-style enemy_demon cutout + demon_attack/demon_cast strips below; this
  // tiny silhouette renders only if those images fail to load (offline/asset-fail safety).
  // On the cold FOUNTAINS palette: dark umber body, lone amber eye-glow, bone-white claws.
  demon: { pal:{o:COL.out,d:"#39342a",D:"#4d4636",e:"#ffcf4d",c:"#cdd0c8"}, rows:[
    "o.o.....o.o",
    ".oDddddDo..",
    ".odeddeDo..",
    ".oDddddDo..",
    "c.oDDddDo.c",
    "coDdDDdDoc.",
    "coDddddDoc.",
    ".oDdddDo...",
    ".oDd.dDo...",
    ".oo...oo..."]},
  // CAS-363: wendigo (board-supplied MOB, art CAS-355). Procedural FALLBACK only — the real
  // art is the 5 PixelLab strips below (idle/walk/attack/hurt/death via ENEMY_STRIPS.wendigo);
  // this antlered wraith-shaman silhouette renders ONLY in the brief asset-load window or if
  // those strips fail to load (offline/asset-fail safety — same role SP.demon plays). Without
  // it, the richAnim strip path falls through to here with SP[sprite]=undefined → a render
  // crash before the strip finishes downloading. Cold palette: slate body, near-black antlers,
  // lone violet eye-glow, silver mane, knotted staff.
  wendigo: { pal:{o:COL.out,d:"#3a3f48",D:"#5a616d",a:"#15171c",e:"#b070ff",s:"#9aa3b0",w:"#6b5a3a"}, rows:[
    "a.a...a.a.w",
    ".aoa.aoa..w",
    "..ososo...w",
    "..oeoeo...w",
    ".osDDDso..w",
    ".oDdDdDo..w",
    ".oDddddDo.w",
    ".oDdddDo...",
    ".oDd.dDo...",
    ".oo...oo..."]},
  // CAS-360: quillback (Quillback Stalker, art CAS-356). Procedural FALLBACK only — the real
  // art is the 5 PixelLab strips (idle/walk/attack/hurt/death via ENEMY_STRIPS.quillback); this
  // spiny quadruped silhouette renders ONLY in the brief asset-load window or if those strips
  // fail to load (same role SP.wendigo/SP.skel play). Without it the richAnim strip path falls
  // through to the procedural blit with SP["quillback"]=undefined → a render crash before the
  // strip downloads. Cold earth palette: bristled body, near-black quills, bone tips, amber eye.
  quillback: { pal:{o:COL.out,b:"#473d33",B:"#60543f",q:"#1f1b17",Q:"#9a8763",e:"#ffcf4d"}, rows:[
    "...Q..Q..Q..",
    "..oqo.oqo.qo",
    ".oqqqqqqqqqo",
    "oqBbbbbbbBqo",
    "obBbbbbbbBeo",
    "obbbbbbbbbbo",
    ".obbbbbbbbo.",
    ".o.o.oo.o.o.",
    "...o.oo.o..."]},
  // CAS-442: the Ciénaga de Bruma family (art CAS-440). Procedural FALLBACKS only — the real
  // art is the PixelLab strips via ENEMY_STRIPS.{mudlurker,wisp,toadbrute,bogtyrant}; these
  // silhouettes render ONLY in the brief asset-load window or if the strips fail to load.
  // MANDATORY (CAS-360 gotcha): a richAnim strip-only mob with SP[sprite]=undefined CRASHES
  // the render before the strip downloads — every richAnim mob ships one of these.
  // Ciénaga palette: teal mist, peat/olive bodies, ámbar eye-glow.
  mudlurker: { pal:{o:COL.out,m:"#4a4232",M:"#5f5640",t:"#3f6b5e",e:"#ffb03a"}, rows:[
    "....o..o....",
    "..ooMmmMoo..",
    ".oMmemmemMo.",
    ".oMmmmmmmMo.",
    "oMmtmmmmtmMo",
    "oMmmmmmmmmMo",
    ".oMmmmmmmMo.",
    ".o.oo..oo.o.",
    "...o....o..."]},
  wisp: { pal:{o:COL.out,f:"#57c8b2",F:"#8fe8d4",c:"#2e6b5e",e:"#ffd75e"}, rows:[
    "....oFo.....",
    "...oFfFo....",
    "..oFfffFo...",
    "..ofecefo...",
    "..oFfffFo...",
    "...ocfco....",
    "....ofo.....",
    ".....o......"]},
  toadbrute: { pal:{o:COL.out,g:"#4f5c33",G:"#6a7a44",d:"#33401f",e:"#ffb03a"}, rows:[
    "..oGGo.oGGo.",
    ".oGeGGGGeGo.",
    "oGgggggggggo",
    "oGgdgggdggGo",
    "oGgggggggggo",
    "oGgggggggggo",
    ".oGgggggggo.",
    ".oo.oGGo.oo.",
    "..o..oo..o.."]},
  bogtyrant: { pal:{o:COL.out,b:"#3d4a2c",B:"#55663c",d:"#26301a",w:"#5a4230",e:"#ffb03a"}, rows:[
    "..oBBo..oBBo",
    ".oBeBBBBeBow",
    ".oBbbbbbbBow",
    "oBbbddddbbBw",
    "oBbbbbbbbbBw",
    "oBbbbbbbbbBw",
    ".oBbbbbbbBo.",
    ".oBbbbbbbBo.",
    ".oobb..bboo.",
    "..oo....oo.."]},
  // --- town deco (CAS-60): market/city variety, drawn like other SP deco ---
  crate: { pal:{o:COL.out,W:"#5a4230",d:"#2c2925"}, rows:[
    "ooooooo",
    "oWWWWWo",
    "oWdWdWo",
    "oWWWWWo",
    "oWdWdWo",
    "oWWWWWo",
    "ooooooo"]},
  stall: { pal:{o:COL.out,p:"#3e2e2c",P:"#52403c",w:"#5a4230",b:"#8f7a44"}, rows:[
    ".ooooooooo.",
    "opPpPpPpPpo",
    "opPpPpPpPpo",
    "oooooooooo.",
    ".ow.....wo.",
    ".ow.bbb.wo.",
    ".owbbbbbwo.",
    ".oooooooo.."]},
  lantern: { pal:{o:COL.out,p:"#3a2c1c",f:"#ff8a2a",F:"#ffd24d"}, rows:[
    "..o..",
    ".oFo.",
    ".ofo.",
    ".oFo.",
    "..o..",
    "..p..",
    "..p..",
    ".ooo."]},
};
export function drawCoin(ctx,x,y,px,t){ const w=Math.abs(Math.cos(t*4))*0.8+0.2; ctx.fillStyle=COL.out; ctx.fillRect(x-px*2*w-px,y-px*3,px*(4*w+2),px*6);
  ctx.fillStyle=COL.gold; ctx.fillRect(x-px*2*w,y-px*2,px*4*w,px*4); ctx.fillStyle=COL.goldL; ctx.fillRect(x-px*1*w,y-px*1,px*1*w,px*2); }
export function drawPotion(ctx,x,y,px,fill,light){ ctx.fillStyle=COL.out; ctx.fillRect(x-px*2,y-px*4,px*4,px*8);
  ctx.fillStyle="#cfe6ee"; ctx.fillRect(x-px*1.5,y-px*3.5,px*3,px*3); ctx.fillStyle=fill; ctx.fillRect(x-px*1.5,y-px*0.5,px*3,px*3.5);
  ctx.fillStyle=light; ctx.fillRect(x-px*1,y,px*1,px*2); ctx.fillStyle="#8a6a3a"; ctx.fillRect(x-px,y-px*4.5,px*2,px*1); }
export function drawFragment(ctx,x,y,px,t){ const g=0.6+0.4*Math.sin(t*5); ctx.globalAlpha=0.5*g; ctx.fillStyle=COL.fragL; ctx.fillRect(x-px*4,y-px*4,px*8,px*8); ctx.globalAlpha=1;
  ctx.fillStyle=COL.out; ctx.fillRect(x-px*2,y-px*3,px*4,px*6); ctx.fillStyle=COL.frag; ctx.fillRect(x-px*1.5,y-px*2.5,px*3,px*5); ctx.fillStyle=COL.fragL; ctx.fillRect(x-px*0.5,y-px*2,px*1,px*3); }

// ---------------- loaded image assets (purchased packs) + animation ----------------
export const IMG={}; let imgPending=0;
// Cache-bust image assets with the same build id the module graph uses (CAS-58).
// window.__BUILD is set by the index.html bootstrap before this module loads;
// fall back to no query when absent (e.g. unit tooling) so paths stay valid.
const ASSET_V=(typeof globalThis!=="undefined"&&globalThis.__BUILD)?("?v="+globalThis.__BUILD):"";
export function loadImg(key,src){ imgPending++; const im=new Image();
  im.onload=()=>{ imgPending--; }; im.onerror=()=>{ console.warn("asset fail",src); imgPending--; }; im.src=src+ASSET_V; IMG[key]=im; }
// enemy animation strips (EPIC mage skeleton). Viking sprites removed.
export const ANIM={
  mage:    {fc:{idle:8,walk:8,attack:7}, fw:{idle:88,walk:88,attack:88}, fh:{idle:72,walk:72,attack:72}},
  // CAS-74: real "Stone Golem" from the EPIC RPG World — Ancient Ruins pack. Single-row
  // horizontal strips (run reused as walk). Native frames were 224×192 with heavy padding;
  // tools/slice-pack-strip.mjs crops them to 224×88 so the feet bottom-anchor cleanly.
  // The golem body is ~68px; ds≈1.15 (×boss mult) renders it ~90px — a 3-tile capstone.
  golem:   {fc:{idle:8,walk:8,attack:17}, fw:{idle:224,walk:224,attack:224}, fh:{idle:88,walk:88,attack:88}, ds:1.15},
  // CAS-76: real "Moose" from the EPIC RPG World — Ancient Ruins pack. Same golem
  // pattern: single-row horizontal strips (run reused as walk), native frames 347×192
  // with heavy padding cropped by tools/slice-pack-strip.mjs to 347×112 so the hooves
  // bottom-anchor. attack rears up (30-frame antler charge → a long, readable telegraph).
  // Body is ~78px; ds≈1.1 (×0.82 trash mult) renders it ~70px — a ~2-tile bruiser.
  moose:   {fc:{idle:8,walk:8,attack:30}, fw:{idle:347,walk:347,attack:347}, fh:{idle:112,walk:112,attack:112}, ds:1.1},
  // CAS-84: real "NPC merchant" from the EPIC RPG World — Ancient Ruins pack. A town
  // NPC (not a combat mob), so it carries only an idle loop and renders via the
  // drawNPC path (NPC_ANIM below), never ENEMY_ANIM. Native 110×110 frames cropped by
  // tools/slice-pack-strip.mjs to 110×64 so the feet bottom-anchor; body is ~59px, so
  // scale ≈1.0 renders it ~2 tiles tall — in line with the hero and other townsfolk.
  merchant:{fc:{idle:8}, fw:{idle:110}, fh:{idle:64}},
  // CAS-309 (board CAS-308): the green-robed HEALER NPC ("Maren la Sanadora") that
  // replaces the central healing fountain. Board-delivered art (healer_pack ZIP) sliced
  // by tools/cas309-build.mjs into a clean 6-frame front idle strip — feet bottom-anchored,
  // transparent bg. Native 24×34 frames render at scale 1.0 ≈ town-NPC scale (Lina-sized),
  // on the frozen dark-fantasy palette (green robe + gold trim = Lina's #34503a/#446a4d
  // family). Town NPC → drawNPC + NPC_ANIM idle loop only, never ENEMY_ANIM. The companion
  // healernpc_cast.png (6f heal-cast swing, same slicer) is on disk for the Game Engineer to
  // play on the heal trigger if desired.
  healernpc:{fc:{idle:6, cast:6}, fw:{idle:24, cast:40}, fh:{idle:34, cast:33}}, // CAS-466: cast al curar
  // CAS-464: el HERRERO con el arte real del blacksmith pack — 6f martillando el yunque
  // (fila idle-work del character sheet, recortada con base al fondo). Town NPC → drawNPC.
  blacksmithnpc:{fc:{idle:6}, fw:{idle:29}, fh:{idle:50}},
};
// enemy strips driven by drawEnemy (combat AI states). Town NPCs are kept OUT of this
// map so they never aggro/attack — they animate via NPC_ANIM + drawNPC instead.
// CAS-233: golem REMOVED — it now renders real FOUNTAINS PixelLab strips via
// ENEMY_STRIPS/resolveStrip (keyed by tpl.sprite), not the legacy near-black
// assets/char/golem_*.png blob. mage/moose keep the legacy ANIM path.
export const ENEMY_ANIM={ mage:"mage", moose:"moose" };
// CAS-206: FOUNTAINS-style single-frame enemy art (PixelLab REST, 64×64 transparent
// cutouts). Keyed by tpl.sprite → IMG key. drawEnemy draws these bottom-anchored with
// the CAS-203 procedural breathe/walk-bob, replacing the tiny procedural SP blobs for
// the common mobs so the bestiary reads at FOUNTAINS fidelity. Falls back to SP rows
// while the image loads or for mobs without a generated sprite.
export const ENEMY_IMG={ skel:"enemy_skeleton", bandit:"enemy_bandit", wraith:"enemy_wraith", orc:"enemy_orc",
  // CAS-1692: new FOUNTAINS-style PixelLab cutouts (side-view, same load path as skel/bandit/orc)
  thornspitter:"enemy_thornspitter", ironback:"enemy_ironback", ashwraith:"enemy_ashwraith",
  // CAS-312: dark_demon_3 idle cutout (claw frame 0). drawEnemy uses this for idle/walk
  // (resolveStrip returns null for those states → ENEMY_IMG path adds the breathe/walk-bob),
  // and the demon_attack / demon_cast strips below for the two board animations.
  demon:"enemy_demon" };
// CAS-209: per-state PixelLab MCP animation strips for solid-bodied mobs.
// Each mob has a map of animState → strip descriptor. drawEnemyStrip() picks the
// correct state strip (falling back to "walk" if the state-specific strip is absent).
// Frame size is always 64×64 (scaled to ~2 tiles in render). Wraith stays on ENEMY_IMG.
//
// Strip files: assets/pixellab/fountains/anim/{mob}_{state}_strip.png
// Build tool:  tools/cas209-build-strip.mjs <mob> 64 <frameURL>...
const _s=(fc,key)=>({key,fc,fw:64,fh:64});
export const ENEMY_STRIPS={
  skel:{
    walk: _s(6,"skel_walk_strip"),
    idle: _s(8,"skel_idle_strip"),
    attack: _s(7,"skel_attack_strip"),
  },
  bandit:{
    walk: _s(6,"bandit_walk_strip"),
    idle: _s(8,"bandit_idle_strip"),
    attack: _s(7,"bandit_attack_strip"),
  },
  orc:{
    walk: _s(6,"orc_walk_strip"),
    idle: _s(8,"orc_idle_strip"),
    attack: _s(7,"orc_attack_strip"),
  },
  // CAS-203: PixelLab 9-frame strips for wolf + bat (idle+walk) and wraith (idle only).
  wolf:{
    walk: _s(9,"wolf_walk_strip"),
    idle: _s(9,"wolf_idle"),
  },
  bat:{
    idle: _s(9,"bat_idle"),
    walk: _s(9,"bat_walk_flying"), // CAS-222: was "bat_walk_strip" (404 — file is bat_walk_flying.png, 9×64²)
  },
  wraith:{
    idle: _s(9,"wraith_idle"),
  },
  // CAS-233: FOUNTAINS Stone Golem BOSS (PixelLab v3 d7f5577c — cracked grey-blue
  // stone, crimson-ember cracks, mossy ruined plates). Larger 96px frames preserve
  // the boss detail that 64px would crush. resolveStrip drives all 4 zone bosses
  // (all share tpl.sprite="golem"); boss on-screen scale = e.tpl.size*3.4 in render.
  golem:{
    walk:   {key:"golem_walk_strip",   fc:6, fw:96, fh:96, tiles:3.6},
    idle:   {key:"golem_idle_strip",   fc:8, fw:96, fh:96, tiles:3.6},
    attack: {key:"golem_attack_strip", fc:9, fw:96, fh:96, tiles:3.6},
  },
  // CAS-317 (board CAS-310 / art CAS-313): the dracónic Stage-1 BOSS. 6 PixelLab strips,
  // all 133×133, side-view facing RIGHT (flip for left). tiles:4.6 → ~147px on-screen box,
  // beast body ≈4 tiles wide — dwarfs the ~1.5-tile hero, reads bigger than the golem (3.6).
  // attack2/hurt/death are NEW states resolveStrip + the render strip path honor: attack1/2
  // and hurt play ONE-SHOT (synced to e.animT), death holds the collapsed final frame on a
  // presentation-only corpse (sim G.corpses). Fallback chain: state → walk → idle.
  dragon:{
    // CAS-331 (board CAS-327): each 133px frame has ~41px (0.308) of empty rows BELOW the
    // dragon's feet (content band y≈41–91), so the bottom-anchored draw floated the boss above
    // its grounding shadow. `footPad` shifts the draw DOWN by footPad·dh so the content bottom
    // lands on feetY (see render.js richAnim + drawCorpse). Shared value keeps the body baseline
    // consistent across anims; the walk stride dips a few px lower (natural footfall). `tiles`
    // 4.6→7.5 makes the visible dragon ~2.9 tiles tall — imposing for a Stage-1 BOSS.
    idle:    {key:"dragon_idle_strip",    fc:10, fw:133, fh:133, tiles:7.5, footPad:0.308},
    walk:    {key:"dragon_walk_strip",    fc:10, fw:133, fh:133, tiles:7.5, footPad:0.308},
    attack1: {key:"dragon_attack1_strip", fc:9,  fw:133, fh:133, tiles:7.5, footPad:0.308},
    attack2: {key:"dragon_attack2_strip", fc:17, fw:133, fh:133, tiles:7.5, footPad:0.308},
    hurt:    {key:"dragon_hurt_strip",    fc:3,  fw:133, fh:133, tiles:7.5, footPad:0.308},
    death:   {key:"dragon_death_strip",   fc:7,  fw:133, fh:133, tiles:7.5, footPad:0.308},
  },
  // CAS-312: dark_demon_3 — the TWO board animations, 6f each, native 24×40 (joint-bbox
  // baked so claw + cast share frame size → no body-size pop on melee↔cast). Mapping per
  // CAS-311: claw → "attack" (melee), warlock → "cast" (ranged/spell). resolveStrip serves
  // these by animState; idle/walk have NO demon strip → fall through to the ENEMY_IMG
  // enemy_demon cutout + breathe/walk-bob path. The engineer drives animState="cast"
  // during the demon's ranged/warlock attack window (else only the melee claw ever shows).
  demon:{
    attack: {key:"demon_attack", fc:6, fw:24, fh:40},
    cast:   {key:"demon_cast",   fc:6, fw:24, fh:40},
  },
  // CAS-360 (art CAS-356): Quillback Stalker — a STANDARD-size quilled beast (NOT a boss).
  // 5 PixelLab strips, single-row 64×64, side-view facing RIGHT (flip for left), feet anchored
  // at the frame bottom. Rendered at the standard mob scale (size*2.4, NO `tiles` key → unlike
  // the golem/dragon bosses). `richAnim:true` on its ETPL row drives the extended states:
  // attack1/hurt play ONE-SHOT (synced to e.animT), death plays on the presentation-only corpse.
  // attack2 aliases the attack strip so a champion/elite heavy still shows the lunge frames.
  quillback:{
    idle:    _s(4,"quillback_idle_strip"),
    walk:    _s(6,"quillback_walk_strip"),
    attack1: _s(6,"quillback_attack_strip"),
    attack2: _s(6,"quillback_attack_strip"),
    hurt:    _s(6,"quillback_hurt_strip"),
    death:   _s(7,"quillback_death_strip"),
  },
  // CAS-363 (art CAS-355 / board CAS-351): Wendigo — a dark antlered wraith-shaman CASTER.
  // 5 PixelLab strips, single-row 64×64, south-facing, feet anchored at the frame bottom
  // (global-bbox baked → NO `footPad` needed, confirmed by Art Director). Standard mob scale
  // (size*2.4, NO `tiles` key → not a boss). `richAnim:true` on its ETPL row drives these
  // extended states: attack1/hurt play ONE-SHOT (synced to e.animT), death plays on the
  // presentation-only corpse. attack2 aliases the single attack (staff-raise → purple ring)
  // strip so a champion/elite still shows the cast frames. Same load/render path as quillback.
  wendigo:{
    idle:    _s(7,"wendigo_idle_strip"),
    walk:    _s(7,"wendigo_walk_strip"),
    attack1: _s(9,"wendigo_attack_strip"),
    attack2: _s(9,"wendigo_attack_strip"),
    hurt:    _s(5,"wendigo_hurt_strip"),
    death:   _s(9,"wendigo_death_strip"),
  },
  // CAS-442 (art CAS-440): the Ciénaga de Bruma family — 3 trash mobs at the standard 64px
  // strip format (east-facing, flip for left, feet bottom-anchored per the cas355 union-bbox
  // bake → no footPad; quillback/wendigo convention: standard mob scale size*2.4, no `tiles`).
  // `richAnim:true` on their ETPL rows drives the extended states: attack1/hurt play ONE-SHOT
  // (synced to e.animT), death plays on the presentation-only corpse. attack2 aliases the
  // single attack strip so a champion/elite heavy still shows the swing frames.
  mudlurker:{
    idle:    _s(7,"mudlurker_idle_strip"),
    walk:    _s(6,"mudlurker_walk_strip"),
    attack1: _s(9,"mudlurker_attack_strip"),
    attack2: _s(9,"mudlurker_attack_strip"),
    hurt:    _s(6,"mudlurker_hurt_strip"),
    death:   _s(7,"mudlurker_death_strip"),
  },
  wisp:{
    idle:    _s(7,"wisp_idle_strip"),
    walk:    _s(7,"wisp_walk_strip"),
    attack1: _s(6,"wisp_attack_strip"),
    attack2: _s(6,"wisp_attack_strip"),
    hurt:    _s(7,"wisp_hurt_strip"),
    death:   _s(9,"wisp_death_strip"),
  },
  toadbrute:{
    idle:    _s(4,"toadbrute_idle_strip"),
    walk:    _s(7,"toadbrute_walk_strip"),
    attack1: _s(9,"toadbrute_attack_strip"),
    attack2: _s(9,"toadbrute_attack_strip"),
    hurt:    _s(6,"toadbrute_hurt_strip"),
    death:   _s(7,"toadbrute_death_strip"),
  },
  // CAS-442 (art CAS-440): el Tirano del Pantano — the Ciénaga ZONE CAPSTONE. 6 PixelLab
  // strips at the golem BOSS format (96px frames, east-facing, feet bottom-anchored — ~6px
  // bottom gap measured, no footPad needed). `tiles` pins the on-screen boss height at the
  // golem's proven 3.6-tile capstone scale (the generic size×2.9 champion mult would read
  // smaller than the imposing 96px art deserves). attack1 = club-smash (windup telegraph in
  // the strip), attack2 = club-sweep driven by the HUNTS special (specialNow → attack2).
  bogtyrant:{
    idle:    {key:"bogtyrant_idle_strip",    fc:9,  fw:96, fh:96, tiles:3.6},
    walk:    {key:"bogtyrant_walk_strip",    fc:9,  fw:96, fh:96, tiles:3.6},
    attack1: {key:"bogtyrant_attack1_strip", fc:11, fw:96, fh:96, tiles:3.6},
    attack2: {key:"bogtyrant_attack2_strip", fc:11, fw:96, fh:96, tiles:3.6},
    hurt:    {key:"bogtyrant_hurt_strip",    fc:7,  fw:96, fh:96, tiles:3.6},
    death:   {key:"bogtyrant_death_strip",   fc:9,  fw:96, fh:96, tiles:3.6},
  },
  // CAS-1706 (art CAS-1699 / board CAS-1692): the 3 CAVES mobs get their 8-dir base baked
  // into single-row 64×64 FOUNTAINS strips (east-facing, flip for left, feet bottom-anchored
  // per the cas356 union-bbox bake → no footPad; standard mob scale size*2.4, no `tiles`).
  // Frame counts confirmed from the committed PNG dims (idle 4 / walk 6 / attack 9 / hurt 7 /
  // death 9). `richAnim:true` on each ETPL row (sim/config.js) drives the extended states:
  // attack1/hurt play ONE-SHOT (synced to e.animT), death plays on the presentation-only
  // corpse. attack2 aliases the single attack strip so a champion/elite still shows the cast/
  // swing frames. Crash-guard: these mobs KEEP their ENEMY_IMG cutout, so the richAnim path
  // falls through to the single-frame cutout while a strip is still loading (render.js draw
  // chain: resolveStrip → ENEMY_IMG → procedural). ashwraith/thornspitter = casters, ironback
  // = brute — all reach e.state windup/strike so the generic richAnim resolver plays attack.
  ashwraith:{
    idle:    _s(4,"ashwraith_idle_strip"),
    walk:    _s(6,"ashwraith_walk_strip"),
    attack1: _s(9,"ashwraith_attack_strip"),
    attack2: _s(9,"ashwraith_attack_strip"),
    hurt:    _s(7,"ashwraith_hurt_strip"),
    death:   _s(9,"ashwraith_death_strip"),
  },
  ironback:{
    idle:    _s(4,"ironback_idle_strip"),
    walk:    _s(6,"ironback_walk_strip"),
    attack1: _s(9,"ironback_attack_strip"),
    attack2: _s(9,"ironback_attack_strip"),
    hurt:    _s(7,"ironback_hurt_strip"),
    death:   _s(9,"ironback_death_strip"),
  },
  thornspitter:{
    idle:    _s(4,"thornspitter_idle_strip"),
    walk:    _s(6,"thornspitter_walk_strip"),
    attack1: _s(9,"thornspitter_attack_strip"),
    attack2: _s(9,"thornspitter_attack_strip"),
    hurt:    _s(7,"thornspitter_hurt_strip"),
    death:   _s(9,"thornspitter_death_strip"),
  },
  // CAS-1744 (art CAS-1778): the CALDERA mobs. Single-row east-facing FOUNTAINS strips (flip for left,
  // feet bottom-anchored). Frame dims/counts confirmed from the committed PNGs (983457d): emberkin/
  // magmabrute 120/124px square (idle 4 / walk 6 / attack 9 / hurt 7 / death 9), calderatyrant 188px.
  // `richAnim:true` on each ETPL row drives the extended states; attack2 aliases the single attack
  // strip (like ironback) so a champion/elite still shows the swing frames. The boss uses `tiles` for
  // the imposing capstone scale (bogtyrant/dragon convention); the trash mobs scale off mob `size`.
  emberkin:{
    idle:    {key:"emberkin_idle_strip",   fc:4, fw:120, fh:120},
    walk:    {key:"emberkin_walk_strip",   fc:6, fw:120, fh:120},
    attack1: {key:"emberkin_attack_strip", fc:9, fw:120, fh:120},
    attack2: {key:"emberkin_attack_strip", fc:9, fw:120, fh:120},
    hurt:    {key:"emberkin_hurt_strip",   fc:7, fw:120, fh:120},
    death:   {key:"emberkin_death_strip",  fc:9, fw:120, fh:120},
  },
  magmabrute:{
    idle:    {key:"magmabrute_idle_strip",   fc:4, fw:124, fh:124},
    walk:    {key:"magmabrute_walk_strip",   fc:6, fw:124, fh:124},
    attack1: {key:"magmabrute_attack_strip", fc:9, fw:124, fh:124},
    attack2: {key:"magmabrute_attack_strip", fc:9, fw:124, fh:124},
    hurt:    {key:"magmabrute_hurt_strip",   fc:7, fw:124, fh:124},
    death:   {key:"magmabrute_death_strip",  fc:9, fw:124, fh:124},
  },
  calderatyrant:{
    idle:    {key:"calderatyrant_idle_strip",   fc:4, fw:188, fh:188, tiles:4.4},
    walk:    {key:"calderatyrant_walk_strip",   fc:6, fw:188, fh:188, tiles:4.4},
    attack1: {key:"calderatyrant_attack_strip", fc:9, fw:188, fh:188, tiles:4.4},
    attack2: {key:"calderatyrant_attack_strip", fc:9, fw:188, fh:188, tiles:4.4},
    hurt:    {key:"calderatyrant_hurt_strip",   fc:7, fw:188, fh:188, tiles:4.4},
    death:   {key:"calderatyrant_death_strip",  fc:9, fw:188, fh:188, tiles:4.4},
  },
};
// Resolve the best available strip for a mob + animState.
// Falls back to "walk" strip if the specific state is absent or not yet loaded.
export function resolveStrip(sprite, animState){
  const states=ENEMY_STRIPS[sprite]; if(!states) return null;
  // CAS-317: fall back state → walk → idle so a rich-anim boss missing one strip (or a
  // legacy mob asked for a new state) never renders blank.
  return states[animState]||states.walk||states.idle||null;
}
// Legacy single-strip map (still used by load path below until full state-strip wiring).
export const ENEMY_STRIP={
  skel:  ENEMY_STRIPS.skel.walk,
  bandit:ENEMY_STRIPS.bandit.walk,
  orc:   ENEMY_STRIPS.orc.walk,
};
// animated, non-hostile town NPCs. Keyed by npc.sprite → ANIM strip; idle loop only.
export const NPC_ANIM={ merchant:"merchant", healernpc:"healernpc", blacksmithnpc:"blacksmithnpc" };
// player class sprites: directional (down/up/side, left=side mirrored), states idle/walk/attack
export const CLS={
  warrior: {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  paladin: {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  mage:    {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  druid:   {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  priest:  {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
};
export const CLASS_DIRS=["down","up","side"];
// In-world hero render scale. 22×34 source frame → 34×1.85 ≈ 63px ≈ 2 tiles,
// matching the ASSET_PIPELINE.md §2 "~2 tiles (~64px)" standard and enemy scale
// (CAS-21, board-approved 2026-06-27). Not the class-select card preview, which
// fits-to-card independently.
export const HERO_SPRITE_SCALE=1.85;
export const PROP_SCALE={ prop_tree_a:0.5, prop_tree_b:0.5, prop_shrub:0.62, prop_bush:0.72, prop_ruin_statue:0.55, prop_ruin_obelisk:0.6, prop_ruin_arch:0.58, prop_erw_fountain:0.5, prop_erw_altar:0.5,
  prop_city_house:1.0, prop_city_depot:1.0, prop_city_temple:1.0, prop_city_lamp:1.0 };
// CAS-353: nature pack (board-supplied) for the wilderness forest that fills the empty
// field (the "tiles negras" — the dark negative space outside every zone). Authored at
// tile resolution (trees 48×80, pines 32×80, rocks 16–48px, foliage 16–32px), so they
// render at native size (PROP_SCALE default 1.0 → no entry needed). Loaded as prop_f_*
// kinds; the leading "prop_" routes them through the image deco draw path in render.js.
// world.js scatters them NON-SOLID (decorative) so collision (solidBlocked's O(n) scan) and
// zone balance are untouched; render.js view-culls deco so the dense forest stays cheap.
export const FOREST_PROPS=[
  "tree_1","tree_2","tree_3","tree_4","tree_5","tree_6",
  "tree_1_yellow","tree_2_yellow","tree_3_yellow","tree_4_yellow","tree_5_yellow","tree_6_yellow",
  "pine_1","pine_2","pine_3","pine_4","pine_5","pine_6","pine_7","pine_8","pine_9","pine_10",
  "rock_1_1","rock_1_2","rock_1_3","rock_1_4","rock_1_5","rock_1_6","rock_1_7","rock_1_8",
  "rock_2_1","rock_2_2","rock_3_1","rock_3_2","rock_3_3","rock_3_4","rock_3_5","rock_3_6",
  "rock_4_1","rock_4_2","rock_4_3","rock_4_4","rock_4_5",
  "rock_5_1","rock_5_2","rock_5_3","rock_5_4","rock_5_5","rock_5_6",
  "flower_1","flower_2","flower_3","flower_4","flower_5","flower_6",
  "grass_1","grass_2","bush_1","dead_logs1","dead_logs2"];
export function loadAllAssets(){
  for(const ch in ANIM) for(const st in ANIM[ch].fc) loadImg(ch+"_"+st, "./assets/char/"+ch+"_"+st+".png");
  for(const cl in CLS) for(const dir of CLASS_DIRS) for(const st in CLS[cl].fc) loadImg("cls_"+cl+"_"+st+"_"+dir, "./assets/class/"+cl+"_"+st+"_"+dir+".png");
  // CAS-217: high-fidelity FOUNTAINS dark-zone floor (CAS-209 art handoff). Re-source the
  // T_STONE crypt/cave slots from the hi-fi 32x32 tileset (cracked cold flagstone + near-
  // black void variant + war-torn blood accent). Re-points the slots only — CAS-201's
  // canonical assets/tiles/cave_floor*.png files stay on disk untouched, so no art is
  // stomped. Drop-in 32x32, same loader/collision (Stage-2 safe).
  loadImg("cave_floor","./assets/pixellab/fountains/tilesets/floor_upper.png");
  loadImg("cave_floor2","./assets/pixellab/fountains/tilesets/floor_lower.png");
  loadImg("cave_blood","./assets/pixellab/fountains/tilesets/blood_upper.png");
  // CAS-77: real EPIC RPG World — Ancient Ruins ground. Flagstone paves the town
  // plaza (T_COBBLE); grass dresses forest/ruins/field (T_GRASS). Two variants each
  // so hash2() alternates them deterministically. Art only — collision unchanged.
  loadImg("ruins_floor","./assets/tiles/ruins_floor.png");
  loadImg("ruins_floor2","./assets/tiles/ruins_floor2.png");
  loadImg("ruins_grass","./assets/tiles/ruins_grass.png");
  loadImg("ruins_grass2","./assets/tiles/ruins_grass2.png");
  loadImg("wall","./assets/tiles/wall.png");
  loadImg("wall2","./assets/tiles/wall2.png");
  // ERW Ancient Ruins pack (real tileset art) → the central walled city. erw_wall_h is a
  // mossy sandstone crown over stone brick (horizontal ramparts + corners); erw_wall_v is a
  // stone-brick face for vertical runs; erw_flag/2 pave the plaza in flagstone. Town-only —
  // routed in render.js by world.town bounds, so cave walls / colosseum floor are untouched.
  loadImg("erw_wall_h","./assets/tiles/erw_wall_h.png");
  loadImg("erw_wall_v","./assets/tiles/erw_wall_v.png");
  loadImg("erw_flag","./assets/tiles/erw_flag.png");
  loadImg("erw_flag2","./assets/tiles/erw_flag2.png");
  loadImg("prop_erw_fountain","./assets/props/erw_fountain.png");
  // ERW Atlas-Props (real art) → the central shrine plaza monument. The greek-key altar is a
  // y-sorted deco prop (player walks behind it); the radiant sun glyph is blitted flat on the
  // plaza. Alt centerpieces (sword monument, colossus foot, altar basin) ship for easy swap.
  loadImg("prop_erw_altar","./assets/props/erw_altar.png");
  // CAS-2191/CAS-2215: City Batch-1 street tileset + building props (assets/pixellab/city/,
  // byte-identical STYLE TOKEN). city_street feeds the render.js CITY_WANG dual-grid autotiler.
  loadImg("city_street","./assets/pixellab/city/cobble_street_tileset.png");
  loadImg("prop_city_house","./assets/pixellab/city/house_red.png");
  loadImg("prop_city_depot","./assets/pixellab/city/depot.png");
  loadImg("prop_city_temple","./assets/pixellab/city/temple.png");
  loadImg("prop_city_lamp","./assets/pixellab/city/street_lamp.png");
  loadImg("erw_sun","./assets/props/erw_sun.png");
  // CAS-441: Ciénaga de Bruma marsh floor (CAS-439 art) — T_SWAMP paints these four
  // 32px tiles (mud base / moss-flecked mud / puddle / water pool) via hash2 variants.
  loadImg("swamp_mud","./assets/tiles/swamp_mud.png");
  loadImg("swamp_mud2","./assets/tiles/swamp_mud2.png");
  loadImg("swamp_puddle","./assets/tiles/swamp_puddle.png");
  loadImg("swamp_water","./assets/tiles/swamp_water.png");
  for(const p of ["barrel","bones","rock","pillar","torch","tree_a","tree_b","bush","shrub","grass1","grass2","spear","ruin_obelisk","ruin_statue","ruin_pillar2","ruin_arch"]) loadImg("prop_"+p,"./assets/props/"+p+".png");
  // CAS-353: wilderness nature pack → prop_f_* deco kinds (see FOREST_PROPS above).
  for(const p of FOREST_PROPS) loadImg("prop_f_"+p,"./assets/props/forest/"+p+".png");
  // CAS-441: Ciénaga marsh props (CAS-439 art, tile-resolution → native size) → prop_sw_*
  // deco kinds; the "prop_" prefix routes them through the image deco path in render.js.
  for(const p of ["dead_tree_1","dead_tree_2","mossy_rock_1","reeds_1","mushroom_1"]) loadImg("prop_sw_"+p,"./assets/props/swamp/"+p+".png");
  // CAS-206: FOUNTAINS-style PixelLab enemy cutouts (see ENEMY_IMG above).
  for(const k of new Set(Object.values(ENEMY_IMG))) loadImg(k,"./assets/pixellab/fountains/"+k+".png");
  // CAS-209: PixelLab per-state strips for solid mobs (walk+idle; see ENEMY_STRIPS).
  // Missing state strips (file 404s) silently fall through to ENEMY_IMG procedural fallback.
  const _loaded=new Set();
  for(const mob in ENEMY_STRIPS) for(const st in ENEMY_STRIPS[mob]){
    const {key}=ENEMY_STRIPS[mob][st]; if(_loaded.has(key)) continue; _loaded.add(key);
    loadImg(key,"./assets/pixellab/fountains/anim/"+key+".png");
  }
  // CAS-417: UI icon set (art CAS-415, 32x32) — spell bar, equip slots, HUD consumables.
  for(const cl of ["warrior","paladin","mage","druid","priest"]) for(let i=0;i<4;i++)
    loadImg("icon_spell_"+cl+"_"+i,"./assets/ui/icons/spell_"+cl+"_"+i+".png");
  for(const s of ["head","body","legs","feet","neck","back","ring","bag","weapon","shield"])
    loadImg("icon_slot_"+s,"./assets/ui/icons/slot_"+s+".png");
  for(const k of ["potion_hp","potion_mp","coin"])
    loadImg("icon_hud_"+k,"./assets/ui/icons/hud_"+k+".png");
  // CAS-1562: meta-progression altar node icons (art CAS-1558, 32x32). Keyed by full path so
  // renderAltar can index them directly from n.key.toLowerCase(); glyph stays as load-fallback.
  for(const k of ["hpmax","dmg","movespd","reroll","startgold","essence"])
    loadImg("assets/ui/icons/altar_"+k+".png","./assets/ui/icons/altar_"+k+".png");
  // CAS-1545: professional purchased combat-VFX sprite strips ("Beat 'em Up 2D Pixel Art
  // VFX Pack"). Horizontal frame strips (frame = square, N frames). drawFx animates them by
  // effect progress. FX_STRIP holds per-effect frame count + frame size (see assets/fx/_meta.json).
  for(const fx of ["slash","fire","nova","holy","impact","crit","heal","thorn","arcane","spark"])
    loadImg("fx_"+fx, "./assets/fx/"+fx+"_strip.png");
}
// CAS-1545: frame geometry for the purchased VFX strips (frames, frame width = frame height).
export const FX_STRIP = { slash:{n:5,fw:96}, fire:{n:8,fw:64}, nova:{n:9,fw:128}, holy:{n:8,fw:96}, impact:{n:6,fw:96}, crit:{n:8,fw:96}, heal:{n:5,fw:64}, thorn:{n:8,fw:128}, arcane:{n:16,fw:64}, spark:{n:9,fw:96} };
export function dir4FromAngle(a){ const p=Math.PI;
  if(a>p/4 && a<=3*p/4) return "down";
  if(a<=-p/4 && a>-3*p/4) return "up";
  if(a>-p/4 && a<=p/4) return "right";
  return "left"; }
const _tc=(typeof document!=="undefined")?document.createElement("canvas"):null, _tx=_tc?_tc.getContext("2d"):null;
export function drawClassFrame(ctx,cls,state,dir,fidx,cx,cy,scale,tint){
  const stripDir=(dir==="left"||dir==="right")?"side":dir, flip=(dir==="left"), meta=CLS[cls];
  const img=IMG["cls_"+cls+"_"+state+"_"+stripDir]; if(!img||!img.complete||!img.naturalWidth) return false;
  const fw=meta.fw, fh=meta.fh, dw=fw*scale, dh=fh*scale, dx=cx-dw/2, dy=cy-dh;
  if(tint && _tx){ _tc.width=fw; _tc.height=fh; _tx.clearRect(0,0,fw,fh); _tx.imageSmoothingEnabled=false;
    _tx.globalCompositeOperation="source-over"; _tx.drawImage(img,fidx*fw,0,fw,fh,0,0,fw,fh);
    _tx.globalCompositeOperation="source-atop"; _tx.globalAlpha=0.8; _tx.fillStyle=tint; _tx.fillRect(0,0,fw,fh);
    _tx.globalAlpha=1; _tx.globalCompositeOperation="source-over";
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(_tc,0,0,fw,fh,0,0,dw,dh); } else ctx.drawImage(_tc,0,0,fw,fh,dx,dy,dw,dh);
    ctx.restore();
  } else { ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(img,fidx*fw,0,fw,fh,0,0,dw,dh); } else ctx.drawImage(img,fidx*fw,0,fw,fh,dx,dy,dw,dh); ctx.restore(); }
  return true;
}
export function frameIndex(ch,state,t,fps,loop){ const n=(ANIM[ch].fc[state]||1); let i=Math.floor(t*fps); return loop? (i%n) : Math.min(i,n-1); }
// draw an animation frame in WORLD coords, bottom-center anchored at (cx,cy). tint=color flashes the silhouette.
export function drawAnim(ctx,ch,state,fidx,cx,cy,scale,flip,tint){
  const img=IMG[ch+"_"+state]; if(!img||!img.complete||!img.naturalWidth) return false;
  const fw=ANIM[ch].fw[state], fh=ANIM[ch].fh[state], dw=fw*scale, dh=fh*scale, dx=cx-dw/2, dy=cy-dh;
  if(tint && _tx){ _tc.width=fw; _tc.height=fh; _tx.clearRect(0,0,fw,fh); _tx.imageSmoothingEnabled=false;
    _tx.globalCompositeOperation="source-over"; _tx.drawImage(img,fidx*fw,0,fw,fh,0,0,fw,fh);
    _tx.globalCompositeOperation="source-atop"; _tx.globalAlpha=0.8; _tx.fillStyle=tint; _tx.fillRect(0,0,fw,fh);
    _tx.globalAlpha=1; _tx.globalCompositeOperation="source-over";
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(_tc,0,0,fw,fh,0,0,dw,dh); } else ctx.drawImage(_tc,0,0,fw,fh,dx,dy,dw,dh);
    ctx.restore();
  } else {
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(img,fidx*fw,0,fw,fh,0,0,dw,dh); } else ctx.drawImage(img,fidx*fw,0,fw,fh,dx,dy,dw,dh); ctx.restore();
  }
  return true;
}
