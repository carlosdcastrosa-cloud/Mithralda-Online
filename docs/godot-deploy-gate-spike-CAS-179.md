# CAS-179 Task #1 — Deploy-gate spike (the make-or-break gate, BEFORE any rewrite)

**Owner:** Game Engineer · **Date:** 2026-06-29 · Parent: CAS-179 (Godot Phase 2) / CAS-172 (board-approved)

> **Why this runs first.** CAS-179 Task #1 is explicit: *prove a Godot WASM bundle actually
> deploys & loads under the 25 MiB bound + no-custom-header serving. If the bound is enforced on
> the uncompressed `.wasm`, this is a **blocker — STOP and escalate to CTO before spending
> rewrite effort.*** We do NOT start the ~8–14 wk GDScript rewrite until this gate is green.

---

## The hard numbers

| Artifact | bytes | MiB | vs 25 MiB bound (26,214,400 B) |
|---|---|---|---|
| Stock Godot 4.3 web template `index.wasm` (single-threaded, **zero art**) | 35,376,909 | 33.74 | **+9,162,509 B — 35% OVER** |
| 25 MiB per-asset deploy bound (`build-game.md` §2/§6) | 26,214,400 | 25.00 | — |

The `.pck` (game+assets) was ~7 KB only because the prototype has no art; the real game's
**~27 MB of assets load on top**. The single largest *file* — the engine `.wasm` — already
busts the per-file bound on its own.

## Why the bound is (almost certainly) enforced on the RAW `.wasm`

- `build-game.md` calls it a **"25 MiB-per-asset bound"** — a per-*file* limit on the bytes you
  ship, i.e. the stored/served file, not its gzip transfer size.
- **We do not control response headers.** Our own `index.html` documents Higgsfield serves our
  modules with *no custom headers*; we cannot rely on the host transferring `.wasm` gzip-encoded
  to "fit" a raw-byte limit. (Godot's gzip is 7.61 MiB, but that only helps transfer, not a
  stored-file bound.)
- Cross-check: the **backup static host** (CAS-177, Cloudflare Pages) also enforces a **25 MiB
  per-file** limit. So a >25 MiB single `.wasm` is broadly rejected — *changing the deploy host
  does NOT dodge this.* The size fix is mandatory regardless of where we deploy.

**Conclusion so far:** the stock engine **fails the gate**. The migration is only viable if we
can ship a `.wasm` ≤ 25 MiB raw.

## The one viable mitigation — a size-stripped custom engine build

Godot's official web templates are built `optimize=speed` and ship the full engine (3D,
navigation, GridMap, CSG, advanced text-server, WebRTC/WebSocket, OpenXR…) — none of which a
top-down 2D ARPG needs. A **custom source build** with `optimize=size lto=full production=yes`
and those modules disabled can cut the `.wasm` substantially (community stripped 2D-only builds
land roughly ~18–25 MiB raw — *borderline*, not guaranteed).

### Env friction found (and worked around)
The agent environment has **no `scons`, no `emcc`/emsdk, no root** (`apt` blocked) and was even
**missing the `xz` binary**, so emsdk could not unpack its toolchain. Worked around with a
Python-`lzma`-backed `xz` shim (`~/.local/bin/xz`); emsdk 3.1.62 then installs. Build script:
`godot/build-stripped-wasm.sh` (pinned emscripten 3.1.62 + Godot 4.3-stable source, module
strips above). **This is itself a finding:** producing migration builds needs a provisioned
toolchain, not the bare agent env.

### Decision rule (drives the whole Phase 2 go/no-go)
- **`.wasm` ≤ 25 MiB raw →** gate is *plausibly* passable. Proceed to decompose the rewrite
  tracks — but real green still requires a live `deploy_game` (or CAS-177 host) verify once the
  outage clears, plus the load/feel/perf gates in the feasibility doc §4.
- **`.wasm` still > 25 MiB raw →** Godot-web is **not viable** under our hosting constraints.
  This is the issue's explicit STOP condition → escalate to CTO/board to reconsider (stay on the
  tuned JS engine + backup-host path, or change hosting strategy).

