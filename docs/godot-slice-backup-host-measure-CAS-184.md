# CAS-184 — Godot slice on the backup-host test URL: measured numbers

**Parent:** CAS-182 (staged Godot roadmap). **Feeds:** the G0→G1 gate.
**Slice:** `godot/` web export, commit `58dd793`, ZERO art (engine baseline only).
**Test URL (non-public, not linked anywhere):**
`https://carlosdcastrosa-cloud.github.io/Mithralda-Online/godot-slice/`
Additive publish — prod backup bundle (`build 112f63203e18`, 266 files) untouched.
Never touches the live Higgsfield `game_id`. Measurement, not cutover.

## How it was served & measured

- Published via `node tools/cas184-publish-godot-slice.mjs` (clones gh-pages,
  adds only `godot-slice/`, pushes — prod tree preserved).
- Measured via `node tools/cas184-godot-measure.mjs` (puppeteer-core + chromium,
  resource-timing for sizes, `#status` overlay removal as the time-to-interactive
  marker, 3 s rAF window for fps). Desktop 1280×720 and mobile 390×844 (DSF 3).

## 1. Size served (real, over GitHub Pages / Fastly CDN)

GitHub Pages **gzips `application/wasm` over the wire** — confirmed empirically.
So the 33.74 MiB raw `index.wasm` is transferred as **7.77 MiB**.

| File | wire (gzip) | raw |
|---|---|---|
| `index.wasm` | **7.77 MiB** | 33.74 MiB |
| `index.js` | 0.08 MiB | 0.32 MiB |
| `index.png` (splash) | 0.02 MiB | 0.02 MiB |
| `index.pck` (game data, no art) | 0.01 MiB | 0.01 MiB |
| `index.icon.png` | 0.004 MiB | 0.003 MiB |
| **TOTAL** | **7.88 MiB** | **34.08 MiB** |

- **Largest file: `index.wasm` — 7.77 MiB wire / 33.74 MiB raw.**
- The `.pck` is ~7 KB only because the slice has **zero art**. The real game's
  ~27 MB of assets load on top of this engine baseline.
- Deploy-bound note: raw `index.wasm` (33.74 MiB) is **over the 25 MiB-per-file
  Higgsfield `deploy_game` bound**, but **fine for GitHub Pages** (100 MB/file).
  Stripping only matters if we ever route Godot back through `deploy_game`.

## 2. Time-to-interactive (engine running, first frame drawn)

Measured from datacenter → Fastly CDN (near-zero transfer latency), so these
isolate **engine init + wasm compile**, not network:

| | TTI |
|---|---|
| Desktop 1280×720 | **2048 ms** |
| Mobile 390×844 | **1844 ms** |
| **JS live baseline** | **~120–160 ms** |

**Godot engine boot is ~13–17× the JS game's boot** even on a fast link, before
adding any art or real network transfer.

### Modeled real-world TTI (transfer-bound, add to the ~2 s engine cost)

The 7.77 MiB wire payload dominates on real connections:

| Connection | wasm transfer (7.77 MiB) | ≈ total TTI |
|---|---|---|
| Fast broadband (~50 Mbps) | ~1.3 s | ~3–3.5 s |
| Typical 4G (~10 Mbps eff.) | ~6.2 s | ~8 s |
| Slow 3G (~1.5 Mbps) | ~41 s | ~43 s |

Plus mobile-CPU wasm **compile** is meaningfully slower than the datacenter
desktop core measured here — so real mobile TTI skews worse than the table.

## 3. Worst-case fps — NOT representative (software rendering)

Headless chromium has **no GPU**; it rasterizes via SwiftShader (software GL).
The fps below are **fill-rate-bound by software rendering**, not real-device GPU,
and must NOT be read as the game's real frame rate:

| | fps (headless SwiftShader) |
|---|---|
| Desktop 1280×720 | 19 |
| Mobile 390×844 (DSF 3) | 7 |

The mobile number is lower **only because it renders 3.2× the pixels**
(1170×2532 backing store) in software — a fill-rate artifact, not an engine
regression. A real-device GPU fps reading needs a real device or a GPU-backed
runner; this env cannot produce one. **0 JS errors** in both runs (clean boot).

## Bottom line for the G0→G1 gate

- ✅ Godot WASM **serves and boots cleanly** on a host we control (GitHub Pages
  gzips the wasm → 7.77 MiB wire), 0 JS errors, single-threaded (no COOP/COEP).
- ⚠️ **Boot cost is the headline risk vs the north star "no install friction":**
  ~2 s engine init on a fast link → realistically **~8 s on typical 4G** for a
  zero-art slice, vs the JS game's ~120–160 ms. Art (~27 MB) lands on top.
- ⚠️ Raw wasm (33.74 MiB) exceeds the `deploy_game` 25 MiB bound — Godot needs
  either the backup host or a size-stripped engine build to ship publicly.
- ❓ Real-device fps is still **unmeasured** (headless = software GL). A GPU/real
  device reading is required before any G1 commit.

These numbers are the empirical input to CAS-182's G0→G1 gate (board-owned).
