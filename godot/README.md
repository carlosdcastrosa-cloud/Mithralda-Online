# Mithralda — Godot migration prototype (CAS-172 / CAS-174)

**Non-destructive.** This folder is the Godot migration workspace. It is completely
separate from the live JS game (`../game.js`, `../sim/`, `../render/`, …). Nothing here
is part of the production deploy. The live game is untouched.

## What this is

A Godot 4.3 top-down vertical slice (player + chasing enemies, procedural draw) whose only
purpose is to **measure the real Godot→WASM→deploy pipeline** for the migration the board
approved on CAS-172. It is NOT feature parity with Mithralda.

## Reproduce the toolchain (the agent env has no Godot pre-installed)

```sh
# 1. Engine (headless works in this env — confirmed)
curl -sL -o /tmp/godot.zip \
  https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_linux.x86_64.zip
python3 -c "import zipfile;zipfile.ZipFile('/tmp/godot.zip').extractall('/tmp/godot-tools')"
chmod +x /tmp/godot-tools/Godot_v4.3-stable_linux.x86_64

# 2. Export templates (~700 MB .tpz; web_nothreads_release.zip is the one we use)
curl -sL -o /tmp/templates.tpz \
  https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_export_templates.tpz
# extract every entry into ~/.local/share/godot/export_templates/4.3.stable/

# 3. Build the web/WASM export (headless)
/tmp/godot-tools/Godot_v4.3-stable_linux.x86_64 --headless --path . --import
/tmp/godot-tools/Godot_v4.3-stable_linux.x86_64 --headless --path . --export-release "Web" build/index.html
```

## Measured results (2026-06-29, this prototype, ZERO art assets)

| File | raw | gzip |
|---|---|---|
| `index.wasm` | **33.74 MiB** | 7.61 MiB |
| `index.js` | 0.32 MiB | 0.08 MiB |
| `index.pck` (game data) | 0.01 MiB | 0.01 MiB |
| **total** | **34.07 MiB** | **7.70 MiB** |

- The engine `index.wasm` alone is **33.74 MiB raw — over the 25 MiB-per-file deploy bound**
  in the Higgsfield `build-game.md`. The `.pck` is ~7 KB only because the prototype has no
  art; the real game's ~27 MB of assets would load on top.
- Single-threaded web export (`thread_support=false`) is used deliberately: Godot's
  multi-threaded export needs `SharedArrayBuffer` → COOP/COEP headers we **cannot set**
  (Higgsfield serves with no custom headers).

## Deploy spike result (the decisive finding)

The exported bundle was packaged (`index.*` + stub `logic.js` at root), uploaded to the CDN,
and submitted to `deploy_game` (new game_id — non-destructive). It **failed with the same
generic Higgsfield outage error** that is currently blocking the JS game (CAS-136/CAS-154),
ReqIDs `78738cf8`, `24944aa8`. → **A working Godot WASM build does not escape the deploy
outage; it ships through the exact same `deploy_game` pipeline.** See
`../docs/godot-migration-feasibility-CAS-174.md`.
