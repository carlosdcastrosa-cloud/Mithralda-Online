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
  wolf: { pal:{o:COL.out,g:"#6a6e76",G:"#878c95",x:"#43474e",e:"#ffcf4d",f:"#e8e0d0"}, rows:[
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
  rat: { pal:{o:COL.out,r:"#7a5a3a",R:"#946f48",t:"#4a3626",e:"#d24b4b"}, rows:[
    "...o...o..t",
    "..oRo.oRott",
    ".orRrrrRrt.",
    ".oreRRReo..",
    "orrrRRrrro.",
    ".orrrrrro..",
    "..o.rr.o..."]},
  skel: { pal:{o:COL.out,n:"#d8cdb8",N:"#efe6cf",m:"#a89a7d",e:"#8fd0ff",w:"#b9c0c8"}, rows:[
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
  orc: { pal:{o:COL.out,q:"#4a6a3a",Q:"#5d7d47",u:"#324a26",e:"#e05bd0",T:"#e8e0d0",c:"#6b4a2a"}, rows:[
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
  golem: { pal:{o:COL.out,l:"#5a5550",L:"#77716a",j:"#3a3631",z:"#ff8a2a",Z:"#ffd24d",e:"#ffd24d"}, rows:[
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
  npcBram: { pal:{o:COL.out,a:"#7a4a2a",A:"#9a6038",b:"#d8b894",h:"#3a2c1e",w:"#cfc4ad"}, rows:[
    "..ohho..",
    ".obbbbo.",
    ".obbbbo.",
    ".oaAAao.",
    "owAAAAwo",
    "owAaaAwo",
    ".oAAAAo.",
    ".oa..ao.",
    ".oo..oo."]},
  npcRolf: { pal:{o:COL.out,s:"#7d838c",S:"#9aa0a9",b:"#d8b894",a:"#5a626e",p:"#8a6a3a"}, rows:[
    "..oSSo..p",
    ".osssso.p",
    ".obbbbo.p",
    ".oaSSao.p",
    "osSssSso.",
    "osSssSso.",
    ".oSssSo..",
    ".oa..ao..",
    ".oo..oo.."]},
  npcLina: { pal:{o:COL.out,g:"#2f6a44",G:"#3f8a58",b:"#d8b894",h:"#234d33"}, rows:[
    "..oGGo..",
    ".oghhgo.",
    ".ogbbgo.",
    ".oGggGo.",
    "ogGggGgo",
    "ogGggGgo",
    "ogGggGgo",
    ".oGGGGo.",
    ".oo..oo."]},
  adv: { pal:{o:COL.out,s:"#7a6a8c",S:"#998aa9",b:"#d8b894",a:"#5a4e6e"}, rows:[
    "..oSSo..",
    ".osbbso.",
    ".obbbbo.",
    "osSssSso",
    "osSssSso",
    ".oSssSo.",
    ".oa..ao.",
    ".oo..oo."]},
  tree: { pal:{o:COL.out,g:"#243a22",G:"#33522f",d:"#1a2c19",t:"#3a2c1c",T:"#4a3a26"}, rows:[
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
  rock: { pal:{o:COL.out,s:"#4a505a",S:"#626a76",d:"#343a42"}, rows:[
    "..oooo..",
    ".oSSSSo.",
    "oSSSSdSo",
    "oSdSSSSo",
    "oSSSdSSo",
    ".odSSdo.",
    "..oooo.."]},
  chest: { pal:{o:COL.out,w:"#6b4a2a",W:"#8a6038",i:"#caa14e",d:"#3a2c1c"}, rows:[
    ".oooooo.",
    "oWiWWiWo",
    "oWWWWWWo",
    "oiiiiiio",
    "oWWWWWWo",
    "oWdWWdWo",
    ".oooooo."]},
  // --- new mob variety (CAS-60): forest flyer, ruins rogue, caves ghost ---
  bat: { pal:{o:COL.out,k:"#4a4150",K:"#6a5f78",e:"#ff6b6b"}, rows:[
    "oo.......oo",
    "oKko...okKo",
    "oKkko.okkKo",
    "oKkkkkkkkKo",
    ".oKeKkKeKo.",
    "..okkkkko..",
    "...o.k.o..."]},
  bandit: { pal:{o:COL.out,l:"#5a3f2a",L:"#7a5638",m:"#2a2420",e:"#ffd24d",s:"#9aa0a9"}, rows:[
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
  // --- town deco (CAS-60): market/city variety, drawn like other SP deco ---
  crate: { pal:{o:COL.out,W:"#8a6038",d:"#3a2c1c"}, rows:[
    "ooooooo",
    "oWWWWWo",
    "oWdWdWo",
    "oWWWWWo",
    "oWdWdWo",
    "oWWWWWo",
    "ooooooo"]},
  stall: { pal:{o:COL.out,p:"#7a3a2a",P:"#9a4838",w:"#6b4a2a",b:"#caa14e"}, rows:[
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
};
export const ENEMY_ANIM={ mage:"mage" };
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
export const PROP_SCALE={ prop_tree_a:0.5, prop_tree_b:0.5, prop_shrub:0.62, prop_bush:0.72, prop_ruin_statue:0.55, prop_ruin_obelisk:0.6, prop_ruin_arch:0.58 };
export function loadAllAssets(){
  for(const ch in ANIM) for(const st in ANIM[ch].fc) loadImg(ch+"_"+st, "./assets/char/"+ch+"_"+st+".png");
  for(const cl in CLS) for(const dir of CLASS_DIRS) for(const st in CLS[cl].fc) loadImg("cls_"+cl+"_"+st+"_"+dir, "./assets/class/"+cl+"_"+st+"_"+dir+".png");
  loadImg("cave_floor","./assets/tiles/cave_floor.png");
  loadImg("cave_floor2","./assets/tiles/cave_floor2.png");
  loadImg("wall","./assets/tiles/wall.png");
  loadImg("wall2","./assets/tiles/wall2.png");
  for(const p of ["barrel","bones","rock","pillar","torch","tree_a","tree_b","bush","shrub","grass1","grass2","spear","ruin_obelisk","ruin_statue","ruin_pillar2","ruin_arch"]) loadImg("prop_"+p,"./assets/props/"+p+".png");
}
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
