// ===========================================================================
// audio.js — procedural chiptune music + SFX (client-side effect sink).
// The simulation calls into this via the injected `audio` dependency; on a
// headless Stage-2 server it can be swapped for a no-op with the same surface.
// ===========================================================================
export const audio = (()=>{
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
    // CAS-127: a crit reads as a brighter, layered "ching" distinct from a normal hit —
    // a high square slide + a metallic upper harmonic + a short bright noise transient.
    crit(){ tone(880,0.10,"square",0.20,sfxGain,1500); tone(1320,0.09,"triangle",0.14,sfxGain); noise(0.05,0.14,3200); },
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
