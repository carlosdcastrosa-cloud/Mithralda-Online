# CAS-284 — Remote Telemetry Sink: Board Brief (spend + privacy decision)

**Status:** SCOPE-ONLY. No build change, no deploy, no data collected. Asks the board to
approve (a) a small/free spend and (b) a privacy posture before we light the seam.
**Author:** CTO · **For:** CEO → board · **Build referenced:** live `6c0820eb57bb` (CAS-281 read-out).

---

## 1. Why this exists (the honest gap)

The Stage-1 loop is **validated as built**: RECAP "otra ronda" click-through 67%, return-hook
(4-day streak + daily contract) fires correctly, 60fps, 0 errors (CAS-281, QA-confirmed).

What we **cannot** do today is **quantify real cohort retention (D1/D7) across players.** Our
telemetry (`analytics.js` + the F9 `overlay.js` HUD) is **per-client `localStorage`**: it proves the
hooks fire and reports *this one browser's* numbers, but it never leaves the device. So every
playtester is a sample size of 1. To data-gate the next Stage-1 increment on *real* numbers, we need
the per-client signal to become a **cohort metric** — i.e. aggregate anonymous reports from many
browsers into one place we can read.

> **Correction to the issue framing (important):** the beacon seam lives in **`analytics.js`**, not
> `overlay.js`. `overlay.js` is the read-only QA HUD (default-OFF) and stays untouched. See §3.

---

## 2. Recommended option — cheapest credible path ($0, opt-in pilot)

**Recommendation: Cloudflare Worker collector + Workers KV/D1, fed by an explicit "join the
playtest" opt-in cohort.** This is the smallest thing that yields trustworthy D1/D7 while sidestepping
the EU consent-banner debate.

| Option | Cost | Effort | gh-pages fit | Notes |
|---|---|---|---|---|
| **A. Cloudflare Worker + KV/D1** ✅ | **$0** (free tier: 100k req/day, 100k KV writes/day) | ~0.5 day | ✅ just a URL + CORS | Accepts raw `sendBeacon` body (text/plain), parses JSON, appends row. Best fit. |
| B. Supabase (free Postgres + PostgREST) | $0 free tier | ~0.5 day | ⚠️ | PostgREST wants an `apikey` header; `sendBeacon` **can't set headers** → needs a thin proxy or edge fn anyway. Worker is simpler. |
| C. Google Apps Script → Sheet | $0 | ~1–2 hr | ✅ | Truly zero-infra throwaway pilot; crude, rate-limited by Google, fine for a first read. |
| D. Managed privacy analytics (Plausible/Umami Cloud) | ~$9–14/mo | ~0.5 day | ✅ | Cookieless, GDPR-friendly out of the box; offloads infra **and** compliance. Worth it if we don't want to own a Worker. |

**Capacity sanity:** ~3 beacons/session (pagehide/visibility) → 100k req/day ≈ **33k sessions/day**
headroom. Vastly above a vertical-slice playtest. No autoscaling cost risk inside free tier.

**Why opt-in pilot, not always-on for everyone:** see §4. An invited "join the playtest" cohort gives
us **consenting** users → clean D1/D7 with no consent-banner / GDPR ambiguity, at the cost of a smaller
n. For a vertical slice that tradeoff is correct.

---

## 3. Exact wiring of the seam (what's missing to turn it on)

The seam is **already built and dormant** — it's a one-line enable plus the endpoint. No balance,
gameplay, or render change. In `analytics.js`:

```js
const REMOTE = null;   // line 27 — set to the collector URL to enable
```

```js
function flush(){                                   // line 163
  if(!store) return;
  persist(Date.now());
  if(REMOTE){ try{ if(navigator&&navigator.sendBeacon)
    navigator.sendBeacon(REMOTE, JSON.stringify(reportBlob())); }catch(e){} }
}
function initFlush(){                                // already wired to lifecycle
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", ()=>{ if(hidden) flush(); });
}
```

**To light it, the only code delta is:**
1. Set `REMOTE` to the collector URL (1 line). *Recommend reading it from a build-time const or a
   tiny `telemetry.config.js` so flipping it is a config change, not a logic change.*
