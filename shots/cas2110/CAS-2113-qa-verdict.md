# CAS-2113 — QA OBSERVABLE Perfect Dodge Counter / Contraataque de Esquiva (mec #34) DARK

**Verdict: PASS×2 — GO.** Gate CEO CAS-2111 unblocked for the config flip.

- **Live build served:** `37521ab19b4c` (files=799)
- **Served bytes == HEAD:** config.js md5 `d133cd838e0547d5472a10f0ecc9eda4`, sim.js md5 `2524c04f07b8b5f0961f587071d4250c` (both match HEAD exactly)
- **Harness:** `tools/cas2110-dodge-counter-live-qa.mjs` — drives the REAL served sim loop (not byte-check only), desktop + mobile, mage/ranged class for shield-less universality.

## Runs
- **Run 1:** all game AC PASS desktop+mobile; single transient `503` on one desktop boot resource load (CDN hiccup — mobile boot clean 0 errors).
- **Run 2:** FULL PASS, 0 boot errors both profiles (60.8/60.4 fps).
- **Run 3:** FULL PASS, 0 boot errors both profiles.
- ⇒ The 503 was a non-repro CDN flake; PASS×2 clean (runs 2+3), determinism confirmed across 3 runs.

## AC results (desktop + mobile, both PASS)
- **AC1 META:** served DODGE_COUNTER DARK — enabled=false, windowS=0.5, dmgMul=1.5, poiseMul=2.0, staminaCost=6, perfectWindowMs=160, requiresShield=false.
- **AC2 WINDOW:** PERFECT dodge (i-frame negates real hit, rollAge≤160ms) ARMS dodgeCounterT=0.5; STALE roll no-arm; MERCY i-frame no-arm; UNIVERSAL ranged/mage ARMS.
- **AC3 DMG+POISE:** LIGHT swing in-window 54 vs 36 ⇒ ratio 1.5==dmgMul; consumes window; spends 6 stam. Poise 24 = light 12 × poiseMul 2.0.
- **AC4 COMPOSE:** same-event only dodge arms (guard stayed closed); same-swing ratio 1.8==guardMul only, dodge NOT consumed ⇒ guard-counter precedence, dc gated on !gc, never both fire.
- **AC5 OFF==baseline:** enabled=false ⇒ dodge no-arm + forcing dodgeCounterT>0 INERT, dmg identical 36==36 ⇒ attack branch byte-id to HEAD; 0 regression on 33 live mechanics.
- **AC6 SAVE:** dodgeCounterT/_rollAge transient ⇒ serializeSave() byte-identical ON/OFF, no leaked key.
- **AC7 SRAND:** master-srand fingerprint (96 draws) byte-identical ON==OFF (0 dodgeCounterRng draws); ON non-vacuously fired counter; deterministic across repeats.
- **AC8 60FPS:** 60.2–60.8 fps sustained; mobile playable (DPR-cap).

## Evidence
- `desktop-play.png`, `desktop-final.png`, `mobile-play.png`, `mobile-final.png` (regenerated this pass).

## Defects
- 0 new defects. Known sev-4: favicon 404 (pre-existing, cosmetic).
