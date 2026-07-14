import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2365: LIVE FLIP of Cordón de Guardia / Warding Ring (flag WARDING_RING) — enciende el PILAR FRESCO EVO#59.
// DOS pivotes FRESCOS a la vez:
//   · canal FRESCO `wardRegen` (regen de HP FUERA de combate; ORTOGONAL a restedMult/XP ⇒ 0 doble-conteo;
//     mismo chokepoint pactHeal que SAFEZONE.regenPct pero kind≠safeRegen — Cordón CREA regen en zona de caza).
//   · eje FRESCO cobertura ANGULAR (`wardCoverage` pura: centroide media, sectores 8=45°, cover/8; distinto
//     del anillo fuera ringRadius40). ≥K(3) con cover≥0.375 SOSTENIDO ⇒ ward decay half-life 25s ⇒ tiers 2/4/6
//     → 0.05/0.10/0.15. DIFERENCIADORES: N AMONTONADOS ⇒ onRing 0 ⇒ NO abre (≠ Congregación headcount);
//     línea/2-sectores ⇒ cover 0.25 ⇒ NO abre (≠ Expedición área); QUIETOS abren (≠ Convoy velocidad);
//     1 solo / opp<K ⇒ 0. Passive COMPARTIDO por wardRegen (canal HP-regen, NO restedMult).
// byte-id OFF por CONSTRUCCIÓN (0 estado nuevo serializado, save-blob sin key ward*, G.ward/G.wardServer nunca,
// worldFingerprint estable). SIN input.js (passive automático server-driven + badge ◯ "Cordón" = 0 hotkey).
// KINSHIP_BOND (EVO#60) permanece enabled:false — su flip está serializado aparte (CAS-2366+).
//
// CEO Gate APPROVED (CAS-2365 issue: byte-verify LIVE config 316746B = 10/10 master arc flags served true
// 0 regresión, WARDING_RING ABSENT=correct DARK pre-flip) + QA OBSERVABLE DARK build c4a549ae2fa1 = 33/33 ×2
// (North Star convergencia 2-cliente byte-idéntica 0 desync; 6 zonas broken=[]).
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  {game.js, render/render.js,
//   sim/config.js, sim/sim.js} (4 files). Idéntico a CAS-2359/2357/2353/2348: la última LIVE (CONVOY_MARCH
//   flip c3cac4d5d50a) shipó estos 4 módulos; los DARK builds WARDING_RING (2a7563e) + KINSHIP_BOND (b821eca)
//   + este flip los AVANZARON de nuevo ⇒ DIVERGEN y están en MODS ⇒ overlay mínimo-y-suficiente = estos 4.
//   logic.js/version.js divergen pero NO están en MODS (no cargados por index.html) ⇒ fuera del overlay.
//
// consistent-HEAD: el único cambio master↔flip es enabled:false→true (1 línea, commit 155cd07). deployOverlay
//   envía el blob de HEAD, NO el working tree — el WIP CAS-2200 (M render/render.js en git status) NUNCA se
//   envía (se manda HEAD:render/render.js, la versión committeada sin el portal WIP).
//
// Reversible 1-line: WARDING_RING.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2365 LIVE FLIP: Cordón de Guardia / Warding Ring (WARDING_RING.enabled:true; overlay consistente-HEAD 4-file {game,render/render,sim/config,sim/sim} = divergent∩MODS de los DARK builds WARDING_RING+KINSHIP + flip aún no en gh-pages, todos behavior-neutral; SIN input.js, passive automático server-driven wardRegen HP-regen por cobertura-angular-en-anillo + badge ◯ = 0 hotkey; render.js WIP CAS-2200 no shipped=HEAD blob; PILAR FRESCO EVO#59 — DOS pivotes FRESCOS: canal wardRegen (regen HP fuera de combate ⊥ restedMult ⇒ 0 doble-conteo) + eje cobertura ANGULAR (wardCoverage sectores 8=45°), ≥K(3) cover≥0.375 sostenido→ward decay hl25s→tiers 2/4/6; DIFERENCIADORES: N AMONTONADOS→onRing0→NO abre, línea→cover0.25→NO abre, QUIETOS abren, 1solo/opp<K→0; KINSHIP_BOND EVO#60 permanece false flip serializado aparte; QA DARK 33/33 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco Kinship-dark/Convoy/BattleSync/Influx/Frontier/LongWatch/DiverseCompany/Wayfarer/Congregation/WorldPulse/Soul intacto; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
