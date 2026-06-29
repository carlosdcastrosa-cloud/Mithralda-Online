// ---------------------------------------------------------------------------
// CAS-267 — bind-aware onboarding coachmark QA (deterministic, no DOM).
//
// Imports the REAL shipped copy (strings.js) + the REAL rebind table (settings.js)
// and asserts every coachmark line resolves the player's CURRENT keybinding rather
// than a hardcoded key. `keyLabel` mirrors render.js:127 (the code that turns a
// KeyboardEvent.code into the on-card label); it is tiny and stable. The live render
// path (function-vs-string handling, fps, zero errors) is covered by `npm run
// onboarding-live`; this harness proves the COPY itself is bind-aware.
//
//   [DEFAULT] default binds render the familiar keys (WASD / J / I / …)
//   [REBIND]  a rebind is reflected immediately and the old key disappears
//   [ARROWS]  movement rebound to arrows shows the arrow glyphs
//   [DONE]    the final card + menu controls hint are bind-aware too
//   [TOUCH]   touch copy is untouched (touch controls are not rebindable)
//
// Run: npm run cas267   (node tools/cas267-coachmark-binds.mjs)
// ---------------------------------------------------------------------------
import { STR } from "../strings.js";
import { REBINDS, defaultBinds } from "../settings.js";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const check = (m, cond) => cond ? pass(m) : fail(m);

// mirror of render.js:127 keyLabel — the single source of card labels.
const keyLabel = (code) => { if (!code) return "—";
  if (code === "Space") return "Espacio";
  if (code === "Escape") return "Esc";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  if (code === "ArrowUp") return "↑"; if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←"; if (code === "ArrowRight") return "→";
  return code; };
const resolver = (binds) => (a) => keyLabel(binds[a]);
const pc = (step, binds) => { const v = STR.tutSteps[step].pc; return typeof v === "function" ? v(resolver(binds)) : v; };
const touch = (step) => STR.tutSteps[step].touch;

// ---- [DEFAULT] -----------------------------------------------------------
const d = defaultBinds();
check('[DEFAULT] move card shows "WASD"', pc("move", d).includes("WASD"));
check('[DEFAULT] attack card shows "J"', /tecla J\b/.test(pc("attack", d)));
check('[DEFAULT] skill card shows 2, 3 o 4', pc("skill", d).includes("2, 3 o 4"));
check('[DEFAULT] loot card shows "F"', /tecla F\b/.test(pc("loot", d)));
check('[DEFAULT] equip card shows "I"', /inventario con I\b/.test(pc("equip", d)));

// every pc step is a function OR a key-free string; none hardcodes a default code
// that a rebind would invalidate.
check('[DEFAULT] travel card is key-free (no rebindable key in copy)',
  typeof STR.tutSteps.travel.pc === "string" && !/tecla/.test(STR.tutSteps.travel.pc));

// ---- [REBIND] attack J→K, pickup F→H, inventory I→B -----------------------
const r = defaultBinds(); r.attack = "KeyK"; r.pickup = "KeyH"; r.inventory = "KeyB";
check('[REBIND] attack reflects new key K', /tecla K\b/.test(pc("attack", r)));
check('[REBIND] attack no longer shows stale J', !/tecla J\b/.test(pc("attack", r)));
check('[REBIND] loot reflects new pickup key H', /tecla H\b/.test(pc("loot", r)));
check('[REBIND] equip reflects new inventory key B', /inventario con B\b/.test(pc("equip", r)));
check('[REBIND] equip no longer shows stale I', !/inventario con I\b/.test(pc("equip", r)));

// ---- [ARROWS] movement → arrow keys --------------------------------------
const a = defaultBinds(); a.up = "ArrowUp"; a.left = "ArrowLeft"; a.down = "ArrowDown"; a.right = "ArrowRight";
check('[ARROWS] move card shows arrow glyphs ↑←↓→', pc("move", a).includes("↑←↓→"));
check('[ARROWS] move card no longer shows WASD', !pc("move", a).includes("WASD"));

// ---- [DONE] final card + menu controls hint ------------------------------
const td = defaultBinds(); td.talents = "KeyZ"; td.interact = "KeyX"; td.forge = "KeyV"; td.pause = "KeyP";
const doneCopy = typeof STR.tutDone === "function" ? STR.tutDone(resolver(td)) : STR.tutDone;
check('[DONE] final card is bind-aware (function)', typeof STR.tutDone === "function");
check('[DONE] final card reflects talents rebind Z', doneCopy.includes("(Z)"));
check('[DONE] final card reflects interact rebind X', doneCopy.includes("(X)"));
// CAS-270: the final card also surfaces the Forja + Opciones (Settings) keys, bind-aware.
check('[DONE-270] final card reflects forge rebind V', doneCopy.includes("(V)"));
check('[DONE-270] final card reflects pause/Opciones rebind P', doneCopy.includes("(P)"));
const hint = typeof STR.controlsHintPC === "function" ? STR.controlsHintPC(resolver(r)) : STR.controlsHintPC;
check('[DONE] menu controls hint is bind-aware (function)', typeof STR.controlsHintPC === "function");
check('[DONE] menu hint reflects attack rebind K', hint.includes("Atacar clic o K"));

// ---- [TOUCH] touch copy is a stable string, no rebindable codes ------------
check('[TOUCH] move touch copy is a plain string', typeof touch("move") === "string");
check('[TOUCH] attack touch copy unchanged (button hint)', touch("attack").includes("⚔"));

// ---- coverage: every rebindable action that appears in copy resolves -------
check('[COVER] REBINDS table present (CAS-265 contract intact)', Array.isArray(REBINDS) && REBINDS.length >= 20);

console.log(ok ? "\n✓ CAS-267 coachmark bind-awareness: all checks passed." : "\n✗ CAS-267: failures above.");
process.exit(ok ? 0 : 1);
