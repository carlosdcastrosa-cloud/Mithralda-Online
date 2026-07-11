# CAS-2016 — EVO Onboarding: Primer de Combate (first-run) — DESIGN / DECOMP (CTO)

Owner: CTO · Chain: Build (GE) → Deploy gh-pages (CTO) → QA PASS×2 observable (QA) → Gate CEO (CEO)
Pattern: **BORROW + EXTEND** (mirror CAS-2010 game-feel — gate/extend an already-live system, do NOT build from scratch).

---

## 0. RECONCILIATION (read this first — the ticket's premise is half-true)

The ticket says "falta un primer de combate guiado de primera-ejecución". **A first-run tutorial step-machine already ships LIVE** (CAS-128). It is not missing — it is *incomplete for the Souls verbs*.

What LIVES today (CAS-128, no knob, armed on true first-run):
- Step machine `TUT_STEPS = ["move","attack","skill","travel","loot","equip","done"]` (`sim/sim.js:1300`).
- Armed ONLY on a true first run (`!loaded && !tutSeen()`, `persist.js:192`); returning players skip it; replayable from pause menu (`dev.tutStart`).
- **Isolated first-run marker `mithralda.tut.v1`** (`persist.js:26`) — SEPARATE from the run save (`save.v1`). This is exactly the "save aislado" the ticket asks for; it already exists.
- Coachmarks drawn by `renderTutorial()` (`render/render.js:3795`), skip button rect handled in `input.js:556`.
- In-progress step serialized into `save.v1` so a first-run refresh resumes (`sim.js:1701/1777`), flushed to the seen marker on finish (`persist.js:228`).
- Teach-by-doing seams: `tutMark("atk")` at `heroAttack` (`sim.js:2359/2404`), `tutMark("skill")` at cast (`3151/3174/3191`), `tutMark("looted")` at pickup (`3465`).

**Delta = the Souls combat verbs the existing machine never teaches.** CAS-128 covers the generic ARPG loop (move/attack/skill/travel/loot/equip). CAS-2016 wants the *combat* verbs: **mover, atacar, esquiva rodante (dodge), parry, backstab, lock-on, Estus, hoguera**. Overlap = move + attack. NET-NEW teaching = **dodge · parry · lock-on · backstab · Estus · bonfire** (6 verbs).

Therefore CAS-2016 is **NOT** "build a tutorial". It is: (1) add the `ONBOARDING` knob that governs a combat-primer segment, (2) extend the EXISTING step machine with the 6 combat steps wired to their REAL execution seams, (3) keep it byte-identical to today when the knob is off. This is the CAS-2010 move: thin gate + coverage over live primitives, RNG-neutral, `$0` art.

Also note: the **Códice de Combate** (CAS-1995, `COMBAT_CODEX`, Backquote) already ships as passive reference. The primer's "done" card should point the player at the Códice (Backquote) for the rest — compose, don't duplicate.

---

## 1. Scope (NON-GATED presentation/data layer — no new sim mechanic)

Extend the first-run flow to teach the 6 net-new combat verbs, one step each, advancing when the sim **observes the real verb execute** (no forced timers). Reuse the live primitives — DODGE / PARRY / BACKSTAB / LOCK_ON / FLASK / BONFIRE — and the existing coachmark/skip/save machinery. Zero new sim mechanics.

### Verb → REAL seam map (Build wires `tutMark(...)` at each; all already instrumented or trivial)
| Step (new)   | Verb taught          | REAL execution seam (grep-anchored)                 | Notes |
|--------------|----------------------|------------------------------------------------------|-------|
| `dodge`      | Esquiva rodante      | `doRoll()` `sim.js:3907` (successful roll)           | costs stamina; mark on a roll that actually starts (`h.rolling`) |
| `parry`      | Parada con Tempo     | `tryParry()` success → riposte arm `sim.js:2344/2498`| mark only on a *successful* parry, not a whiff |
| `lockon`     | Fijar objetivo       | `cycleLock()` `sim.js:2188` (target acquired)        | mark when `h.lockTarget` becomes non-null |
| `backstab`   | Puñalada por espalda | backstab branch in `hitEnemy` `sim.js:2583`          | mark when the rear-arc branch resolves true |
| `estus`      | Beber Estus          | `drinkFlask()` `sim.js:2214` (drink starts)          | mark when a charge is actually consumed |
| `bonfire`    | Hoguera              | bonfire rest success `sim.js:3647` (already `fireHint`)| mark alongside the existing `hint_bonfire` fire |

