// ===========================================================================
// bestiary.js — Bestiary / Codex collection meta-goal (CAS-386).
//
// WHY: Stage-1's core loop (mobs, bosses, guaranteed gear, daily contracts, boon
// draft, directed hunts) is deep, but there is no LONG-HORIZON goal that ties the
// whole roster together and gives a reason to keep hunting past today's contract.
// The Bestiary is that goal: one entry per mob/boss type, a lifetime kill count,
// and per-type MASTERY TIERS that pay a one-time meta-reward as you fill them in.
//
// DESIGN — a pure OBSERVER + meta-progression controller, an exact sibling of
// daily.js / analytics.js, so NO gameplay logic leaks into the deterministic sim:
//   • COUNTS are READ (never written) from the hero's already-persisted lifetime
//     tally G.hero.killsByType (landed by CAS-375). The Bestiary adds ZERO new
//     counters and never touches the sim except through the single deliberate,
//     idempotent reward seam applyMetaReward() — the SAME surface daily.js uses,
//     and only on an explicit player CLAIM (never per-frame). Stage-2 portable.
//   • CLAIMED-TIER state lives in this module's OWN localStorage key (never the
//     save / settings / analytics blob), so it needs NO SAVE_VERSION bump and is
//     fully reversible (delete this file + its one key). Device-global exactly like
//     daily.js's streak store; a reward is earned once per device per tier.
//   • TIERS are data-driven (a threshold table): adding a mob or retuning a tier is
//     one row. NO new currency, NO new economy, NO spawn/XP/gear/difficulty touch —
//     the reward flows through applyMetaReward's existing gold/xp/mats paths.
// ===========================================================================
import { G, applyMetaReward, toast } from "./sim/sim.js";
import { ETPL } from "./sim/config.js";
import { analytics } from "./analytics.js";
import { STR } from "./strings.js";

