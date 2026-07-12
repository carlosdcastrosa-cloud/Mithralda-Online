// CAS-2194: headless verification of the PixelLab pilot wiring (data + on-disk geometry + draw math).
import { readFileSync, existsSync } from 'node:fs';
import { CLS, ENEMY_STRIPS, FX_STRIP, resolveStrip, HERO_SPRITE_SCALE } from '../render/sprites.js';
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS':'FAIL')+' '+m); if(!c) fail++; };
const dims=p=>{ const d=readFileSync(p); return [d.readUInt32BE(16), d.readUInt32BE(20)]; };

// 1. CLS.warrior matches committed CAS-2193 88x64 art
const w=CLS.warrior;
ok(w.fw===88&&w.fh===64, `CLS.warrior fw/fh = ${w.fw}x${w.fh} (expect 88x64)`);
ok(w.fc.idle===2&&w.fc.walk===6&&w.fc.attack===9, `CLS.warrior fc = ${JSON.stringify(w.fc)} (expect idle2/walk6/attack9)`);
ok(Math.abs(w.scale-0.64)<1e-9 && Math.abs(w.footPad-0.08)<1e-9, `CLS.warrior scale/footPad = ${w.scale}/${w.footPad}`);
for(const [st,frames] of [['idle',2],['walk',6],['attack',9]]) for(const dir of ['down','up','side']){
  const p=`assets/class/warrior_${st}_${dir}.png`; const [W,H]=dims(p);
  ok(W===frames*88&&H===64, `${p} = ${W}x${H} (expect ${frames*88}x64)`);
}
// draw math: body ~53px should render ~63px; feet land ~cy
{ const S=HERO_SPRITE_SCALE*w.scale, dh=w.fh*S, bodyPx=53*S;
  const feetFrac=58.5/64, feetScreenFromTop=feetFrac*dh, drawTop=-dh+w.footPad*dh; // relative to cy
  const feetOffset=drawTop+feetScreenFromTop;
  ok(bodyPx>58&&bodyPx<68, `warrior body on-screen = ${bodyPx.toFixed(1)}px (~63 target)`);
  ok(Math.abs(feetOffset)<3, `warrior feet land ${feetOffset.toFixed(2)}px from ground (≈0)`);
}

// 2. ENEMY_STRIPS.skel pilot side strips
for(const [st,fc,expW] of [['idle',1,124],['walk',6,744],['attack',7,868]]){
  const s=ENEMY_STRIPS.skel[st];
  ok(s.fw===124&&s.fh===124&&s.fc===fc&&s.footPad===0.25&&Math.abs(s.bodyScale-2.03)<1e-9,
     `ENEMY_STRIPS.skel.${st} geom = fc${s.fc} ${s.fw}x${s.fh} pad${s.footPad} bs${s.bodyScale}`);
  ok(!!s.src && existsSync(s.src.replace('./','')), `skel.${st}.src exists: ${s.src}`);
  const [W,H]=dims(s.src.replace('./','')); ok(W===expW&&H===124, `${s.src} = ${W}x${H} (expect ${expW}x124)`);
}
ok(resolveStrip('skel','walk')===ENEMY_STRIPS.skel.walk, 'resolveStrip(skel,walk) → pilot walk');
ok(resolveStrip('skel','attack')===ENEMY_STRIPS.skel.attack, 'resolveStrip(skel,attack) → pilot attack');
ok(resolveStrip('skel','idle')===ENEMY_STRIPS.skel.idle, 'resolveStrip(skel,idle) → pilot idle');
// skel body scale sanity: 61px body at bodyScale 2.03 → standard mob height (skeleton size 20 → 48px)
{ const size=20, dh=size*2.4*2.03, bodyPx=(61/124)*dh; ok(bodyPx>44&&bodyPx<52, `skel body on-screen = ${bodyPx.toFixed(1)}px (~48 std mob)`); }

// 3. nova pilot
ok(FX_STRIP.nova.n===9&&FX_STRIP.nova.fw===128, `FX_STRIP.nova = ${JSON.stringify(FX_STRIP.nova)}`);
const np='assets/pixellab/pilot/fx/nova_strip.png'; ok(existsSync(np), 'pilot nova exists');
const [nw,nh]=dims(np); ok(nw===9*128&&nh===128, `pilot nova = ${nw}x${nh} (expect 1152x128)`);

console.log(fail? `\n${fail} FAIL`: '\nALL PASS');
process.exit(fail?1:0);
