# Godot Migration — Feasibility & Plan (CAS-174 / parent CAS-172)

**Author:** CTO · **Date:** 2026-06-28 · **Phase 1 — NON-DESTRUCTIVE: viability + plan only.**
No production build is touched. The live JS game stays intact. Any Godot prototype lives in a
separate folder/branch and deploys (if ever) to a **new** `game_id` (new URL), never the live one.

> **Board ask (CAS-172):** "Higgsfield está trayendo muchos problemas → migremos todo a Godot,
> no rompas nada." This document answers whether Godot actually fixes that problem, what it costs,
> and what I recommend instead.

---

## TL;DR — Recommendation

**Do NOT do a full Godot migration to solve the Higgsfield problem. It does not fix the actual
pain point and it regresses our core promise.**

1. The current pain is the **`deploy_game` outage** (deploy/hosting), not art generation.
2. A Godot HTML5 export still ships through the **exact same `deploy_game` Higgsfield pipeline**.
   So migrating to Godot **does not remove the deploy dependency at all** — we'd be down right now
   either way. It would only reduce reliance on Higgsfield's *art-generation* tools, which we
   barely use anymore (we already have real, committed assets).
3. Godot web (WASM) **regresses the "abrir el link y estar dentro" promise**: a 15–30 MB WASM
   runtime + boot splash + compile time replaces our near-instant ~6 KB-HTML / tiny-JS load, and
   Godot web on mobile is historically weak.
4. It is a **from-scratch rewrite, not a port** (~6,700 LOC of mature, tuned JS across 20 files +
   re-tuning combat *feel* and balance to parity): realistically **8–14 weeks** with a **Godot
   engineer we do not currently have**.

**Better path:** keep the JS engine; if deploy resilience is the goal, the leverage is a
**backup static-hosting path + custom domain** for the *same static bundle* (our game is already
plain static files), which is days of work, not months — and survives `deploy_game` outages.
If the board wants Godot for *strategic* reasons (future 3D, editor tooling, hiring pool), that is a
separate bet; de-risk it with a **thin vertical-slice prototype on a new URL** to measure real
bundle size / load time / mobile perf **before** committing to full parity. Decision belongs to the
board on CAS-172.

---

## 1. Does Godot export to HTML5/WASM viably for this top-down 2D game?

**Technically yes — Godot 4 exports a working HTML5/WASM build for 2D — but with real friction:**

| Dimension | Current JS game | Godot 4 web export |
|---|---|---|
| First-load payload | `index.html` 6 KB + ~6.7 K LOC tiny ES modules; assets stream on demand | Engine `.wasm` ~15–30 MB + `.pck` (game+assets) + `.js` glue + `.audio.worklet.js` |
| Time to interactive | ~instant (HTML parses, canvas draws first frame) | Download full wasm → **WASM compile** → boot splash/progress bar → *then* first frame. Seconds on desktop, **tens of seconds on slow mobile** |
| Mobile browser | Works today (we playtest mobile at 60 fps) | Godot 4 web on mobile is historically fragile: memory pressure, audio quirks, lower perf |
| 60 fps 2D | Yes (canvas2d, pooled FX) | Achievable for simple 2D, but the WASM/GC + canvas-in-wasm path is heavier per frame |

**Bundle/load verdict:** This **directly conflicts with the cero-fricción mission promise.** A 2D
top-down game does not need a general-purpose engine runtime shipped to every first-time visitor.
Godot's value (physics, 3D, scene editor) is mostly irrelevant to what we built; we'd pay its
download/boot cost for little gameplay benefit.

**Two hard platform gotchas (decisive):**

- **HTTP headers are not ours.** Our own `index.html` documents that *"Higgsfield serves our
  fixed-name modules with NO cache headers"* — we do **not** control response headers. Godot 4's
  **multi-threaded** web export requires `SharedArrayBuffer`, which requires **COOP/COEP** headers
  we cannot set. → We'd be forced onto Godot's **single-threaded** export (supported, fine for 2D,
  but no thread pool — and a constraint to verify, not assume).
- **25 MiB-per-file deploy bound.** `build-game.md` states a **25 MiB-per-asset bound**. Godot 4's
  engine `.wasm` can approach or exceed that uncompressed in some builds. The export's largest file
  (`.wasm`) being ≤ 25 MiB is a **hard gate to verify on a real export**, not assume.

## 2. CRITICAL — How would a Godot export be deployed? Does it escape Higgsfield?

**This is the crux, and the answer kills the stated rationale.**

I confirmed the pipeline format via `get_game_creation_instructions` + `build-game.md` + the
`deploy_game` tool schema:

- `deploy_game` takes a **ZIP** with `logic.js` (or `server.js`) **+ `index.html` at the root**;
  *"everything else ships as assets."* A Godot export (`index.html` + `.wasm` + `.pck` + `.js`) is
  just static files, so it **could be packaged** (keep our existing stub `logic.js`, drop Godot's
  output beside it, fix relative paths). **Format-compatibility: plausible** (modulo the 25 MiB and
  relative-path checks above).
- **BUT the deploy path is identical.** There is exactly one deploy mechanism available to us:
  `deploy_game`, which **is** the Higgsfield pipeline. The thing that is **down right now**
  (CAS-136 / CAS-154: `deploy_game` outage, ~11 h+) is the **deploy/hosting** service — and a Godot
  build would go through that **same** service. The fixed URL is bound to the Higgsfield-issued
  `game_id`/slug; that binding is unchanged by the engine.

