# Deploy runbook — gh-pages is the repeatable player-URL path (CAS-193)

**Status:** OPERATIONAL. gh-pages is the canonical, repeatable deploy path for the
interim player URL while Higgsfield `deploy_game` is in outage. It does **not**
depend on `deploy_game` recovering.

- **Interim player URL (live, QA-green):** https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
- **Canonical fallback (stale during outage):** https://tender-bridge-504.higgsfield.gg
- **Internals / one-time activation:** see `docs/backup-static-host-CAS-177.md`.

## The repeatable recipe — ship a new QA-green build

Run these from a **clean working tree at the commit you want live** (the gate
below refuses a dirty tree / stale stamp, so WIP never leaks):

```sh
npm run stamp            # 1. recompute version.json build-id from tracked files
git add version.json && git commit  # 2. commit the stamp (+ your shipped changes)
npm run backup-host-publish          # 3. export HEAD bundle -> force-push gh-pages
# 4. verify live == committed HEAD (see note on dirty trees below):
npm run deploy-verify -- --base=https://carlosdcastrosa-cloud.github.io/Mithralda-Online
```

`backup-host-publish` is **idempotent**: it exports `git archive HEAD` (tracked
files only — no untracked WIP), adds `.nojekyll`, and force-pushes the servable
tree to the `gh-pages` branch. GitHub Pages auto-rebuilds within ~1 min. Re-run
it any time to re-ship the current HEAD.

## Verifying the deploy

`deploy-verify --base=<url>` asserts the live build-id and that every shipped
file is byte-identical to the local tree.

> **Gotcha — dirty working tree gives a FALSE failure.** Both `deploy-verify`
> and the build-id hash the *working-tree bytes* of tracked files (file list
> from git, content from disk). If a concurrent agent has uncommitted edits to
> shipped files, the gate reports "bundle drift" / "stale build-id" even when
> the *live* host is correctly serving committed HEAD. To verify live integrity
> independently of a dirty tree, compare live bytes against committed HEAD:
>
> ```sh
> B=https://carlosdcastrosa-cloud.github.io/Mithralda-Online
> for f in game.js daily.js sim/sim.js version.json; do
>   h=$(git show HEAD:"$f" | sha256sum | cut -c1-12)
>   l=$(curl -s "$B/$f" | sha256sum | cut -c1-12)
>   [ "$h" = "$l" ] && echo "$f ✔" || echo "$f ✖ MISMATCH"
> done
> ```

## Current state (2026-06-29, CAS-193)

- Live build `112f63203e18` == committed master HEAD (verified byte-identical
  across all shipped runtime files incl. `daily.js`, `version.json`).
- This superset **already contains** the daily-return-loop (`daily.js`, commit
  `fa1c06a`, the gameplay the issue flagged as deploy-blocked). It is live and
  QA-green (CAS-183 pass #20, 28/28). The older standalone build `9178e57a1130`
  is therefore superseded — no separate publish needed.
- Fork-neutral content (single-player, no online/balance) ships through this
  path without waiting on any board fork decision.

## Next build (Stage-1 deepening, e.g. CAS-192 consumables)

Same recipe: stamp → commit → `npm run backup-host-publish` → verify → hand to
QA. No `deploy_game` dependency. When `deploy_game` recovers, also re-ship to the
canonical Higgsfield URL (its own track) — the two are decoupled.
