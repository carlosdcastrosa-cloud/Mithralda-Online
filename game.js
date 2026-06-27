// ===========================================================================
// MITHRALDA - El Reino Pixelado  (single-player ARPG, HTML5 canvas, no build)
// All in-game art is procedural pixel art under the locked STYLE FORMULA:
// chunky 16-bit, bold dark outlines, desaturated green/stone/teal palette,
// warm torch + signal-hue accents, top-down. Audio is procedural chiptune.
// ===========================================================================
import { STR } from "./strings.js";

// ----------------------------- config & math ------------------------------
const TS = 32;                 // world pixels per tile
const MAP_W = 110, MAP_H = 110;
const CFG = {
  heroSpeed: 152, rollSpeed: 430, rollTime: 0.20, rollIFrame: 0.34, rollCD: 0.62,
  atkRange: 50, atkArc: Math.PI * 0.62, atkCD: 0.42, atkActive: 0.16,
  pickRange: 44, talkRange: 56, fountainRange: 60,
};
// per-class basic attack (key J / 1 / click)
const ATK = {
  warrior:{type:"melee", range:54, arc:Math.PI*0.66, cd:0.40, dmgMul:1.0,  fx:"slash"},
  druid:  {type:"melee", range:62, arc:Math.PI*1.05, cd:0.46, dmgMul:0.9,  fx:"thorns"},
  priest: {type:"nova",  range:84, cd:0.52, dmgMul:0.8,  heal:8, fx:"holy"},
  paladin:{type:"proj",  cd:0.40, dmgMul:1.05, kind:"arrow", spd:440, fx:"arrow"},
  mage:   {type:"proj",  cd:0.50, dmgMul:1.15, kind:"orb",   spd:300, fx:"orb"},
};
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
const lerp = (a,b,t)=> a+(b-a)*t;
const dist2 = (ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;};
const norm = (x,y)=>{const m=Math.hypot(x,y)||1;return [x/m,y/m];};
function angDiff(a,b){let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;}
// seeded RNG (deterministic)
let _seed = 0x9e3779b9 >>> 0;
function srand(){ _seed ^= _seed<<13; _seed ^= _seed>>>17; _seed ^= _seed<<5; _seed>>>=0; return _seed/4294967296; }
function seed(n){ _seed = (n>>>0) || 1; }
const rr = (a,b)=> a + srand()*(b-a);
const ri = (a,b)=> Math.floor(rr(a,b+1));
// stable per-tile hash for terrain detail (no per-frame randomness)
function hash2(x,y){ let h=(x*374761393 + y*668265263)>>>0; h=(h^(h>>>13))*1274126177>>>0; return ((h^(h>>>16))>>>0)/4294967296; }

// ------------------------------- palette ----------------------------------
const COL = {
  bg:"#0c0e13", night:"#10141b",
  grass:"#2c3a2a", grassL:"#37492f", grassD:"#1f2a1d", twig:"#3d2f1d",
  dirt:"#4a3a28", dirtL:"#5a4632", dirtD:"#382a1c",
  stone:"#3a4047", stoneL:"#49505a", stoneD:"#2a2f35",
  cobble:"#34464a", cobbleL:"#415559", cobbleD:"#27353a",
  sand:"#6a5a3c", sandL:"#7d6c48", sandD:"#4a3d28", bloodSand:"#5a1f1f",
  water:"#1d3a4a", waterL:"#2e5e72", waterGlint:"#7fb8c8",
  out:"#14171c",
  hpf:"#c83b3b", hpb:"#3a1416", mpf:"#3f6bd0", mpb:"#14203a",
  xpf:"#e0b94a", xpb:"#2a2410",
  gold:"#f2c14e", goldL:"#ffe39a", goldD:"#b88a2e",
  cream:"#e8e0d0", textGold:"#e8c46a", textDim:"#9a9484",
  panel:"#1a1e26", panelB:"#5a4632", panelB2:"#3a2c1e",
  flame:"#ff8a2a", flameL:"#ffd24d", heal:"#5fd66a", rune:"#5a8aff", spark:"#ffffff", blood:"#8a1f1f",
  skullW:"#e8e0d0", skullY:"#e8c44a", skullR:"#d23b3b",
  frag:"#3fd0c0", fragL:"#8fece0",
};

// ---------------------- procedural pixel sprites ---------------------------
// blit a sprite grid (array of strings) using a per-sprite palette.
function blit(ctx, rows, pal, cx, cy, px, flipX){
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
const SP = {
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
};
function drawCoin(ctx,x,y,px,t){ const w=Math.abs(Math.cos(t*4))*0.8+0.2; ctx.fillStyle=COL.out; ctx.fillRect(x-px*2*w-px,y-px*3,px*(4*w+2),px*6);
  ctx.fillStyle=COL.gold; ctx.fillRect(x-px*2*w,y-px*2,px*4*w,px*4); ctx.fillStyle=COL.goldL; ctx.fillRect(x-px*1*w,y-px*1,px*1*w,px*2); }
function drawPotion(ctx,x,y,px,fill,light){ ctx.fillStyle=COL.out; ctx.fillRect(x-px*2,y-px*4,px*4,px*8);
  ctx.fillStyle="#cfe6ee"; ctx.fillRect(x-px*1.5,y-px*3.5,px*3,px*3); ctx.fillStyle=fill; ctx.fillRect(x-px*1.5,y-px*0.5,px*3,px*3.5);
  ctx.fillStyle=light; ctx.fillRect(x-px*1,y,px*1,px*2); ctx.fillStyle="#8a6a3a"; ctx.fillRect(x-px,y-px*4.5,px*2,px*1); }
function drawFragment(ctx,x,y,px,t){ const g=0.6+0.4*Math.sin(t*5); ctx.globalAlpha=0.5*g; ctx.fillStyle=COL.fragL; ctx.fillRect(x-px*4,y-px*4,px*8,px*8); ctx.globalAlpha=1;
  ctx.fillStyle=COL.out; ctx.fillRect(x-px*2,y-px*3,px*4,px*6); ctx.fillStyle=COL.frag; ctx.fillRect(x-px*1.5,y-px*2.5,px*3,px*5); ctx.fillStyle=COL.fragL; ctx.fillRect(x-px*0.5,y-px*2,px*1,px*3); }

// --------------------------- procedural audio ------------------------------
const Audio2 = (()=>{
  let ac=null, master=null, musicGain=null, sfxGain=null, started=false;
  let musicTimer=null, curTrack=null, step=0, enabled=true;
  function init(){ if(ac) return; try{ ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createGain(); master.gain.value=0.7; master.connect(ac.destination);
    musicGain=ac.createGain(); musicGain.gain.value=0.28; musicGain.connect(master);
    sfxGain=ac.createGain(); sfxGain.gain.value=0.5; sfxGain.connect(master);
  }catch(e){ enabled=false; } }
  function resume(){ if(ac&&ac.state==="suspended") ac.resume(); }
  function tone(freq,dur,type,gain,dest,slideTo){ if(!ac||!enabled)return; const o=ac.createOscillator(),g=ac.createGain();
    o.type=type||"square"; o.frequency.setValueAtTime(freq,ac.currentTime); if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo,ac.currentTime+dur);
    g.gain.setValueAtTime(0.0001,ac.currentTime); g.gain.exponentialRampToValueAtTime(gain||0.3,ac.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur); o.connect(g); g.connect(dest||sfxGain); o.start(); o.stop(ac.currentTime+dur+0.02); }
  function noise(dur,gain,filterF){ if(!ac||!enabled)return; const n=ac.createBufferSource(); const b=ac.createBuffer(1,ac.sampleRate*dur,ac.sampleRate); const d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1); n.buffer=b; const f=ac.createBiquadFilter(); f.type="lowpass"; f.frequency.value=filterF||1200;
    const g=ac.createGain(); g.gain.setValueAtTime(gain||0.3,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur); n.connect(f); f.connect(g); g.connect(sfxGain); n.start(); n.stop(ac.currentTime+dur); }
  const TOWN=[0,4,7,11,7,4,2,4], COMBAT=[0,3,7,10,12,10,7,3];
  const baseTown=196, baseCombat=147;
  function semis(s){ return Math.pow(2,s/12); }
  function playMusic(track){ if(curTrack===track) return; curTrack=track; }
  function musicTick(){ if(!ac||!enabled||!curTrack) return; const seq=curTrack==="combat"?COMBAT:TOWN; const base=curTrack==="combat"?baseCombat:baseTown;
    const note=seq[step%seq.length]; tone(base*semis(note),0.18,"square",0.18,musicGain); if(step%2===0) tone(base/2*semis(seq[(step+2)%seq.length]),0.22,"triangle",0.14,musicGain); step++; }
  function start(){ if(started)return; started=true; init(); musicTimer=setInterval(musicTick, curTrack==="combat"?180:230); }
  // sfx
  const sfx={
    sword(){ noise(0.09,0.25,2600); tone(440,0.08,"square",0.18,sfxGain,180); },
    roll(){ noise(0.18,0.18,800); },
    cast(){ tone(330,0.18,"sawtooth",0.16,sfxGain,760); },
    fire(){ tone(180,0.22,"sawtooth",0.2,sfxGain,520); noise(0.18,0.12,900); },
    heal(){ tone(523,0.14,"sine",0.18,sfxGain,784); tone(659,0.18,"sine",0.16,sfxGain,988); },
    rune(){ tone(294,0.26,"sawtooth",0.2,sfxGain,588); tone(392,0.26,"square",0.12,sfxGain); },
    hurt(){ tone(160,0.16,"square",0.22,sfxGain,90); noise(0.1,0.18,500); },
    ehurt(){ tone(220,0.07,"square",0.12,sfxGain,140); },
    coin(){ tone(880,0.06,"square",0.16,sfxGain); tone(1320,0.08,"square",0.14,sfxGain); },
    pickup(){ tone(660,0.07,"triangle",0.16,sfxGain,990); },
    levelup(){ [0,4,7,12].forEach((n,i)=>setTimeout(()=>tone(330*semis(n),0.18,"square",0.2,sfxGain),i*90)); },
    death(){ [0,-2,-4,-7,-12].forEach((n,i)=>setTimeout(()=>tone(330*semis(n),0.3,"sawtooth",0.2,sfxGain),i*140)); },
    boss(){ tone(80,0.5,"sawtooth",0.3,sfxGain,60); noise(0.4,0.2,400); },
    buy(){ tone(740,0.07,"square",0.16,sfxGain); tone(990,0.09,"square",0.14,sfxGain); },
    deny(){ tone(180,0.12,"square",0.16,sfxGain,120); },
  };
  function setEnabled(v){ enabled=v; if(master) master.gain.value=v?0.7:0; }
  return { init,resume,start,playMusic,sfx,setEnabled, get on(){return enabled;} };
})();

// ---------------- loaded image assets (purchased packs) + animation ----------------
const IMG={}; let imgPending=0;
function loadImg(key,src){ imgPending++; const im=new Image();
  im.onload=()=>{ imgPending--; }; im.onerror=()=>{ console.warn("asset fail",src); imgPending--; }; im.src=src; IMG[key]=im; }
