import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2367: LIVE FLIP de Camaradería / Kinship Bond (flag KINSHIP_BOND) — enciende EVO mecánica #60.
// Canal FRESCO `goldFind` (3er canal del passive): multiplicador del ORO recogido en el pickup de monedas por
// PARES PRÓXIMOS SOSTENIDOS (celda coarse 128 Chebyshev≤1, acumulador-decay half-life 25s NO reset-on-break,
// tiers 2/4/6 ⇒ +5/10/15% oro). ORTOGONAL a restedMult (XP) y a wardRegen (HP) ⇒ máx-único trivial (única
// fuente del canal goldFind), 0 doble-conteo. DIFERENCIADORES: AMONTONADOS abren (OPUESTO a Warding onRing0);
// par de 1 tick ⇒ NO (≠ Congregación permanencia); QUIETOS cuentan (≠ Convoy velocidad); 1 solo / lejos ⇒ 0.
// byte-id OFF por CONSTRUCCIÓN (0 estado nuevo serializado, save-blob sin key kinship*, worldFingerprint estable).
// SIN input.js (passive automático server-driven + badge ⚭ "Camaradería" = 0 hotkey).
//
// SERIALIZACIÓN (anti-stacking, 1 arco valida a la vez): este flip estaba blockedBy CAS-2366 = post-flip QA
// LIVE de #59 WARDING_RING. CAS-2366 done (2-cliente 29/29 ×2, build ce3717254190, WARDING_RING served true
// LIVE, 0 desync) ⇒ blockers_resolved ⇒ este flip procede.
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { sim/config.js }  (1 file).
//   DISTINTO de CAS-2365/2359/2357 (que shiparon 4 files): la última LIVE (WARDING_RING flip ce3717254190,
//   deploy CAS-2365 f4a4a25) YA avanzó game.js/render/render.js/sim/sim.js a HEAD — incluyen los cambios del
//   DARK build KINSHIP (b821eca: badge ⚭, dev hook, goldTick seam). Desde entonces master SÓLO avanzó
//   sim/config.js (el flip de 1 línea, commit f5fcd73) ⇒ único módulo divergente ∩ cargado = sim/config.js.
//   Overlay mínimo-y-suficiente = { sim/config.js }. Los demás MODS son byte-idénticos gh-pages==HEAD.
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree — el WIP CAS-2200 (M render/render.js
//   en git status) NUNCA se envía (render/render.js ni siquiera está en el overlay; gh-pages conserva su copia,
//   byte-idéntica a HEAD:render/render.js).
//
// Reversible 1-line: KINSHIP_BOND.enabled true→false + re-run overlay.
const overlay = ["sim/config.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2367 LIVE FLIP: Camaradería / Kinship Bond (KINSHIP_BOND.enabled:true; overlay mínimo config-only {sim/config.js} = único divergent∩MODS — game.js/render/sim.js ya shipeados por el deploy WARDING_RING CAS-2365 ce3717254190; render.js WIP CAS-2200 no shipped, ni en overlay; SIN input.js, passive automático server-driven goldFind multiplicador de oro por pares próximos sostenidos celda128 Chebyshev≤1 decay hl25s→tiers 2/4/6 +5/10/15% oro, ⊥ restedMult ⊥ wardRegen ⇒ máx-único 0 doble-conteo; DIFERENCIADORES: AMONTONADOS abren (OPUESTO Warding), par 1-tick→NO, QUIETOS cuentan, 1solo/lejos→0; byte-id OFF por construcción 0 save key; SERIALIZADO tras #59 WARDING_RING LIVE verificado (CAS-2366 2-cliente 29/29 ×2 0 desync); arco Warding/Convoy/BattleSync/Influx/Frontier/LongWatch/DiverseCompany/Wayfarer/Congregation/WorldPulse/Soul intacto; EVO#60; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
