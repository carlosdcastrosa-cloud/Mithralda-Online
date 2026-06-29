// ===========================================================================
// daily.js — daily return loop (CAS-134): daily contracts + login streak.
//
// WHY: Stage-1 is feature-complete; the one fork-NEUTRAL way to move the metric the
// CTO took to the board (retention, CAS-129) is to give players a reason to come back
// each day. This module is that reason — and it is fully reversible (delete this file
// + its one localStorage key) so it commits the studio to NOTHING about the Stage-2
// fork. No online, no backend, no infra: pure client-side, single-player deepening.
//
// DESIGN — a pure OBSERVER + meta-progression controller, sibling to analytics.js /
// persist.js, so NO gameplay logic leaks into the deterministic sim:
//   • CONTRACTS are generated DETERMINISTICALLY from the calendar day (a date-seeded
//     xorshift): every device/reload on the same day sees the SAME 3 contracts, and a
//     new day rotates to a fresh set. Zero RNG touch on the sim stream.
//   • PROGRESS is observed read-only each tick by DELTA-counting the hero's monotonic
//     lifetime counters (h.kills / h.champKills) and watching hunt-zone clears — so it
//     survives reloads (progress lives in this module's store, accumulated from deltas)
//     and never double-counts. The sim is never mutated here except through the single
//     deliberate, idempotent reward seam applyMetaReward() (claim only) — Stage-2 safe
//     (a server build grants the same reward through the same surface).
//   • STREAK is a localStorage day-chain: consecutive calendar days bump it, a gap
//     resets it; today's streak reward is claimable once per day.
//   • Claims emit retention EVENTS into analytics.js so the loop is MEASURABLE (D1/D7).
// ===========================================================================
import { G, applyMetaReward, toast } from "./sim/sim.js";
import { analytics } from "./analytics.js";
import { STR } from "./strings.js";