2. **Gate it on opt-in** (recommended): `const REMOTE = optedIn() ? URL : null;` where `optedIn()`
   reads a dedicated consent key (own localStorage key, like the overlay's). This is the ~10 lines
   that make it ethical/legal-safe; without it the beacon is always-on for every player.
3. Stand up the Worker endpoint (CORS allow the gh-pages origin; accept text/plain; JSON-parse;
   append row; return 204).

**Payload already shipped by `reportBlob()`** — no new fields to add:
- `retention`: `aid` (anonymous random UUID, no PII), `createdDay`, `sessions`, `activeDays`,
  `days[]`, `returning`, **`d1`, `d7`**, `totalPlayMin`
- `events`: `recap_shown/recap_retry/recap_hub` (RECAP CTR), `daily_contract_ready/claimed`,
  `daily_streak_claimed/milestone` (return-hook hits)
- `gameplay`: lifetime + session kills/deaths/runs/forge + `runsPerSession`, `killsPerRun`
- `funnel`: boot → onboarding → first hunt → first boss → first outcome
- `sessionsLog`: last 50 session rows (length/timestamps) → session_len + return visits

That's exactly the metric set the issue asks for: session_len, runs/session, RECAP CTR, return-hook
hits, return visits. **Nothing else is or would be sent.**

---

## 4. Privacy posture + risks

**What we send:** anonymous aggregate counters + a random pseudonymous `aid`. **What we never send:**
names, email, inputs/keystrokes, IP (the collector must **not** log it), precise geo, device
fingerprint, or any save/account data. There is none of that in the blob.

**The real privacy decisions for the board:**

1. **Consent model — the key call.** The F9 HUD being default-OFF does **not** make the beacon
   opt-in; flipping `REMOTE` makes telemetry **always-on for every player**. The random `aid` is a
   persistent pseudonymous "online identifier" → under GDPR it's personal-data-lite even with no
   name. **Recommendation: explicit opt-in pilot cohort** (a "help us by sharing anonymous play
   stats?" toggle, default OFF, honored by §3-step-2). Cleanest legally; gives consenting D1/D7.
   - *Alternative if the board wants max n:* always-on **aggregate-only** with a short retention
     window + a visible privacy note + a deletion path. Heavier compliance lift.

2. **Retention window:** store ≤90 days, aggregate, then purge. Matches our 90-day active-day bound.

3. **Risks & mitigations:**
   - *Open-endpoint abuse / flood:* `sendBeacon` endpoint is unauthenticated by nature. Mitigate in
     the Worker: cap body size (e.g. 8 KB), basic per-IP rate-limit (Worker rate-limiting / Turnstile
     if needed), drop malformed bodies, sample if volume spikes.
   - *Cost-if-scales:* free tier caps protect us; set a billing alert at $0 so we can never silently
     spill into paid. At slice scale we're 100× under the cap.
   - *GDPR-lite:* opt-in cohort + no IP + aggregate + deletion path keeps us defensible without a
     full cookie-consent platform. If we later go always-on at scale, revisit with a proper notice.
   - *Data integrity:* `sendBeacon` is best-effort (can drop on hard crash) and the `aid` resets if a
     user clears storage or uses a fresh browser → modest under-count of returning users. Acceptable
     for a directional D1/D7; flag it in any read-out (same caveat class as CAS-281).

---

## 5. Is a sink even the right move? (alternatives considered)

- **Cheaper-than-a-sink:** for a *first* directional read, **Option C (Apps Script → Sheet)** or a
  managed cookieless analytics (Option D) needs zero infra ownership. If the board just wants "is D1
  north of X?", D or C answers it fastest.
- **No-sink alternative:** we *could* keep validating qualitatively (moderated playtests, the F9 HUD
  read live per tester). That's what CAS-281 already did — it proves hooks fire but **can't** give
  cohort D1/D7. So if the decision genuinely needs cohort retention numbers, a sink (or managed
  analytics) is required; there's no honest per-client substitute.

**CTO recommendation:** approve **Option A (Cloudflare Worker, $0) behind an explicit opt-in pilot
cohort.** Smallest spend, cleanest privacy, real D1/D7, fully reversible (set `REMOTE=null`).

---

## 6. Decision the board owns

1. **Spend:** approve $0 free-tier (Option A) — or ~$9–14/mo (Option D) if we prefer managed
   compliance. *(No always-on infra is added until this is approved.)*
2. **Privacy/consent:** opt-in pilot cohort (recommended) vs always-on aggregate-only.
3. On approval → CTO files a build issue to (a) stand up the endpoint, (b) set `REMOTE` + opt-in
   gate, (c) QA soak-safe verify, (d) deploy. **Until then nothing ships and no data is collected.**
