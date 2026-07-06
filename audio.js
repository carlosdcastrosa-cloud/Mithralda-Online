// ===========================================================================
// audio.js — procedural chiptune music + ambient soundscape + SFX (client-side
// effect sink). The simulation calls into this via the injected `audio`
// dependency; on a headless Stage-2 server it can be swapped for a no-op with
// the same surface — NO audio state ever feeds the deterministic sim.
//
// CAS-131: contextual music (town / combat / boss) with a crossfade on
// transition, a per-biome ambient bed under the music, a persisted 3-channel
// mix (master / music / sfx + mute) and the missing UI/step/loot SFX. All
// additive — zero balance or mechanics touched. The whole graph hangs under a
// single `master` gain so the mix never clips and one mute kills everything.
// ===========================================================================
export const audio = (()=>{
  let ac=null, master=null, musicGain=null, sfxGain=null;
  let ambGain=null, ambFilter=null, ambSrc=null, ambDrone=null, ambDrone2=null, ambDroneGain=null;
  let started=false, running=false, musicTimer=null;
  let curTrack=null, step=0, ambZone=null;

  // ---- persisted mix (master/music/sfx 0..1 + mute) -----------------------
  // Stored separately from the gameplay save so volume survives a "Nueva
  // partida" wipe; degrades silently in private mode / quota failure.
  const VKEY="mithralda.audio.v1";
  // user-facing volumes (0..1) scaled by per-bus base headroom so nothing clips.
  const vol={ master:0.8, music:0.7, sfx:0.9 };
  let muted=false, enabled=true;
  const MUSIC_BASE=0.30, SFX_BASE=0.55, AMB_BASE=1.0;
  (function load(){ try{ const raw=localStorage.getItem(VKEY); if(raw){ const o=JSON.parse(raw);
    if(o&&typeof o==="object"){ if(o.master!=null)vol.master=clamp01(o.master); if(o.music!=null)vol.music=clamp01(o.music);
      if(o.sfx!=null)vol.sfx=clamp01(o.sfx); muted=!!o.muted; } } }catch(e){} })();
  function persist(){ try{ localStorage.setItem(VKEY,JSON.stringify({master:vol.master,music:vol.music,sfx:vol.sfx,muted})); }catch(e){} }
  function clamp01(v){ v=+v; return v<0?0:v>1?1:v; }

  function applyMix(){ if(!ac) return; const now=ac.currentTime;
    if(master) master.gain.setTargetAtTime(muted?0:vol.master, now, 0.02);
    if(musicGain) musicGain.gain.setTargetAtTime(vol.music*MUSIC_BASE, now, 0.05);
    if(sfxGain) sfxGain.gain.setTargetAtTime(vol.sfx*SFX_BASE, now, 0.02);
    // ambient sits UNDER the music slider (it's part of the music/soundscape bed)
    if(ambGain) ambGain.gain.setTargetAtTime(curAmbLevel()*vol.music*AMB_BASE, now, 0.6);
  }

  // ----------------------------- graph init --------------------------------
  function init(){ if(ac) return; try{ ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createGain(); master.gain.value=muted?0:vol.master; master.connect(ac.destination);
    musicGain=ac.createGain(); musicGain.gain.value=vol.music*MUSIC_BASE; musicGain.connect(master);
    sfxGain=ac.createGain(); sfxGain.gain.value=vol.sfx*SFX_BASE; sfxGain.connect(master);
    initAmbient();
  }catch(e){ enabled=false; } }
  function resume(){ if(ac&&ac.state==="suspended") ac.resume(); }

  // ----------------------------- ambient bed -------------------------------
  // One looping noise source through a lowpass + two detuned low drones, whose
  // cutoff / level / pitch morph per biome (slow crossfade). Level 0 == silence
  // (town), so the town carries on music alone.
  function initAmbient(){ if(!ac) return; try{
    ambGain=ac.createGain(); ambGain.gain.value=0; ambGain.connect(master);
    ambFilter=ac.createBiquadFilter(); ambFilter.type="lowpass"; ambFilter.frequency.value=900; ambFilter.connect(ambGain);
    const len=Math.floor(ac.sampleRate*2); const b=ac.createBuffer(1,len,ac.sampleRate); const d=b.getChannelData(0);
    let last=0; for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.2; } // brownish noise
    ambSrc=ac.createBufferSource(); ambSrc.buffer=b; ambSrc.loop=true; ambSrc.connect(ambFilter); ambSrc.start();
    ambDroneGain=ac.createGain(); ambDroneGain.gain.value=0.0; ambDroneGain.connect(ambGain);
    ambDrone=ac.createOscillator(); ambDrone.type="sine"; ambDrone.frequency.value=55; ambDrone.connect(ambDroneGain); ambDrone.start();
    ambDrone2=ac.createOscillator(); ambDrone2.type="sine"; ambDrone2.frequency.value=55*1.01; ambDrone2.connect(ambDroneGain); ambDrone2.start();
  }catch(e){} }

  // per-biome ambience: cutoff (timbre), level (how present), drone freq+gain (mood).
  const AMB={
    town:  { f:1400, lvl:0.00, df:0,  dg:0.00 },
    forest:{ f:2800, lvl:0.10, df:0,  dg:0.00 },   // airy leaf-rustle hiss, no drone
    ruins: { f:850,  lvl:0.13, df:70, dg:0.05 },   // hollow stone + low drone
    caves: { f:520,  lvl:0.15, df:55, dg:0.06 },   // deep cavern rumble
    arena: { f:780,  lvl:0.11, df:65, dg:0.04 },
    abyss: { f:320,  lvl:0.18, df:44, dg:0.08 },   // ominous deep void
    frost: { f:3600, lvl:0.13, df:0,  dg:0.00 },   // high airy wind
    swamp: { f:640,  lvl:0.14, df:58, dg:0.05 },   // CAS-441: thick humid murk + low bog drone
    field: { f:1600, lvl:0.06, df:0,  dg:0.00 },
  };
  function ambCfg(){ return AMB[ambZone]||AMB.town; }
  function curAmbLevel(){ return ambCfg().lvl; }
  function setAmbient(zone){ if(zone===ambZone) return; ambZone=zone; if(!ac||!enabled) return; const a=ambCfg(), now=ac.currentTime;
    if(ambFilter) ambFilter.frequency.setTargetAtTime(a.f, now, 0.5);
    if(ambGain)   ambGain.gain.setTargetAtTime(a.lvl*vol.music*AMB_BASE, now, 0.8);
    if(ambDroneGain) ambDroneGain.gain.setTargetAtTime(a.dg, now, 0.8);
    if(a.df>0 && ambDrone){ ambDrone.frequency.setTargetAtTime(a.df, now, 0.6); ambDrone2.frequency.setTargetAtTime(a.df*1.01, now, 0.6); }
  }

  // ----------------------------- tone helpers ------------------------------
  function tone(freq,dur,type,gain,dest,slideTo){ if(!ac||!enabled)return; const o=ac.createOscillator(),g=ac.createGain();
    o.type=type||"square"; o.frequency.setValueAtTime(freq,ac.currentTime); if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo,ac.currentTime+dur);
    g.gain.setValueAtTime(0.0001,ac.currentTime); g.gain.exponentialRampToValueAtTime(gain||0.3,ac.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur); o.connect(g); g.connect(dest||sfxGain); o.start(); o.stop(ac.currentTime+dur+0.02); }
  function noise(dur,gain,filterF,dest){ if(!ac||!enabled)return; const n=ac.createBufferSource(); const b=ac.createBuffer(1,Math.max(1,ac.sampleRate*dur),ac.sampleRate); const d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1); n.buffer=b; const f=ac.createBiquadFilter(); f.type="lowpass"; f.frequency.value=filterF||1200;
    const g=ac.createGain(); g.gain.setValueAtTime(gain||0.3,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur); n.connect(f); f.connect(g); g.connect(dest||sfxGain); n.start(); n.stop(ac.currentTime+dur); }
  function semis(s){ return Math.pow(2,s/12); }

  // ----------------------------- music tracks ------------------------------
  // Each track is data: a lead sequence, a bass line, a root pitch and a tempo
  // (ms/step). Boss = lower, slower, heavier (octave bass + a kick) → "épica".
  const TRACKS={
    town:  { lead:[0,4,7,11,7,4,2,4],  bass:[0,0,5,5,7,7,4,4],   root:196, tempo:230, kick:false, leadType:"square",   leadG:0.18 },
    combat:{ lead:[0,3,7,10,12,10,7,3], bass:[0,0,7,7,3,3,5,5],   root:147, tempo:180, kick:false, leadType:"square",   leadG:0.18 },
    boss:  { lead:[0,3,5,7,10,7,5,3],   bass:[0,-5,0,3,0,-5,0,3], root:110, tempo:150, kick:true,  leadType:"sawtooth", leadG:0.16 },
  };
  function musicTick(){ if(!ac||!enabled||!curTrack) return; const tk=TRACKS[curTrack]; if(!tk) return;
    const i=step%tk.lead.length;
    tone(tk.root*semis(tk.lead[i]),0.18,tk.leadType,tk.leadG,musicGain);
    if(step%2===0) tone(tk.root/2*semis(tk.bass[i]),0.24,"triangle",0.14,musicGain);
    if(tk.kick && step%2===0){ noise(0.10,0.18,180,musicGain); } // boss heartbeat kick
    if(curTrack==="boss" && step%4===0) tone(tk.root*2*semis(tk.lead[i]),0.16,"square",0.06,musicGain); // octave shimmer
    step++; }
  // self-rescheduling loop so tempo follows the live track (a fixed setInterval
  // can't change cadence on a town→boss switch).
  function schedule(){ if(musicTimer) clearTimeout(musicTimer); const tk=TRACKS[curTrack]; const tempo=tk?tk.tempo:230;
    musicTimer=setTimeout(()=>{ if(running){ musicTick(); schedule(); } }, tempo); }
  // Crossfade: duck the music bus to near-silent, swap the track + reset the
  // phrase, then swell back. The audible dip masks the seam → no hard cut.
  function playMusic(track){ if(curTrack===track) return;
    // first track (nothing playing yet) OR no audio graph → swap instantly, no fade.
    if(!ac||!enabled||!curTrack){ curTrack=track; step=0; if(running) schedule();
      if(ac&&enabled&&musicGain) musicGain.gain.setTargetAtTime(vol.music*MUSIC_BASE, ac.currentTime, 0.18); return; }
    const tgt=vol.music*MUSIC_BASE, now=ac.currentTime;
    musicGain.gain.cancelScheduledValues(now); musicGain.gain.setTargetAtTime(0.0001, now, 0.06);
    setTimeout(()=>{ curTrack=track; step=0; schedule(); if(ac&&musicGain) musicGain.gain.setTargetAtTime(tgt, ac.currentTime, 0.18); }, 220); }

  function start(){ init(); if(!started){ started=true; } if(!running){ running=true; schedule(); } applyMix(); }

  // ----------------------------- sfx ---------------------------------------
  const sfx={
    sword(){ noise(0.09,0.25,2600); tone(440,0.08,"square",0.18,sfxGain,180); },
    roll(){ noise(0.18,0.18,800); },
    cast(){ tone(330,0.18,"sawtooth",0.16,sfxGain,760); },
    fire(){ tone(180,0.22,"sawtooth",0.2,sfxGain,520); noise(0.18,0.12,900); },
    heal(){ tone(523,0.14,"sine",0.18,sfxGain,784); tone(659,0.18,"sine",0.16,sfxGain,988); },
    rune(){ tone(294,0.26,"sawtooth",0.2,sfxGain,588); tone(392,0.26,"square",0.12,sfxGain); },
    hurt(){ tone(160,0.16,"square",0.22,sfxGain,90); noise(0.1,0.18,500); },
    ehurt(){ tone(220,0.07,"square",0.12,sfxGain,140); },
    // CAS-127: a crit reads as a brighter, layered "ching" distinct from a normal hit.
    crit(){ tone(880,0.10,"square",0.20,sfxGain,1500); tone(1320,0.09,"triangle",0.14,sfxGain); noise(0.05,0.14,3200); },
    coin(){ tone(880,0.06,"square",0.16,sfxGain); tone(1320,0.08,"square",0.14,sfxGain); },
    pickup(){ tone(660,0.07,"triangle",0.16,sfxGain,990); },
    // CAS-131: loot pickup PITCHED by rarity rank (0 common → 4 legendary) — a
    // rarer drop chimes brighter; epics+ add a sparkle. Reuses pickup if rank 0.
    loot(rank){ rank=rank|0; const r=660*(1+rank*0.14); tone(r,0.08,"triangle",0.16,sfxGain,r*1.5);
      if(rank>=2){ setTimeout(()=>tone(r*1.5,0.10,"square",0.12,sfxGain,r*2.2),60); }
      if(rank>=3){ setTimeout(()=>tone(r*2.0,0.12,"square",0.10,sfxGain),130); } },
    levelup(){ [0,4,7,12].forEach((n,i)=>setTimeout(()=>tone(330*semis(n),0.18,"square",0.2,sfxGain),i*90)); },
    death(){ [0,-2,-4,-7,-12].forEach((n,i)=>setTimeout(()=>tone(330*semis(n),0.3,"sawtooth",0.2,sfxGain),i*140)); },
    boss(){ tone(80,0.5,"sawtooth",0.3,sfxGain,60); noise(0.4,0.2,400); },
    buy(){ tone(740,0.07,"square",0.16,sfxGain); tone(990,0.09,"square",0.14,sfxGain); },
    deny(){ tone(180,0.12,"square",0.16,sfxGain,120); },
    // CAS-192: consumable "power-up" chime — a quick rising triad distinct from buy/heal
    // so quaffing a furia/antídoto reads instantly by ear.
    buff(){ [0,4,7].forEach((n,i)=>setTimeout(()=>tone(392*semis(n),0.12,"square",0.16,sfxGain,392*semis(n)*1.6),i*55)); },
    // CAS-131: missing feel SFX -------------------------------------------------
    // soft, low footfall (varied so it doesn't machine-gun); kept quiet on its own bus level.
    step(){ noise(0.05,0.05,420+Math.random()*180); },
    // light UI blips — open rises, close falls.
    uiOpen(){ tone(520,0.06,"square",0.12,sfxGain,760); },
    uiClose(){ tone(520,0.06,"square",0.10,sfxGain,300); },
    // CAS-447: completion pass — the sim already guarded-called click() (draft
    // reroll/banish, curse offer) but it never existed, so those actions were
    // silent; mobDie gives every regular kill an audible finisher (boss/champion
    // keep the heavier sfx.boss on their own paths); bossAtk is the heavy swing
    // whoosh when a boss/champion COMMITS a strike — an audible telegraph that
    // fires even on a dodged hit, so the miss still reads.
    click(){ tone(700,0.045,"square",0.11,sfxGain,520); },
    mobDie(){ noise(0.12,0.14,650); tone(196,0.14,"triangle",0.13,sfxGain,90); },
    bossAtk(){ noise(0.16,0.20,420); tone(130,0.16,"sawtooth",0.14,sfxGain,70); },
  };

  // ----------------------------- mix controls ------------------------------
  function setMaster(v){ vol.master=clamp01(v); applyMix(); persist(); }
  function setMusic(v){ vol.music=clamp01(v); applyMix(); persist(); }
  function setSfx(v){ vol.sfx=clamp01(v); applyMix(); persist(); }
  function setMuted(v){ muted=!!v; applyMix(); persist(); }
  function toggleMute(){ setMuted(!muted); }
  // back-compat: the old single ON/OFF toggle maps to mute.
  function setEnabled(v){ setMuted(!v); }

  // dev/QA introspection (read-only view of the audio state machine)
  function state(){ return { track:curTrack, ambZone, master:vol.master, music:vol.music, sfx:vol.sfx, muted, enabled, started, running }; }

  return { init,resume,start,playMusic,setAmbient,sfx,
    setMaster,setMusic,setSfx,setMuted,toggleMute,setEnabled,state,
    get master(){return vol.master;}, get music(){return vol.music;}, get sfxVol(){return vol.sfx;},
    get muted(){return muted;}, get on(){return !muted;} };
})();
