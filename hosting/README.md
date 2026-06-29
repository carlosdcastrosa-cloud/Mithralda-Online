# Backup static host (CAS-177)

The Mithralda client is a pile of fixed-name static files (`index.html` +
ES modules + `assets/`), so it can be served from **any** static host. This
folder holds everything needed to stand up a **backup host** that removes the
single point of failure today: Higgsfield's `deploy_game` pipeline. When
`deploy_game` is down (it has been out for 11h+ twice — see memory
`cas136-deploy-outage-recurrence`, `cas154-stage1-queue-land`), we currently
cannot ship at all. A backup host we control fixes that.

> ⚠️ Going public (free subdomain **or** custom domain) is a **board gate**
> (CEO). This folder is the spike: configs + tooling, ready to deploy, nothing
> published. Do not deploy to a public URL without the CEO's OK.

## What's here

| File              | Purpose |
|-------------------|---------|
| `_headers`        | Cloudflare Pages / Netlify cache-header rules |
| `netlify.toml`    | Netlify config (publish dir + headers) |
| `nginx.conf`      | Self-hosted / VPS fallback server block |
| `../tools/backup-host-policy.mjs`  | Single source of truth for the header policy |
| `../tools/backup-host-export.mjs`  | `npm run backup-host-export` → `deploy/backup-host/` |
| `../tools/backup-host-serve.mjs`   | `npm run backup-host-serve` → local prod-faithful host |
| `../tools/backup-host-verify.mjs`  | `npm run backup-host-verify` → boot + header + cache proof |

## The one thing that matters: cache headers (CAS-58)

Higgsfield serves our modules with **no** cache headers; the game stays fresh
only because the `index.html` bootstrap fetches `version.json` with
`cache:'no-store'`, reads a content-hash `build` id, and rewrites every module +
asset URL to `?v=<build>`. A backup host must preserve that contract:

| Path            | `Cache-Control`                          | Why |
|-----------------|------------------------------------------|-----|
| `version.json`  | `no-store`                               | freshness lever — must hit the net every boot |
| `*.html`        | `no-cache`                               | revalidate so the bootstrap reruns |
| everything else | `public, max-age=31536000, immutable`    | always fetched with `?v=<build>`, so safe to cache hard → instant repeat loads |

All three config files above encode exactly this. `npm run backup-host-verify`
proves it end-to-end (boots the real game off the local host and asserts the
headers + that no cacheable asset is ever fetched without `?v=`).

## How to deploy to a backup host (when board-approved)

```sh
npm run stamp            # ensure version.json build == tree hash, commit it
npm run backup-host-export   # -> deploy/backup-host/ (tracked files only)
npm run backup-host-verify   # local proof: boots + correct headers
```

Then upload `deploy/backup-host/` to the chosen host:

- **Cloudflare Pages** (recommended): `npx wrangler pages deploy deploy/backup-host`
  (the `_headers` file is read automatically). Free tier, free `*.pages.dev`
  subdomain, free custom domain (you pay only domain registration).
- **Netlify**: `npx netlify deploy --dir=deploy/backup-host --prod` with
  `netlify.toml` at repo root. Free tier + free `*.netlify.app`.
- **nginx/VPS**: copy contents to `root`, install `nginx.conf`, reload.

After deploy, verify the live backup URL the same way the primary is verified:

```sh
npm run deploy-verify -- --base=https://<backup-url>
```

This is the existing byte-identity + behavior gate (CAS-37) pointed at the
backup host instead of `tender-bridge-504`.
