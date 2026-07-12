# CAS-2225 — Door open/close + interior-warp mechanic (code-only, DARK)

**Parent:** CAS-2186 (open-world Thais rebuild) · **Lane:** Gameplay Evolution · **Ships:** DARK (`DOORS_INTERIORS.enabled:false`)

The **door open/close + interior-warp MECHANIC** off the door-stubs placed in City Batch-1/Batch-2
(`kind:"door"` threshold portals). Code-only — **not** art-gated. The Thais interior tileset (PixelLab,
budget approval a28b841f) dresses it later; here we build the working mechanic behind existing tiles.

## Server-authority-ready state model (Stage-2 lens)

- **Door state is SHARED WORLD STATE**, not client-only truth. `G.doors` maps a **stable, position-derived
  id** `"door:tx,ty"` → `open:bool`. A Stage-2 server owns this map; nearby clients read it and render the
  same door state. Toggled **only** by the `interact` intent → deterministic, replay-safe, **0 RNG draws**.
  The id is derived from tile coordinates (not an array index or pointer), so it is stable across clients,
  reloads and rebuilds — the property a networked authority needs to sync a door to N observers.
- **Deterministic + save-neutral.** No feature code draws from the seeded RNG stream (`srand ON==OFF`), and
  `G.doors` is transient run-state — reset CLOSED on every new/loaded run, **never serialized** (save-neutral).
  The world build mutates *terrain* (carves interior rooms) but never the RNG stream, so the srand fingerprint
  is identical ON vs OFF.

## Interior = instance (concurrency model, documented per acceptance)

The interior is a **small walled room carved into the unused ocean margin of the tiled world** (cols beyond
the proc-world stamp, in the oldlands band) — unreachable on foot, reached **only by warp**. This mirrors the
established caldera "self-contained region reached only by a portal" precedent, so it reuses the existing
renderer + collision with zero new subsystems.

**2+ player behavior (design, for Stage-2 netcode):**
- The carved room is an **instance TEMPLATE** for a house, not a shared overworld cell. Entering resolves to
  an instance keyed by **(houseId, partyId)** — so party A and party B entering the *same* house get **distinct**
  room instances and never see/collide with each other; members of one party share their instance.
- Stage-1 is single-player: exactly one player, one party ⇒ the resolver collapses to **the one carved room**.
  Because entry is a pure function of `(houseId, instanceKey)`, adding the server-side per-party keying later
  is additive — no client rewrite. Door open/closed remains the *exterior* shared-world state (all players at
  the street see the same door); the *interior* is the instanced space behind it.
- Exit warps back to the **exact origin threshold** (`door.outX/outY`), so re-entry is idempotent and there is
  no soft-lock regardless of how many players cycle in/out.

## Interaction loop

1. Doors start **CLOSED** (`startOpen:false`) → the threshold tile is **solid** (blocks). Reuses the placed
   stubs; the doorway is cleared of stray oldlands scatter *collision* (deco kept) so an OPEN door is passable.
2. **Interact** (E / the existing interact key) near a door **toggles** open/closed (sfx + toast). Closed =
   solid collision; open = walkable — collision matches state via a single check in `solidBlocked`.
3. **Walk across an OPEN threshold** → warp into the interior instance (placed just inside the exit).
4. **Step on the interior exit tile** → warp back to the exact origin threshold (placed just outside).
   A short post-warp cooldown (`warpCooldown`) debounces the tile you land on so you never insta-re-trigger.

## Files / seams

- `sim/config.js` — `DOORS_INTERIORS` flag (DARK). All geometry + tuning is data here.
- `sim/world.js` (`buildTiledWorld`) — ON only: promotes `kind:"door"` stubs to interactive doors, carves one
  interior room per door into the ocean margin, wires `doorAt`/`exitAt` tile maps + the `doors` record list,
  clears doorway collision. OFF ⇒ block skipped ⇒ terr/wallSet/props byte-identical.
- `sim/sim.js` — `doorOpen`/`toggleDoor`/`warpToInterior`/`warpToWorld`/`maybeDoorWarp`; a closed-door branch
  in `solidBlocked`; threshold check after hero movement; `G.doors` reset on run start; dev harness hooks.
- `render/render.js` — procedural door slab (closed=wooden panel, open=dark doorway) at ground level. No art dep.
- `strings.js` — door open/close + enter/leave interior toasts.
- `game.js` — exposes the door hooks on `window.__dev` for QA OBSERVABLE.

## DARK guarantee

`DOORS_INTERIORS.enabled:false` ⇒ world.js carves nothing + creates no door records (stubs keep their
"coming soon" toast), sim.js runs zero door/warp/collision code, render draws no slabs ⇒ **a run is
byte-identical to a build without the feature**. `srand ON==OFF`. CEO Gate byte-verifies + flips config-only.

## Verification

- `tools/cas2225-doors-test.mjs` — world-build layer, 9/9: OFF byte-identical + srand ON==OFF (0 RNG draws),
  ON carves interiors, geometry (room hollow walkable, wall ring solid, exit open, warp-isolated), deterministic.
- `tools/cas2225-runtime-test.mjs` — drives the REAL sim (8/8): closed=solid, interact opens→walkable, toggle
  closes→solid, threshold warp IN, interior walkable (no soft-lock), exit warp OUT to origin threshold.
- `tools/cas2225-shot.mjs` — served-build screenshots (flag temporarily flipped): open door + interior room,
  **zero page errors**. → `tools/cas2225-open-door.png`, `tools/cas2225-interior.png`.
- `npm run determinism` + `npm run smoke` pass with the flag OFF (default): 60fps, 0 page errors, no regression.

## Not in scope

PixelLab Thais interior tileset (art) — tracked under a28b841f / the CAS-2186 art lane. This mechanic dresses
with that art later (drop-in: the interior renders from terrain today; swapping in Thais floor/wall art is a
render change, not a mechanic change).