// enemy animation strips (EPIC mage skeleton). Viking sprites removed.
const ANIM={
  mage:    {fc:{idle:8,walk:8,attack:7}, fw:{idle:88,walk:88,attack:88}, fh:{idle:72,walk:72,attack:72}},
};
const ENEMY_ANIM={ mage:"mage" };
// player class sprites: directional (down/up/side, left=side mirrored), states idle/walk/attack
const CLS={
  warrior: {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  paladin: {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  mage:    {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  druid:   {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
  priest:  {fw:22, fh:34, fc:{idle:2,walk:4,attack:3}},
};
const CLASS_DIRS=["down","up","side"];
const PROP_SCALE={ prop_tree_a:0.5, prop_tree_b:0.5, prop_shrub:0.62, prop_bush:0.72, prop_ruin_statue:0.55, prop_ruin_obelisk:0.6, prop_ruin_arch:0.58 };
function loadAllAssets(){
  for(const ch in ANIM) for(const st in ANIM[ch].fc) loadImg(ch+"_"+st, "./assets/char/"+ch+"_"+st+".png");
  for(const cl in CLS) for(const dir of CLASS_DIRS) for(const st in CLS[cl].fc) loadImg("cls_"+cl+"_"+st+"_"+dir, "./assets/class/"+cl+"_"+st+"_"+dir+".png");
  loadImg("cave_floor","./assets/tiles/cave_floor.png");
  loadImg("cave_floor2","./assets/tiles/cave_floor2.png");
  loadImg("wall","./assets/tiles/wall.png");
  loadImg("wall2","./assets/tiles/wall2.png");
  for(const p of ["barrel","bones","rock","pillar","torch","tree_a","tree_b","bush","shrub","grass1","grass2","spear","ruin_obelisk","ruin_statue","ruin_pillar2","ruin_arch"]) loadImg("prop_"+p,"./assets/props/"+p+".png");
}
function dir4FromAngle(a){ const p=Math.PI;
  if(a>p/4 && a<=3*p/4) return "down";
  if(a<=-p/4 && a>-3*p/4) return "up";
  if(a>-p/4 && a<=p/4) return "right";
  return "left"; }
function drawClassFrame(ctx,cls,state,dir,fidx,cx,cy,scale,tint){
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
const _tc=(typeof document!=="undefined")?document.createElement("canvas"):null, _tx=_tc?_tc.getContext("2d"):null;
function frameIndex(ch,state,t,fps,loop){ const n=(ANIM[ch].fc[state]||1); let i=Math.floor(t*fps); return loop? (i%n) : Math.min(i,n-1); }
// draw an animation frame in WORLD coords, bottom-center anchored at (cx,cy). tint=color flashes the silhouette.
function drawAnim(ctx,ch,state,fidx,cx,cy,scale,flip,tint){
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

// =========================================================================
//  WORLD
// =========================================================================
const T_GRASS=0,T_DIRT=1,T_STONE=2,T_COBBLE=3,T_SAND=4,T_WATER=5;
function inRect(x,y,r){ return x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h; }

function buildWorld(){
  seed(13371);
  const terr = new Uint8Array(MAP_W*MAP_H);
  const town  = {x:46,y:46,w:18,h:18};
  const forest= {x:64,y:34,w:44,h:42};
  const caves = {x:30,y:4,w:52,h:34};
  const arena = {x:42,y:66,w:26,h:38};
  const ruins = {x:6,y:44,w:30,h:30};
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    let t=T_GRASS;
    if(inRect(x,y,caves)) t=T_STONE;
    else if(inRect(x,y,town)) t=T_COBBLE;
    else if(inRect(x,y,arena)) t=T_SAND;
    else if(inRect(x,y,forest)) t=T_GRASS;
    // dirt paths radiating from town center
    const cxp=town.x+town.w/2, cyp=town.y+town.h/2;
    if(t===T_GRASS){
      if(Math.abs(y-cyp)<1.5 && x>cxp) t=T_DIRT;            // east path to forest
      if(Math.abs(x-cxp)<1.5 && y<cyp) t=T_DIRT;            // north path to caves
      if(Math.abs(x-cxp)<1.5 && y>cyp) t=T_DIRT;            // south path to arena
      if(Math.abs(y-cyp)<1.5 && x<town.x && x>ruins.x+2) t=T_DIRT; // west path to ruins
    }
    terr[y*MAP_W+x]=t;
  }
  const solids=[]; // {x,y,r,kind}
  const deco=[];   // {x,y,kind}  (drawn, tree/rock collide)
  const chests=[]; // {x,y,opened,loot}
  const fragments=[]; // {x,y,taken,kind}
  const fountains=[]; // {x,y}
  const npcs=[];
  const spawners=[]; // {x,y,r,types[],zone,max,cool,t}

  function place(kind,x,y,r){ solids.push({x,y,r,kind}); deco.push({x,y,kind}); }
  // trees, bushes & grass in forest (Ancient Ruins foliage)
  for(let i=0;i<78;i++){ const x=(forest.x+rr(1,forest.w-1))*TS, y=(forest.y+rr(1,forest.h-1))*TS;
    const k=srand();
    if(k<0.50) prop(srand()<0.5?"prop_tree_a":"prop_tree_b", x,y, true, 12);
    else if(k<0.62) prop("prop_rock",x,y,true,12);
    else if(k<0.78) prop("prop_bush",x,y,false);
    else if(k<0.88) prop("prop_shrub",x,y,false);
    else prop(srand()<0.5?"prop_grass1":"prop_grass2",x,y,false);
  }
  // rocks in caves
  for(let i=0;i<70;i++){ const x=(caves.x+rr(1,caves.w-1))*TS, y=(caves.y+rr(1,caves.h-1))*TS; place("rock",x,y,14); }
  // town fountains (3): central square + temple (respawn) + market
  const tcx=(town.x+town.w/2)*TS, tcy=(town.y+town.h/2)*TS;
  fountains.push({x:tcx,y:tcy,temple:false});
  const templeF={x:tcx-5*TS,y:tcy-4*TS,temple:true}; fountains.push(templeF);
  fountains.push({x:tcx+5*TS,y:tcy+4*TS,temple:false});
  for(const f of fountains) solids.push({x:f.x,y:f.y,r:22,kind:"fountain"});
  // NPCs in town
  npcs.push({x:tcx+3*TS,y:tcy-1*TS,sprite:"npcBram",name:STR.npcBram,role:"shop",lines:STR.bramLines});
  npcs.push({x:tcx-2*TS,y:tcy+2*TS,sprite:"npcRolf",name:STR.npcRolf,role:"quest",lines:STR.rolfLines});
  npcs.push({x:tcx-4*TS,y:tcy-2*TS,sprite:"npcLina",name:STR.npcLina,role:"heal",lines:STR.linaLines});
  // neutral adventurers in arena
  for(let i=0;i<5;i++){ const x=(arena.x+rr(3,arena.w-3))*TS, y=(arena.y+rr(3,arena.h-3))*TS;
    npcs.push({x,y,sprite:"adv",name:STR.npcAdventurer,role:"neutral",lines:STR.adventurerLines,neutral:true}); }
  // chests
  chests.push({x:(forest.x+forest.w-4)*TS,y:(forest.y+4)*TS,opened:false,loot:"gold40"});
  chests.push({x:(caves.x+4)*TS,y:(caves.y+4)*TS,opened:false,loot:"potionhp"});
  chests.push({x:(caves.x+caves.w-5)*TS,y:(caves.y+caves.h-4)*TS,opened:false,loot:"gold60"});
  // hidden vitality fragments
  fragments.push({x:(forest.x+3)*TS,y:(forest.y+forest.h-3)*TS,taken:false,kind:"hp"});
  fragments.push({x:(caves.x+caves.w/2)*TS,y:(caves.y+2)*TS,taken:false,kind:"mp"});
  fragments.push({x:(arena.x+2)*TS,y:(arena.y+arena.h-3)*TS,taken:false,kind:"hp"});
  // spawners
  spawners.push({rect:forest,types:["wolf","wolf","rat"],max:10,cool:3,t:0,zone:"forest"});
  spawners.push({rect:caves,types:["skeleton","spearman","orc","skeleton","mage","spearman"],max:11,cool:4,t:0,zone:"caves"});
  // ---- dungeon walls in the caves (perimeter ring + interior alcoves) ----
  const wallSet=new Set();
  const cx0=caves.x, cy0=caves.y, cx1=caves.x+caves.w-1, cy1=caves.y+caves.h-1;
  const cxc=Math.floor(caves.x+caves.w/2);
  for(let x=cx0;x<=cx1;x++){ wallSet.add(cy0*MAP_W+x);                       // top wall
    if(!(x>=cxc-3 && x<=cxc+2)) wallSet.add(cy1*MAP_W+x); }                  // bottom wall w/ south entrance gap
  for(let y=cy0;y<=cy1;y++){ wallSet.add(y*MAP_W+cx0); wallSet.add(y*MAP_W+cx1); } // side walls
  const stubs=[ {x:cx0+6,y:cy0+10,w:11,h:1}, {x:cx1-16,y:cy0+10,w:11,h:1},
    {x:cx0+14,y:cy0+16,w:1,h:9}, {x:cx1-14,y:cy0+16,w:1,h:9},
    {x:cx0+8,y:cy0+24,w:8,h:1}, {x:cx1-15,y:cy0+24,w:8,h:1} ];
  for(const s of stubs) for(let yy=s.y;yy<s.y+s.h;yy++) for(let xx=s.x;xx<s.x+s.w;xx++){
    if(Math.abs(xx-cxc)<=3) continue;   // keep central corridor open
    if(yy<cy0+6) continue;              // keep boss area (top) clear
    wallSet.add(yy*MAP_W+xx); }
  function isWall(tx,ty){ return wallSet.has(ty*MAP_W+tx); }
  // props from the purchased packs — decorate the caves (and a little of the arena)
  function prop(kind,x,y,solid,r){ deco.push({x,y,kind}); if(solid) solids.push({x,y,r:r||10,kind}); }
  for(let i=0;i<16;i++){ const tx=caves.x+rr(2,caves.w-2), ty=caves.y+rr(3,caves.h-2); if(isWall(tx,ty)) continue; const x=tx*TS, y=ty*TS;
    const k=srand(); if(k<0.30) prop("prop_barrel",x,y,true,9);
    else if(k<0.50) prop("prop_pillar",x,y,true,9);
    else if(k<0.72) prop("prop_bones",x,y,false);
    else prop("prop_rock",x,y,false); }
  // torches lining the path into the caves
  for(let i=0;i<6;i++){ prop("prop_torch",(cxc-3)*TS,(caves.y+6+i*4)*TS,false); prop("prop_torch",(cxc+3)*TS,(caves.y+6+i*4)*TS,false); }
  for(let i=0;i<6;i++){ const x=(arena.x+rr(2,arena.w-2))*TS, y=(arena.y+rr(3,arena.h-2))*TS; prop(srand()<0.5?"prop_bones":"prop_rock",x,y,false); }
  // ---- Ruinas de Eldath (outdoor ruins zone, west of town) ----
  spawners.push({rect:ruins,types:["orc","mage","spearman","skeleton","orc"],max:10,cool:4,t:0,zone:"ruins"});
  const rcyp=town.y+town.h/2;
  for(let i=0;i<34;i++){ const tx=ruins.x+rr(1,ruins.w-2), ty=ruins.y+rr(1,ruins.h-2);
    if(tx>=ruins.x+ruins.w-4 && Math.abs(ty-rcyp)<2) continue; // keep east entrance clear
    const x=tx*TS, y=ty*TS, k=srand();
    if(k<0.16) prop("prop_ruin_statue",x,y,true,11);
    else if(k<0.30) prop("prop_ruin_obelisk",x,y,true,12);
    else if(k<0.44) prop("prop_ruin_arch",x,y,true,14);
    else if(k<0.58) prop(srand()<0.5?"prop_pillar":"prop_ruin_pillar2",x,y,true,9);
    else if(k<0.74) prop(srand()<0.5?"prop_tree_a":"prop_tree_b",x,y,true,12);
    else if(k<0.86) prop("prop_bush",x,y,false);
    else if(k<0.94) prop("prop_rock",x,y,false);
    else prop(srand()<0.5?"prop_grass1":"prop_grass2",x,y,false); }
  chests.push({x:(ruins.x+2)*TS,y:(ruins.y+2)*TS,opened:false,loot:"gold60"});
  fragments.push({x:(ruins.x+2)*TS,y:(ruins.y+ruins.h-3)*TS,taken:false,kind:"hp"});
  return { terr, town, forest, caves, arena, ruins, solids, deco, chests, fragments, fountains, npcs, spawners, templeF, tcx, tcy, wallSet };
}

function zoneOf(world,x,y){ const tx=x/TS,ty=y/TS;
  if(inRect(tx,ty,world.town)) return "town";
  if(inRect(tx,ty,world.caves)) return "caves";
  if(inRect(tx,ty,world.arena)) return "arena";
  if(world.ruins && inRect(tx,ty,world.ruins)) return "ruins";
  if(inRect(tx,ty,world.forest)) return "forest";
  return "field"; }

// =========================================================================
//  ENEMY TEMPLATES
// =========================================================================
const ETPL = {
  wolf:    {hp:34, dmg:10, spd:120, aggro:240, range:42, windup:0.45, recover:0.45, xp:12, gold:[2,6], sprite:"wolf", size:18, knock:140, boss:false},
  rat:     {hp:20, dmg:6,  spd:132, aggro:170, range:36, windup:0.35, recover:0.4,  xp:8,  gold:[1,4], sprite:"rat", size:15, knock:110, boss:false},
  skeleton:{hp:52, dmg:14, spd:86,  aggro:230, range:46, windup:0.6,  recover:0.55, xp:20, gold:[4,9], sprite:"skel", size:20, knock:120, boss:false},
  orc:     {hp:84, dmg:22, spd:70,  aggro:220, range:50, windup:0.78, recover:0.7,  xp:32, gold:[8,16],sprite:"orc", size:22, knock:90,  boss:false},
  spearman:{hp:42, dmg:13, spd:74,  aggro:300, range:210, windup:0.7, recover:0.75, xp:26, gold:[6,12],sprite:"skel", size:19, knock:80, boss:false, ranged:true, projspd:300, proj:"spear"},
  mage:    {hp:56, dmg:16, spd:58,  aggro:340, range:250, windup:0.9, recover:0.85, xp:34, gold:[10,18],sprite:"skel", size:21, knock:60, boss:false, ranged:true, projspd:240, proj:"bolt"},
  golem:   {hp:640,dmg:30, spd:46,  aggro:360, range:64, windup:0.95, recover:0.8,  xp:220,gold:[60,90],sprite:"golem",size:36, knock:60, boss:true},
  adv:     {hp:64, dmg:16, spd:96,  aggro:0,   range:44, windup:0.5,  recover:0.5,  xp:0,  gold:[0,0], sprite:"adv", size:18, knock:120, boss:false, neutral:true},
};

// =========================================================================
//  GAME
// =========================================================================
export function createGame(canvas, ctx, getView){
  let VW=innerWidth, VH=innerHeight;
  const nameWrap=document.getElementById("nameWrap"), nameInput=document.getElementById("nameInput");
  nameInput.placeholder = STR.namePlaceholder;

  let world=null;
  const G = {
    scene:"menu", // menu, play, dialogue, shop, inventory, pause, dead
    t:0, hero:null, enemies:[], projectiles:[], fx:[], floaters:[], drops:[],
    cam:{x:0,y:0}, shake:0, settings:{shake:1, crt:false, rollAim:false},
    quest:{wolves:0, done:false, rewarded:false}, dialog:null, shopSel:0,
    toast:"", toastT:0, music:"town", arenaWarned:false, bossDead:false,
    skull:{level:0, t:0, kills:0, killT:0}, started:false,
  };

  function newHero(name,cls){
    return { name:name||"Héroe", x:world.tcx, y:world.tcy+TS*2, vx:0,vy:0, facing:Math.PI/2,
      hp:100, maxHp:100, mp:50, maxMp:50, lvl:1, xp:0, xpNext:60, gold:30,
      baseDmg:12, dmgBonus:0, defBonus:0,
      rolling:false, rollT:0, rollCD:0, iframe:0, atkCD:0, atkT:0, atkAng:0, atkAnim:0, hurtFlash:0, walkT:0, dead:false, moved:false,
      animState:"idle", animT:0, cls:cls||"warrior",
      weapon:{name:"Espada de hierro",dmg:6,price:40}, armor:{name:"Coraza de cuero",def:4,price:35}, shield:{name:"Escudo de madera",def:2,price:25},
      potHP:2, potMP:1, blessings:0,
      respawn:{x:world.templeF.x, y:world.templeF.y+TS} };
  }
  function xpForLevel(l){ return Math.floor(40*Math.pow(l,1.55)); }

  // ----------------------------- helpers ---------------------------------
  function toast(msg,dur){ G.toast=msg; G.toastT=dur||2.6; }
  function floater(x,y,txt,col){ G.floaters.push({x,y,txt,col:col||COL.cream,t:0,life:0.9}); }
  function addFx(kind,x,y,opt){ G.fx.push(Object.assign({kind,x,y,t:0,life:0.4},opt)); }
  function shakeAdd(a){ G.shake=Math.min(14, G.shake + a*(G.settings.shake)); }
  function solidBlocked(x,y,r){
    if(x<r||y<r||x>MAP_W*TS-r||y>MAP_H*TS-r) return true;
    const tx=Math.floor(x/TS), ty=Math.floor(y/TS);
    if(world.terr[ty*MAP_W+tx]===T_WATER) return true;
    if(world.wallSet && world.wallSet.has(ty*MAP_W+tx)) return true;
    for(const s of world.solids){ if(dist2(x,y,s.x,s.y) < (r+s.r)*(r+s.r)) return true; }
    return false;
  }
  function moveEnt(e,dx,dy,r){
    if(!solidBlocked(e.x+dx,e.y,r)) e.x+=dx; 
    if(!solidBlocked(e.x,e.y+dy,r)) e.y+=dy;
  }

  // ----------------------------- spawning --------------------------------
  function spawnEnemy(type,x,y){
    const tpl=ETPL[type]; const e={type, x,y, hp:tpl.hp, maxHp:tpl.hp, tpl, state:"idle", st:0,
      vx:0,vy:0, facing:0, wt:0, hurtFlash:0, hitDone:false, phase:0, knockX:0,knockY:0, wanderX:x,wanderY:y, wanderT:0};
    G.enemies.push(e); return e;
  }
  function spawnBoss(){ const e=spawnEnemy("golem",(world.caves.x+world.caves.w/2)*TS,(world.caves.y+5)*TS); e.isBoss=true; }

  // ------------------------------ combat ---------------------------------
  function heroAttack(){
    const h=G.hero; if(h.atkCD>0||h.rolling) return;
    const cfg=ATK[h.cls||"warrior"]; const a=h.facing, ca=Math.cos(a), sa=Math.sin(a);
    const dmg=(h.baseDmg+h.weapon.dmg+h.dmgBonus)*cfg.dmgMul;
    h.atkAng=a; h.atkAnim=CFG.atkCD; h.atkCD=cfg.cd; h._atkHits=new Set();
    if(cfg.type==="proj"){ h.atkT=0; Audio2.sfx.fire();
      G.projectiles.push({x:h.x+ca*18,y:h.y-2+sa*18,vx:ca*cfg.spd,vy:sa*cfg.spd,life:1.4,dmg,kind:cfg.kind,ang:a}); shakeAdd(2.4); }
    else if(cfg.type==="nova"){ h.atkT=0; Audio2.sfx.rune();
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d<=cfg.range+e.tpl.size){ hitEnemy(e,dmg,Math.atan2(e.y-h.y,e.x-h.x)); } }
      if(cfg.heal){ h.hp=Math.min(h.maxHp,h.hp+cfg.heal); floater(h.x,h.y-30,"+"+cfg.heal,"#5fd66a"); }
      addFx("holynova",h.x,h.y,{r:cfg.range,life:0.5}); shakeAdd(6); }
    else { h.atkT=CFG.atkActive; h._mcfg=cfg; Audio2.sfx.sword(); shakeAdd(2.6);
      addFx("swing",h.x+ca*22,h.y-2+sa*22,{ang:a,fx:cfg.fx,life:0.26}); }
  }
  function applyHeroMelee(){
    const h=G.hero; const cfg=h._mcfg||ATK.warrior; const dmg=(h.baseDmg+h.weapon.dmg+h.dmgBonus)*cfg.dmgMul;
    for(const e of G.enemies){
      if(e.dead||h._atkHits.has(e)) continue;
      const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>cfg.range+e.tpl.size) continue;
      const ang=Math.atan2(e.y-h.y,e.x-h.x);
      if(Math.abs(angDiff(ang,h.atkAng))<cfg.arc/2){
        h._atkHits.add(e); hitEnemy(e,dmg,h.atkAng); shakeAdd(5.5);
      }
    }
  }
  function hitEnemy(e,dmg,ang){
    e.hp-=dmg; e.hurtFlash=0.16; Audio2.sfx.ehurt();
    e.knockX+=Math.cos(ang)*e.tpl.knock; e.knockY+=Math.sin(ang)*e.tpl.knock;
    floater(e.x,e.y-e.tpl.size,"-"+Math.round(dmg),"#ffd24d");
    addFx("spark",e.x,e.y); addFx("blood",e.x,e.y,{ang}); addFx("impact",e.x,e.y,{ang,life:0.26});
    if(e.tpl.neutral && !e.hostile){ makeHostile(e); registerSkull(); }
    if(e.hp<=0) killEnemy(e);
    else if(e.tpl.neutral) { /* stays hostile */ }
  }
  function makeHostile(e){ e.hostile=true; e.tpl=Object.assign({},e.tpl,{aggro:300}); }
  function killEnemy(e){
    if(e.dead) return; e.dead=true;
    const tpl=e.tpl;
    if(e.isBoss){ Audio2.sfx.boss(); G.bossDead=true; toast(STR.bossDefeated); shakeAdd(10);
      G.drops.push({x:e.x,y:e.y,kind:"potionhp"}); G.drops.push({x:e.x+20,y:e.y,kind:"gold"});
      gainXP(tpl.xp); for(let i=0;i<8;i++) addFx("flame",e.x+rr(-30,30),e.y+rr(-30,30)); }
    else { gainXP(tpl.xp);
      const g=ri(tpl.gold[0],tpl.gold[1]); if(g>0){ G.drops.push({x:e.x,y:e.y,kind:"gold",amt:g}); }
      if(srand()<0.22) G.drops.push({x:e.x+rr(-8,8),y:e.y,kind:srand()<0.6?"potionhp":"potionmp"});
    }
    if(e.type==="wolf" && !G.quest.done){ G.quest.wolves=Math.min(8,G.quest.wolves+1);
      if(G.quest.wolves>=8){ G.quest.done=true; toast(STR.questDone); } }
    addFx("poof",e.x,e.y);
    G.enemies.splice(G.enemies.indexOf(e),1);
  }
  function gainXP(n){ const h=G.hero; if(n<=0) return; h.xp+=n; floater(h.x,h.y-30,"+"+n+" XP","#9fe6a0");
    while(h.xp>=h.xpNext){ h.xp-=h.xpNext; h.lvl++; h.maxHp+=18; h.maxMp+=8; h.baseDmg+=3; h.hp=h.maxHp; h.mp=h.maxMp;
      h.xpNext=xpForLevel(h.lvl); toast(STR.levelUp(h.lvl)); Audio2.sfx.levelup(); for(let i=0;i<6;i++) addFx("heal",h.x+rr(-16,16),h.y+rr(-20,6)); } }

  function registerSkull(){ const s=G.skull;
    if(s.level===0){ s.level=1; s.t=60; }            // white
    else if(s.level===1){ s.level=2; s.t=80; }       // yellow
  }
  function onNeutralKill(){ const s=G.skull; s.kills++; s.killT=90;
    if(s.kills>=2 && s.level<3){ s.level=3; s.t=110; toast(STR.redSkull); } else if(s.level<2){ s.level=2; s.t=80; } }

  // ------------------------------ spells ---------------------------------
  function castSpell(i){
    const h=G.hero; if(h.rolling) return;
    if(i===0){ heroAttack(); return; }
    const cost=[0,10,14,22][i];
    if(h.mp<cost){ toast(STR.notEnoughMP); Audio2.sfx.deny(); return; }
    if(h.atkCD>0) return; h.atkCD=0.5;
    if(i===1){ h.mp-=cost; Audio2.sfx.fire(); const[a,b]=[Math.cos(h.facing),Math.sin(h.facing)];
      G.projectiles.push({x:h.x+a*20,y:h.y+b*20,vx:a*320,vy:b*320,life:1.4,dmg:22,kind:"fire"}); }
    else if(i===2){ h.mp-=cost; Audio2.sfx.heal(); h.hp=Math.min(h.maxHp,h.hp+44); floater(h.x,h.y-30,"+44","#5fd66a"); for(let k=0;k<6;k++) addFx("heal",h.x+rr(-14,14),h.y+rr(-18,6)); }
    else if(i===3){ h.mp-=cost; Audio2.sfx.rune(); h.atkCD=0.7; shakeAdd(4);
      const range=96, dmg=38;
      for(const e of G.enemies){ const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>range+e.tpl.size) continue;
        const ang=Math.atan2(e.y-h.y,e.x-h.x); if(Math.abs(angDiff(ang,h.facing))<Math.PI*0.5){ hitEnemy(e,dmg,h.facing); } }
      addFx("rune",h.x,h.y,{ang:h.facing}); }
  }

  // ----------------------------- pickups ---------------------------------
  function tryPickup(){
    const h=G.hero;
    for(const d of G.drops){ if(d.taken) continue; if(dist2(h.x,h.y,d.x,d.y)<CFG.pickRange*CFG.pickRange){
      if(d.kind==="gold"){ const g=d.amt||ri(3,8); h.gold+=g; Audio2.sfx.coin(); floater(h.x,h.y-26,"+"+g+" oro",COL.gold); }
      else if(d.kind==="potionhp"){ h.potHP++; Audio2.sfx.pickup(); toast(STR.pickedUp("poción de vida")); }
      else if(d.kind==="potionmp"){ h.potMP++; Audio2.sfx.pickup(); toast(STR.pickedUp("poción de maná")); }
      d.taken=true;
    }}
    G.drops=G.drops.filter(d=>!d.taken);
    for(const c of world.chests){ if(c.opened) continue; if(dist2(h.x,h.y,c.x,c.y)<CFG.pickRange*CFG.pickRange){
      c.opened=true; Audio2.sfx.pickup();
      if(c.loot==="gold40"){ h.gold+=40; floater(h.x,h.y-26,"+40 oro",COL.gold); }
      else if(c.loot==="gold60"){ h.gold+=60; floater(h.x,h.y-26,"+60 oro",COL.gold); }
      else if(c.loot==="potionhp"){ h.potHP+=2; toast(STR.pickedUp("2 pociones de vida")); }
    }}
    for(const f of world.fragments){ if(f.taken) continue; if(dist2(h.x,h.y,f.x,f.y)<CFG.pickRange*CFG.pickRange){
      f.taken=true; Audio2.sfx.levelup(); if(f.kind==="hp"){ h.maxHp+=20; h.hp+=20; toast("Fragmento de vida: +20 HP máx"); } else { h.maxMp+=15; h.mp+=15; toast("Fragmento de maná: +15 MP máx"); }
    }}
  }

  // ------------------------------ death ----------------------------------
  function heroDie(){
    const h=G.hero; if(h.dead) return; h.dead=true; h.animState="dead"; h.animT=0; G.scene="dead"; Audio2.sfx.death();
    const red=G.skull.level>=3;
    let frac = h.blessings>0 && !red ? 0.10 : 0.30;
    const loss=Math.floor(h.xpNext*frac); h.xp=Math.max(0,h.xp-loss);
    if(red){ if(h.potHP>0) h.potHP--; h.blessings=0; }
    else if(h.blessings>0){ h.blessings--; }
  }
  function respawn(){
    const h=G.hero; h.dead=false; h.hp=h.maxHp; h.mp=h.maxMp; h.x=h.respawn.x; h.y=h.respawn.y;
    h.vx=h.vy=0; h.rolling=false; h.iframe=0.5; G.scene="play"; G.skull.level=0; G.skull.kills=0;
  }

  // ------------------------------ NPCs / shop ----------------------------
  function nearestNPC(){ const h=G.hero; let best=null,bd=CFG.talkRange*CFG.talkRange;
    for(const n of world.npcs){ const d=dist2(h.x,h.y,n.x,n.y); if(d<bd){bd=d;best=n;} } return best; }
  function nearestFountain(){ const h=G.hero; for(const f of world.fountains){ if(dist2(h.x,h.y,f.x,f.y)<CFG.fountainRange*CFG.fountainRange) return f; } return null; }
  function interact(){
    const f=nearestFountain();
    const n=nearestNPC();
    if(n){ openDialogue(n); return; }
    if(f){ const h=G.hero; h.hp=h.maxHp; h.mp=h.maxMp; h.respawn={x:f.x,y:f.y+TS}; toast(STR.fountainRest); Audio2.sfx.heal(); return; }
  }
  function openDialogue(n){
    if(n.role==="quest" && G.quest.done && !G.quest.rewarded){
      G.dialog={npc:n,lines:STR.rolfDone,i:0,reward:true};
    } else {
      G.dialog={npc:n,lines:n.lines,i:0};
    }
    G.scene="dialogue";
  }
  function advanceDialogue(){
    const d=G.dialog; if(!d) return; d.i++;
    if(d.i>=d.lines.length){
      if(d.reward){ const h=G.hero; h.gold+=50; h.potHP+=1; G.quest.rewarded=true; toast(STR.questReward); Audio2.sfx.buy(); }
      const n=d.npc; G.dialog=null;
      if(n.role==="shop"){ G.scene="shop"; G.shopSel=0; }
      else if(n.role==="heal"){ G.scene="shop"; G.shopSel=0; G.healShop=true; }
      else { G.scene="play"; G.healShop=false; }
    }
  }
  function shopItems(){
    if(G.healShop) return [
      {name:"Poción de vida",price:15,act:h=>h.potHP++},
      {name:"Poción de maná",price:12,act:h=>h.potMP++},
      {name:"Bendición",price:60,act:h=>{h.blessings++; toast(STR.blessingOn);}},
      {name:"Curación completa",price:20,act:h=>{h.hp=h.maxHp;h.mp=h.maxMp;}},
    ];
    return [
      {name:"Poción de vida",price:15,act:h=>h.potHP++},
      {name:"Poción de maná",price:12,act:h=>h.potMP++},
      {name:"Espada de acero (+6 daño)",price:90,act:h=>{h.weapon={name:"Espada de acero",dmg:12,price:90};},once:h=>h.weapon.dmg>=12},
      {name:"Coraza de placas (+6 def)",price:80,act:h=>{h.armor={name:"Coraza de placas",def:10,price:80};},once:h=>h.armor.def>=10},
      {name:"Escudo de hierro (+4 def)",price:70,act:h=>{h.shield={name:"Escudo de hierro",def:6,price:70};},once:h=>h.shield.def>=6},
    ];
  }
  function buyItem(idx){ const h=G.hero; const it=shopItems()[idx]; if(!it) return;
    if(it.once && it.once(h)){ Audio2.sfx.deny(); toast("Ya tienes algo igual o mejor"); return; }
    if(h.gold<it.price){ toast(STR.cantAfford); Audio2.sfx.deny(); return; }
    h.gold-=it.price; it.act(h); Audio2.sfx.buy(); toast(STR.bought(it.name)); }

  // ====================================================================
  //  INPUT
  // ====================================================================
  const keys=new Set();
  const BIND={KeyW:"up",KeyS:"down",KeyA:"left",KeyD:"right",ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"};
  let mouseX=VW/2, mouseY=VH/2, aimActive=false;
  const press={}; // edge-triggered
  function onKeyDown(e){
    if(G.scene==="menu"){ if(document.activeElement===nameInput && e.code!=="Enter") return;
      if(e.code==="Enter") startGame(); return; }
    if(G.scene==="classsel"){ const c=e.code;
      if(c==="Digit1"||c==="Numpad1") chooseClass(CLASS_LIST[0]);
      else if(c==="Digit2"||c==="Numpad2") chooseClass(CLASS_LIST[1]);
      else if(c==="Digit3"||c==="Numpad3") chooseClass(CLASS_LIST[2]);
      else if(c==="Digit4"||c==="Numpad4") chooseClass(CLASS_LIST[3]);
      else if(c==="Digit5"||c==="Numpad5") chooseClass(CLASS_LIST[4]);
      else if(c==="ArrowLeft"||c==="KeyA") G.classSel=(G.classSel+CLASS_LIST.length-1)%CLASS_LIST.length;
      else if(c==="ArrowRight"||c==="KeyD") G.classSel=(G.classSel+1)%CLASS_LIST.length;
      else if(c==="Enter"||c==="Space") chooseClass(CLASS_LIST[G.classSel]);
      e.preventDefault(); return; }
    if(BIND[e.code]) { keys.add(BIND[e.code]); e.preventDefault(); }
    edge(e.code);
    if(["Space","KeyJ","Digit1","Digit2","Digit3","Digit4","KeyF","KeyI","KeyM","KeyE","Escape"].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e){ if(BIND[e.code]) keys.delete(BIND[e.code]); }
  function edge(code){
    if(G.scene==="dead"){ if(code==="Space"||code==="Enter") respawn(); return; }
    if(G.scene==="dialogue"){ if(code==="KeyE"||code==="Space"||code==="Enter") advanceDialogue(); else if(code==="Escape"){G.dialog=null;G.scene="play";} return; }
    if(G.scene==="shop"){ if(code==="Escape"||code==="KeyE"){G.scene="play";G.healShop=false;}
      else if(code==="ArrowUp"){G.shopSel=(G.shopSel+shopItems().length-1)%shopItems().length;}
      else if(code==="ArrowDown"){G.shopSel=(G.shopSel+1)%shopItems().length;}
      else if(code==="Enter"||code==="Space"){buyItem(G.shopSel);} return; }
    if(G.scene==="inventory"){ if(code==="KeyI"||code==="Escape") G.scene="play"; return; }
    if(G.scene==="pause"){ if(code==="Escape") G.scene="play";
      else if(code==="Digit1"){G.settings.shake=G.settings.shake>0?0:1;}
      else if(code==="Digit2"){G.settings.crt=!G.settings.crt;}
      else if(code==="Digit3"){G.settings.rollAim=!G.settings.rollAim;}
      else if(code==="Digit4"){toggleSound();} return; }
    if(G.scene!=="play") return;
    switch(code){
      case "Space": doRoll(); break;
      case "KeyJ": case "Digit1": castSpell(0); break;
      case "Digit2": castSpell(1); break;
      case "Digit3": castSpell(2); break;
      case "Digit4": castSpell(3); break;
      case "KeyF": tryPickup(); break;
      case "KeyI": G.scene="inventory"; break;
      case "KeyM": G.showMap=!G.showMap; break;
      case "KeyE": interact(); break;
      case "Escape": G.scene="pause"; break;
      case "KeyP": doPotionHP(); break;
      case "KeyO": doPotionMP(); break;
    }
  }
  function doPotionHP(){ const h=G.hero; if(h.potHP>0&&h.hp<h.maxHp){ h.potHP--; h.hp=Math.min(h.maxHp,h.hp+50); Audio2.sfx.heal(); floater(h.x,h.y-30,"+50","#5fd66a"); } }
  function doPotionMP(){ const h=G.hero; if(h.potMP>0&&h.mp<h.maxMp){ h.potMP--; h.mp=Math.min(h.maxMp,h.mp+30); Audio2.sfx.cast(); floater(h.x,h.y-30,"+30","#7fb8e6"); } }
  function doRoll(){ const h=G.hero; if(h.rolling||h.rollCD>0) return; let ax,ay;
    if(G.settings.rollAim){ ax=Math.cos(h.facing); ay=Math.sin(h.facing); }
    else { const mv=moveVec(); if(mv[0]===0&&mv[1]===0){ ax=Math.cos(h.facing); ay=Math.sin(h.facing);} else {[ax,ay]=mv;} }
    h.rolling=true; h.rollT=CFG.rollTime; h.iframe=CFG.rollIFrame; h.rollCD=CFG.rollCD; h.rollX=ax; h.rollY=ay; Audio2.sfx.roll(); }

  function onPointerDown(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
    Audio2.resume();
    if(G.scene==="menu"){ if(menuPlayHit(x,y)) startGame(); return; }
    if(G.scene==="classsel"){ for(const c of classRects){ if(x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h){ chooseClass(c.cls); return; } } return; }
    if(handleUITap(x,y)) return;
    if(G.scene==="play"){
      // touch zones: left half = move stick, right half handled by buttons; tap world = attack toward point
      if(isTouch && x<VW*0.42){ stick.active=true; stick.id=e.pointerId; stick.cx=x; stick.cy=y; stick.x=x; stick.y=y; }
      else if(!isTouch){ aimActive=true; mouseX=x; mouseY=y; faceMouse(); castSpell(0); }
    }
  }
  function onPointerMove(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top;
    mouseX=x; mouseY=y;
    if(stick.active && e.pointerId===stick.id){ stick.x=x; stick.y=y; }
    else if(!isTouch && G.scene==="play"){ faceMouse(); }
  }
  function onPointerUp(e){ if(stick.active&&e.pointerId===stick.id){ stick.active=false; } aimActive=false; }
  function faceMouse(){ const h=G.hero; if(!h) return; const wx=G.cam.x+mouseX/zoom(), wy=G.cam.y+mouseY/zoom(); h.facing=Math.atan2(wy-h.y,wx-h.x); }

  const stick={active:false,id:-1,cx:0,cy:0,x:0,y:0};
  let isTouch=false;
  window.addEventListener("touchstart",()=>{isTouch=true;},{once:true,passive:true});

  function moveVec(){
    if(isTouch && stick.active){ let dx=stick.x-stick.cx, dy=stick.y-stick.cy; const m=Math.hypot(dx,dy);
      if(m<8) return [0,0]; const cl=Math.min(m,48)/m; return [dx*cl/48, dy*cl/48]; }
    let dx=0,dy=0; if(keys.has("left"))dx--; if(keys.has("right"))dx++; if(keys.has("up"))dy--; if(keys.has("down"))dy++;
    // gamepad
    const gp=(navigator.getGamepads&&navigator.getGamepads()[0]);
    if(gp){ const lx=gp.axes[0]||0, ly=gp.axes[1]||0; if(Math.abs(lx)>0.2)dx+=lx; if(Math.abs(ly)>0.2)dy+=ly; }
    if(dx===0&&dy===0) return [0,0]; return norm(dx,dy);
  }
  // gamepad edge buttons
  const padPrev={};
  function pollPad(){ const gp=(navigator.getGamepads&&navigator.getGamepads()[0]); if(!gp) return;
    const map={0:()=>castSpell(0),1:doRoll,2:()=>castSpell(1),3:()=>castSpell(2),5:()=>castSpell(3),9:()=>{G.scene=G.scene==="pause"?"play":"pause";},8:tryPickup,4:interact};
    gp.buttons.forEach((b,i)=>{ const p=!!b.pressed; if(p&&!padPrev[i]&&map[i]&&G.scene==="play") map[i](); if(i===9&&p&&!padPrev[i]&&G.scene==="pause")G.scene="play"; padPrev[i]=p; });
    const rx=gp.axes[2]||0, ry=gp.axes[3]||0; if(Math.hypot(rx,ry)>0.3 && G.hero) G.hero.facing=Math.atan2(ry,rx);
  }

  // ------------------------- on-screen touch UI --------------------------
  function tbtns(){ // returns button rects for current scene
    const s=Math.min(VW,VH); const bs=Math.max(50,s*0.11); const m=14;
    const right=VW-m;
    return {
      attack:{x:right-bs/2, y:VH-m-bs/2, r:bs*0.62, label:"⚔", act:()=>castSpell(0)},
      roll:{x:right-bs*1.5-10, y:VH-m-bs*0.5, r:bs*0.5, label:"↻", act:doRoll},
      s2:{x:right-bs*0.5, y:VH-m-bs*1.7, r:bs*0.44, label:"2", act:()=>castSpell(1)},
      s3:{x:right-bs*1.5-10, y:VH-m-bs*1.9, r:bs*0.44, label:"3", act:()=>castSpell(2)},
      s4:{x:right-bs*2.4-20, y:VH-m-bs*1.1, r:bs*0.44, label:"4", act:()=>castSpell(3)},
      act:{x:right-bs*2.6-20, y:VH-m-bs*0.5, r:bs*0.46, label:"E", act:interact},
      pick:{x:m+bs*0.5, y:VH-m-bs*2.2, r:bs*0.4, label:"F", act:tryPickup},
      bs
    };
  }
  function topBtns(){ const s=Math.min(VW,VH); const b=Math.max(34,s*0.072); const y=14+b/2; return {
    inv:{x:VW-14-b*0.5, y, r:b*0.5, label:"I", act:()=>{G.scene=G.scene==="inventory"?"play":"inventory";}},
    map:{x:VW-14-b*1.6, y, r:b*0.5, label:"M", act:()=>{G.showMap=!G.showMap;}},
    pause:{x:VW-14-b*2.7, y, r:b*0.5, label:"❚❚", act:()=>{G.scene="pause";}}, b }; }

  function handleUITap(x,y){
    if(G.scene==="dead"){ respawn(); return true; }
    if(G.scene==="dialogue"){ advanceDialogue(); return true; }
    if(G.scene==="pause"){ return pauseTap(x,y); }
    if(G.scene==="inventory"){ G.scene="play"; return true; }
    if(G.scene==="shop"){ return shopTap(x,y); }
    if(G.scene==="play" && isTouch){
      const tb=tbtns(); for(const k in tb){ const b=tb[k]; if(b.r&&dist2(x,y,b.x,b.y)<b.r*b.r){ b.act(); return true; } }
      const top=topBtns(); for(const k in top){ const b=top[k]; if(b.r&&dist2(x,y,b.x,b.y)<b.r*b.r){ b.act(); return true; } }
    }
    return false;
  }
  let pauseRects=[], shopRects=[], classRects=[];
  function pauseTap(x,y){ for(const r of pauseRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }
  function shopTap(x,y){ for(const r of shopRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }

  // menu play button
  let menuPlayRect={x:0,y:0,w:0,h:0};
  function menuPlayHit(x,y){ const r=menuPlayRect; return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h; }

  function startGame(){
    let nm=(nameInput.value||"").trim();
    if(nm.length<2){ nameInput.focus(); nameInput.style.borderColor="#c83b3b"; setTimeout(()=>nameInput.style.borderColor=COL.panelB,800); toast(STR.nameTooShort); return; }
    G.pendingName=nm; nameWrap.style.display="none"; G.scene="classsel"; G.classSel=0;
    Audio2.init(); Audio2.resume();
  }
  const CLASS_LIST=["warrior","paladin","mage","druid","priest"];
  function chooseClass(cls){ G.hero=newHero(G.pendingName||"Héroe",cls); G.scene="play"; G.started=true;
    Audio2.playMusic("town"); Audio2.start(); }
  function toggleSound(){ Audio2.setEnabled(!Audio2.on); }

  // attach listeners
  addEventListener("keydown",onKeyDown);
  addEventListener("keyup",onKeyUp);
  canvas.addEventListener("pointerdown",onPointerDown);
  canvas.addEventListener("pointermove",onPointerMove);
  canvas.addEventListener("pointerup",onPointerUp);
  canvas.addEventListener("pointercancel",onPointerUp);
  canvas.addEventListener("contextmenu",e=>e.preventDefault());

  // ====================================================================
  //  UPDATE
  // ====================================================================
  function zoom(){ return VW<700? 1.55 : 1.7; }

  function update(dtMs){
    const dt=dtMs/1000; G.t+=dt;
    if(G.toastT>0) G.toastT-=dt;
    if(G.scene==="menu"){ if(nameWrap.style.display!=="block"){ positionNameInput(); nameWrap.style.display="block"; } return; }
    pollPad();
    if(G.scene!=="play"){ updateFloaters(dt); return; } // freeze world in menus
    const h=G.hero;
    // music switch by zone danger
    const z=zoneOf(world,h.x,h.y); const wantCombat=(z==="caves"||z==="forest"||z==="arena"||z==="ruins") && G.enemies.some(e=>e.state==="chase"||e.state==="windup");
    const wantMusic=wantCombat?"combat":"town"; if(wantMusic!==G.music){ G.music=wantMusic; Audio2.playMusic(wantMusic); }
    if(z==="arena" && !G.arenaWarned){ G.arenaWarned=true; toast(STR.enteredArena,3.5); }
    if(z==="caves" && !G.bossSpawned && h.y<(world.caves.y+10)*TS){ G.bossSpawned=true; spawnBoss(); }

    // timers
    h.atkCD=Math.max(0,h.atkCD-dt); h.rollCD=Math.max(0,h.rollCD-dt); h.iframe=Math.max(0,h.iframe-dt); h.hurtFlash=Math.max(0,h.hurtFlash-dt); h.atkAnim=Math.max(0,h.atkAnim-dt);
    if(h.atkT>0){ h.atkT-=dt; if(h._atkHits) applyHeroMelee(); }
    // movement
    if(h.rolling){ h.rollT-=dt; const sp=CFG.rollSpeed; moveEnt(h,h.rollX*sp*dt,h.rollY*sp*dt,12);
      if(h.rollT<=0) h.rolling=false; h.moved=false; }
    else { const mv=moveVec(); h.vx=mv[0]*CFG.heroSpeed; h.vy=mv[1]*CFG.heroSpeed;
      h.moved=!!(mv[0]||mv[1]);
      if(h.moved){ moveEnt(h,h.vx*dt,h.vy*dt,12); h.walkT+=dt*8;
        h.dustT=(h.dustT||0)+dt; if(h.dustT>0.15){ h.dustT=0; addFx("dust", h.x-h.vx*0.03, h.y+15-h.vy*0.02); }
        if(!aimActive && isTouch) h.facing=Math.atan2(mv[1],mv[0]); }
      else h.walkT=0;
    }
    if(!isTouch) faceMouse();
    { let ns = h.dead?"dead": h.rolling?"roll": h.atkAnim>0?"attack": h.moved?"walk":"idle";
      if(ns!==h.animState){ h.animState=ns; h.animT=0; } else h.animT+=dt; }

    // skull timers
    const s=G.skull; if(s.t>0){ s.t-=dt; if(s.t<=0){ s.level=0; s.kills=0; } }
    if(s.killT>0){ s.killT-=dt; if(s.killT<=0) s.kills=0; }

    // enemies
    updateEnemies(dt);
    updateProjectiles(dt);
    updateDrops(dt);
    updateFx(dt); updateFloaters(dt);
    // spawners
    for(const sp of world.spawners){ sp.t-=dt; const count=G.enemies.filter(e=>e.tpl && sp.types.includes(e.type)&&!e.isBoss).length;
      if(sp.t<=0 && count<sp.max){ sp.t=sp.cool; const tp=sp.types[ri(0,sp.types.length-1)];
        let tx,ty,tries=0; do{ tx=(sp.rect.x+rr(2,sp.rect.w-2))*TS; ty=(sp.rect.y+rr(2,sp.rect.h-2))*TS; tries++; }
          while((dist2(tx,ty,h.x,h.y)<300*300 || (world.wallSet&&world.wallSet.has(Math.floor(ty/TS)*MAP_W+Math.floor(tx/TS)))) && tries<10);
        const wallHere = world.wallSet && world.wallSet.has(Math.floor(ty/TS)*MAP_W+Math.floor(tx/TS));
        if(!wallHere && dist2(tx,ty,h.x,h.y)>240*240) spawnEnemy(tp,tx,ty); } }

    if(h.hp<=0) heroDie();
    // camera
    G.cam.x=lerp(G.cam.x, h.x-VW/2/zoom(), 0.14);
    G.cam.y=lerp(G.cam.y, h.y-VH/2/zoom(), 0.14);
    if(G.shake>0) G.shake=Math.max(0,G.shake-dt*30);
  }

  function updateEnemies(dt){ const h=G.hero;
    for(const e of G.enemies){
      e.hurtFlash=Math.max(0,e.hurtFlash-dt);
      { let ns=(e.state==="windup"||e.state==="strike")?"attack":(e.state==="chase")?"walk":"idle";
        if(ns!==e.animState){ e.animState=ns; e.animT=0; } else e.animT=(e.animT||0)+dt; }
      // knockback decay
      if(Math.abs(e.knockX)>1||Math.abs(e.knockY)>1){ moveEnt(e,e.knockX*dt,e.knockY*dt,e.tpl.size*0.6); e.knockX*=0.82; e.knockY*=0.82; }
      const d=Math.hypot(h.x-e.x,h.y-e.y);
      const aggro=e.hostile?300:e.tpl.aggro;
      if(e.tpl.neutral && !e.hostile){ // wander only
        e.wanderT-=dt; if(e.wanderT<=0){ e.wanderT=rr(1.5,3.5); e.wx=rr(-1,1); e.wy=rr(-1,1); const n=norm(e.wx,e.wy); e.wx=n[0]; e.wy=n[1]; }
        moveEnt(e, (e.wx||0)*40*dt, (e.wy||0)*40*dt, e.tpl.size*0.6); continue; }
      if(e.state==="idle"||e.state==="wander"){
        if(d<aggro){ e.state="chase"; }
        else { e.wanderT-=dt; if(e.wanderT<=0){ e.wanderT=rr(1.5,3.5); const a=rr(0,6.28); e.wx=Math.cos(a); e.wy=Math.sin(a);} moveEnt(e,(e.wx||0)*30*dt,(e.wy||0)*30*dt,e.tpl.size*0.6); }
      } else if(e.state==="chase"){
        if(d>aggro*1.4 && !e.hostile){ e.state="idle"; }
        else if(d<=e.tpl.range){ e.state="windup"; e.st=e.tpl.windup; e.hitDone=false; }
        else { const a=Math.atan2(h.y-e.y,h.x-e.x); e.facing=a; moveEnt(e,Math.cos(a)*e.tpl.spd*dt,Math.sin(a)*e.tpl.spd*dt,e.tpl.size*0.6); }
      } else if(e.state==="windup"){
        e.st-=dt; e.facing=Math.atan2(h.y-e.y,h.x-e.x);
        if(e.st<=0){ e.state="strike"; e.st=0.12;
          // boss extra: ground wave on alternate strikes
          if(e.isBoss){ e.phase++; if(e.phase%2===0){ for(let k=0;k<10;k++){ const a=k/10*6.28; G.projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,life:1.2,dmg:18,kind:"rune",enemy:true}); } } }
        }
      } else if(e.state==="strike"){
        e.st-=dt;
        if(!e.hitDone){ e.hitDone=true;
          if(e.tpl.ranged){ const a=Math.atan2(h.y-e.y,h.x-e.x); e.facing=a;
            G.projectiles.push({x:e.x+Math.cos(a)*16, y:e.y-4+Math.sin(a)*16, vx:Math.cos(a)*e.tpl.projspd, vy:Math.sin(a)*e.tpl.projspd, life:2.4, dmg:e.tpl.dmg, kind:e.tpl.proj||"spear", enemy:true, ang:a});
            addFx("spark",e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);
          } else {
            if(d<=e.tpl.range+10){ const a=Math.atan2(h.y-e.y,h.x-e.x); if(Math.abs(angDiff(a,e.facing))<1.2) damageHero(e.tpl.dmg,a); }
            addFx("spark",e.x+Math.cos(e.facing)*e.tpl.range*0.6,e.y+Math.sin(e.facing)*e.tpl.range*0.6);
          }
        }
        if(e.st<=0){ e.state="recover"; e.st=e.tpl.recover; }
      } else if(e.state==="recover"){ e.st-=dt; if(e.st<=0) e.state=d<aggro?"chase":"idle"; }
    }
  }
  function damageHero(dmg,ang){ const h=G.hero; if(h.iframe>0||h.dead) return;
    const def=h.armor.def+h.shield.def+h.defBonus; const real=Math.max(1,dmg-def*0.6);
    h.hp-=real; h.hurtFlash=0.18; Audio2.sfx.hurt(); shakeAdd(6); floater(h.x,h.y-30,"-"+Math.round(real),"#ff7a6a");
    h.iframe=0.25; // brief mercy invuln
  }
  function updateProjectiles(dt){ const h=G.hero;
    for(const p of G.projectiles){ p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(solidBlocked(p.x,p.y,4)){ p.life=0; }
      if(p.enemy){ if(dist2(p.x,p.y,h.x,h.y)<18*18){ damageHero(p.dmg,Math.atan2(p.vy,p.vx)); p.life=0; } }
      else { for(const e of G.enemies){ if(e.dead) continue; if(dist2(p.x,p.y,e.x,e.y)<(e.tpl.size+7)*(e.tpl.size+7)){ const ha=Math.atan2(p.vy,p.vx); hitEnemy(e,p.dmg,ha);
        if(p.kind==="fire"||p.kind==="orb"){ addFx(p.kind==="orb"?"orbburst":"flame",p.x,p.y,{life:0.45}); for(const e2 of G.enemies){ if(e2!==e&&!e2.dead&&dist2(p.x,p.y,e2.x,e2.y)<46*46) hitEnemy(e2,p.dmg*0.5,Math.atan2(e2.y-p.y,e2.x-p.x)); } }
        else addFx("impact",p.x,p.y,{ang:ha,life:0.3});
        shakeAdd(3); p.life=0; break; } } }
      if(p.life<=0){ if(p.kind==="fire") addFx("flame",p.x,p.y); else if(p.kind==="orb") addFx("orbburst",p.x,p.y,{life:0.45}); }
    }
    G.projectiles=G.projectiles.filter(p=>p.life>0);
  }
  function updateDrops(dt){ for(const d of G.drops){ d.t=(d.t||0)+dt; } }
  function updateFx(dt){ for(const f of G.fx){ f.t+=dt; } G.fx=G.fx.filter(f=>f.t<f.life); }
  function updateFloaters(dt){ for(const f of G.floaters){ f.t+=dt; f.y-=24*dt; } G.floaters=G.floaters.filter(f=>f.t<f.life); }

  // ====================================================================
  //  RENDER
  // ====================================================================
  const tileBase=[COL.grass,COL.dirt,COL.stone,COL.cobble,COL.sand,COL.water];
  const tileLight=[COL.grassL,COL.dirtL,COL.stoneL,COL.cobbleL,COL.sandL,COL.waterL];
  const tileDark=[COL.grassD,COL.dirtD,COL.stoneD,COL.cobbleD,COL.sandD,COL.water];

  function render(alpha){
    const Z=zoom();
    let camX=G.cam.x, camY=G.cam.y;
    if(G.shake>0){ camX+=rr(-G.shake,G.shake)/Z; camY+=rr(-G.shake,G.shake)/Z; }
    ctx.fillStyle=COL.bg; ctx.fillRect(0,0,VW,VH);
    if(G.scene==="menu"){ renderMenu(); return; }
    if(G.scene==="classsel"){ renderClassSel(); return; }
    ctx.save(); ctx.scale(Z,Z); ctx.translate(-camX,-camY);
    renderWorld(camX,camY,Z);
    renderEntities();
    ctx.restore();
    renderHUD();
    if(G.showMap) renderBigMap();
    if(G.scene==="inventory") renderInventory();
    if(G.scene==="dialogue") renderDialogue();
    if(G.scene==="shop") renderShop();
    if(G.scene==="pause") renderPause();
    if(G.scene==="dead") renderDeath();
    renderToast();
    if(isTouch && G.scene==="play") renderTouch();
    if(G.settings.crt) renderCRT();
  }

  function renderWorld(camX,camY,Z){
    const x0=Math.max(0,Math.floor(camX/TS)-1), y0=Math.max(0,Math.floor(camY/TS)-1);
    const x1=Math.min(MAP_W-1,Math.ceil((camX+VW/Z)/TS)+1), y1=Math.min(MAP_H-1,Math.ceil((camY+VH/Z)/TS)+1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=world.terr[y*MAP_W+x]; const px=x*TS, py=y*TS;
      if(world.wallSet && world.wallSet.has(y*MAP_W+x)){ const wimg=(hash2(x,y)<0.5?IMG.wall:IMG.wall2);
        if(wimg&&wimg.complete&&wimg.naturalWidth) ctx.drawImage(wimg,px,py,TS,TS); else { ctx.fillStyle="#2b313a"; ctx.fillRect(px,py,TS,TS); }
        continue; }
      if(t===T_STONE){ const img = (hash2(x,y)<0.5?IMG.cave_floor:IMG.cave_floor2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      ctx.fillStyle=tileBase[t]; ctx.fillRect(px,py,TS,TS);
      const hv=hash2(x,y);
      // texture flecks (deterministic)
      ctx.fillStyle = hv<0.5? tileDark[t]: tileLight[t];
      const fx=px+((hv*53)%1)*24+4, fy=py+((hv*97)%1)*24+4;
      ctx.fillRect(fx|0, fy|0, 4,4);
      if(hash2(x+7,y+3)<0.28){ ctx.fillStyle=tileLight[t]; ctx.fillRect(px+ ((hash2(x,y+1)*22)|0)+5, py+((hash2(x+1,y)*22)|0)+5, 3,3); }
      if(t===T_GRASS && hash2(x*2,y)<0.10){ ctx.fillStyle=COL.twig; ctx.fillRect(px+10,py+14,3,6); }
      if(t===T_SAND && hash2(x,y*2)<0.08){ ctx.fillStyle=COL.bloodSand; ctx.fillRect(px+8,py+10,6,5); }
    }
    // fountains (water pools)
    for(const f of world.fountains){ const r=20;
      ctx.fillStyle=COL.stoneD; ctx.beginPath(); ctx.arc(f.x,f.y,r+4,0,6.28); ctx.fill();
      ctx.fillStyle=COL.water; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,6.28); ctx.fill();
      ctx.fillStyle=COL.waterL; const ph=Math.sin(G.t*2+f.x)*3; ctx.fillRect(f.x-8,f.y-4+ph,5,3); ctx.fillRect(f.x+4,f.y+2-ph,4,3);
      ctx.fillStyle=COL.waterGlint; ctx.fillRect(f.x-3,f.y-8+ph,3,3);
      if(f.temple){ ctx.fillStyle=COL.textGold; ctx.fillRect(f.x-2,f.y-r-10,4,8); ctx.fillRect(f.x-6,f.y-r-6,12,3);} }
    // deco (trees, rocks, chests) - sorted by y handled in entities pass for overlap; draw ground deco here
    const order=[];
    for(const d of world.deco) order.push({y:d.y,draw:()=>{
      if(d.kind && d.kind.startsWith("prop_")){ const img=IMG[d.kind]; if(img&&img.complete&&img.naturalWidth){
          const s=PROP_SCALE[d.kind]||1, w=img.naturalWidth*s, h=img.naturalHeight*s; ctx.drawImage(img, Math.round(d.x-w/2), Math.round(d.y-h), Math.round(w), Math.round(h));
          if(d.kind==="prop_torch"){ const fy=d.y-h+10; ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(d.x,fy,5+Math.sin(G.t*9+d.x)*1.5,0,6.28); ctx.fill();
            ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(d.x,fy,2.5,0,6.28); ctx.fill();
            ctx.globalAlpha=0.18; ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(d.x,fy,22,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
        } return; }
      const spr=SP[d.kind]; if(!spr) return; const px=d.kind==="tree"?4:3; blit(ctx,spr.rows,spr.pal,d.x,d.y-(d.kind==="tree"?18:0),px,false);
    }});
    for(const c of world.chests){ if(!c.opened) order.push({y:c.y,draw:()=>blit(ctx,SP.chest.rows,SP.chest.pal,c.x,c.y,3,false)}); }
    for(const f of world.fragments){ if(!f.taken) order.push({y:f.y,draw:()=>drawFragment(ctx,f.x,f.y,2,G.t)}); }
    for(const d of G.drops){ order.push({y:d.y,draw:()=>{ if(d.kind==="gold")drawCoin(ctx,d.x,d.y,2,G.t); else if(d.kind==="potionhp")drawPotion(ctx,d.x,d.y,2,COL.hpf,"#ff8a8a"); else drawPotion(ctx,d.x,d.y,2,COL.mpf,"#8ab8ff"); }}); }
    G._decoOrder=order;
  }

  function renderEntities(){
    const h=G.hero;
    const list=[];
    for(const o of G._decoOrder) list.push(o);
    for(const e of G.enemies) list.push({y:e.y,draw:()=>drawEnemy(e)});
    for(const n of world.npcs) list.push({y:n.y,draw:()=>drawNPC(n)});
    list.push({y:h.y,draw:()=>drawHero(h)});
    list.sort((a,b)=>a.y-b.y);
    for(const o of list) o.draw();
    // projectiles + fx on top
    for(const p of G.projectiles) drawProjectile(p);
    for(const f of G.fx) drawFx(f);
    for(const f of G.floaters){ ctx.globalAlpha=clamp(1-f.t/f.life,0,1); ctx.font="bold 13px 'Courier New',monospace"; ctx.textAlign="center"; ctx.fillStyle=COL.out; ctx.fillText(f.txt,f.x+1,f.y+1); ctx.fillStyle=f.col; ctx.fillText(f.txt,f.x,f.y); ctx.globalAlpha=1; }
  }

  function drawHero(h){
    const cls=h.cls||"warrior", meta=CLS[cls], S=1.05, feet=h.y+18, st=h.animState;
    const cstate=(st==="attack")?"attack":(st==="walk"||st==="roll")?"walk":"idle";
    const ang=(st==="attack")?h.atkAng:((st==="roll"&&(h.rollX||h.rollY))?Math.atan2(h.rollY,h.rollX):h.facing);
    const dir=dir4FromAngle(ang);
    const fc=meta.fc[cstate], fps=(cstate==="walk")?(h.rolling?16:9):(cstate==="attack")?(fc/CFG.atkCD):2.2, loop=(cstate!=="attack");
    let fi=Math.floor((h.animT||0)*fps); fi=loop?(fi%fc):Math.min(fi,fc-1);
    if(h.rolling){ ctx.globalAlpha=0.35; ctx.fillStyle="#aeb6c2"; ctx.beginPath(); ctx.arc(h.x,h.y+4,15,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    if(h.iframe>0 && !h.dead && Math.floor(G.t*20)%2===0) ctx.globalAlpha=0.45;
    const ok=drawClassFrame(ctx,cls,cstate,dir,fi,h.x,feet,S, h.hurtFlash>0?"#ffffff":null);
    ctx.globalAlpha=1;
    if(!ok){ const bob=h.walkT?Math.sin(h.walkT)*2:0; blit(ctx,SP.hero.rows, h.hurtFlash>0?redden(SP.hero.pal):SP.hero.pal, h.x,h.y-12-bob,3, Math.cos(h.facing)<0); }
    if(!h.dead){ ctx.globalAlpha=0.8; ctx.fillStyle=COL.textGold; const fx=h.x+Math.cos(h.facing)*18, fy=h.y-2+Math.sin(h.facing)*18; ctx.fillRect(fx-1.5,fy-1.5,3,3); ctx.globalAlpha=1; }
  }
  function redden(pal){ const o={}; for(const k in pal) o[k]="#ff9a8a"; o.o=pal.o; return o; }
  function whiten(pal){ const o={}; for(const k in pal) o[k]="#ffffff"; return o; }

  function drawEnemy(e){
    const spr=SP[e.tpl.sprite]; const px=e.isBoss?5:(e.tpl.size>20?4:3);
    const fl = (e.facing!==undefined)?Math.cos(e.facing)<0:false;
    // windup telegraph: flashing warning + slight grow
    if(e.state==="windup"){ const fl2=Math.floor(G.t*16)%2===0;
      if(e.tpl.ranged){ const a=e.facing; const col=e.tpl.proj==="bolt"?"#9bef5a":"#ffd24d";
        ctx.globalAlpha=0.55; ctx.strokeStyle=fl2?col:"#ff8a3a"; ctx.lineWidth=2; ctx.setLineDash([6,7]);
        ctx.beginPath(); ctx.moveTo(e.x,e.y-6); ctx.lineTo(e.x+Math.cos(a)*240,e.y-6+Math.sin(a)*240); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha=1;
        const cx=e.x+Math.cos(a)*14, cy=e.y-8+Math.sin(a)*14; ctx.globalAlpha=0.9; ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(cx,cy,3+(fl2?2:0),0,6.28); ctx.fill(); ctx.globalAlpha=1;
      } else {
        ctx.globalAlpha=0.5; ctx.fillStyle=fl2?"#ffd24d":"#ff6a3a";
        ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.range+6,0,6.28); ctx.fill(); ctx.globalAlpha=1;
        ctx.fillStyle="rgba(255,120,60,0.35)"; ctx.beginPath(); ctx.moveTo(e.x,e.y);
        ctx.arc(e.x,e.y,e.tpl.range+12,e.facing-0.5,e.facing+0.5); ctx.closePath(); ctx.fill();
      }
    }
    let drew=false; const ch=ENEMY_ANIM[e.type];
    if(ch && IMG[ch+"_walk"]){
      const S=e.isBoss?1.3:0.85, feet=e.y+e.tpl.size*0.5, st=e.animState||"idle";
      const fps = st==="attack"? (ANIM[ch].fc.attack/(e.tpl.windup+0.15)) : (st==="walk"?10:6);
      const fi=frameIndex(ch,st,e.animT||0,fps, st!=="attack");
      drew=drawAnim(ctx,ch,st,fi,e.x,feet,S,fl, e.hurtFlash>0?"#ffffff":null);
    }
    if(!drew){ if(e.hurtFlash>0) blit(ctx,spr.rows,whiten(spr.pal),e.x,e.y,px,fl); else blit(ctx,spr.rows,spr.pal,e.x,e.y,px,fl); }
    // health bar
    const w=e.isBoss?64:Math.max(22,e.tpl.size*1.6); const hh=e.isBoss?6:4; const yy=e.y-e.tpl.size-(e.isBoss?14:8);
    ctx.fillStyle=COL.out; ctx.fillRect(e.x-w/2-1,yy-1,w+2,hh+2);
    ctx.fillStyle=COL.hpb; ctx.fillRect(e.x-w/2,yy,w,hh);
    ctx.fillStyle=e.hostile?"#ff5a4a":COL.hpf; ctx.fillRect(e.x-w/2,yy,w*clamp(e.hp/e.maxHp,0,1),hh);
    if(e.isBoss){ ctx.fillStyle=COL.textGold; ctx.font="bold 10px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("GÓLEM ANCESTRAL",e.x,yy-4); }
  }
  function drawNPC(n){ const spr=SP[n.sprite]; blit(ctx,spr.rows,spr.pal,n.x,n.y,3,false);
    // marker
    const z=zoneOf(world,G.hero.x,G.hero.y); const near=dist2(G.hero.x,G.hero.y,n.x,n.y)<CFG.talkRange*CFG.talkRange;
    let mk = n.role==="quest" && !G.quest.rewarded ? "!" : (near?"E":"");
    if(n.role==="quest" && G.quest.done && !G.quest.rewarded) mk="!";
    if(mk){ ctx.fillStyle=mk==="!"?COL.textGold:COL.cream; ctx.font="bold 14px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(mk,n.x,n.y-spr.rows.length*3/2-6+Math.sin(G.t*4)*2); }
  }
  function drawProjectile(p){ if(p.kind==="fire"){ ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,6.28); ctx.fill(); ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,6.28); ctx.fill(); }
    else if(p.kind==="rune"){ ctx.fillStyle=COL.rune; ctx.fillRect(p.x-4,p.y-4,8,8); ctx.fillStyle="#aac4ff"; ctx.fillRect(p.x-2,p.y-2,4,4); }
    else if(p.kind==="spear"){ const img=IMG.prop_spear; const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx);
      if(img&&img.complete&&img.naturalWidth){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.imageSmoothingEnabled=false; const s=0.85; ctx.drawImage(img,-img.naturalWidth*s/2,-img.naturalHeight*s/2,img.naturalWidth*s,img.naturalHeight*s); ctx.restore(); }
      else { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.fillStyle="#cdb892"; ctx.fillRect(-10,-1.5,20,3); ctx.fillStyle="#e6ecf4"; ctx.fillRect(8,-2.5,5,5); ctx.restore(); } }
    else if(p.kind==="bolt"){ const pu=Math.sin(G.t*18)*0.5+0.5;
      ctx.globalAlpha=0.25; ctx.fillStyle="#7bd44a"; ctx.beginPath(); ctx.arc(p.x,p.y,11+pu*2,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,6.28); ctx.fill();
      ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(p.x,p.y,2.6,0,6.28); ctx.fill(); }
    else if(p.kind==="arrow"){ const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a);
      ctx.globalAlpha=0.35; ctx.strokeStyle="#ffe7a8"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-22,0); ctx.lineTo(2,0); ctx.stroke(); ctx.globalAlpha=1;
      ctx.fillStyle="#6e4f33"; ctx.fillRect(-10,-1,16,2);
      ctx.fillStyle="#e8edf4"; ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(0,-3.5); ctx.lineTo(0,3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#cf9a38"; ctx.fillRect(-10,-2.5,2,5); ctx.restore(); }
    else if(p.kind==="orb"){ const pu=Math.sin(G.t*16)*0.5+0.5;
      ctx.globalAlpha=0.22; ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x,p.y,15+pu*3,0,6.28); ctx.fill();
      ctx.globalAlpha=0.5; ctx.fillStyle="#7bd44a"; ctx.beginPath(); ctx.arc(p.x,p.y,9+pu*1.5,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#bcff8a"; ctx.beginPath(); ctx.arc(p.x,p.y,5.5,0,6.28); ctx.fill();
      ctx.fillStyle="#f2ffe6"; ctx.beginPath(); ctx.arc(p.x,p.y,2.6,0,6.28); ctx.fill();
      // trailing wisp
      ctx.globalAlpha=0.3; ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x-p.vx*0.02,p.y-p.vy*0.02,3,0,6.28); ctx.fill(); ctx.globalAlpha=1; } }
  function drawFx(f){ const k=clamp(1-f.t/f.life,0,1), sw=1-k;
    if(f.kind==="spark"){ ctx.globalAlpha=k; ctx.fillStyle=COL.spark; for(let i=0;i<9;i++){ const a=i/9*6.28+f.t*7; const r=sw*24; ctx.fillRect(f.x+Math.cos(a)*r-1.5,f.y+Math.sin(a)*r-1.5,4,4);} ctx.globalAlpha=k*0.8; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*11,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="blood"){ ctx.globalAlpha=k*0.92; ctx.fillStyle=COL.blood; for(let i=0;i<9;i++){ const a=(f.ang||0)+rr(-1.0,1.0); const r=sw*26; const s=2+((i*7)%3); ctx.fillRect(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,s,s);} ctx.globalAlpha=1; }
    else if(f.kind==="flame"){ ctx.globalAlpha=k; ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(f.x,f.y,sw*32,0,6.28); ctx.fill(); ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(f.x,f.y,sw*19,0,6.28); ctx.fill(); ctx.fillStyle="#fff3c8"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*8,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="heal"){ ctx.globalAlpha=k; ctx.fillStyle=COL.heal; const yy=f.y-sw*26; ctx.fillRect(f.x-2,yy-5,4,12); ctx.fillRect(f.x-5,yy-2,12,4); ctx.globalAlpha=1; }
    else if(f.kind==="rune"){ ctx.globalAlpha=k*0.85; ctx.strokeStyle=COL.rune; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,sw*104,(f.ang||0)-0.65,(f.ang||0)+0.65); ctx.stroke(); ctx.globalAlpha=k*0.5; ctx.strokeStyle="#cfe0ff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,sw*104,(f.ang||0)-0.65,(f.ang||0)+0.65); ctx.stroke(); ctx.globalAlpha=1; }
    else if(f.kind==="poof"){ ctx.globalAlpha=k*0.7; ctx.fillStyle="#3a3a3a"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*16,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="dust"){ ctx.globalAlpha=k*0.45; ctx.fillStyle="#8d8576"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*6+1.5,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="swing"){ const a0=(f.ang||0)-0.9+sw*1.3;
      if(f.fx==="thorns"){ ctx.globalAlpha=k; ctx.fillStyle="#8fd47a"; for(let i=0;i<11;i++){ const aa=(f.ang||0)+(i-5)*0.17, r=12+sw*42; ctx.fillRect(f.x+Math.cos(aa)*r-2,f.y+Math.sin(aa)*r-2,4,4);} ctx.globalAlpha=k*0.55; ctx.strokeStyle="#4f8f3a"; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,20+sw*26,(f.ang||0)-0.62,(f.ang||0)+0.62); ctx.stroke(); ctx.globalAlpha=1; }
      else { ctx.lineCap="round"; ctx.globalAlpha=k*0.5; ctx.strokeStyle="#bcd2ee"; ctx.lineWidth=13; ctx.beginPath(); ctx.arc(f.x,f.y,22+sw*16,a0,a0+1.25); ctx.stroke(); ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,22+sw*16,a0,a0+1.25); ctx.stroke(); ctx.globalAlpha=1; ctx.lineCap="butt"; } }
    else if(f.kind==="holynova"){ const R=f.r||80, r2=sw*R;
      ctx.globalAlpha=k; ctx.strokeStyle="#ffe39a"; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.8; ctx.strokeStyle="#fff6d8"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.45; ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(f.x,f.y,k*22,0,6.28); ctx.fill();
      ctx.globalAlpha=k*0.7; ctx.strokeStyle="#ffe39a"; ctx.lineWidth=3; for(let i=0;i<8;i++){ const a=i/8*6.28; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r2*0.55,f.y+Math.sin(a)*r2*0.55); ctx.lineTo(f.x+Math.cos(a)*r2,f.y+Math.sin(a)*r2); ctx.stroke(); } ctx.globalAlpha=1; }
    else if(f.kind==="orbburst"){ const r=sw*42; ctx.globalAlpha=k*0.8; ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,6.28); ctx.fill(); ctx.globalAlpha=k; ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*18,0,6.28); ctx.fill(); ctx.fillStyle="#bcff8a"; for(let i=0;i<8;i++){ const a=i/8*6.28+f.t*4; const r3=sw*46; ctx.fillRect(f.x+Math.cos(a)*r3-2,f.y+Math.sin(a)*r3-2,4,4);} ctx.globalAlpha=1; }
    else if(f.kind==="impact"){ ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,sw*22,0,6.28); ctx.stroke(); ctx.fillStyle="#ffffff"; for(let i=0;i<6;i++){ const a=(f.ang||0)+i/6*6.28; const r=sw*20; ctx.fillRect(f.x+Math.cos(a)*r-1.5,f.y+Math.sin(a)*r-1.5,3,3);} ctx.globalAlpha=1; }
  }
  function drawAtkFx(cls,x,y,ang,p){ const a=Math.sin(Math.min(1,p)*Math.PI); if(a<=0.04) return;
    const dx=Math.cos(ang),dy=Math.sin(ang); ctx.save(); ctx.globalAlpha=a;
    if(cls==="warrior"){ const r=13+p*9, a0=ang-0.95+p*1.1; ctx.strokeStyle="#eef3fa"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,r,a0,a0+1.0); ctx.stroke(); }
    else if(cls==="paladin"){ const len=8+p*24; ctx.strokeStyle="#ffe7a8"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dx*len,y+dy*len); ctx.stroke(); ctx.fillStyle="#fff"; ctx.fillRect(x+dx*len-1.5,y+dy*len-1.5,3,3); }
    else if(cls==="mage"){ ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(x,y,5+p*9,0,6.28); ctx.fill(); ctx.globalAlpha=a*0.5; ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(x,y,2+p*4,0,6.28); ctx.fill(); }
    else if(cls==="druid"){ ctx.fillStyle="#8fd47a"; for(let i=0;i<6;i++){ const aa=ang+(i-2.5)*0.32, r=6+p*15; ctx.fillRect(x+Math.cos(aa)*r-1.5,y+Math.sin(aa)*r-1.5,3,3);} }
    else if(cls==="priest"){ ctx.strokeStyle="#ffe39a"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,4+p*13,0,6.28); ctx.stroke(); ctx.globalAlpha=a*0.6; ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(x,y,2+p*3,0,6.28); ctx.fill(); }
    ctx.restore();
  }

  // ------------------------------- HUD -----------------------------------
  function bar(x,y,w,hh,frac,fg,bg,label){ ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,w+4,hh+4); ctx.fillStyle=bg; ctx.fillRect(x,y,w,hh);
    ctx.fillStyle=fg; ctx.fillRect(x,y,w*clamp(frac,0,1),hh); if(label){ ctx.fillStyle=COL.cream; ctx.font="bold 11px 'Courier New'"; ctx.textAlign="left"; ctx.fillText(label,x+4,y+hh-2);} }
  function renderHUD(){ const h=G.hero; ctx.textAlign="left";
    const pad=12, bw=Math.min(220,VW*0.42);
    bar(pad,pad,bw,16,h.hp/h.maxHp,COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+h.maxHp);
    bar(pad,pad+22,bw,12,h.mp/h.maxMp,COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
    bar(pad,pad+38,bw,10,h.xp/h.xpNext,COL.xpf,COL.xpb, STR.level(h.lvl));
    // gold + potions
    ctx.font="bold 13px 'Courier New'"; ctx.fillStyle=COL.gold; ctx.fillText(STR.gold(h.gold),pad,pad+66);
    ctx.fillStyle=COL.cream; ctx.fillText("♥"+h.potHP+"  ◆"+h.potMP+"  ✦"+h.blessings, pad,pad+84);
    // skull indicator
    if(G.skull.level>0){ const sc=[null,COL.skullW,COL.skullY,COL.skullR][G.skull.level]; ctx.fillStyle=sc; ctx.font="bold 16px 'Courier New'"; ctx.fillText("☠ "+h.name, pad, pad+104); }
    else { ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(h.name, pad, pad+102); }
    // quest tracker (top-right under buttons)
    ctx.textAlign="right"; ctx.font="bold 12px 'Courier New'";
    const qx=VW-12, qy=isTouch?64:18;
    ctx.fillStyle=COL.out; const qt=G.quest.done?STR.questDone:STR.questLabel(G.quest.wolves);
    const qw=ctx.measureText(qt).width+12; ctx.fillRect(qx-qw,qy-2,qw,20); ctx.fillStyle=G.quest.done?COL.heal:COL.textGold; ctx.fillText(qt,qx-6,qy+13);
    // zone name
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'";
    const zn={town:STR.zoneTown,forest:STR.zoneForest,caves:STR.zoneCaves,arena:STR.zoneArena,ruins:STR.zoneRuins,field:STR.zoneField}[zoneOf(world,h.x,h.y)];
    ctx.fillText(zn, VW/2, 20);
    // spell bar
    renderSpellBar();
    // minimap
    if(!isTouch || true) renderMiniMap();
  }
  function renderSpellBar(){ const h=G.hero; const n=4; const s=Math.min(46,VW*0.1); const gap=6; const total=n*s+(n-1)*gap;
    const x0=VW/2-total/2; const y=VH-(isTouch?0:14)-s; if(isTouch) return; // touch uses buttons
    const costs=[0,10,14,22];
    for(let i=0;i<n;i++){ const x=x0+i*(s+gap);
      ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,s+4,s+4);
      ctx.fillStyle=h.mp>=costs[i]?"#2a3142":"#1a1d24"; ctx.fillRect(x,y,s,s);
      ctx.fillStyle=["#cfd6de",COL.flame,COL.heal,COL.rune][i]; ctx.fillRect(x+6,y+6,s-12,s-12);
      ctx.fillStyle=COL.out; ctx.font="bold 12px 'Courier New'"; ctx.textAlign="left"; ctx.fillText((i+1),x+3,y+13);
      ctx.fillStyle=COL.cream; ctx.font="8px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(STR.spells[i],x+s/2,y+s-4);
      if(costs[i]>0){ ctx.fillStyle="#8ab8ff"; ctx.font="8px 'Courier New'"; ctx.fillText(costs[i]+"mp",x+s/2,y+s+9);} }
  }
  function renderMiniMap(){ const mw=120, mh=120; const x=VW-mw-12, y=VH-mh-12; if(isTouch) return;
    ctx.fillStyle="rgba(12,14,19,0.8)"; ctx.fillRect(x-2,y-2,mw+4,mh+4); ctx.strokeStyle=COL.panelB; ctx.lineWidth=2; ctx.strokeRect(x-2,y-2,mw+4,mh+4);
    const sx=mw/(MAP_W*TS), sy=mh/(MAP_H*TS);
    const zr=[[world.forest,COL.grass],[world.caves,COL.stone],[world.arena,COL.sand],[world.town,COL.cobble],[world.ruins,COL.grass]];
    for(const [r,c] of zr){ ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy); }
    ctx.fillStyle="#ff5a4a"; for(const e of G.enemies){ ctx.fillRect(x+e.x*sx-1,y+e.y*sy-1,2,2); }
    ctx.fillStyle=COL.textGold; ctx.fillRect(x+G.hero.x*sx-2,y+G.hero.y*sy-2,4,4);
  }
  function renderBigMap(){ const mw=Math.min(VW*0.7,420), mh=mw; const x=(VW-mw)/2, y=(VH-mh)/2;
    panel(x-10,y-30,mw+20,mh+40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("VALDORIA",VW/2,y-8);
    const sx=mw/(MAP_W*TS), sy=mh/(MAP_H*TS);
    const zr=[[world.forest,COL.grass,STR.zoneForest],[world.caves,COL.stone,STR.zoneCaves],[world.arena,COL.sand,STR.zoneArena],[world.town,COL.cobble,STR.zoneTown],[world.ruins,COL.grass,STR.zoneRuins]];
    for(const [r,c,nm] of zr){ ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy);
      ctx.fillStyle=COL.cream; ctx.font="9px 'Courier New'"; ctx.fillText(nm,x+(r.x+r.w/2)*TS*sx,y+(r.y+r.h/2)*TS*sy); }
    ctx.fillStyle=COL.textGold; ctx.fillRect(x+G.hero.x*sx-3,y+G.hero.y*sy-3,6,6);
    ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText("M / tap: cerrar",VW/2,y+mh+18);
  }

  function panel(x,y,w,h){ ctx.fillStyle="rgba(8,10,14,0.92)"; ctx.fillRect(0,0,VW,VH); ctx.fillStyle=COL.panel; ctx.fillRect(x,y,w,h);
    ctx.fillStyle=COL.panelB2; ctx.fillRect(x,y,w,6); ctx.fillRect(x,y+h-6,w,6); ctx.fillRect(x,y,6,h); ctx.fillRect(x+w-6,y,6,h);
    ctx.fillStyle=COL.panelB; ctx.fillRect(x+3,y+3,w-6,3); ctx.fillRect(x+3,y+h-6,w-6,3); }
  function panelLocal(x,y,w,h){ ctx.fillStyle=COL.panel; ctx.fillRect(x,y,w,h); ctx.fillStyle=COL.panelB2; ctx.fillRect(x,y,w,5); ctx.fillRect(x,y+h-5,w,5); ctx.fillRect(x,y,5,h); ctx.fillRect(x+w-5,y,5,h); }

  function renderDialogue(){ const d=G.dialog; if(!d) return;
    const bw=Math.min(VW*0.86,560), bh=120, x=(VW-bw)/2, y=VH-bh-30;
    ctx.fillStyle="rgba(8,10,14,0.55)"; ctx.fillRect(0,0,VW,VH);
    panelLocal(x,y,bw,bh);
    blit(ctx,SP[d.npc.sprite].rows,SP[d.npc.sprite].pal, x+34,y+bh/2, 4,false);
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 15px 'Courier New'"; ctx.fillText(d.npc.name, x+70, y+28);
    ctx.fillStyle=COL.cream; ctx.font="14px 'Courier New'"; wrapText(d.lines[d.i],x+70,y+52,bw-90,18);
    ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.textAlign="right"; ctx.fillText("E / tap ▸ "+STR.dialogContinue, x+bw-14, y+bh-12);
  }
  function wrapText(txt,x,y,maxW,lh){ const words=txt.split(" "); let line="",yy=y; for(const w of words){ const t=line+w+" "; if(ctx.measureText(t).width>maxW){ ctx.fillText(line,x,yy); line=w+" "; yy+=lh;} else line=t; } ctx.fillText(line,x,yy); }

  function renderInventory(){ const bw=Math.min(VW*0.8,440), bh=Math.min(VH*0.8,400), x=(VW-bw)/2, y=(VH-bh)/2; const h=G.hero;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'"; ctx.fillText(STR.invTitle,VW/2,y+30);
    // equipment doll
    const dx=x+70, dy=y+90; blit(ctx,SP.hero.rows,SP.hero.pal,dx,dy,5,false);
    ctx.textAlign="left"; ctx.font="12px 'Courier New'";
    const rows=[[STR.slotWeapon,h.weapon.name],[STR.slotBody,h.armor.name],[STR.slotShield,h.shield.name]];
    let ry=y+70; for(const [a,b] of rows){ ctx.fillStyle=COL.textDim; ctx.fillText(a+":",x+140,ry); ctx.fillStyle=COL.cream; ctx.fillText(b,x+140,ry+16); ry+=44; }
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.statsDmg+": "+(h.baseDmg+h.weapon.dmg+h.dmgBonus), x+140, ry); ctx.fillText(STR.statsDef+": "+(h.armor.def+h.shield.def+h.defBonus), x+140, ry+18);
    // backpack
    ctx.fillStyle=COL.textDim; ctx.fillText(STR.backpack+":", x+30, y+bh-90);
    ctx.fillStyle=COL.cream; ctx.fillText("♥ Poción de vida x"+h.potHP, x+30, y+bh-70);
    ctx.fillText("◆ Poción de maná x"+h.potMP, x+30, y+bh-52);
    ctx.fillText("✦ Bendiciones x"+h.blessings, x+30, y+bh-34);
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.fillText(STR.invHint+" · P usa poción vida · O usa maná",VW/2,y+bh-12);
  }

  function renderShop(){ const items=shopItems(); const bw=Math.min(VW*0.86,460), bh=Math.min(VH*0.82,420), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'"; ctx.fillText(G.healShop?STR.npcLina:STR.shopTitle,VW/2,y+30);
    ctx.fillStyle=COL.gold; ctx.font="bold 13px 'Courier New'"; ctx.fillText(STR.gold(G.hero.gold),VW/2,y+50);
    shopRects=[]; const iy=y+72, ih=42;
    for(let i=0;i<items.length;i++){ const it=items[i]; const ry=iy+i*ih; const sel=i===G.shopSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+20,ry,bw-40,ih-6);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+20,ry,bw-40,ih-6); }
      ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText(it.name,x+34,ry+24);
      ctx.textAlign="right"; ctx.fillStyle=COL.gold; ctx.fillText(it.price+" oro",x+bw-34,ry+24);
      shopRects.push({x:x+20,y:ry,w:bw-40,h:ih-6,act:()=>{G.shopSel=i; buyItem(i);}});
    }
    // close
    const cy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,cy,120,24); ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("Cerrar (E)",VW/2,cy+17);
    shopRects.push({x:x+bw/2-60,y:cy,w:120,h:24,act:()=>{G.scene="play";G.healShop=false;}});
  }

  function renderPause(){ const bw=Math.min(VW*0.8,400), bh=300, x=(VW-bw)/2, y=(VH-bh)/2; panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 22px 'Courier New'"; ctx.fillText(STR.pauseTitle,VW/2,y+40);
    ctx.fillStyle=COL.textDim; ctx.font="13px 'Courier New'"; ctx.fillText(STR.settingsTitle,VW/2,y+70);
    pauseRects=[]; const opts=[
      [STR.settingShake+": "+(G.settings.shake>0?"ON":"OFF"),()=>{G.settings.shake=G.settings.shake>0?0:1;}],
      [STR.settingCRT+": "+(G.settings.crt?"ON":"OFF"),()=>{G.settings.crt=!G.settings.crt;}],
      [STR.settingRollDir+": "+(G.settings.rollAim?STR.rollTowardAim:STR.rollTowardMove),()=>{G.settings.rollAim=!G.settings.rollAim;}],
      ["Sonido: "+(Audio2.on?"ON":"OFF"),toggleSound],
    ];
    let oy=y+90; for(const [label,act] of opts){ ctx.fillStyle="#20262f"; ctx.fillRect(x+30,oy,bw-60,30); ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText(label,VW/2,oy+20); pauseRects.push({x:x+30,y:oy,w:bw-60,h:30,act}); oy+=38; }
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-80,oy+6,160,30); ctx.fillStyle=COL.textGold; ctx.font="bold 14px 'Courier New'"; ctx.fillText(STR.resume,VW/2,oy+26); pauseRects.push({x:x+bw/2-80,y:oy+6,w:160,h:30,act:()=>{G.scene="play";}});
  }

  function renderDeath(){ ctx.fillStyle="rgba(40,8,8,0.6)"; ctx.fillRect(0,0,VW,VH);
    ctx.textAlign="center"; ctx.fillStyle=COL.skullR; ctx.font="bold 40px 'Courier New'"; ctx.fillText(STR.deathTitle,VW/2,VH/2-30);
    ctx.fillStyle=COL.cream; ctx.font="16px 'Courier New'"; ctx.fillText(STR.deathSub,VW/2,VH/2+6);
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(VW/2-90,VH/2+30,180,40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px 'Courier New'"; ctx.fillText(STR.deathContinue,VW/2,VH/2+56);
  }

  function renderToast(){ if(G.toastT<=0) return; const a=clamp(G.toastT,0,1); ctx.globalAlpha=a; ctx.textAlign="center";
    ctx.font="bold 15px 'Courier New'"; const w=ctx.measureText(G.toast).width+24; ctx.fillStyle="rgba(8,10,14,0.9)"; ctx.fillRect(VW/2-w/2,VH*0.18,w,30);
    ctx.fillStyle=COL.panelB; ctx.fillRect(VW/2-w/2,VH*0.18,w,3); ctx.fillStyle=COL.textGold; ctx.fillText(G.toast,VW/2,VH*0.18+20); ctx.globalAlpha=1; }

  function renderTouch(){ const tb=tbtns(); const top=topBtns();
    // joystick
    if(stick.active){ ctx.globalAlpha=0.5; ctx.fillStyle="#1a1e26"; ctx.beginPath(); ctx.arc(stick.cx,stick.cy,52,0,6.28); ctx.fill();
      ctx.fillStyle="#5a4632"; let dx=stick.x-stick.cx,dy=stick.y-stick.cy; const m=Math.hypot(dx,dy)||1; const cl=Math.min(m,48); ctx.beginPath(); ctx.arc(stick.cx+dx/m*cl,stick.cy+dy/m*cl,22,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    function btn(b,col,big){ if(!b.r) return; ctx.globalAlpha=0.55; ctx.fillStyle="#12161d"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.28); ctx.fill();
      ctx.globalAlpha=0.9; ctx.strokeStyle=col||COL.panelB; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle=col||COL.cream; ctx.font="bold "+(big?20:14)+"px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(b.label,b.x,b.y+ (big?7:5)); ctx.globalAlpha=1; }
    btn(tb.attack,COL.textGold,true); btn(tb.roll,COL.cream); btn(tb.s2,COL.flame); btn(tb.s3,COL.heal); btn(tb.s4,COL.rune); btn(tb.act,COL.cream); btn(tb.pick,COL.cream);
    btn(top.inv,COL.cream); btn(top.map,COL.cream); btn(top.pause,COL.cream);
    // mp cost hints on spell buttons
    ctx.globalAlpha=0.8; ctx.font="9px 'Courier New'"; ctx.fillStyle="#8ab8ff"; ctx.textAlign="center";
    ctx.fillText("10",tb.s2.x,tb.s2.y+tb.s2.r+10); ctx.fillText("14",tb.s3.x,tb.s3.y+tb.s3.r+10); ctx.fillText("22",tb.s4.x,tb.s4.y+tb.s4.r+10); ctx.globalAlpha=1;
  }

  function renderCRT(){ ctx.globalAlpha=0.08; ctx.fillStyle="#000";
    for(let y=0;y<VH;y+=3){ ctx.fillRect(0,y,VW,1); } ctx.globalAlpha=1;
    const g=ctx.createRadialGradient(VW/2,VH/2,VH*0.3,VW/2,VH/2,VH*0.8); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,0.5)");
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH); }

  // ------------------------------- menu ----------------------------------
  function positionNameInput(){ const cy=VH*0.52; nameWrap.style.top=(cy-26)+"px"; }
  function renderMenu(){
    // dark fantasy backdrop
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    seed(7); for(let i=0;i<60;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    // silhouette trees
    ctx.fillStyle="#0c130d"; for(let i=0;i<10;i++){ const x=i*VW/9; ctx.fillRect(x-10,VH-120,20,120); ctx.beginPath(); ctx.moveTo(x-22,VH-100); ctx.lineTo(x,VH-180); ctx.lineTo(x+22,VH-100); ctx.fill(); }
    ctx.textAlign="center";
    // title
    ctx.fillStyle=COL.out; ctx.font="bold 56px 'Courier New'"; ctx.fillText(STR.title,VW/2+3,VH*0.30+3);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.title,VW/2,VH*0.30);
    ctx.fillStyle=COL.cream; ctx.font="bold 18px 'Courier New'"; ctx.fillText(STR.subtitle,VW/2,VH*0.30+34);
    // sword+shield emblem
    drawMenuEmblem(VW/2,VH*0.30-78);
    // play button
    const bw=200,bh=52,bx=VW/2-bw/2,by=VH*0.62; menuPlayRect={x:bx,y:by,w:bw,h:bh};
    ctx.fillStyle="#2e231a"; ctx.fillRect(bx,by,bw,bh); ctx.fillStyle=COL.panelB; ctx.fillRect(bx,by,bw,4); ctx.fillRect(bx,by+bh-4,bw,4);
    ctx.fillStyle=COL.textGold; ctx.font="bold 24px 'Courier New'"; ctx.fillText(STR.play,VW/2,by+34);
    ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(STR.controlsHintPC,VW/2,VH-40);
    ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(STR.version,VW/2,VH-18);
  }
  function renderClassSel(){
    const META={warrior:["Guerrero","Espada y escudo","#8d3636"], paladin:["Paladín","Arco sagrado","#e6e0cf"],
      mage:["Mago","Orbes arcanos","#2f6e6e"], druid:["Druida","Naturaleza","#41693c"], priest:["Sacerdote","Luz sagrada","#e2ddcd"]};
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    seed(7); for(let i=0;i<50;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 26px 'Courier New'"; ctx.fillText("Elige tu clase",VW/2,VH*0.15);
    ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("Toca una clase  ·  o usa 1-5 / ←→ + Enter",VW/2,VH*0.15+24);
    classRects.length=0;
    const n=CLASS_LIST.length, gap=10, cw=Math.min(150,(VW-30)/n-gap), ch=Math.min(210,VH*0.52);
    const totalW=n*cw+(n-1)*gap, x0=(VW-totalW)/2, cy=VH*0.55;
    for(let i=0;i<n;i++){ const cls=CLASS_LIST[i], rx=x0+i*(cw+gap), ry=cy-ch/2, sel=(G.classSel===i);
      ctx.fillStyle=sel?"#2b313d":COL.panel; ctx.fillRect(rx,ry,cw,ch);
      ctx.strokeStyle=sel?COL.textGold:COL.panelB; ctx.lineWidth=sel?3:2; ctx.strokeRect(rx,ry,cw,ch);
      ctx.fillStyle=META[cls][2]; ctx.fillRect(rx+cw/2-14,ry+10,28,4);
      const sc=Math.max(2,Math.min(4,Math.floor((cw-10)/22)));
      drawClassFrame(ctx,cls,"idle","down",0, rx+cw/2, ry+ch*0.66, sc, null);
      ctx.fillStyle=sel?COL.textGold:COL.cream; ctx.font="bold 14px 'Courier New'"; ctx.fillText(META[cls][0],rx+cw/2,ry+ch-26);
      ctx.fillStyle="#9aa0aa"; ctx.font="10px 'Courier New'"; ctx.fillText(META[cls][1],rx+cw/2,ry+ch-12);
      ctx.fillStyle=COL.textDim; ctx.font="bold 11px 'Courier New'"; ctx.fillText(String(i+1),rx+10,ry+18);
      classRects.push({x:rx,y:ry,w:cw,h:ch,cls});
    }
  }
  function drawMenuEmblem(x,y){ ctx.save(); ctx.translate(x,y);
    ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(0,0,26,0,6.28); ctx.fill(); ctx.fillStyle="#6b4a2a"; ctx.beginPath(); ctx.arc(0,0,22,0,6.28); ctx.fill();
    ctx.fillStyle="#8a6038"; ctx.beginPath(); ctx.arc(0,0,16,0,6.28); ctx.fill();
    ctx.strokeStyle="#cdd4dc"; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(-18,-18); ctx.lineTo(18,18); ctx.moveTo(18,-18); ctx.lineTo(-18,18); ctx.stroke();
    ctx.strokeStyle=COL.out; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }

  // ---------------------------- lifecycle --------------------------------
  function onResize(w,h){ VW=w; VH=h; if(G.scene==="menu") positionNameInput(); }
  function onFocusLost(){ if(G.scene==="play") G.scene="pause"; }
  function devInfo(){ return "ent:"+G.enemies.length+" fx:"+G.fx.length+" scene:"+G.scene; }

  // boot world
  world = buildWorld();
  loadAllAssets();
  if(typeof location!=="undefined" && location.search.indexOf("dev")>=0){
    window.__dev={ spawn:(type,dx,dy)=>{ const e=spawnEnemy(type, G.hero.x+(dx||0), G.hero.y+(dy||0)); if(type==="golem"&&e) e.isBoss=true; return type; },
      tp:(tx,ty)=>{ G.hero.x=tx*TS; G.hero.y=ty*TS; return [G.hero.x,G.hero.y]; } };
  }
  nameWrap.style.display="block"; positionNameInput();

  return { update, render, onResize, onFocusLost, devInfo };
}
