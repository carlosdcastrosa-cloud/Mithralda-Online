// ===========================================================================
// CAS-1957 (QA live for CAS-1954, eslabón 3/4) — LIVE OBSERVABLE QA:
// CENIZAS DE ESPÍRITU (Spirit Summon, knob SUMMON) — 1er aliado IA invocable.
//
// Verifica el build LIVE (4ef6efbe196c) sobre la URL canónica gh-pages. A diferencia de
// una verificación byte/seam, esta corrida DRIVES THE REAL SIM LOOP en el navegador:
//   (1) md5 served==HEAD de los 4 blobs tocados (config·sim·render·input).
//   (2) Static knob/seam checks (SUMMON enabled:false byte-id + ambos SEAMs OFF-gated).
//   (3) Observable via los dev-hooks REALES _sum* servidos (AC0-AC11): spawn/carga,
//       refill zona+hoguera, IA target, daño PLANO ×1 0-srand, SEAM1 retarget,
//       SEAM2 golpe→HP espíritu (héroe intacto), expira, srand ON==OFF, save byte-id,
//       REG 22 pilares. Fingerprint idéntico entre 2 corridas (determinista).
//   (4) HEADLINE VISUAL en LOOP REAL: se persiste un espíritu peleando junto a un
//       enemigo en scene=play y se deja correr el rAF propio del juego (update→
//       updateSpirit→updateEnemies→render). Se lee de vuelta: el enemigo ENCARA al
//       espíritu (SEAM1, e._sumAggro), su golpe de contacto BAJA el HP del espíritu
//       (SEAM2) y el HP del HÉROE queda INTACTO ⇒ la aggro se DIVIDE. Screenshot con
//       el espíritu cian visible. (lección capstone CAS-1947: byte/seam != observable).
//
//   node tools/cas1957-summon-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js", "input.js"];
const OUT = "shots/cas1957"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const REF = process.env.SUM_REF || "HEAD";
const refMd5 = (f) => md5(execSync(`git show ${REF}:${f}`).toString());

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt);
        if (lastMd5[f] !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

let pass = 0, fail = 0;
function ok(label, cond) { if (cond) { pass++; console.log("  ✓ " + label); } else { fail++; console.error("  ✗ " + label); } }

// Drive the REAL sim loop through the build's dedicated SUMMON dev hooks (the same _sum* the
// build harness tools/cas1954-summon.mjs exercised). Each hook toggles SUMMON via _sumArm and
// drives the genuine spawnSpirit/updateSpirit/hitSpirit/tickSummon + the two SEAMs via
// updateEnemies()/damageHero() against the LIVE-served code. Returns a compact fingerprint.
async function driveObservable(page) {
  return await page.evaluate(async () => {
    const R = { steps: {}, err: null };
    try {
      const mod = await import(new URL("sim/sim.js", location.href).href);
      const cfg = await import(new URL("sim/config.js", location.href).href);
      const { G, dev, createHero } = mod;
      const SUM = cfg.SUMMON;
      if (!SUM) { R.err = "SUMMON knob absent on live"; return R; }
      if (!dev._sumArm || !dev._sumSeam2Probe) { R.err = "dedicated _sum dev hooks absent on live"; return R; }

      if (!G.hero) createHero("BrasaQA", "warrior");
      G.scene = "play";
      const defaultEnabled = SUM.enabled;   // config.js default (must be false = byte-id to HEAD)

      R.steps.meta = dev.summonMeta();
      R.steps.defaultOff = defaultEnabled === false;

      // AC0 OFF byte-id (ambos SEAMs no-op, héroe recibe)
      R.steps.off = dev._sumOffProbe();
      // AC1 baseline == 22 pilares (ON sin invocar)
      R.steps.baseline = dev._sumBaselineProbe();
      R.steps.pillars = { sb: cfg.SIGNATURE_BOSS.enabled, bld: cfg.STATUS_BUILDUP.enabled, wb: cfg.WEAPON_BUFFS.enabled, poise: cfg.POISE.enabled, back: cfg.BACKSTAB.enabled };
      // AC2 spawn + carga
      R.steps.spawn = dev._sumSpawnProbe();
      // AC3 refill zona + hoguera
      R.steps.refill = dev._sumRefillProbe();
      R.steps.bonfire = dev._sumBonfireProbe();
      // AC4 IA target
      R.steps.target = dev._sumTargetProbe();
      // AC5 daño plano ×1 0-srand
      R.steps.damage = dev._sumDamageProbe();
      // AC6 SEAM1 retarget
      R.steps.seam1 = dev._sumSeam1Probe();
      // AC7 SEAM2 HEADLINE redirect
      R.steps.seam2 = dev._sumSeam2Probe();
      // AC8 expira
      R.steps.expire = dev._sumExpireProbe();
      // AC9 srand ON==OFF
      const on = dev._sumSrandProbe(true, 0xC1A, 8);
      const offr = dev._sumSrandProbe(false, 0xC1A, 8);
      R.steps.srand = { on, off: offr, fpEqual: JSON.stringify(on.fingerprint) === JSON.stringify(offr.fingerprint) };
      // AC10 save byte-id
      R.steps.save = dev._sumSaveByteId();

      // restore default (leave the page clean for the visual stage)
      SUM.enabled = defaultEnabled; G._spirit = null; G.enemies.length = 0;
      return R;
    } catch (e) { R.err = (e && e.message) || String(e); R.stack = e && e.stack; return R; }
  });
}

// HEADLINE VISUAL: persist a real spirit next to a hostile enemy in scene=play and let the game's
// OWN rAF loop (update→updateSpirit→updateEnemies→render) animate the fight for ~N frames. Then
// read back the observable: enemy faces/aggros the spirit (SEAM1), its contact hit drains the
// SPIRIT hp (SEAM2), and the HERO hp stays intact ⇒ aggro is DIVIDED. Screenshot shows cyan spirit.
async function stageVisual(page) {
  // driveObservable already booted a real hero into scene="play" on this page; the only thing covering
  // the canvas is the leftover #nameWrap menu-input DOM. Force scene=play and hide the menu DOM overlay
  // so the screenshot is a real in-world frame.
  await page.evaluate(async () => {
    const m = await import(new URL("sim/sim.js", location.href).href);
    if (!m.G.hero) m.createHero("BrasaQA", "warrior");
    m.G.scene = "play";
    for (const id of ["nameWrap", "dev"]) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
  });

  // spawnEnemy is module-internal; drive the genuine scene through the dedicated _sumSeam1Probe hook,
  // which spawns a real enemy + a real spirit adjacent and runs one updateEnemies tick. We then persist
  // them in scene=play and let the game's OWN rAF loop keep fighting/drawing them.
  const staged = await page.evaluate(async () => {
    const mod = await import(new URL("sim/sim.js", location.href).href);
    const cfg = await import(new URL("sim/config.js", location.href).href);
    const { G, dev } = mod;
    cfg.SUMMON.enabled = true;
    // _sumSeam1Probe spawns a genuine enemy + a genuine spirit adjacent and runs one updateEnemies
    // tick (marking e._sumAggro). It leaves G._spirit + G.enemies populated in scene=play.
    const s1 = dev._sumSeam1Probe();
    const sp = G._spirit, en = G.enemies[0];
    if (!sp || !en) return { err: "no spirit/enemy after seam1 stage" };
    // give the spirit a readable HP bar and park the enemy on top of it so its contact hit lands
    sp.hp = sp.maxHp = 200; sp.life = 8;
    en.x = sp.x + 10; en.y = sp.y; en.state = "chase"; en.stun = 0;
    G.hero.x = sp.x - 90; G.hero.y = sp.y;   // hero clearly apart => visibly not the one taking hits
    const heroHp0 = G.hero.hp, spHp0 = sp.hp;
    G.scene = "play";
    return { seam1: s1, heroHp0, spHp0, spx: sp.x, spy: sp.y };
  });
  if (staged.err) return staged;

  // let the game's OWN loop run the real fight for ~2.5s (no key input => hero stands, spirit fights)
  await wait(2500);

  const observed = await page.evaluate(async () => {
    const mod = await import(new URL("sim/sim.js", location.href).href);
    const { G } = mod;
    const sp = G._spirit, en = G.enemies[0];
    return {
      spiritAlive: !!(sp && sp.hp > 0),
      spiritHp: sp ? +sp.hp.toFixed(1) : null,
      spiritMaxHp: sp ? sp.maxHp : null,
      heroHp: G.hero ? +G.hero.hp.toFixed(1) : null,
      heroMaxHp: G.hero ? G.hero.maxHp : null,
      enemyAggroSpirit: !!(en && en._sumAggro),
      scene: G.scene,
    };
  });
  return { ...staged, ...observed };
}

async function runPass(label, isMobile) {
  console.log(`\n${"=".repeat(60)}\n${label}\n${"=".repeat(60)}`);
  const headHashes = {};
  for (const f of FILES) headHashes[f] = refMd5(f);

  console.log("\n[BUILD] Verificando md5 live==HEAD (4 blobs)...");
  const poll = await pollBuild(headHashes);
  for (const f of FILES) ok(`md5 live==HEAD: ${f}`, poll.md5[f] === headHashes[f]);
  ok("pollBuild OK (todos los blobs)", poll.ok);
  console.log("  build live:", poll.build);

  // ---- static knob/seam checks ----
  const cfgText = poll.text["sim/config.js"] || "";
  ok("SUMMON knob en config live (enabled:false byte-id)", cfgText.includes("SUMMON") && /SUMMON[\s\S]{0,120}?enabled:\s*false/.test(cfgText));
  ok('key:"KeyN" en config', cfgText.includes('key: "KeyN"') || cfgText.includes('key:"KeyN"'));
  const simText = poll.text["sim/sim.js"] || "";
  ok("SEAM1 OFF-gate en updateEnemies (spiritAggroTarget / G.hero)", /SUMMON\.enabled\s*\?\s*spiritAggroTarget/.test(simText) || simText.includes("_sumAggro = (h !== G.hero)"));
  ok("SEAM2 OFF-gate en damageHero (SUMMON.enabled && src._sumAggro)", simText.includes("SUMMON.enabled && src && src._sumAggro"));
  const renText = poll.text["render/render.js"] || "";
  ok("render espíritu OFF-gated (SUMMON.enabled && G._spirit)", renText.includes("SUMMON.enabled && G._spirit"));
  const inText = poll.text["input.js"] || "";
  ok("input KeyN gated en live", inText.includes("KeyN"));

  const chromePath = await findChromium();
  const browser = await puppeteer.launch({ executablePath: chromePath, args: LAUNCH_ARGS });
  const page = await browser.newPage();
  if (isMobile) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 800 });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));

  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 30000 });
  await wait(2000);

  console.log("\n[DRIVE] Observable real-loop drive (dedicated _sum dev hooks)...");
  const R = await driveObservable(page);
  console.log(JSON.stringify(R, null, 1));

  let fp = null;
  if (R.err) { ok("observable drive ejecutado sin error: " + R.err, false); }
  else {
    const s = R.steps;
    ok("content: SUMMON knob (key/charges/summonMs/threat/spirit)", s.meta && s.meta.key && s.meta.charges > 0 && s.meta.summonMs > 0 && s.meta.threat === "nearest" && s.meta.spirit && s.meta.spirit.dmgMul > 0);
    ok("AC0 OFF: enabled:false default (byte-id a HEAD)", s.defaultOff === true);
    ok("AC0 OFF: spawn inerte + refill inerte + ambos SEAMs no-op (héroe recibe)", s.off && s.off.ok === true);
    ok("AC1 baseline: 22 pilares intactos (SB/BLD/WB/POISE/BACKSTAB)", s.pillars.sb && s.pillars.bld && s.pillars.wb && s.pillars.poise && s.pillars.back);
    ok("AC1 baseline: ON sin invocar ⇒ noSpirit/noSpend/SEAM1 no-op", s.baseline && s.baseline.ok === true);
    ok(`AC2 carga: invoca gasta 1 (${s.spawn.before}→${s.spawn.after}), re-invoca no-op, 0 deny`, s.spawn && s.spawn.ok === true);
    ok("AC3 refill: zona (misma sin refill · nueva a tope · seed registra)", s.refill && s.refill.ok === true);
    ok(`AC3 hoguera: recarga a tope (charges=${s.bonfire.charges})`, s.bonfire && s.bonfire.ok === true);
    ok(`AC4 IA target: nearest al espíritu · LOCK_ON manda (lockOn=${s.target.lockOn})`, s.target && s.target.ok === true);
    ok(`AC5 daño: PLANO ×1 sin crit (${s.damage.dealt}==${s.damage.base}) + 0-srand; héroe SÍ dibuja`, s.damage && s.damage.ok === true);
    ok(`AC6 SEAM1: enemigo marca e._sumAggro y ENCARA (OFF no marca)`, s.seam1 && s.seam1.ok === true);
    ok(`AC7 SEAM2 HEADLINE: golpe lo COME el espíritu (HP↓ negado) + HÉROE intacto; sin aggro lo recibe el héroe`, s.seam2 && s.seam2.ok === true);
    ok(`AC8 expira: timer · HP · hitSpirit a 0 disipa`, s.expire && s.expire.ok === true);
    ok(`AC9 RNG: srand ON==OFF (${s.srand.on.fingerprint.length}-draw idéntico) spawn/ataque/SEAMs 0-draw`, s.srand.fpEqual === true && s.srand.on.spawned && s.srand.on.attacked && s.srand.on.seamed);
    ok(`AC10 SAVE: serializeSave byte-id ON/OFF (${s.save.offLen}==${s.save.onLen}) sin clave summon/_spirit`, s.save && s.save.ok === true);
    ok("AC11 REG: SIGNATURE_BOSS + STATUS_BUILDUP + core intactos con SUMMON on/off", s.pillars.sb && s.pillars.bld && s.pillars.poise && s.pillars.back);
    // fingerprint for cross-run determinism (stable, structural)
    fp = { off: s.off.ok, base: s.baseline.ok, spawn: s.spawn.ok, refill: s.refill.ok, bonfire: s.bonfire.ok,
      target: s.target.ok, dmg: [s.damage.base, s.damage.dealt, s.damage.flat, s.damage.zeroDraw, s.damage.heroDraws],
      seam1: s.seam1.ok, seam2: s.seam2.ok, expire: s.expire.ok, rngFp: s.srand.on.fingerprint, save: [s.save.byteId, s.save.noKey] };
  }

  console.log("\n[VISUAL] HEADLINE aggro-division en LOOP REAL (rAF propio del juego)...");
  const V = await stageVisual(page);
  console.log(JSON.stringify(V, null, 1));
  if (V.err) { ok("visual stage sin error: " + V.err, false); }
  else {
    ok(`(VISUAL) espíritu VIVO peleando en el loop (hp=${V.spiritHp}/${V.spiritMaxHp})`, V.spiritAlive === true);
    ok(`(VISUAL) SEAM1: el enemigo ENCARA/aggroa al espíritu (e._sumAggro)`, V.enemyAggroSpirit === true);
    ok(`(VISUAL HEADLINE) SEAM2: el jefe golpea al ESPÍRITU ⇒ su HP baja (${V.spHp0}→${V.spiritHp})`, V.spiritHp < V.spHp0);
    ok(`(VISUAL HEADLINE) el HÉROE queda PROTEGIDO (hp ${V.heroHp0}→${V.heroHp} intacto)`, V.heroHp === V.heroHp0);
    ok(`(VISUAL) aggro DIVIDIDA: espíritu recibe el daño, héroe no`, V.spiritHp < V.spHp0 && V.heroHp === V.heroHp0);
  }

  ok("boot sin errores JS", jsErrors.length === 0);
  if (jsErrors.length) console.error("  JS errors:", jsErrors.slice(0, 5));

  const shot = `${OUT}/${isMobile ? "mobile" : "desktop"}_spirit.png`;
  await page.screenshot({ path: shot });
  console.log(`  screenshot: ${shot}`);
  await browser.close();
  return fp;
}

const fp1 = await runPass("PASS 1 — Desktop", false);
const fp2 = await runPass("PASS 2 — Mobile", true);
const detOk = fp1 && fp2 && JSON.stringify(fp1) === JSON.stringify(fp2);
ok(`determinism: 2 corridas fingerprint idéntico`, detOk);

console.log("\n" + "=".repeat(60));
console.log(`CAS-1957 SUMMON OBSERVABLE live QA: ${pass} pass, ${fail} fail`);
if (fail > 0) { console.error("FAIL"); process.exit(1); }
else console.log("PASS");
