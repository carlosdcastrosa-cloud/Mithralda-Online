# Mithralda — Engine Architecture (Stage-2-ready module boundary)

`game.js` was a single ~1385-line `createGame` closure mixing simulation,
rendering, input and audio. **CAS-15** split it into ES modules (native
`import`/`export`, no build step) along the one boundary that matters for the
Stage-2 online layer: a **pure, deterministic, server-authority-ready
simulation core** that render/UI/input wrap without a rewrite.

## Module map

```
index.html ── createGame() ─┐   (unchanged public surface: update/render/onResize/onFocusLost/devInfo)
                            │
game.js  (thin orchestrator)│  wires deps, owns the per-frame update→render seam
  │
  ├── sim/                  ── AUTHORITATIVE SIMULATION. No ctx, no DOM.
  │   ├── rng.js            ── createRNG() isolated seeded streams + pure hash2
  │   ├── math.js           ── clamp/lerp/dist2/norm/angDiff/inRect
  │   ├── config.js         ── TS, map dims, tile ids, CFG, ATK, ETPL, CLASS_LIST
  │   ├── world.js          ── buildWorld(rng) + zoneOf  (deterministic worldgen)
  │   └── sim.js            ── state G, update(dt), collision, combat, spells,
  │                            pickups, spawners, enemy AI  (deps injected)
  │
  ├── render/               ── PRESENTATION. Reads sim state + alpha; mutates nothing.
  │   ├── palette.js        ── COL
  │   ├── sprites.js        ── blit, procedural sprites, atlas/asset loading, anim
  │   └── render.js         ── createRenderer(ctx): world/entities/fx/HUD/menus/camera
  │
  ├── input.js              ── controller: keyboard/pointer/touch/gamepad → sim
  │                            commands; owns UI hit-rects + the `io` intent surface
  ├── audio.js              ── procedural chiptune SFX/music sink
  └── view.js               ── viewport numbers (VW/VH/zoom) shared by sim camera/render/input
```

## The enforced boundary

- **`update` has zero render/DOM dependencies.** `sim/` never references `ctx`,
  `document`, `window`, `Image`, `canvas`, etc. Everything it needs from the
  outside is injected via `configure({ io, audio, view })`:
  - `io` — sampled player intent (move vector, aim, gamepad, touch flags)
  - `audio` — sound sink (swap for a no-op on a headless server)
  - `view` — plain viewport numbers used **only** for the presentation camera
  Verified mechanically (`grep` finds no ctx/DOM in `sim/`) and at runtime:
  `tools/determinism-check.mjs` imports and runs `sim/` under Node with no
  browser globals — if the sim touched the DOM, that import would throw.

- **`render` mutates no simulation state.** `render/render.js` reads `sim.G` /
  `sim.world` and an interpolation `alpha`, and only draws. The immediate-mode
  UI hit-rects it produces are written into the input-owned `ui` object, not sim.

- **Determinism is real now.** The original build used a single global RNG seed
  shared between gameplay and render, so render's per-frame jitter (screen shake,
  blood spray, menu starfield) silently advanced the gameplay RNG — a Stage-2
  hazard (frame timing would change the simulation). The sim and render now own
  **separate** `createRNG()` streams, so a fixed seed + identical intent stream
  produces a byte-identical simulation regardless of how/when render runs. The
  visible game is unchanged; only the hidden coupling is removed.

## Stage-2 path

A networking layer wraps `sim/`: feed `update(dt)` an intent stream per tick via
`io`, inject a no-op `audio`/`view`, and treat `G` as the authoritative state to
serialize. No gameplay logic lives in render/UI/input, so none of it has to be
torn out.

## Verifying

```
node tools/determinism-check.mjs     # determinism + DOM-free proof (headless)
```
`tools/smoke.html` boots the real modules into a play frame for a quick visual
check (open in a browser, or screenshot headless).
```
