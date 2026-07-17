// CAS-2533 — DARK QA Gate 2/2 (INDEPENDIENTE) para REMATE DE INTERRUPCIÓN (INTERRUPT_SURGE, EVO#89 DARK, enabled:false).
// QA-OWNED: los oráculos están RE-DERIVADOS en JS PURO aquí abajo (NO reusa el harness de GE cas2532-interrupt-selfverify.mjs).
// Corroboración independiente del build GE @420958e sobre #88 LONGSHOT_SURGE LIVE (served 9e9beb7f0958).
//
// EJE bajo verificación: interruptWeight(e) = ESTADO-DE-ACCIÓN-EN-PROGRESO del mob al instante del remate.
//   habilidad PESADA en curso (canal shield/Freeze Nova, special slam/lunge e.specialNow, cast warlock e.castNow) ⇒ 2;
//   ataque NORMAL comprometido (windup/strike sin special/cast) ⇒ 1;
//   ocioso/persiguiendo/recover/flee/idle/wander ⇒ 0; EXCLUYE stun-frozen (e.stun>0 ⇒ 0).
// Canal FRESCO interruptFind → h.interruptBounty (transitorio, fuera del save + fingerprint), sub-cap interruptBountyCap=2, badge ⊘.
//
// Run: node tools/cas2533-interrupt-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2533");
mkdirSync(OUT, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// ORÁCULOS RE-DERIVADOS EN JS PURO (QA-OWNED, independientes del código del juego)
// Config esperada (knobs CEO): weights heavy=2 light=1; tiers [{min1,charge1},{min2,charge2}]; cap=2.
const W = { heavy: 2, light: 1 };
const TIERS = [{ min: 1, charge: 1 }, { min: 2, charge: 2 }];
const CAP = 2;
// interruptWeight re-derivado: stun-frozen ⇒ 0; shield ⇒ heavy; windup/strike ⇒ special||cast ? heavy : light; else 0.
function oracleWeight(state, specialNow, castNow, stun) {
  if ((+stun || 0) > 0) return 0;
  if (state === "shield") return W.heavy;
  if (state === "windup" || state === "strike") return (specialNow || castNow) ? W.heavy : W.light;
  return 0;
}
function oracleTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
function oracleCharge(score) { const t = oracleTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge) | 0; }
// controlWeight #85 re-derivado (para el crux COMPLEMENTO): stun>0 ⇒ 2; slowT>0 ⇒ 1; else 0.
function oracleControl(stun, slowT) { if ((+stun || 0) > 0) return 2; if ((+slowT || 0) > 0) return 1; return 0; }
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) { passed++; results.push(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; results.push(`❌ ${name}${detail ? " — " + detail : ""}`); }
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAIndep";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 1 — boots + hooks
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.interrupt && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.interrupt + peer hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 — DARK OFF: enabled:false + gExists:false + badge tag "" con OFF
  const dark = await page.evaluate(() => window.__dev.interrupt());
  ok("2 DARK OFF: served enabled:false + gExists:false (G.interruptBounty NUNCA creado) + tag vacío", dark.enabled === false && dark.gExists === false && dark.tag === "", `enabled=${dark.enabled} gExists=${dark.gExists} tag="${dark.tag}"`);

  // 3 — config servida (knobs) coincide con mis oráculos re-derivados
  const cfg = await page.evaluate(() => { const d = window.__dev.interrupt(); return { channel: d.channel, radius: d.radius, weights: d.weights, tiers: d.tiers, cap: d.cap }; });
  const cfgOK = cfg.channel === "interruptFind" && cfg.weights.heavy === W.heavy && cfg.weights.light === W.light && cfg.cap === CAP && JSON.stringify(cfg.tiers) === JSON.stringify(TIERS);
  ok("3 knobs servidos == oráculos re-derivados (channel/weights/tiers/cap)", cfgOK, JSON.stringify(cfg));

  // 4 — STATELESS: saveBlob (OFF y ON) SIN interruptFind/interruptBounty; fingerprint toggle-neutral
  const stateless = await page.evaluate(() => {
    const sOff = JSON.stringify(window.__dev.saveBlob());
    window.__dev.interrupt({ enabled: true });
    const sOn = JSON.stringify(window.__dev.saveBlob());
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.interrupt({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    const re = /interruptFind|interruptBounty/;
    return { offClean: !re.test(sOff), onClean: !re.test(sOn), fpNeutral: fpOn === fpOff };
  });
  ok("4 STATELESS: save (OFF y ON) SIN clave interruptFind/interruptBounty + worldFingerprint toggle-neutral", stateless.offClean && stateless.onClean && stateless.fpNeutral, JSON.stringify(stateless));

  // 5 — byte-neutral OFF: con OFF, forageChargePreview==0 aun con mob mid-heavy en radio ⇒ 0 fichas al seam
  const neutralOff = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero;
    window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } });
    const onPrev = window.__dev.interrupt().forageChargePreview;      // ON con mob mid-heavy ⇒ >0
    window.__dev.interrupt({ enabled: false });
    const offPrev = window.__dev.interrupt().forageChargePreview;     // OFF con el MISMO mob ⇒ 0 EXACTO (rama muerta — interruptForage→interruptBonus GATEADO por enabled)
    window.__dev.interrupt({ clearAct: true });
    return { onPrev, offPrev };
    // NOTA: scoreProbe es un probe de LUT PURA de la TABLA (ungated por diseño, 10861-10863) ⇒ NO es la vía del seam;
    // la evidencia byte-neutral REAL = forageChargePreview (interruptForage→interruptBonus, GATEADO: 4494 `if(!enabled) return 0`).
  });
  ok("5 BYTE-NEUTRAL OFF: ON+mid-heavy forage>0 PERO OFF+mismo-mob forageChargePreview==0 (seam interruptForage rama muerta ⇒ killEnemy byte-id al HEAD)", neutralOff.onPrev > 0 && neutralOff.offPrev === 0, JSON.stringify(neutralOff));

  // 6 — LUT PURA re-derivada: scoreProbe {0,1,2,3,9} → tier/charge coincide con oracleTier/oracleCharge
  const lutCases = [0, 1, 2, 3, 9];
  const lut = await page.evaluate((cs) => { window.__dev.interrupt({ enabled: true }); const o = cs.map(s => { const p = window.__dev.interrupt({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }); window.__dev.interrupt({ enabled: false }); return o; }, lutCases);
  const lutOK = lut.every(r => r.tier === oracleTier(r.s) && r.charge === oracleCharge(r.s));
  ok("6 LUT PURA score→tier→charge == oráculo re-derivado (det, cap 2)", lutOK, JSON.stringify(lut));

  // 7 — SUB-CAP 2: ningún score produce charge>2
  const capOK = lut.every(r => r.charge <= CAP);
  ok("7 SUB-CAP interruptBountyCap=2 respetado (max charge servido)", capOK, `maxCharge=${Math.max(...lut.map(r => r.charge))}`);

  // 8 — ESTADO→PESO re-derivado (stateProbe mob sintético) == oracleWeight para toda la matriz
  const stMatrix = [
    { state: "shield", specialNow: false, castNow: false, stun: 0 },   // ⇒2
    { state: "strike", specialNow: true, castNow: false, stun: 0 },    // special ⇒2
    { state: "windup", specialNow: false, castNow: true, stun: 0 },    // cast ⇒2
    { state: "windup", specialNow: false, castNow: false, stun: 0 },   // normal ⇒1
    { state: "strike", specialNow: false, castNow: false, stun: 0 },   // normal ⇒1
    { state: "windup", specialNow: true, castNow: false, stun: 999 },  // STUN-FROZEN ⇒0 (aunque mid-heavy)
    { state: "chase", specialNow: false, castNow: false, stun: 0 },    // ⇒0
    { state: "idle", specialNow: false, castNow: false, stun: 0 },     // ⇒0
    { state: "recover", specialNow: false, castNow: false, stun: 0 },  // ⇒0
    { state: "flee", specialNow: false, castNow: false, stun: 0 },     // ⇒0
    { state: "wander", specialNow: false, castNow: false, stun: 0 },   // ⇒0
  ];
  const st = await page.evaluate((cs) => { window.__dev.interrupt({ enabled: true }); const o = cs.map(c => window.__dev.interrupt({ stateProbe: c }).stateProbe); window.__dev.interrupt({ enabled: false }); return o; }, stMatrix);
  const stOK = st.every((r, i) => r.weight === oracleWeight(stMatrix[i].state, stMatrix[i].specialNow, stMatrix[i].castNow, stMatrix[i].stun));
  ok("8 ESTADO→PESO server-auth == oráculo re-derivado (11 estados: shield/special/cast⇒2, windup/strike normal⇒1, stun-frozen/idle/chase/recover/flee/wander⇒0)", stOK, JSON.stringify(st.map((r, i) => `${stMatrix[i].state}${stMatrix[i].specialNow ? "+sp" : ""}${stMatrix[i].castNow ? "+ct" : ""}${stMatrix[i].stun ? "+stun" : ""}=${r.weight}`)));

  // 9 — REAL server-auth: spawnAct empuja un mob REAL a G.enemies; actProbe lee el estado REAL server-auth
  const realKinds = [["heavy", 2], ["shield", 2], ["cast", 2], ["light", 1], ["stun", 0], ["idle", 0]];
  const real = await page.evaluate((kinds) => {
    window.__dev.interrupt({ enabled: true }); window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    const o = kinds.map(([kind]) => {
      window.__dev.interrupt({ clearAct: true });
      const sa = window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind } }).spawnAct;
      const ap = window.__dev.interrupt({ actProbe: true }).actProbe;
      return { kind, saW: sa.weight, apW: ap.mobs[0] ? ap.mobs[0].weight : -1, apScore: ap.score, state: sa.state, stun: sa.stun };
    });
    window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ enabled: false });
    return o;
  }, realKinds);
  const realOK = real.every((r, i) => r.saW === realKinds[i][1] && r.apW === realKinds[i][1] && r.apScore === realKinds[i][1]);
  ok("9 REAL server-auth spawnAct→actProbe: heavy/shield/cast⇒2, light⇒1, stun/idle⇒0 (leído de los MISMOS campos que updateEnemies escribe)", realOK, JSON.stringify(real.map(r => `${r.kind}=${r.apW}`)));

  // 10 — ACTION-crux ⊥ CC#85 (COMPLEMENTO EXACTO): mismo mob mid-windup NO-CC ⇒ int1/ctl0 ; CON stun ⇒ int0/ctl2
  const crux = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true }); window.__dev.controlHarvest({ enabled: true }); window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; const RX = h.tx - 70, RY = h.ty; window.__dev.interrupt({ tp: { tx: RX, ty: RY } });
    // A: mid-windup SIN CC
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "light" } });
    const aInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const aCtl = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    // B: mid-windup CON stun-frozen
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "stun" } });
    const bInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const bCtl = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ enabled: false }); window.__dev.controlHarvest({ enabled: false });
    return { aInt, aCtl, bInt, bCtl };
  });
  // re-derivo con mis oráculos: windup no-CC ⇒ int oracleWeight(windup)=1, ctl oracleControl(0,0)=0 ; windup+stun ⇒ int 0, ctl oracleControl(999,0)=2
  const cruxExp = crux.aInt === oracleWeight("windup", 0, 0, 0) && crux.aCtl === oracleControl(0, 0) && crux.bInt === oracleWeight("windup", 0, 0, 999) && crux.bCtl === oracleControl(999, 0);
  ok("10 ★ ACTION-crux ⊥#85 COMPLEMENTO EXACTO: windup NO-CC ⇒ int1/ctl0 · windup STUN-FROZEN ⇒ int0/ctl2 (DISJUNTOS, == oráculos)", cruxExp && crux.aInt === 1 && crux.aCtl === 0 && crux.bInt === 0 && crux.bCtl === 2, JSON.stringify(crux));

  // 11 — DIFERENCIADOR ⊥ peers: mob mid-HEAVY SANO SUELTO NO-CC ⇒ interrupt T2 MIENTRAS skirmish#84/pack#87/blood#86/control#85 = 0
  const diff = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true }); window.__dev.skirmishLine({ enabled: true }); window.__dev.packHarvest({ enabled: true }); window.__dev.bloodHarvest({ enabled: true }); window.__dev.controlHarvest({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero; const RX = h.tx - 90, RY = h.ty; window.__dev.interrupt({ tp: { tx: RX, ty: RY } });
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "heavy" } });   // orco MELEE sano suelto no-CC mid-special-slam
    const vm = window.__dev.interrupt();
    const ski = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pak = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const blo = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctr = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false }); window.__dev.skirmishLine({ enabled: false }); window.__dev.packHarvest({ enabled: false }); window.__dev.bloodHarvest({ enabled: false }); window.__dev.controlHarvest({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, ski, pak, blo, ctr };
  });
  ok("11 ★ DIFERENCIADOR ⊥ peers: mob mid-HEAVY sano suelto NO-CC ⇒ interrupt T2 (score2/charge2) MIENTRAS skirmish#84/pack#87/blood#86/control#85 = 0", diff.score === 2 && diff.tier === 2 && diff.charge === 2 && diff.ski === 0 && diff.pak === 0 && diff.blo === 0 && diff.ctr === 0, JSON.stringify(diff));

  // 12 — 0-REGRESIÓN: 30 flags del arco #59-#88 served enabled:true; INTERRUPT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ivDark = flag("INTERRUPT_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 30 flags #59-#88 served enabled:true; INTERRUPT_SURGE served false (DARK #89)", arcAllOn && ivDark && arc.length === 30, `interrupt=${flag("INTERRUPT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // shot self-verify (mid-heavy mob, ON)
  await page.evaluate(() => { window.__dev.interrupt({ enabled: true }); window.__dev.interrupt({ clearAct: true }); const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ enabled: false }); });

  // 13 — NORTH STAR 2-cliente 0-desync: A==B (score/tier/charge/actProbe/LUT/fingerprint) + terrHash esperado 15920977
  await sleep(300);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();   // 2ª pág DEBE estar al frente antes de bootear (headless throttla rAF en 2º plano ⇒ boot cuelga)
  await toPlay(pageB);
  const MOB = { tx: 56, ty: 40 }, HERO_TILE = { tx: 53, ty: 40 };   // 3 tiles = 96px ≤ radio 300 ⇒ mid-heavy ⇒ weight2/T2
  const readVM = async (pg) => await pg.evaluate((M, HT) => {
    window.__dev.interrupt({ enabled: true }); window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ tp: { tx: HT.tx, ty: HT.ty } });
    window.__dev.interrupt({ spawnAct: { tx: M.tx, ty: M.ty, kind: "heavy" } });
    const vm = window.__dev.interrupt();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.interrupt({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; });
    const ap = window.__dev.interrupt({ actProbe: true }).actProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, apScore: ap.score, apCount: ap.count, apW: ap.mobs[0] ? ap.mobs[0].weight : -1, apState: ap.mobs[0] ? ap.mobs[0].state : "", lut, fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, MOB, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.apScore === B.apScore && A.apCount === B.apCount && A.apW === B.apW && A.apState === B.apState && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("13 ★ NORTH STAR 2-CLIENTE 0-desync: A==B (score/tier/charge + actProbe + LUT + worldFingerprint byte-idénticos)", conv && A.score === 2 && A.tier === 2 && A.charge === 2, `A={s:${A.score},t:${A.tier},c:${A.charge},apW:${A.apW},apState:${A.apState}} B={s:${B.score},t:${B.tier},c:${B.charge},apW:${B.apW}} fpMatch=${A.fp === B.fp}`);
  ok("14 ★ NORTH STAR fp observado (worldFingerprint length) == esperado 15920977, A==B (mundo determinista compartido; terrHash 2105484439)", A.fpLen === 15920977 && B.fpLen === 15920977 && A.terrHash === B.terrHash, `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} terrHash=${A.terrHash}`);

  // 0 — sin errores JS
  ok("0 sin errores JS durante el run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

  console.log("\n" + results.join("\n"));
  console.log(`\n=== CAS-2533 DARK QA INDEP: ${passed}/${passed + failed} PASS ===`);
  console.log(`fp observado (worldFingerprint length): ${A.fpLen} (esperado 15920977) · terrHash: ${A.terrHash} · 2-cli fpMatch: ${A.fp === B.fp} · build: ${build}`);
  console.log(failed === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed === 0 ? 0 : 1);