`move` + `attack` are already taught by CAS-128 and stay as the primer's opening two steps (the combat segment slots AFTER `attack`).

Contextual prompt text = existing string/HUD primitives + `keyLabel(<KNOB>.key)` so every prompt shows the player's REAL binding (never a hardcoded literal — same discipline as the Códice's `keyOf`). `$0` art: reuse `renderTutorial` coachmark styling + `MithraldaPixel`; no new assets.

---

## 2. Architecture decision (CTO calls)

**D1 — Extend the existing machine, do not fork a second tutorial.** One first-run flow. Insert the combat block into `TUT_STEPS` after `"attack"`. *Reversibility + Blast radius*: one machine = one code path to reason about; a parallel tutorial would double the coachmark/skip/save surface for no gain.

**D2 — `ONBOARDING.enabled:false` ⇒ byte-identical to TODAY (not to an empty game).** The knob gates ONLY the net-new combat steps. With `enabled:false`, `TUT_STEPS` composes to *exactly* today's `["move","attack","skill","travel","loot","equip","done"]` and every new `tutMark` seam early-returns before touching state ⇒ `save.v1` + srand byte-identical to HEAD. This is the "0 regresión / blobs byte-idénticos" bar. The step array MUST be built through a gate helper, NOT hardcoded with the combat steps always present.

**D3 — Ship DARK (`enabled:false`), Gate CEO flips.** Mirror the established EVO chain (SUMMON/BOSS_RUSH/CODEX). This touches the *first thing a new player sees* — retention-critical, user-facing. The CEO reviews the SERVED combat primer before it reaches new players. QA proves it by ARMING the runtime (mirror `_ccArm(true)` for the Códice), while the served default stays `enabled:false`. *Critical-path*: prove the risky user-facing change behind a flag first.

**D4 — Save store.** The ticket names `mithralda.tutorial.v1`. The live marker is `mithralda.tut.v1` and is already correctly isolated. **Reuse `mithralda.tut.v1`** — a NEW sibling store buys nothing and risks a first-run player getting *both* flows (old marker unset ⇒ combat primer re-arms forever). The seen-marker semantics are unchanged: finish/skip the (now longer) flow ⇒ one marker ⇒ never again. Do NOT touch `save.v1` schema. (If a clean re-trigger for existing veterans is desired later, that is a separate `clearTutSeen()` dev call, not a schema change.)

**D5 — Determinism.** No new RNG stream. All seams touch only `G.tut.*` bookkeeping (mirror CAS-128 `tutMark`). 0 srand draws whether `enabled` is true or false. `doRoll`/`tryParry`/etc. already own their RNG; the primer only READS that they fired. If a step ever needs a draw, it uses a dedicated stream that is off byte-identical — but the design target is **0 draws**.

**D6 — Compose with the Códice.** The terminal `"done"` card gains one line: "Pulsa [`] para el Códice de Combate completo." (`keyLabel(COMBAT_CODEX.codexKey)`, gated on `COMBAT_CODEX.enabled`). No dependency; pure pointer.

---

## 3. `ONBOARDING` knob (Build adds to `sim/config.js`)

```js
export const ONBOARDING = {
  enabled: false,          // DARK — Gate CEO flips live (mirror SUMMON/BOSS_RUSH/CODEX). false ⇒ TUT_STEPS == HEAD, byte-id.
  teachDodge:   true,      // per-verb a11y sub-flags — each independently removes its step from the combat block
  teachParry:   true,
  teachLockOn:  true,
  teachBackstab:true,
  teachEstus:   true,
  teachBonfire: true,
  skippable:    true,      // keep the existing skip affordance (never a forced timer)
};
```

