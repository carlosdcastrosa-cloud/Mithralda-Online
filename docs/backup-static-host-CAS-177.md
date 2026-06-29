# CAS-177 — Backup static host spike

**Status:** spike complete, prototype green, go-live gated on board (CEO) OK.
**Date:** 2026-06-28 · **Owner:** CTO
**Non-destructive:** the live fixed URL `tender-bridge-504` is **not** touched.

## TL;DR

The game is 100% static files, so it can be served from a host we control. I
built and verified a **production-faithful backup host** locally: the real game
boots from it in **~120–160 ms** (desktop + mobile viewport), **0 errors**, with
**CAS-58-correct cache headers** and the stale-build invariant structurally
guaranteed. Configs for Cloudflare Pages / Netlify / nginx are committed and
ready. Go-live (a public staging URL and/or custom domain) needs the CEO's OK —
**that's the only thing left**, and it costs **$0** on a free tier (or
~**$10/yr** if we want a custom domain).

## Why — the SPOF is real and biting us right now

`deploy_game` (Higgsfield) is our **only** way to publish. It has gone fully
dark for 11h+ **twice** in the last day (memory `cas136-deploy-outage-recurrence`,
`cas154-stage1-queue-land`). Live proof while writing this:

| | build | files |
|--|--|--|
| live `tender-bridge-504` | `585a05e63d46` | 241 |
| master HEAD | `19051354562c` | 266 |

The live URL is **stranded ~25 files / many shipped features behind master**
(CAS-131 audio, CAS-132 analytics, CAS-134 daily, CAS-146/149/150 progression,
CAS-167/169 customization) purely because `deploy_game` is down. A backup host we
control would already be serving HEAD. **This is the SPOF, demonstrated.**

## What I built (this spike)

All committed, no public deploy:

- `tools/backup-host-policy.mjs` — single source of truth for the cache policy.
- `tools/backup-host-export.mjs` (`npm run backup-host-export`) — exports tracked
  HEAD only (à la `git archive`) to `deploy/backup-host/`, **gated** so it
  refuses to export a stale-stamped tree.
- `tools/backup-host-serve.mjs` (`npm run backup-host-serve`) — local static host
  applying the production header policy exactly.
- `tools/backup-host-verify.mjs` (`npm run backup-host-verify`) — boots the real
  game off the backup host and asserts boot + headers + cache invariant.
- `hosting/_headers`, `hosting/netlify.toml`, `hosting/nginx.conf`,
  `hosting/README.md` — drop-in configs for three host options, same policy.

## (b) Header + load verification — results

`npm run backup-host-verify` output (green):

```
✔ desktop boot to menu in 161ms (build=19051354562c)
✔ mobile (390x844) boot to menu in 123ms
✔ 0 page errors / failed requests across both loads
✔ version.json -> no-store
✔ index.html -> no-cache
✔ assets (/game.js) -> public, max-age=31536000, immutable
✔ every cacheable asset requested with ?v=<build> (no stale-build hole)
✔ build id consistent across loads: 19051354562c
✅ backup-host verify PASS
```

Screenshot of the menu served from the backup host:
`tools/cas177-backup-host-menu.png`.

### The cache policy (avoids the CAS-58 stale-build bug)

| Path | `Cache-Control` | Why |
|--|--|--|
| `version.json` | `no-store` | freshness lever — must hit net every boot |
| `*.html` | `no-cache` | revalidate so the cache-busting bootstrap reruns |
| everything else | `public, max-age=31536000, immutable` | always fetched with `?v=<build>` (a global content hash) → safe to cache hard → instant repeat loads |

This is **stricter than the current live host**, which serves `version.json`
with *no* cache header at all (verified live: no `cache-control` on the response).
The bootstrap's `cache:'no-store'` fetch saves us there today; on the backup host
we make it explicit at the header layer too, belt-and-suspenders. The
`immutable` class on versioned assets gives the backup host **better repeat-load
performance** than the current bare-headers host, at parity on first load.

## (c) Go-live plan + cost + reversibility

**Recommendation: Cloudflare Pages.** Free tier, free `*.pages.dev` subdomain,
global CDN, custom domain free (you pay only registration), `_headers` honored
natively, zero-build static upload, instant rollback.

### Phased go-live (each phase a board gate)

1. **Phase 0 — staging (free, no new public identity advertised).** `wrangler
   pages deploy deploy/backup-host` to a `*.pages.dev` URL. Not linked anywhere
   public. Run `npm run deploy-verify -- --base=<staging-url>` (the existing
   CAS-37 byte+behavior gate, repointed). **Cost: $0.** Reversible: delete the
   Pages project. *(Needs CEO OK because it is technically a public URL.)*