## Second blocker, independent of size: the deploy pipeline is DOWN
`deploy_game` is in outage (ReqIDs `78738cf8`/`24944aa8`, CAS-136/CAS-154). Even a perfectly
sized bundle **cannot be deploy-verified right now**. Migration does not fix this — Godot ships
through the *same* `deploy_game` pipeline. The live cutover additionally requires board sign-off
(never repoint the live `game_id` without it).

## RESULT — the size mitigation FAILS the gate (definitive)

I built the size-stripped engine headless (`godot/build-stripped-wasm.sh`, emscripten 3.1.62 +
Godot 4.3-stable) with **every lever a top-down 2D ARPG can pull**:

- `threads=no` — the single-threaded export we are forced onto (no COOP/COEP) — also the smaller variant
- `optimize=size production=no`
- **12 modules stripped**: navigation, gridmap, csg, raycast, multiplayer, webrtc, websocket,
  openxr, camera, text_server_adv (→ fb fallback), deprecated APIs

| Build | `.wasm` raw bytes | MiB | vs 25 MiB bound |
|---|---|---|---|
| Stock 4.3 web template (threaded, optimize=speed) | 35,376,909 | 33.74 | +35% |
| **This spike — single-threaded, optimize=size, 12 modules stripped** | **30,723,222** | **29.30** | **+4,508,822 B (+18%) — STILL OVER** |

**The one remaining lever does not save it.** Full LTO (`lto=full`) is the only further size
knob (~10–15% typical). It **OOM-kills on our 8 GB build box** — `wasm-ld` received `SIGKILL`
during the link (confirmed twice). Even *if* it ran, 29.30 MiB × 0.85–0.90 ≈ **24.9–26.4 MiB**:
best case it squeaks *marginally* under, worst case still over — a fragile target we cannot even
produce here, before adding a single byte of game code.

### And the asset `.pck` busts the same bound independently
The bound is **per-file**. Godot packs all game assets into one `index.pck`; our real game is
**~27 MB of assets → a >25 MiB `.pck`**, a *second* per-file violation. Fixing it needs asset
splitting / streaming work that does not exist today.

## Verdict → BLOCKER, escalated to CTO/board (issue Task #1 STOP condition)

A stripped, single-threaded, size-optimized Godot 4.3 engine `.wasm` is **29.30 MiB — over the
hard 25 MiB per-file deploy bound** that applies on **both** the Higgsfield `deploy_game`
pipeline **and** the CAS-177 Cloudflare Pages backup host. The migration cannot deploy under our
current hosting constraints. Per Task #1 — *"if the bound is enforced on the uncompressed
`.wasm`, this is a blocker — STOP and escalate to CTO before spending rewrite effort"* — I am
**not** starting the ~8–14 wk rewrite. Rewrite-track sub-issues are deliberately NOT created.

**Decision required from CTO/board (one of):**
1. **STOP Godot-web migration** — it cannot meet the 25 MiB/file hosting bound; stay on the
   tuned JS engine + backup-host path (CAS-177). *(Engineer recommendation.)*
2. **Authorize a bound-breaking infra spike FIRST** (prerequisite to any rewrite): a host with
   no 25 MiB/file limit and our own domain, and/or WASM split/streaming, and/or a provisioned
   build box that can run full-LTO + maximal module strips to chase a sub-25 MiB `.wasm`.
   Only if that proves out does the GDScript rewrite become worth starting.
3. Proceed with the rewrite accepting it currently has **no viable deploy path** *(not recommended)*.

Independently, `deploy_game` is still in outage (ReqIDs `78738cf8`/`24944aa8`) so even a
hypothetically-sized bundle can't be live-verified right now.

**Reproduce:** `bash godot/build-stripped-wasm.sh` (env needs the `xz` shim + SCons wheel noted above; result line `RESULT: FAIL … 30,723,222 bytes`).