Sub-flags are the accessibility off-switches the ticket requires. Each `false` drops exactly its step from the composed `TUT_STEPS`; all `false` (or `enabled:false`) ⇒ zero combat steps ⇒ byte-id HEAD.

---

## 4. Acceptance criteria (QA proves PASS×2, OBSERVABLE in the real sim loop)

- **AC0 [RNG-STRONG]** `enabled:false` ⇒ `TUT_STEPS` deep-equals HEAD `["move","attack","skill","travel","loot","equip","done"]`; every new `tutMark` seam is a no-op; `save.v1` serialize + srand ON==OFF byte-identical; `mithralda.tut.v1` schema unchanged.
- **AC1 arm** with `enabled:true` ⇒ composed `TUT_STEPS` contains the 6 combat steps inserted after `"attack"` in the documented order.
- **AC2 dodge** drive REAL `doRoll()` ⇒ dodge step advances; a whiffed/failed roll does not.
- **AC3 parry** drive a REAL successful `tryParry()` ⇒ parry step advances; a whiff does not.
- **AC4 lockon** drive REAL `cycleLock()` acquiring a target ⇒ lockon step advances.
- **AC5 backstab** drive a REAL rear-arc `hitEnemy` backstab ⇒ backstab step advances; a frontal hit does not.
- **AC6 estus** drive REAL `drinkFlask()` consuming a charge ⇒ estus step advances.
- **AC7 bonfire** drive a REAL safe bonfire rest ⇒ bonfire step advances.
- **AC8 sub-flag** set `teachParry:false` ⇒ parry step absent, the other 5 present, order intact.
- **AC9 skip/opt-out** `dev.tutSkip()` retires the whole flow; marker `mithralda.tut.v1` written once; a second first-run does NOT re-arm.
- **AC10 save isolation** the primer never adds a key to `save.v1`; in-progress step still resumes on refresh (existing CAS-128 behavior preserved).
- **AC11 Códice compose** `"done"` card references `keyLabel(COMBAT_CODEX.codexKey)` when `COMBAT_CODEX.enabled`.
- **AC12 boot smoke** desktop + mobile: boot 0 game-JS errors with `enabled:false` (served default); armed runtime shows the combat coachmarks without console error.

Harness: extend/borrow `tools/cas1814-dodge.mjs` + the codex harness pattern (DOM-free, import real sim seams). QA writes an observable puppeteer smoke for the coachmark render + a Node AC0-12 harness.

---

## 5. Deploy blob set (Build reports; CTO derives at deploy from `git diff --stat`)

Expected effective blobs: `sim/config.js` (knob), `sim/sim.js` (TUT_STEPS gate helper + 6 tutMark seams + done-card compose), `render/render.js` (coachmark strings for the 6 steps). `game.js`/`input.js`/`persist.js` likely UNCHANGED (skip + save + arm already wired). **CTO derives the REAL blob set from `git diff --stat <parent>..HEAD -- sim/ render/ game.js input.js persist.js`, NOT from this list or the ticket count** (CAS-1990/2012 lesson). DARK: served `ONBOARDING.enabled:false` ⇒ byte-id HEAD behavior.

---

## 6. Chain

1. **Build CAS-201x (GE)** — knob + gate helper + 6 seams + done-card + Node AC0-12 harness. Ships `enabled:false`. Commit.
2. **Deploy CAS-201x (CTO)** — overlay real blobs to gh-pages, DARK. Report build hash + md5 config served==HEAD.
3. **QA CAS-201x (QA)** — PASS×2 observable (arm runtime), boot smoke desktop+mobile, served==HEAD byte-id.
4. **Gate CEO CAS-201x (CEO)** — review served primer, decide the `enabled:false→true` flip. Recommend **GO** (retention leverage over 24 live mechanics, `$0` art, trivially reversible 1-line flip).

Board fork (CAS-1986 Arte/Tibia) is GATED + independent — untouched.
