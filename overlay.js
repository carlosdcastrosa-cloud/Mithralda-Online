// ===========================================================================
// overlay.js — opt-in retention telemetry overlay (CAS-279). QA-facing read-out.
//
// WHY: the CAS-129 board fork (deepen Stage-1 vs start Stage-2/MMO) hinges on
// retention EVIDENCE. analytics.js (CAS-132/134) already accumulates the numbers
// in localStorage; this is the compact, opt-in HUD that lets QA READ those numbers
// off a live playtest without opening the analytics.html dashboard in a second tab.
//
// DESIGN — a pure READ-ONLY presentation layer, default OFF:
//   • Toggled with F9 (a non-game key) — and the choice persists in its OWN
//     localStorage key so it never touches the save or the accessibility prefs.
//     Default hidden ⇒ zero change to the shipped player experience (CAS-265 pattern).
//   • It NEVER touches the sim, balance, tunables or input handling. It only READS
//     analytics.report()/daily.dump() and paints a fixed DOM panel. Reversible by
//     deleting this file + its one toggle key.
//   • Refreshes on a light interval ONLY while visible (no per-frame work, no work
//     at all when hidden) — keeps the 60fps game loop untouched.
// ===========================================================================
import { analytics } from "./analytics.js";
import { daily } from "./daily.js";

export const overlay = (()=>{
  const KEY="mithralda.overlay.v1"; // own key — never the save / settings blob
  const REFRESH_MS=600;
  let el=null, on=false, timer=0, booted=false;

  function readPref(){ try{ return localStorage.getItem(KEY)==="1"; }catch(e){ return false; } }
  function writePref(v){ try{ localStorage.setItem(KEY, v?"1":"0"); }catch(e){} }

  function ensureEl(){
    if(el || typeof document==="undefined") return el;
    el=document.createElement("div");
    el.id="telemetry";
    el.setAttribute("aria-hidden","true"); // decorative QA HUD, not part of the a11y tree
    el.style.cssText=[
      "position:fixed","right:6px","top:6px","z-index:60","display:none",
      "max-width:46vw","max-height:94vh","overflow:auto","pointer-events:none",
      "font:11px/1.45 'MithraldaPixel',monospace","color:#cfe8d0",
      "background:rgba(8,11,16,0.88)","border:1px solid #2c5a3a","border-radius:6px",
      "padding:8px 10px","white-space:pre","letter-spacing:0.2px",
      "text-shadow:0 1px 0 #000"
    ].join(";");
    document.body.appendChild(el);
    return el;
  }

  // ---- formatting helpers (all pure reads) -------------------------------
  function pct(a,b){ return b? Math.round((a/b)*100) : 0; }
  function ev(events,name){ const e=events&&events[name]; return e?(e.n|0):0; }

  function snapshot(){
    let r={}; try{ r=analytics.report()||{}; }catch(e){ r={}; }
    const ret=r.retention||{}, gp=r.gameplay||{lifetime:{},session:{}}, events=r.events||{};
    const L=gp.lifetime||{}, S=gp.session||{};
    let dly=null; try{ dly=daily.dump?daily.dump():null; }catch(e){}
    // RECAP "one more run" click-through: retries / recaps shown.
    const recapShown=ev(events,"recap_shown"), recapRetry=ev(events,"recap_retry"), recapHub=ev(events,"recap_hub");
    // return-hook (CAS-134/243) trigger hits.
    const dailyReady=ev(events,"daily_contract_ready"), dailyClaim=ev(events,"daily_contract_claimed");
    const streakClaim=ev(events,"daily_streak_claimed"), streakMile=ev(events,"daily_streak_milestone");
    const lines=[];
    lines.push("◆ RETENTION TELEMETRY  (F9)");
    lines.push("  build "+((typeof window!=="undefined"&&window.__BUILD)||"?")+"   id "+String(ret.aid||"-").slice(0,10));
    lines.push("─ RETENTION ─────────────");
    lines.push("  1ª vez   : "+(ret.createdDay||"-")+"  ("+(ret.activeDays|0)+" días activos)");
    lines.push("  sesiones : "+(ret.sessions|0)+(ret.returning?"  (regresó)":"  (nuevo)"));
    lines.push("  D1 / D7  : "+(ret.d1?"sí":"no")+" / "+(ret.d7?"sí":"no"));
    lines.push("  juego tot: "+(ret.totalPlayMin|0)+" min");
    lines.push("─ ESTA SESIÓN ───────────");
    lines.push("  tiempo   : "+(S.sessionMin||0)+" min");
    lines.push("  rondas   : "+(S.runs|0)+"   muertes: "+(S.deaths|0));
    lines.push("  kills    : "+(S.kills|0)+"   kills/ronda: "+(S.killsPerRun||0));
    lines.push("  forja    : "+(S.forge|0)+" mejoras");
    lines.push("─ ACUMULADO ─────────────");
    lines.push("  rondas   : "+(L.runs|0)+"   rondas/ses: "+(L.runsPerSession||0));
    lines.push("  kills    : "+(L.kills|0)+"   kills/ronda: "+(L.killsPerRun||0));
    lines.push("  muertes  : "+(L.deaths|0)+"   forja: "+(L.forge|0));
    lines.push("─ GANCHO 'OTRA RONDA' ───");
    lines.push("  recap most: "+recapShown+"   otra ronda: "+recapRetry+" ("+pct(recapRetry,recapShown)+"%)");
    lines.push("  al pueblo : "+recapHub);
    lines.push("─ GANCHO DE REGRESO ─────");
    lines.push("  racha     : "+(dly?(dly.streak|0):"-")+" días"+(dly&&dly.comeback?"  (comeback)":""));
    lines.push("  contratos : listo "+dailyReady+" / cobrado "+dailyClaim);
    lines.push("  racha cobr: "+streakClaim+"   hito: "+streakMile);
    lines.push("─ EMBUDO ────────────────");
    for(const f of (r.funnel||[])){ lines.push("  "+(f.reached?"▣":"▢")+" "+pad(f.step,18)+" "+(f.n|0)+"  "+f.pctOfBoot+"%"); }
    return lines.join("\n");
  }
  function pad(s,n){ s=String(s); return s.length>=n?s:s+" ".repeat(n-s.length); }

  function paint(){ if(!on||!el) return; el.textContent=snapshot(); }

  function show(){ ensureEl(); if(!el) return; on=true; el.style.display="block"; paint();
    if(!timer) timer=setInterval(paint, REFRESH_MS); writePref(true); }
  function hide(){ on=false; if(el) el.style.display="none";
    if(timer){ clearInterval(timer); timer=0; } writePref(false); }
  function toggle(){ on?hide():show(); }

  // F9 toggle — captured at window level so it works in any scene. F9 is not a game
  // key, so this never collides with combat / menu input. Default OFF on first boot.
  function boot(){
    if(booted || typeof window==="undefined") return; booted=true;
    window.addEventListener("keydown",(e)=>{
      if(e.code==="F9" || e.key==="F9"){ e.preventDefault(); toggle(); }
    });
    // Restore a QA tester's previous choice so the overlay survives a reload mid-playtest.
    if(readPref()) show();
    // dev/QA hook — read the same snapshot text + the raw report headlessly.
    if(typeof window!=="undefined"){ window.__overlay={ show, hide, toggle, isOn:()=>on, text:snapshot, report:()=>{ try{ return analytics.report(); }catch(e){ return null; } } }; }
  }

  return { boot, show, hide, toggle, isOn:()=>on, KEY };
})();