**Conclusion (answer to the board's real question):**

> **Migrating to Godot does NOT solve the DEPLOY problem.** It only reduces dependency on
> Higgsfield's art-GENERATION tools — which is not where the outages hurt us, and which we already
> largely don't need (assets are made and committed). If the goal is "stop being blocked by
> Higgsfield deploy outages," **changing the game engine addresses the wrong layer.**

## 3. Effort estimate to rewrite each subsystem in GDScript (feature + feel parity)

This is a **rewrite, not a translation**: Godot's paradigm (scene tree, nodes, signals, GDScript,
engine-owned render/input/audio) is fundamentally different from our data-driven canvas/JS. Every
subsystem changes shape.

| Subsystem (current file, LOC) | Godot rewrite | Rough effort |
|---|---|---|
| `sim/sim.js` (1,911) — combat, AI, status, archetypes, telegraphs, mastery | GDScript sim or node logic; re-tune all combat *feel* | 3–4 wk |
| `render/render.js` (1,418) + `sprites.js` (330) + `customize.js` (149) | **Discarded** — re-authored as Godot scenes/nodes/AnimatedSprite2D; re-import every asset through Godot's import pipeline | 2–3 wk |
| `sim/config.js`/`gear.js`/`talents.js`/`world.js`/`rng.js`/`math.js` (~1,055) — data-driven content (zones, enemies, gear, affixes, talents) | Port data → Godot Resources/`.tres`; re-verify determinism | 1.5–2 wk |
| `input.js` (294) + `game.js` (170) | Godot Input map (keyboard/touch/gamepad) + main loop | ~1 wk |
| `audio.js` (174) | Godot AudioStreamPlayer graph + re-import audio | ~1 wk |
| `persist.js` (86) + save format | Godot `user://` / localStorage bridge; migrate save schema | ~0.5 wk |
| `daily.js` (217), `analytics.js` (189), `strings.js` (268) | Re-implement daily/seed, analytics sink, i18n strings | 1–1.5 wk |
| Integration, parity QA, balance/feel re-tuning, load/mobile gate | full-game pass | 2–3 wk |

**Total: ~8–14 weeks of focused work for one engineer**, and the highest-risk part is **not**
features — it's re-earning the *feel* (telegraph readability, juice, i-frames, balance matrices)
that took us many tuned iterations in JS. **Staffing gap:** our engineers are JS, not Godot;
we'd need to hire/retrain a Godot engineer (board-cost decision).

## 4. Risks to the live game + fixed URL; QA / parity plan

- **Live game / URL risk in Phase 1: zero, if we stay disciplined.** The fixed URL is tied to the
  live `game_id`. Rule: **never** call `deploy_game` with the live `game_id` pointing at a Godot
  build until full parity + board sign-off. Any prototype deploys to a **new `game_id` (new URL)**.
  Prototype code lives in a separate folder/branch; production JS files are untouched.
- **Cutover risk (if a migration ever ships):** replacing the live `game_id` with a worse build
  swaps the public game at the same URL. Mitigated by the parity gate below + keeping the JS zip as
  an instant rollback artifact.
- **QA / parity gate (Godot build must pass ALL before cutover):**
  1. Feature parity checklist — every subsystem behavior in §3 reproduced.
  2. **Load gate:** first-visit time-to-interactive within the cero-fricción budget on a mid mobile
     device; `.wasm` ≤ 25 MiB per file (deploy bound).
  3. Perf gate: ≥ 60 fps worst-case scene, desktop + mobile.
  4. Feel gate: telegraph/i-frame readability, juice, balance matrices match or beat live.
  5. Determinism + save-migration: existing players' saves survive or migrate cleanly.
  6. Single-threaded export confirmed working under Higgsfield's no-custom-header serving.

## 5. Recommendation — total vs phased vs alternative

1. **Total migration now — NOT recommended.** High cost (8–14 wk + new hire), regresses load-time
   and mobile, and — critically — **does not fix the deploy outage** that motivated the request.

2. **Alternative (recommended first): reduce Higgsfield *deploy* dependency without changing
   engine.** Our game is already a folder of static files. The real leverage against `deploy_game`
   outages is a **second static-hosting path for the identical bundle + a custom domain** we own,
   so the fixed URL is no longer hostage to Higgsfield's slug. This is **days, not months**, keeps
   the instant-load promise, and directly targets the actual pain. (Custom domain / second host is
   a product+infra decision for CEO/board — flagged on CAS-172.) Transient outages are also already
   covered by the monitor + ready-to-ship recipe (CAS-144 / CAS-145).

3. **Phased Godot — only if the board wants Godot for STRATEGIC reasons** (future 3D, editor
   tooling, hiring pool) — *not* as an outage fix. De-risk before committing: build a **thin
   vertical-slice prototype** (one zone, one class, movement + combat) in a separate folder, deploy
   to a **new URL**, and **measure** real bundle size, time-to-interactive, and mobile perf against
   the gates in §4. Only then decide on full parity. This spends ~1 week to buy a real decision
   instead of a multi-month gamble.

**Decision owner:** the board / CEO, on **CAS-172**. Per the issue, I am **not** starting the full
rewrite until that direction is approved.