export const bestiary = (()=>{
  const KEY = "mithralda.bestiary.v1";  // own key — never the save / settings / analytics blob
  const STORE_V = 1;

  // ------------------------------------------------------------------ roster ---
  // One row per HUNTABLE type (the ETPL keys the killsByType counter can hold).
  // `boss` picks the sparse-spawn threshold/reward band (bosses are rare → lower
  // tiers pay more). `tiers` may override the defaults per-entry. Order = display
  // order (early game → deep zones → bosses). Neutrals (adv) are excluded: they are
  // never counted (killEnemy skips tpl.neutral) so they can never be "hunted".
  const DEF_TIERS  = [ {id:"seen",n:1}, {id:"hunted",n:25}, {id:"mastered",n:100} ];
  const BOSS_TIERS = [ {id:"seen",n:1}, {id:"hunted",n:5},  {id:"mastered",n:20}  ];
  const ROSTER = [
    "rat","wolf","bat","skeleton","spearman","orc","bandit","moose",
    "mage","wraith","charger","summoner","healer","volatile","revenant",
    "quillback","demon","wendigo",
    "golem","dragon",
  ];

  // Tier reward — a one-time collection bonus per tier, granted through the EXISTING
  // applyMetaReward seam (gold / xp, + Forja `mena` at Mastered). Bosses pay ~2×.
  // Pure data, deterministic, no RNG. NOT a spawn/XP/gear curve change (guardrail).
  const TIER_REWARD = {
    seen:     { gold:15,  xp:20 },
    hunted:   { gold:60,  xp:90 },
    mastered: { gold:150, xp:220, mats:5 },
  };
  function tierReward(type, tierId){
    const base=TIER_REWARD[tierId]||{}; const boss=isBoss(type)?2:1;
    return { gold:(base.gold||0)*boss, xp:(base.xp||0)*boss, mats:(base.mats||0)*boss };
  }

  function isBoss(type){ const t=ETPL[type]; return !!(t&&t.boss); }
  function tiersFor(type){ return isBoss(type)?BOSS_TIERS:DEF_TIERS; }
  function killCount(type){ const h=G&&G.hero; return (h&&h.killsByType&&(h.killsByType[type]|0))||0; }

  // ------------------------------------------------------------------- store ---
  let store=null, booted=false;
  function read(){ try{ const raw=localStorage.getItem(KEY); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
  function write(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); return true; }catch(e){ return false; } }
  function fresh(){ return { v:STORE_V, claimed:{} }; }
  function boot(){ if(booted) return; booted=true;
    store=read();
    if(!store || store.v!==STORE_V || typeof store.claimed!=="object" || !store.claimed) store=fresh();
    write();
  }
  function isClaimed(type,tierId){ const c=store&&store.claimed[type]; return !!(c&&c[tierId]); }

  // ------------------------------------------------------------- claim seam ---
  // Player claims a REACHED-but-unclaimed tier → grant its reward ONCE. Idempotent:
  // re-claiming a claimed tier, or one whose threshold isn't met yet, is a no-op with
  // feedback. This is the ONLY write into sim state this module makes (a deliberate
  // meta-grant on explicit action, never per-frame) — the SAME seam daily.js uses.
  function claim(type, tierId){ if(!store) return false;
    const tier=tiersFor(type).find(t=>t.id===tierId); if(!tier) return false;
    if(killCount(type) < tier.n){ toast(STR.bestiaryLocked); return false; }
    if(isClaimed(type,tierId)){ toast(STR.dailyAlready); return false; }
    (store.claimed[type]||(store.claimed[type]={}))[tierId]=true; write();
    const r=tierReward(type,tierId);
    applyMetaReward(r);
    toast(STR.bestiaryClaimed(STR.mobName(type), STR.bestiaryTier(tierId), r.gold, r.xp));
    analytics.event("bestiary_tier_claimed");
    return true;
  }
  // The next tier that is reached but not yet claimed (drives Enter/tap "Reclamar").
  function nextClaimable(type){ const n=killCount(type);
    for(const t of tiersFor(type)){ if(n>=t.n && !isClaimed(type,t.id)) return t.id; }
    return null;
  }
  function claimNext(type){ const id=nextClaimable(type); if(!id){ toast(STR.bestiaryNothing); return false; } return claim(type,id); }

  // -------------------------------------------------- read API for the UI -----
  // The codex view model: every roster entry with its live count, per-tier state,
  // and whether a reward is claimable. Also a rollup for the header (discovered N/total).
  function entry(type){ const n=killCount(type), tiers=tiersFor(type);
    const seen=n>=tiers[0].n;
    const ts=tiers.map(t=>({ id:t.id, label:STR.bestiaryTier(t.id), need:t.n,
      reached:n>=t.n, claimed:isClaimed(type,t.id) }));
    // current tier rank achieved (0..tiers.length) and the next threshold to chase
    let rank=0; for(const t of tiers) if(n>=t.n) rank++;
    const next = rank<tiers.length ? tiers[rank] : null;
    return { type, sprite:(ETPL[type]&&ETPL[type].sprite)||type, boss:isBoss(type),
      name: seen?STR.mobName(type):"???", seen, count:n,
      tiers:ts, rank, nextNeed: next?next.n:null,
      claimable: !!nextClaimable(type) };
  }
  function board(){ if(!store) return null;
    const entries=ROSTER.map(entry);
    const discovered=entries.filter(e=>e.seen).length;
    const claimable=entries.filter(e=>e.claimable).length;
    return { entries, total:entries.length, discovered, claimable };
  }
  function dump(){ return store?JSON.parse(JSON.stringify(store)):null; }

  // dev/QA hooks — pure-local, the user's own device data. Lets QA claim + read
  // deterministically and reset between runs without a real save wipe.
  const devApi={ dump, board, entry, claim, claimNext, nextClaimable, killCount,
    reset(){ try{ localStorage.removeItem(KEY); }catch(e){} store=null; booted=false; boot(); },
    _roster:()=>ROSTER.slice(), _tiers:tiersFor, _reward:tierReward };

  return { boot, board, entry, claim, claimNext, nextClaimable, dump, dev:devApi, KEY };
})();
