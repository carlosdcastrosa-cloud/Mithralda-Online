// CAS-2529 — DARK QA Gate 2/2 (QA-OWNED, INDEPENDIENTE) para REMATE A DISTANCIA (LONGSHOT_SURGE.enabled:false, EVO#88) @ master aa50b28.
// NO reusa el harness GE (cas2527). Oráculos RE-DERIVADOS desde cero en JS PURO — sólo leo los KNOBS del CEO (farR/midR/reachWeights/tiers/cap) del snapshot servido
// y recomputo la relación distancia→peso→tier→charge por MI cuenta ⇒ corroboración indep del seam sim.js. Verdict: PASS/FAIL X/Y + fp 2-cli + 0-desync + 0-regr.
//
// Eje ⊥29 = DISTANCIA DE REMATE (geometría hero↔víctima al kill): reachWeight(dist)= far(≥farR)⇒2 / near(≥midR,<farR)⇒1 / point-blank(<midR)⇒0.
// Canal FRESCO reachFind→h.reachBounty transitorio (fuera del save + worldFingerprint), sub-cap reachBountyCap=2. DARK ⇒ enabled:false ⇒ byte-neutral OFF.
//
// Cobertura (issue CAS-2529):
//  1 North Star 2-cli 0-desync (B==C byte-idéntico: score/tier/charge + reachProbe + LUT + worldFingerprint)
//  2 byte-neutral OFF (enabled:false ⇒ score/charge/preview 0 aun con mob FAR; gExists false; save sin claves)
//  3 STATELESS (h.reachBounty/reachFind ∉ save allowlist ∉ worldFingerprint; toggle ON/OFF fp-neutral)
//  4 DISTANCE-crux ⊥#84/#73 (MISMO mob FAR⇒T2, POINT-BLANK⇒T0: pura geometría)
//  5 Diferenciador ⊥ peers (orco melee SANO SUELTO FAR ⇒ remate T2, escaramuza#84/manada#87/siega#86/control#85 IGNORAN)
//  6 REAL server-auth (spawnShot→reachProbe distancia real ⇒ peso; LUT/distProbe puras, sub-cap 2, 0 RNG)
//  7 Observable hook (__dev.longshot snapshot coherente con MI oráculo re-derivado)
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2529-longshot-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2529-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ===== ORÁCULOS RE-DERIVADOS DESDE CERO (JS puro, indep del seam) =====
// reachWeight: sólo leo los knobs del CEO (farR, midR, reachWeights) y computo el peso YO.
function oracleWeight(dist, k) {
  const d = +dist || 0;
  if (d >= (+k.farR || 0)) return +((k.reachWeights || {}).far) || 0;
  if (d >= (+k.midR || 0)) return +((k.reachWeights || {}).near) || 0;
  return 0;
}
// oracleTier: el tier vigente = el índice+1 del último tier cuyo min ≤ score (0 si ninguno).
function oracleTier(score, tiers) {
  let t = 0;
  for (let i = 0; i < (tiers || []).length; i++) if (score >= (+tiers[i].min || 0)) t = i + 1;
  return t;
}
// oracleCharge: charge del tier vigente, acotado por el sub-cap. OFF ⇒ 0.
function oracleCharge(score, tiers, cap, enabled) {
  if (!enabled) return 0;
  const t = oracleTier(score, tiers);
  if (t <= 0) return 0;
  const raw = +tiers[t - 1].charge || 0;
  return cap > 0 ? Math.min(cap, raw) : raw;
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
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
  await sleep(400);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // ---- 1 boot + hooks ----
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.longshot && window.__dev.packHarvest &&
    window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex &&
    window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boot to play, __dev.longshot + peer hooks present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // Snapshot DARK inicial (leo SÓLO los knobs del CEO)
  const d0 = await page.evaluate(() => window.__dev.longshot());
  const K = { farR: d0.farR, midR: d0.midR, reachWeights: d0.reachWeights, tiers: d0.tiers, cap: d0.cap };

  // ---- 2 byte-neutral OFF (fresh boot) ----
  ok("2 DARK OFF: enabled:false + gExists false (G.reachBounty NUNCA creado) + score/charge/preview 0 + channel reachFind",
    d0.enabled === false && d0.gExists === false && d0.score === 0 && d0.charge === 0 &&
    d0.forageChargePreview === 0 && d0.channel === "reachFind" && d0.tag === "",
    `enabled=${d0.enabled} gExists=${d0.gExists} score=${d0.score} charge=${d0.charge} preview=${d0.forageChargePreview} farR=${d0.farR} midR=${d0.midR} cap=${d0.cap}`);

  // ---- 3 STATELESS: save allowlist sin reachFind/reachBounty + fingerprint toggle-neutral ----
  const st = await page.evaluate(() => {
    const blob = window.__dev.saveBlob ? window.__dev.saveBlob() : "";
    const s = typeof blob === "string" ? blob : JSON.stringify(blob);
    const fpOff = window.__dev.worldFingerprint();
    window.__dev.longshot({ enabled: true });
    const fpOn = window.__dev.worldFingerprint();
    window.__dev.longshot({ enabled: false });
    const fpOff2 = window.__dev.worldFingerprint();
    return { hasReach: /reachFind|reachBounty/.test(s), len: s.length,
      fpOff: JSON.stringify(fpOff), fpOn: JSON.stringify(fpOn), fpOff2: JSON.stringify(fpOff2) };
  });
  ok("3 STATELESS: save allowlist SIN reachFind/reachBounty + worldFingerprint byte-id a través del toggle ON/OFF/OFF",
    !st.hasReach && st.fpOff === st.fpOn && st.fpOn === st.fpOff2,
    `hasReachKey=${st.hasReach} len=${st.len} fpToggleMatch=${st.fpOff === st.fpOn && st.fpOn === st.fpOff2}`);

  // ---- 6a REAL server-auth: spawnShot mob REAL a G.enemies + reachProbe distancia real; MI oráculo == hook ----
  // Enciendo en-memoria para observar señal; teleport a un tile aislado; inyecto mob a distintas distancias.
  const sa = await page.evaluate((farR) => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });          // héroe a un tile aislado
    // mob FAR: lo pongo lejos en X (≥farR px). TS suele ser 32 ⇒ +8 tiles ≈ 256px.
    const far = window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });
    const rpFar = window.__dev.longshot({ reachProbe: true });
    window.__dev.longshot({ clearShot: true });
    // mob POINT-BLANK: mismo tile que el héroe.
    const pb = window.__dev.longshot({ spawnShot: { tx: 200, ty: 150 } });
    const rpPb = window.__dev.longshot({ reachProbe: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { far, rpFar, pb, rpPb };
  }, K.farR);
  const wFarOracle = oracleWeight(sa.far.spawnShot.dist, K);
  const wPbOracle = oracleWeight(sa.pb.spawnShot.dist, K);
  ok("6 REAL server-auth: spawnShot inyecta mob REAL a G.enemies; reachProbe lee DISTANCIA real ⇒ MI oráculo(dist)==peso servido (far y point-blank)",
    sa.far.spawnShot.dist >= K.farR && sa.far.spawnShot.weight === wFarOracle && wFarOracle === 2 &&
    sa.rpFar.reachProbe.score === wFarOracle && sa.rpFar.reachProbe.count === 1 &&
    sa.pb.spawnShot.dist < K.midR && sa.pb.spawnShot.weight === wPbOracle && wPbOracle === 0 &&
    sa.rpPb.reachProbe.score === 0,
    `farDist=${sa.far.spawnShot.dist} farW=${sa.far.spawnShot.weight}(oracle ${wFarOracle}) rpFarScore=${sa.rpFar.reachProbe.score} rpFarCount=${sa.rpFar.reachProbe.count} pbDist=${sa.pb.spawnShot.dist} pbW=${sa.pb.spawnShot.weight}(oracle ${wPbOracle}) rpPbScore=${sa.rpPb.reachProbe.score}`);

  // ---- 6b LUT scoreProbe + distProbe puras: MI oráculo == hook para un barrido ----
  const sweep = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    const scores = [0, 1, 2, 3, 9].map(s => window.__dev.longshot({ scoreProbe: { score: s } }).scoreProbe);
    const dists = [0, 109, 110, 209, 210, 300].map(d => window.__dev.longshot({ distProbe: { dist: d } }).distProbe);
    window.__dev.longshot({ enabled: false });
    return { scores, dists };
  });
  let lutOk = true, lutDetail = [];
  for (const r of sweep.scores) {
    const t = oracleTier(r.score, K.tiers), c = oracleCharge(r.score, K.tiers, K.cap, true);
    if (r.tier !== t || r.charge !== c) { lutOk = false; lutDetail.push(`score${r.score}:hook(t${r.tier}/c${r.charge})!=oracle(t${t}/c${c})`); }
  }
  for (const r of sweep.dists) {
    const w = oracleWeight(r.dist, K), f = oracleCharge(w, K.tiers, K.cap, true);
    if (r.weight !== w || r.forage !== f) { lutOk = false; lutDetail.push(`dist${r.dist}:hook(w${r.weight}/f${r.forage})!=oracle(w${w}/f${f})`); }
  }
  ok("6b LUT/distProbe puras: MI oráculo re-derivado == hook servido (score→tier→charge y dist→peso→forage), sub-cap≤2",
    lutOk, lutDetail.length ? lutDetail.join("; ") : `scores=${JSON.stringify(sweep.scores.map(r => [r.score, r.tier, r.charge]))} dists=${JSON.stringify(sweep.dists.map(r => [r.dist, r.weight, r.forage]))}`);

  // ---- 4 DISTANCE-crux ⊥#84/#73: MISMO mob FAR⇒T2, POINT-BLANK⇒T0 (pura geometría) ----
  const crux = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });   // mismo mob, FAR
    const far = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ spawnShot: { tx: 200, ty: 150 } });   // mismo mob (idéntico), POINT-BLANK
    const pb = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { far: { score: far.score, tier: far.tier }, pb: { score: pb.score, tier: pb.tier } };
  });
  ok("4 DISTANCE-crux ⊥#84/#73: MISMO mob FAR⇒score2/T2, POINT-BLANK⇒score0/T0 (geometría hero↔víctima, NO stats del mob)",
    crux.far.score === 2 && crux.far.tier === 2 && crux.pb.score === 0 && crux.pb.tier === 0,
    `far=${JSON.stringify(crux.far)} pb=${JSON.stringify(crux.pb)}`);

  // ---- 5 Diferenciador ⊥ peers: orco melee SANO SUELTO FAR ⇒ remate T2 mientras escaramuza/manada/siega/control IGNORAN ----
  const diff = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });   // orco melee sano suelto, FAR (in-radio 260 de los peers)
    const ls = window.__dev.longshot();
    const peers = {
      ski: (window.__dev.skirmishLine ? (window.__dev.skirmishLine().score || 0) : 0),
      pak: (window.__dev.packHarvest ? (window.__dev.packHarvest().score || 0) : 0),
      blo: (window.__dev.bloodHarvest ? (window.__dev.bloodHarvest().score || 0) : 0),
      ctr: (window.__dev.controlHarvest ? (window.__dev.controlHarvest().score || 0) : 0),
    };
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { ls: { score: ls.score, tier: ls.tier, charge: ls.charge }, peers };
  });
  ok("5 Diferenciador ⊥ peers: orco melee SANO SUELTO FAR ⇒ remate score2/T2 MIENTRAS escaramuza#84/manada#87/siega#86/control#85 = 0",
    diff.ls.score === 2 && diff.ls.tier === 2 &&
    diff.peers.ski === 0 && diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0,
    `longshot=${JSON.stringify(diff.ls)} peers=${JSON.stringify(diff.peers)}`);

  // ---- 2b byte-neutral OFF con mob FAR: OFF ⇒ score/charge/preview 0 aun con long-shot disponible ----
  const offFar = await page.evaluate(() => {
    window.__dev.longshot({ enabled: false });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });   // mob FAR PERO flag OFF
    const off = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    return { enabled: off.enabled, score: off.score, tier: off.tier, charge: off.charge, preview: off.forageChargePreview, tag: off.tag };
  });
  ok("2b BYTE-NEUTRAL OFF con mob FAR presente: enabled:false ⇒ score/tier/charge/preview 0 + tag '' (0 fichas al seam ⇒ killEnemy byte-id)",
    offFar.enabled === false && offFar.score === 0 && offFar.tier === 0 && offFar.charge === 0 && offFar.preview === 0 && offFar.tag === "",
    JSON.stringify(offFar));

  // ---- 7 Observable hook coherente: VM (score/tier/charge/tag) == MI oráculo, ON con mob FAR ----
  const vm = await page.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });
    const s = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { score: s.score, tier: s.tier, charge: s.charge, tag: s.tag, preview: s.forageChargePreview };
  });
  const vmT = oracleTier(vm.score, K.tiers), vmC = oracleCharge(vm.score, K.tiers, K.cap, true);
  ok("7 Observable hook: VM (score/tier/charge/tag/preview) coherente con MI oráculo re-derivado (score2⇒T2/c2/⌖)",
    vm.tier === vmT && vm.charge === vmC && vm.charge === 2 && vm.tag === "⌖" && vm.preview === 2,
    `vm=${JSON.stringify(vm)} oracle(t${vmT}/c${vmC})`);

  // ---- 8 0-REGRESIÓN: config SERVIDA — 29 flags #59-#87 enabled:true; LONGSHOT_SURGE false ----
  const cfgTxt = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const flagState = (name) => { const m = cfgTxt.match(new RegExp("export const " + name + "\\s*=\\s*\\{[^]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE"];
  const arcOff = ARC.filter(n => flagState(n) !== "true");
  const lsState = flagState("LONGSHOT_SURGE");
  ok("8 0-REGRESIÓN: config servida — 29 mecánicas #59-#87 enabled:true (0 flip) + LONGSHOT_SURGE enabled:false (DARK #88)",
    arcOff.length === 0 && lsState === "false",
    `arcOff=${JSON.stringify(arcOff)} longshot=${lsState}`);

  // ---- 9 NORTH STAR 2-CLIENTE 0-desync: 2 páginas, MISMO mob FAR + héroe ⇒ todo byte-idéntico ----
  const measure = async (pg) => await pg.evaluate(() => {
    window.__dev.longshot({ enabled: true });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    const shot = window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });
    const rp = window.__dev.longshot({ reachProbe: true }).reachProbe;
    const sp = window.__dev.longshot({ scoreProbe: { score: 2 } });
    const s = window.__dev.longshot();
    const fp = window.__dev.worldFingerprint();
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ enabled: false });
    return { score: s.score, tier: s.tier, charge: s.charge, rpScore: rp.score, rpCount: rp.count, rpDist: rp.mobs[0] ? rp.mobs[0].dist : -1,
      spTier: sp.scoreProbe.tier, spCharge: sp.scoreProbe.charge, shotDist: shot.spawnShot.dist,
      fp: JSON.stringify(fp).length, fpHash: JSON.stringify(fp) };
  });
  const A = await measure(page);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("B:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();   // headless chromium throttla el rAF de páginas en 2º plano ⇒ el boot se estanca; foregroundear antes de bootear
  await toPlay(page2);
  const B = await measure(page2);
  const nsMatch = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore &&
    A.rpCount === B.rpCount && A.rpDist === B.rpDist && A.spTier === B.spTier && A.spCharge === B.spCharge &&
    A.shotDist === B.shotDist && A.fpHash === B.fpHash;
  ok("9 ★ NORTH STAR 2-CLIENTE: MISMO mob FAR+héroe ⇒ score/tier/charge + reachProbe + LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
    nsMatch, `A={score:${A.score},tier:${A.tier},charge:${A.charge},rpDist:${A.rpDist},fpLen:${A.fp}} B={score:${B.score},tier:${B.tier},charge:${B.charge},rpDist:${B.rpDist},fpLen:${B.fp}} fpMatch=${A.fpHash === B.fpHash}`);

  // screenshot evidencia (badge ON con long-shot)
  await page.evaluate(() => { window.__dev.longshot({ enabled: true }); window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } }); window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.longshot({ clearShot: true }); window.__dev.longshot({ enabled: false }); });

  ok("0 no JS errors during run", errors.length === 0, `err=${errors.length}${errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""}`);

} catch (e) {
  FAIL++;
  console.log("FAIL  harness exception  — " + String(e && e.stack || e));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "HAS FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
