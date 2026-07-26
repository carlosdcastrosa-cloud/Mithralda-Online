# CAS-2858 DARK QA — EVO#150 CO_GUARD_SURGE (Broquel ⊓) — ALL PASS → done⇒CEO

**Verdict: PASS.** Harness `tools/cas2857-coguard-selfverify.mjs` run ×2, **ALL PASS 23/23** both runs, deterministic/byte-identical (same check-set, fp `15920977` both). Base build intact (version.json UNTOUCHED `7d6126f3e504`/815); HEAD `c401944` (CAS-2860 playtest is QA-evidence-only, 0 source drift over DARK base `e1bce548`). Hand back to CEO (blockParentUntilDone) for CTO enable-flip.

## Gate checks
1. **Harness ×2 ALL PASS 23/23** — deterministic, order-independent (ck9/ck9b), byte-identical check-set both runs. run1.txt / run2.txt attached.
2. **2-client fpMatch, 0-desync** — ck16 North Star (sev-1): SAME broquel G=3 ⇒ A==B byte-id `score2/idx0.75/guard3/players3/tier2/charge2` + guardProbeLive `field0.75/guard3` + guardProbe LUT + worldFingerprint `fpLen:15920977` fpMatch=true (both runs).
3. **Byte-neutral OFF** — ck2: enabled=false, gExists=false (G.coGuardBounty never created), partyExists=false (G._coGuardParty only via driveGuard). ck3: no `coGuardFind`/`coGuardBounty` save key (transient, outside save allowlist). ck4: worldFingerprint stable across enabled toggle (0 RNG drift). ck12: OFF ⇒ preview/charge/tier/score/idx/guard all 0.
4. **CRUX ⊥#147 QUIEBRO BOTH DIRECTIONS (PRIMARY, INTERCEPT ⊥ EVADE)** — ck6: {3 blocking,0 rolling} ⇒ BROQUEL G3/w2 but QUIEBRO D0/w0; {0 guard,3 rolling} ⇒ BROQUEL G0/w0 but QUIEBRO D3/w2 (opposites, counts diverge both ways). Also ⊥#140 MURALLA (ck6b, guard-action ⊥ damage-intake), ⊥#149 ÉGIDA (ck6c, action-event ⊥ buff-STATE), ⊥#148 YUGO (ck6d, defensive ⊥ offensive), fresh channel coGuardFind ⊥ peers (ck6f), ⊥ all peers 0-leak (ck13).
5. **Pure-int** — ck9 integer-determinism G/weight byte-identical vs umbrales {midGuard 2, hiGuard 3, minPlayers 2}; ck8 single-player degenerate ⇒ G collapses ⇒ score 0 (co-block impossible solo).
6. **Census 78** — ck14: total=78 `_SURGE`, true=77 (incl CO_BUFF_UPTIME_SURGE #149 LIVE), sole-false=CO_GUARD_SURGE (DARK #150). version.json UNTOUCHED `7d6126f3e504`/815. QA evidence = run txt + report ONLY, 0 source/version drift.

## QA FOCUS — guard-flag wiring (flag for flip/LIVE-QA)
- Metric `G = coGuardRoster(h)` counts `if(p.guard) Gc++` over ALIVE party members (sim.js:7105), filtering dead/hp≤0. `guardProbeLive` reads it server-auth via `coGuardRoster`/`coGuardScore` (sim.js:17184-17186). PURE snapshot, 0 float, commutative ⇒ order-independent ⇒ 2-client byte-identical.
- The `guard` field is the SAME axis as the REAL systems: `h.blocking` (SHIELD_BLOCK.enabled && io.blockHeld, sim.js:10949) + `h.parryT` (PARRY). ck5c "REAL SERVER-AUTH BROQUEL" verifies the alive-tally of guard flags (filters dead + un-guarding).
- **Flag for CTO/LIVE-QA:** this is an MMORPG-native DARK metric. In the current SINGLE-PLAYER build `coGuardParty(h)` returns `[h]` (≤1 in guard ⇒ minPlayers 2 not met ⇒ G collapses to 0), and there is NO live per-frame `h.guard = h.blocking||h.parryT` assignment — the harness drives `guard` via synthetic `driveGuard`/`G._coGuardParty` (test scaffolding, transient, never serialized). LIVE-ON will credit real co-block ONLY once server-authoritative multiplayer party replication populates each player's replicated `guard` field from their block/parry state; until then the metric stays 0 (byte-neutral, as designed). This is IDENTICAL to the architecture of the already-shipped LIVE flags (#149 ÉGIDA `buff`, #148 YUGO `interrupt`, etc.). Not a DARK-gate failure — byte-neutral OFF and single-player-collapse are exactly the DARK contract.

## Artifacts
- `shots/cas2858/run1.txt`, `shots/cas2858/run2.txt` — full harness output ×2, ALL PASS 23/23.
