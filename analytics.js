// ===========================================================================
// analytics.js — privacy-light retention + funnel instrumentation (CAS-132).
//
// WHY: the strategic gate the CTO took to the board ("validate Stage-1 retention
// before committing to Stage-2/MMO", CAS-129) needs to be MEASURABLE. This module
// is the smallest honest way to measure it: anonymous, client-side, no PII, no new
// infra, fully reversible (delete this file + its one localStorage key).
//
// DESIGN — a pure OBSERVER sink, exactly like audio.js:
//   • It NEVER mutates the deterministic sim. game.js calls analytics.tick(dt,G)
//     once per sim step; we only READ G to detect funnel transitions (mirroring the
//     scene-transition observer already in game.js). Zero balance / gameplay touch,
//     Stage-2-safe (a server build swaps this for a real sink with the same surface).
//   • Storage is ONE localStorage key (privacy-light): an anonymous id + aggregate
//     counters/timestamps. No names, no inputs, no IP, nothing personal. Degrades
//     silently in private mode / quota failure — the game runs regardless.
//   • REMOTE SINK is OFF by default (REMOTE=null). Client-only localStorage can only
//     report THIS browser's user; cross-user cohort retention would need a remote
//     sink — left as a one-line, board-approval-gated seam so we add NO always-on
//     infra now (per CAS-132 constraint). Read locally via analytics.html.
// ===========================================================================
export const analytics = (()=>{
  const KEY = "mithralda.analytics.v1";
  const STORE_V = 1;
  // OFF by default — no network, no infra. Set to a collector URL (and get board
  // sign-off) to additionally beacon the aggregate blob on flush. sendBeacon only.
  const REMOTE = null;
  const MAX_DAYS = 90;        // bound the distinct-day list (≈ a quarter of retention)
  const MAX_SESS_LOG = 50;    // bound the per-session log
  const PERSIST_EVERY = 5000; // ms between throttled writes during a session
  // Canonical funnel order (CAS-132): boot → onboarding → first hunt → first boss →
  // first outcome (death/victory). Kept here so the dashboard renders in step order.
  const FUNNEL = ["boot","onboarding_complete","first_hunt","first_boss","first_death","first_victory"];

  const day = (ts)=>{ const d=new Date(ts); // local calendar day "YYYY-MM-DD"
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const nextDay = (s)=>{ const [y,m,d]=s.split("-").map(Number); const t=new Date(y,m-1,d); t.setDate(t.getDate()+1); return day(t.getTime()); };
  function anonId(){
    try{ if(typeof crypto!=="undefined" && crypto.randomUUID) return "a-"+crypto.randomUUID(); }catch(e){}
    return "a-"+Math.random().toString(36).slice(2)+Date.now().toString(36);
  }

  let store=null;             // the persisted blob (loaded once at boot)
  let sessionStart=0, sessionMs=0, lastPersist=0, baseTotalMs=0;
  const markedThisSession=new Set(); // funnel steps already counted this session
  let booted=false;
  // CAS-279 — gameplay-engagement counters the retention overlay reads. Two scopes:
  //   • store.gameplay — lifetime aggregates (persisted), survive across sessions.
  //   • sess           — THIS session only (in-memory, reset every page load).
  // All filled by OBSERVING monotonic sim counters in tick() (kills/deaths) + the
  // forge interaction event(). Pure read of G — never mutates the sim. A "run" = a
  // life: the current run on first hero sighting, +1 on each death/respawn.
  const sess={ runs:0, kills:0, deaths:0, forge:0 };
  let lastKills=0, lastDeaths=0, runOpened=false;
  function bumpGameplay(field, by){ if(!store) return; if(!store.gameplay) store.gameplay={kills:0,deaths:0,runs:0,forge:0};
    store.gameplay[field]=(store.gameplay[field]|0)+by; sess[field]=(sess[field]|0)+by; }

  function read(){ try{ const raw=localStorage.getItem(KEY); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
  function write(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); return true; }catch(e){ return false; } }

  function fresh(now){
    return { v:STORE_V, aid:anonId(), createdTs:now, createdDay:day(now),
      sessions:0, days:[], lastDay:null, lastTs:now, totalPlayMs:0,
      funnel:{}, sessionsLog:[], events:{}, gameplay:{kills:0,deaths:0,runs:0,forge:0} };
  }

  // mark a funnel step reached. first-ever reach stamps the ts; n counts how many
  // SESSIONS reached it (rising-edge per session) for an engagement read.
  function mark(step){
    if(!store) return;
    const now=Date.now();
    let f=store.funnel[step]; if(!f){ f=store.funnel[step]={first:now,n:0}; }
    if(!markedThisSession.has(step)){ markedThisSession.add(step); f.n=(f.n||0)+1; }
  }

  // ----------------------------------------------------------------- boot ----
  // Called once at game boot (game.js). Loads/creates the store, opens a session,
  // updates the distinct-day list (the basis for D1 retention) and records boot.
  function boot(){
    if(booted) return; booted=true;
    const now=Date.now();
    store=read();
    if(!store || store.v!==STORE_V || !store.aid){ store=fresh(now); }
    if(!store.gameplay) store.gameplay={kills:0,deaths:0,runs:0,forge:0}; // CAS-279 backfill older stores
    const today=day(now);
    store.sessions=(store.sessions|0)+1;
    if(!store.days.includes(today)){ store.days.push(today); if(store.days.length>MAX_DAYS) store.days=store.days.slice(-MAX_DAYS); }
    store.lastDay=today; store.lastTs=now;
    sessionStart=now; sessionMs=0; lastPersist=now; baseTotalMs=store.totalPlayMs|0;
    mark("boot");
    // Backfill onboarding_complete for a returning player who already finished/skipped
    // the first-run tutorial in a prior session (CAS-128 marker), so the funnel is honest
    // across sessions even though G.tut only exists during the run that showed it.
    try{ if(localStorage.getItem("mithralda.tut.v1")==="1") mark("onboarding_complete"); }catch(e){}
    write();
  }

  // CAS-134 — a generic, public retention EVENT counter. The daily return loop (daily.js)
  // beacons engagement events here (contract ready/claimed, streak claimed) so the metric
  // the CTO took to the board is MEASURABLE alongside D1/D7 — without adding a second sink.
  // {name:{n,first,last}} aggregate counters; no PII, no per-event payload. Persists lazily.
  function event(name){
    if(!store || typeof name!=="string") return;
    if(!store.events) store.events={};
    const now=Date.now(); let e=store.events[name];
    if(!e){ e=store.events[name]={ n:0, first:now }; }
    e.n=(e.n||0)+1; e.last=now;
    // CAS-279: a Forja upgrade is an engagement interaction — fold it into the gameplay
    // aggregates the overlay reads, alongside the generic event counter above.
    if(name==="forge_upgrade") bumpGameplay("forge", 1);
    write();
  }

  // ------------------------------------------------------- per-step observe ----
  // Called every sim step from game.js with (dtMs, G). READ-ONLY on G. Cheap: a
  // handful of property reads + already-reached short-circuits.
  function tick(dtMs, G){
    if(!store || !G) return;
    if(typeof dtMs==="number" && dtMs>0) sessionMs += dtMs;
    // funnel observation — each is a monotonic sim flag; mark() is idempotent.
    if(G.tut && G.tut.finished) mark("onboarding_complete");
    const H=G.hunts;
    if(H){ for(const z in H){ const h=H[z]; if(!h) continue;
      if((h.kills|0)>0 || h.cleared) mark("first_hunt");
      if(h.champ) mark("first_boss"); } }
    const hero=G.hero;
    if(hero){ if((hero.deaths|0)>0) mark("first_death");
      if(hero.stage1) mark("first_victory");
      // CAS-279 gameplay observation — read-only off the monotonic sim counters.
      // The first time a hero exists this session opens run #1 (covers an auto-resumed
      // save too). kills/deaths accumulate by positive delta; a counter going DOWN means
      // a new character was rolled (kills reset to 0) — we just resync, never go negative.
      if(!runOpened){ runOpened=true; bumpGameplay("runs",1); }
      const k=hero.kills|0;   if(k>lastKills) bumpGameplay("kills", k-lastKills); lastKills=k;
      const de=hero.deaths|0; if(de>lastDeaths){ const dd=de-lastDeaths; bumpGameplay("deaths",dd); bumpGameplay("runs",dd); } lastDeaths=de;
    }
    const now=Date.now();
    if(now-lastPersist>=PERSIST_EVERY){ lastPersist=now; persist(now); }
  }

  // Persist current session progress. totalPlayMs = (sum of prior sessions, captured
  // at boot) + this session's active ms, and the current session row is kept updated
  // in place — so a throttled write and the final flush converge on the same value.
  function persist(now){
    if(!store) return;
    now=now||Date.now();
    const dur=Math.max(0, sessionMs);                 // active (unpaused) ms this session
    store.totalPlayMs=baseTotalMs+dur;
    let row=store.sessionsLog[store.sessionsLog.length-1];
    const build=(typeof window!=="undefined" && window.__BUILD)||"";
    if(!row || row._k!==sessionStart){
      row={ _k:sessionStart, start:sessionStart, durMs:dur, build };
      store.sessionsLog.push(row);
      if(store.sessionsLog.length>MAX_SESS_LOG) store.sessionsLog=store.sessionsLog.slice(-MAX_SESS_LOG);
    } else { row.durMs=dur; }
    store.lastTs=now;
    write();
  }

  // -------------------------------------------------------------- flush ----
  // Tab hide / unload: finalize the session and (optionally) beacon. Idempotent —
  // safe to fire on visibilitychange and again on pagehide.
  function flush(){
    if(!store) return;
    persist(Date.now());
    if(REMOTE){ try{ if(navigator&&navigator.sendBeacon) navigator.sendBeacon(REMOTE, JSON.stringify(reportBlob())); }catch(e){} }
  }

  function initFlush(){
    if(typeof window==="undefined") return;
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    if(typeof document!=="undefined")
      document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") flush(); });
  }

  // --------------------------------------------------- derived read API ----
  // D1 retention (this user): did they return on the calendar day AFTER first session?
  function d1(){ if(!store) return false; const want=nextDay(store.createdDay); return store.days.includes(want); }
  // generic D-N return.
  function dn(n){ if(!store) return false; let s=store.createdDay; for(let i=0;i<n;i++) s=nextDay(s); return store.days.includes(s); }
  function funnel(){ // ordered steps with reach + per-session counts, plus % of boot
    if(!store) return [];
    const bootN=(store.funnel.boot&&store.funnel.boot.n)||0;
    return FUNNEL.map(step=>{ const f=store.funnel[step]||null;
      return { step, reached:!!f, n:f?f.n:0, firstTs:f?f.first:null,
        pctOfBoot: bootN? Math.round(((f?f.n:0)/bootN)*100):0 }; });
  }
  function retention(){ if(!store) return null;
    return { aid:store.aid, createdDay:store.createdDay, sessions:store.sessions,
      activeDays:store.days.length, days:store.days.slice(), returning:store.sessions>1,
      d1:d1(), d7:dn(7), totalPlayMin:Math.round((store.totalPlayMs|0)/60000),
      lastDay:store.lastDay }; }
  // CAS-279 — gameplay-engagement metrics for the retention overlay. Lifetime aggregates
  // (persisted, all-sessions) + this-session counters + a couple of derived rates the gate
  // summary wants (kills/run, runs/session). Pure read; no sim touch.
  function gameplay(){ const g=(store&&store.gameplay)||{kills:0,deaths:0,runs:0,forge:0};
    const lifeRuns=g.runs|0, sessRuns=sess.runs|0;
    return { lifetime:{ kills:g.kills|0, deaths:g.deaths|0, runs:lifeRuns, forge:g.forge|0,
        killsPerRun: lifeRuns? +((g.kills|0)/lifeRuns).toFixed(2) : 0,
        runsPerSession: (store&&store.sessions)? +((lifeRuns)/(store.sessions||1)).toFixed(2) : 0 },
      session:{ kills:sess.kills|0, deaths:sess.deaths|0, runs:sessRuns, forge:sess.forge|0,
        sessionMin:+((Math.max(0,sessionMs))/60000).toFixed(1),
        killsPerRun: sessRuns? +((sess.kills|0)/sessRuns).toFixed(2) : 0 } }; }
  // full snapshot for the dashboard / QA harness.
  function reportBlob(){ return { v:STORE_V, retention:retention(), funnel:funnel(),
    events:store?Object.assign({},store.events):{}, // CAS-134 retention events
    gameplay:gameplay(), // CAS-279 engagement counters
    sessionsLog:store?store.sessionsLog.slice():[] }; }
  function dump(){ return store?JSON.parse(JSON.stringify(store)):null; }

  // dev/QA hooks (read + simulate). Pure-local; safe to expose — it's the user's
  // own anonymous device data. Backdating helpers let QA assert D1 deterministically.
  const devApi={
    dump, report:reportBlob, funnel, retention, gameplay, flush,
    reset(){ try{ localStorage.removeItem(KEY); }catch(e){} store=null; booted=false; markedThisSession.clear(); },
    // QA: shift createdDay back N days so d1()/dn() can be exercised without waiting.
    _backdate(n){ if(!store) return; const t=Date.now()-n*86400000; store.createdTs=t; store.createdDay=day(t);
      if(!store.days.includes(store.createdDay)) store.days.unshift(store.createdDay); write(); },
    _markDay(s){ if(!store) return; if(!store.days.includes(s)) store.days.push(s); write(); },
  };

  return { boot, tick, event, flush, initFlush, dump, report:reportBlob, funnel, retention, gameplay, dev:devApi, KEY };
})();
