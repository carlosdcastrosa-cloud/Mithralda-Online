import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2441: LIVE FLIP de Proximidad a Amenaza Apex / APEX_PROXIMITY (flag) — enciende EVO mecánica #73.
// QA DARK CAS-2440 PASS 15/15 (build DARK 51299d4c1bb0, HEAD cc0d6f8) + CEO byte-verify DARK PASS
// (byte-neutral OFF: rama de forrajeo de mena = código muerto con enabled:false ⇒ 0 mena + 0 grantMats
// + 0 RNG ⇒ killEnemy byte-idéntico al HEAD; STATELESS; canal fresco matFind; REAL server-auth
// apexNearestDist sobre G.enemies isBoss/champion/champElite) + CEO Gate #73 APROBADO. Config-only
// flip (APEX_PROXIMITY.enabled false→true, master bf05ed7, diff DARK→LIVE = EXACTAMENTE 1 línea token),
// NO rebuild de lógica. Serialización satisfecha: #72 SCARCITY_EDGE ya LIVE&closed (CAS-2437/2438).
// Umbrella CAS-2439, linaje CAS-2439 DARK build.
//
// Eje = PROXIMIDAD A UN DEPREDADOR APEX (server-auth, MMORPG-native): apexNearestDist(hero) =
// min hypot(hero − apexVivo) sobre G.enemies vivos isBoss/champion/champElite → tabla de tiers por
// proximidad (≤480px T1/+1 mena, ≤240px T2/+2 mena; sin apex vivo / lejos ⇒ T0/+0) → forrajeo de mena
// en el TAIL de killEnemy, banca a h.mats vía grantMats (0 RNG), sub-cap apexMatCap=2. Canal FRESCO
// `matFind` (NINGUNA de las 14 flags #59-#72 lo usa; goldFind/lootQuality/xpGain/essenceFind ocupados ⇒
// mena único libre) ⇒ fuente única, máximo-único trivial. INVERSO a #72 SCARCITY_EDGE (esto = PRESENCIA
// de un apex CONCRETO cercano vs AUSENCIA de mobs vs cap-de-zona). ⊥ #69 LAST_STAND force-ratio (cuenta
// enemigos ENGANCHADOS; esto = distancia a UN apex vivo, con o sin engage). Byte-neutro OFF = rama muerta;
// con enabled:true el forrajeo-por-proximidad corre.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado antes del commit del flip. La última LIVE fue
//   el flip+deploy SCARCITY_EDGE (CAS-2437, gh-pages 31790bf), overlay 4-file. DESDE entonces master
//   avanzó con el DARK BUILD de #73 APEX_PROXIMITY (GE CAS-2439 cc0d6f8, seam tail killEnemy + badge
//   Apex:▲ + funcs puras apexNearestDist/tier/forageMats + canal matFind), inerte con enabled:false, en
//   game.js / render/render.js / sim/sim.js. Por eso los 3 archivos de código NO son byte-idénticos
//   gh-pages↔HEAD y ENTRAN al overlay (mirror SCARCITY_EDGE/SHADOW_STALK 4-file). El preflight
//   MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD (bf05ed7), NO el working tree ⇒ se envía exactamente
// el build DARK verificado por QA (51299d4c1bb0) + el flip 1-línea. Los flags del arco LIVE previo #59–#72
// siguen enabled:true (0-regr, count 61→62 servidas true); APEX_PROXIMITY es el único que cambia false→true.
// Reversible 1-line: APEX_PROXIMITY.enabled true→false + re-run.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2441 LIVE FLIP: Proximidad a Amenaza Apex / APEX_PROXIMITY (APEX_PROXIMITY.enabled:true) — EVO#73. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE SCARCITY_EDGE CAS-2437, master avanzó el DARK build #73 APEX_PROXIMITY GE CAS-2439 cc0d6f8 que añadió su seam tail killEnemy + badge Apex:▲ + funcs puras apexNearestDist/tier/forageMats + canal matFind inerte con enabled:false a game/render/sim.js + este flip config-1-línea bf05ed7). Eje PROXIMIDAD A UN DEPREDADOR APEX server-auth: apexNearestDist(hero)=min hypot(hero−apexVivo) sobre G.enemies isBoss/champion/champElite → tiers por proximidad (≤480 T1/+1 mena, ≤240 T2/+2 mena) → forrajeo de mena round por tier en el TAIL de killEnemy vía grantMats, sub-cap apexMatCap=2. Canal FRESCO matFind (NINGUNA de las 14 flags #59-#72 lo usa). INVERSO a #72 (PRESENCIA de apex vs AUSENCIA de mobs) · ⊥ #69 force-ratio (distancia a UN apex vs nº enganchados). QA DARK PASS 15/15 CAS-2440 (build 51299d4c1bb0, HEAD cc0d6f8) + CEO byte-verify DARK PASS (byte-neutral OFF rama muerta, STATELESS, REAL server-auth) + CEO Gate #73 APROBADO. Serializado tras #72 SCARCITY_EDGE LIVE&closed. Arc flags previos #59-#72 intactos (0-regr, count 61→62 servidas true); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