export const daily = (()=>{
  const KEY = "mithralda.daily.v1";
  const STORE_V = 1;
  const PERSIST_EVERY = 4000;   // ms between throttled progress writes
  const STREAK_CYCLE = 7;       // streak reward escalates over a 7-day week then loops

  // --- calendar helpers (local day, mirrors analytics.js so D1/D7 line up) ----
  const fmtDay = (ts)=>{ const d=new Date(ts);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const nextDay = (s)=>{ const [y,m,d]=s.split("-").map(Number); const t=new Date(y,m-1,d); t.setDate(t.getDate()+1); return fmtDay(t.getTime()); };
  // Whole-day gap between two local day strings (b - a), calendar-correct across months.
  const dayDiff = (a,b)=>{ const [ay,am,ad]=a.split("-").map(Number); const [by,bm,bd]=b.split("-").map(Number);
    return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000); };
  // ms from now until the next local midnight (the contract/streak reset boundary).
  function msToReset(now){ const d=new Date(now); const t=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1,0,0,0,0); return Math.max(0, t.getTime()-now); }

  // QA can pin "today" without waiting for a real day to pass (see devApi._setDay).
  let dayOverride=null;
  function today(){ return dayOverride || fmtDay(Date.now()); }

  // --- date-seeded deterministic picker (NOT the sim RNG) --------------------
  function dayHash(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h>>>0; }
  function seededPick(seed){
    let st=(seed>>>0)||1;
    const next=()=>{ st^=st<<13; st^=st>>>17; st^=st<<5; st>>>=0; return st/4294967296; };
    const ri=(a,b)=>a+Math.floor(next()*(b-a+1));
    return { next, ri };
  }

  // Contract templates (data-driven). `obs` names the monotonic counter / zone the
  // observer reads; rewards scale with difficulty. Adding a contract is one row.
  const TEMPLATES = [
    { id:"slay_s", obs:"slay", titleKey:"slay", n:[12,18], gold:[55,85],  xp:[80,120] },
    { id:"slay_l", obs:"slay", titleKey:"slay", n:[24,32], gold:[100,150], xp:[150,210] },
    { id:"champ",  obs:"champion",            n:[1,2],  gold:[120,180], xp:[160,240] },
    { id:"clr_forest", obs:"clear", zone:"forest", n:[1,1], gold:[75,110],  xp:[100,150] },
    { id:"clr_ruins",  obs:"clear", zone:"ruins",  n:[1,1], gold:[95,135],  xp:[130,185] },
    { id:"clr_caves",  obs:"clear", zone:"caves",  n:[1,1], gold:[120,160], xp:[150,210] },
    { id:"clr_arena",  obs:"clear", zone:"arena",  n:[1,1], gold:[150,200], xp:[200,280] },
  ];
  const N_CONTRACTS = 3;

  // Build the day's contracts deterministically from its date. Same day → same set on
  // any device/reload; a new day → a fresh rotation. Picks distinct templates, biased to
  // avoid two of the same observation type so the day's goals feel varied.
  function genContracts(dayStr){
    const rng=seededPick(dayHash(dayStr));
    const pool=TEMPLATES.slice();
    // Fisher–Yates with the date-seeded stream (deterministic shuffle).
    for(let i=pool.length-1;i>0;i--){ const j=rng.ri(0,i); const t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
    const out=[]; const seenObs={};
    for(const tpl of pool){ if(out.length>=N_CONTRACTS) break;
      const o=tpl.obs; if((seenObs[o]||0)>=(o==="clear"?2:1)) continue; // ≤1 slay, ≤1 champ, ≤2 clears
      seenObs[o]=(seenObs[o]||0)+1;
      const need=rng.ri(tpl.n[0],tpl.n[1]);
      out.push({ id:tpl.id, obs:o, zone:tpl.zone||null, titleKey:tpl.titleKey||null,
        need, prog:0, done:false, claimed:false,
        gold:rng.ri(tpl.gold[0],tpl.gold[1]), xp:rng.ri(tpl.xp[0],tpl.xp[1]) });
    }
    // top up if the type caps left us short (rare) — relax the cap on a second pass
    for(const tpl of pool){ if(out.length>=N_CONTRACTS) break; if(out.some(c=>c.id===tpl.id)) continue;
      const need=rng.ri(tpl.n[0],tpl.n[1]);
      out.push({ id:tpl.id, obs:tpl.obs, zone:tpl.zone||null, titleKey:tpl.titleKey||null,
        need, prog:0, done:false, claimed:false,
        gold:rng.ri(tpl.gold[0],tpl.gold[1]), xp:rng.ri(tpl.xp[0],tpl.xp[1]) }); }
    return out;
  }

  // Streak reward escalates over the week then loops (CAS-243 return-hook). Each day's
  // reward grows with the cycle-day so consecutive returns pay off MORE the longer you
  // keep the chain; from day 3 it also drips Forja material `mena` (the CAS-237 sink),
  // escalating d3=1 … d7=5 so a full 7-day streak yields 1+2+3+4+5 = 15 mena — exactly
  // one gear piece forged to MÁX. Day 7 is the milestone: the mena spike + 2 potions.
  // Pure function of the streak count: deterministic, no RNG, Stage-2 portable.
  function streakReward(streak){ const c=((Math.max(1,streak)-1)%STREAK_CYCLE)+1;
    const milestone=c>=STREAK_CYCLE;
    return { gold:20+c*15, xp:30+c*20, mena:c>=3?(c-2):0, potHP:milestone?2:0,
      milestone, cycleDay:c }; }

  // --- store ----------------------------------------------------------------
  let store=null, lastPersist=0, booted=false;
  // session-local delta baselines for the monotonic hero counters (reset per page life)
  let baseKills=null, baseChamp=null;

  function read(){ try{ const raw=localStorage.getItem(KEY); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
  function write(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); return true; }catch(e){ return false; } }
  function fresh(dayStr){ return { v:STORE_V, day:dayStr, contracts:genContracts(dayStr),
    streak:1, lastLoginDay:dayStr, streakClaimedDay:null, comeback:false }; }

  // Roll the store to `dayStr`: regenerate contracts (rotation), advance/soften/break the
  // streak chain, and arm today's streak claim. Idempotent for the same day.
  //
  // CAS-243 comeback catch-up: a SINGLE missed day no longer hard-resets the streak — it
  // SOFTENS it (halve, floor, min 1) and flags `comeback` so the UI can reassure the
  // player. Returning the very next day after a slip keeps a long chain meaningful instead
  // of dropping it to 1; a gap of two or more missed days still resets (the chain is gone).
  function refreshDay(dayStr){
    if(!store){ store=fresh(dayStr); return true; }
    if(store.day===dayStr) return false;            // same day → nothing to roll
    const gap = store.lastLoginDay ? dayDiff(store.lastLoginDay, dayStr) : 1;
    store.comeback=false;
    if(gap===1) store.streak=(store.streak|0)+1;                       // consecutive → advance
    else if(gap===2){ store.streak=Math.max(1, Math.floor((store.streak|0)/2)); store.comeback=true; } // missed 1 → soften
    else store.streak=1;                                              // gap ≥3 days (or backwards) → reset
    store.lastLoginDay=dayStr;
    store.day=dayStr;
    store.contracts=genContracts(dayStr);           // fresh rotation, progress reset
    return true;
  }

  // ----------------------------------------------------------------- boot ----
  function boot(){ if(booted) return; booted=true;
    store=read();
    const t=today();
    if(!store || store.v!==STORE_V || !Array.isArray(store.contracts)){ store=fresh(t); }
    else { refreshDay(t); }
    write();
  }

  // ----------------------------------------------------- per-step observe ----
  // Called each sim step from game.js with the live state. READ-ONLY on G except the
  // claim seam (which only runs on explicit player action, never here). Cheap.
  function tick(){
    if(!store) return;
    const t=today();
    if(t!==store.day){ refreshDay(t); write(); }   // crossed midnight mid-session → roll
    const h=G&&G.hero; if(!h) return;
    if(baseKills===null){ baseKills=h.kills|0; baseChamp=h.champKills|0; }
    const dK=Math.max(0,(h.kills|0)-baseKills); baseKills=h.kills|0;
    const dC=Math.max(0,(h.champKills|0)-baseChamp); baseChamp=h.champKills|0;
    let dirty=false;
    for(const c of store.contracts){ if(c.done) continue;
      if(c.obs==="slay" && dK>0){ c.prog=Math.min(c.need,c.prog+dK); dirty=true; }
      else if(c.obs==="champion" && dC>0){ c.prog=Math.min(c.need,c.prog+dC); dirty=true; }
      else if(c.obs==="clear"){ const H=G.hunts&&G.hunts[c.zone]; if(H&&H.cleared&&c.prog<c.need){ c.prog=c.need; dirty=true; } }
      if(c.prog>=c.need && !c.done){ c.done=true; dirty=true; analytics.event("daily_contract_ready"); }
    }
    const now=Date.now();
    if(dirty || now-lastPersist>=PERSIST_EVERY){ lastPersist=now; write(); }
  }

  // ----------------------------------------------------------- claim seam ----
  // Player taps "Reclamar" on a completed contract → grant its reward ONCE. Idempotent:
  // re-claiming a claimed/unfinished contract is a no-op (with feedback). The ONLY write
  // into sim state this module makes — a deliberate meta-grant, not per-frame logic.
  function claim(id){ if(!store) return false;
    const c=store.contracts.find(x=>x.id===id); if(!c) return false;
    if(!c.done){ toast(STR.dailyNotDone); return false; }
    if(c.claimed){ toast(STR.dailyAlready); return false; }
    c.claimed=true; write();
    applyMetaReward({gold:c.gold, xp:c.xp});
    toast(STR.dailyClaimed(c.gold, c.xp));
    analytics.event("daily_contract_claimed");
    return true;
  }
  function streakClaimable(){ return !!store && store.streakClaimedDay!==store.day; }
  function claimStreak(){ if(!store) return false;
    if(!streakClaimable()){ toast(STR.dailyAlready); return false; }
    const r=streakReward(store.streak); store.streakClaimedDay=store.day; write();
    // CAS-243: streak rewards now also drip Forja material (mena) via the same seam.
    applyMetaReward({gold:r.gold, xp:r.xp, potHP:r.potHP, mats:r.mena});
    toast(r.milestone ? STR.dailyStreakMilestone(store.streak, r.gold, r.mena)
                      : STR.dailyStreakClaimed(store.streak, r.gold, r.mena));
    analytics.event(r.milestone ? "daily_streak_milestone" : "daily_streak_claimed");
    return true;
  }

  // ------------------------------------------------ read API for the UI -----
  // The bounty-board view model: today's contracts (+ progress / claim state), the
  // streak (+ today's reward / claim state), and the live reset countdown.
  function board(){ if(!store) return null;
    return {
      day:store.day,
      resetMs:msToReset(Date.now()),
      streak:{ n:store.streak|0, reward:streakReward(store.streak),
        next:streakReward((store.streak|0)+1),   // CAS-243: tomorrow's reward preview (the return hook)
        comeback:!!store.comeback, claimable:streakClaimable() },
      contracts:store.contracts.map(c=>({ id:c.id, obs:c.obs, zone:c.zone,
        title:contractTitle(c), prog:c.prog|0, need:c.need|0, done:!!c.done, claimed:!!c.claimed,
        gold:c.gold|0, xp:c.xp|0 })),
    };
  }
  function contractTitle(c){
    if(c.obs==="slay") return STR.dailySlay(c.need);
    if(c.obs==="champion") return STR.dailyChampion(c.need);
    if(c.obs==="clear") return STR.dailyClear(c.zone);
    return "Contrato";
  }
  function dump(){ return store?JSON.parse(JSON.stringify(store)):null; }
  function flush(){ if(store) write(); }
  function initFlush(){ if(typeof window==="undefined") return;
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    if(typeof document!=="undefined")
      document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") flush(); }); }

  // dev/QA hooks — pure-local, the user's own anonymous device data. Day override +
  // counter helpers let QA assert rotation / claim / streak deterministically.
  const devApi={ dump, board, claim, claimStreak, flush,
    reset(){ try{ localStorage.removeItem(KEY); }catch(e){} store=null; booted=false; baseKills=baseChamp=null; },
    // Pin "today" to a fixed day and roll the store to it (rotation / streak tests).
    _setDay(s){ dayOverride=s||null; if(s){ refreshDay(s); write(); } },
    // Force a streak chain (n consecutive days ending yesterday) so the next _setDay/boot
    // exercises the +1 / reset branch without waiting real days.
    _setStreak(n, lastLoginDay){ if(!store) store=fresh(today()); store.streak=n|0; if(lastLoginDay) store.lastLoginDay=lastLoginDay; write(); },
    _streakReward:streakReward,
  };

  return { boot, tick, flush, initFlush, board, claim, claimStreak, dump, dev:devApi, KEY };
})();