2. **Phase 1 — keep it warm as a hot standby.** Add the backup deploy as a step
   in the deploy recipe so it ships alongside (or instead of, during outages)
   `deploy_game`. The backup then always carries HEAD. **Cost: $0.**
3. **Phase 2 — custom domain (optional, board decision).** Point a domain we own
   (e.g. `mithralda.<tld>`) at the Pages project. Lets us flip the *canonical*
   URL off Higgsfield entirely if we ever choose to. **Cost: ~$10–12/yr** domain
   registration only; hosting stays free. Reversible: DNS revert.

### Cost summary

| Item | Cost |
|--|--|
| Cloudflare Pages / Netlify hosting | **$0** (free tier; bundle ~a few hundred KB) |
| `*.pages.dev` / `*.netlify.app` staging URL | **$0** |
| Custom domain (Phase 2, optional) | **~$10–12/yr** registration |
| Engineering to go live | ~30 min (configs + tooling already done here) |

### Reversibility / safety

- The live URL `tender-bridge-504` is **never** modified by any of this.
- The backup is additive; deleting the Pages project or reverting DNS fully
  undoes it with no impact on the primary.
- Same byte-identity + behavior gate (`deploy-verify`) guards the backup as the
  primary, so a backup deploy can't silently drift.

## Gates I need from the board (CEO)

1. **OK to stand up the free staging URL** (Phase 0) — no spend, but it is a
   public-ish URL / arguably a "new public identity," which the issue reserves
   for your call.
2. **OK (or not) to buy a custom domain** (~$10–12/yr, Phase 2) — board spend gate.

Until those are granted, this stays a spike: everything is ready, nothing is
published.

---

## CAS-180 — go-live execution (CEO-approved Phase 0 + Phase 1)

Host chosen: **GitHub Pages** (free, $0, repo already exists + authenticated)
instead of Cloudflare Pages, because CF Pages requires an interactive Cloudflare
login this environment does not have, whereas the GitHub remote is already
authenticated — so Pages is fully agent-drivable and unblocks the SPOF fix now.
CF Pages stays the documented option if header-level control is ever needed.

### What shipped

- **Base-path-relative bootstrap** (`index.html`, commit `35d1a24`): import-map
  keys are built from `BASE` (the document's directory) instead of the server
  root, so the SAME bundle runs at any host root. At root `BASE === "/"` →
  byte-identical to the old map (no behavior change on the live Higgsfield URL);
  under `/<repo>/` (a GitHub Pages project site) the `?v=<build>` cache-busting
  still resolves. Verified both ways:
  - `npm run backup-host-verify` → PASS (root, build `112f63203e18`).
  - `npm run cas180-subpath-verify` → PASS (served under `/Mithralda-Online/`,
    0 errors, every cacheable asset carries `?v=`).
- **Publish recipe** `npm run backup-host-publish` (`tools/backup-host-publish.mjs`):
  exports a fresh HEAD bundle (refuses a stale stamp) + adds `.nojekyll` + force-
  pushes it to the `gh-pages` branch of `origin`. **This is the Phase-1 "standby
  always carries HEAD" recipe** — re-run it after any deploy. Already run:
  `gh-pages` on origin carries HEAD `bc35ef8` / build `112f63203e18`.

### Cache headers on GitHub Pages (CAS-58)

GitHub Pages does not honor `_headers`, but CAS-58 freshness does **not** depend
on server headers here: `index.html` fetches `version.json?_=<ts>` with
`cache:'no-store'` (client-side), and every module/asset is fetched with
`?v=<build>`. So a returning player always re-reads the build id and a new build
changes every cache key — the stale-build hole is structurally closed regardless
of host headers. (Cloudflare Pages would additionally enforce it at the header
layer; not required for correctness.)

### One remaining step — enable Pages (repo-owner action, ~30 s, $0)

The installation token can push but lacks the **Pages:write** permission, so the
final activation toggle must be done once by the repo owner:

> GitHub → `carlosdcastrosa-cloud/Mithralda-Online` → **Settings → Pages** →
> **Source: "Deploy from a branch"** → Branch **`gh-pages`** / **`/ (root)`** → **Save**.

Within ~1 min the backup URL goes live at:

**https://carlosdcastrosa-cloud.github.io/Mithralda-Online/**

After it is live, verify with:
`npm run deploy-verify -- --base=https://carlosdcastrosa-cloud.github.io/Mithralda-Online`

The live Higgsfield URL `tender-bridge-504` is untouched throughout.
