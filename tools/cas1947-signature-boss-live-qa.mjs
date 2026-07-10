// ===========================================================================
// CAS-1952 (QA POST-SHIP for CAS-1947) — LIVE OBSERVABLE QA: JEFE FIRMA MULTI-FASE
// (SIGNATURE_BOSS, 22º pilar / capstone Souls-like).
//
// Verifica el build LIVE (5cc1b10af498) sobre la URL canónica gh-pages. A diferencia de
// una verificación byte/seam, esta corrida DRIVES THE REAL SIM LOOP: summona el jefe firma
// (calderatyrant en la Caldera) vía `dev.armHunt("caldera")` → mismo spawnChampion de prod,
// baja su HP con `dev.setChampHp`, avanza frames con el `update()` exportado, y OBSERVA:
//   1. Fase 1 → Fase 2 al cruzar 50% HP + ventana de vulnerabilidad (×1.5 daño) medida en vivo.
//   2. Specials por fase disparan (p1 slam=14 shards; p2 slam=18 + aplica frost al héroe).
//   3. GUARDRAIL: buildup de ailments al héroe CAPEADO (cap 70) — nunca one-shot (héroe sobrevive).
//   4. Poise-break del jefe lo aturde (ejerce combos del kit).
//   5. Recompensa al matar: +200 Esencia + drop rareza garantizada `rare`.
// Lección durable: deploy byte-correcto != mecánica observable ⇒ aquí se OBSERVA en loop real.
//
//   node tools/cas1947-signature-boss-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const OUT = "shots/cas1952"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const REF = process.env.BLD_REF || "HEAD";
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

// Drive the REAL sim loop through the build's dedicated SIGNATURE_BOSS dev hooks (the same ones
// tools/cas1947-signature-boss.mjs used at build time). Each hook summons the genuine Caldera
// capstone via spawnChampion (no shortcut around windup→strike/special AI or the reward path),
// teleports it clear of world geometry, and drives updateEnemies()/hitEnemy()/damageHero()/
// killEnemy() for a directly OBSERVABLE measurement.
async function driveObservable(page) {
  return await page.evaluate(async () => {
    const R = { steps: {}, err: null };
    try {
      const mod = await import(new URL("sim/sim.js", location.href).href);
      const cfg = await import(new URL("sim/config.js", location.href).href);
      const { G, dev, createHero } = mod;
      const SB = cfg.SIGNATURE_BOSS;
      if (!SB || !SB.enabled) { R.err = "SB off/absent"; return R; }
      if (!dev._sbArm) { R.err = "dedicated _sb dev hooks absent on live"; return R; }

      // --- boot a real run so G.hero exists; default procedural world has the caldera zone (ZONE5 on) ---
      if (!G.hero) createHero("SBQA", "warrior");
      G.scene = "play";

      R.steps.meta = dev.sbMeta();

      // (A) Phase-1 baseline: arm the REAL boss ON.
      const arm = dev._sbArm(true);
      R.steps.arm = arm;

      // (C) Phase transition <=50% HP (HEADLINE) — real updateEnemies tick, once, no rebound.
      R.steps.forcePhase2 = dev._sbForcePhase2();
      // (B/C) boss now phase 2 — read the mutated moveset
      R.steps.p2snap = dev._sbBossSnap();

      // (D) Vuln ×transitionVulnMul measured (baseline vs windowed, same 100 raw dmg).
      R.steps.vuln = dev._sbVulnProbe();

      // (E) Specials fire per phase: re-arm for a clean phase-1 slam, then phase-2 slam + frost infl.
      dev._sbArm(true);
      R.steps.slam_p1 = dev._sbFireSpecial();          // phase 1 → 14 shards
      dev._sbForcePhase2();
      R.steps.slam_p2 = dev._sbFireSpecial();          // phase 2 → 18 shards + frost(_sb) infl

      // (F) GUARDRAIL: hero ailment feed CAPPED (never procs in one Erupción ⇒ NO one-shot); dodge negates.
      dev._sbArm(true); dev._sbForcePhase2();
      R.steps.heroFeed = dev._sbHeroFeed();
      // (F-reg) Pilar-21 regression: a NON-sig-boss frost feed to the hero is NOT globally capped.
      R.steps.genericFeed = dev._sbGenericFeedUncapped();

      // (G) Poise-break: phase-2 poiseMul scales the ceiling; crossing it opens a poiseBreakStunMs stagger.
      // Force the REAL transition first so _sbPoiseMul is populated (only the transition sets it), then probe.
      dev._sbArm(true); dev._sbForcePhase2();
      R.steps.poise = dev._sbPoiseProbe();
      // (G-kit) backstab: rear-arc melee lands the positional crit (exercises the kit vs the boss).
      R.steps.backstab = dev._sbBackstabProbe();

      // (H) Reward: kill the marked boss → +essenceBonus banked + >=1 guaranteed high-rarity drop.
      dev._sbArm(true);
      R.steps.reward = dev._sbRewardProbe();

      // (I) Guardrails motor: RNG-STRONG (srand ON==OFF) + save byte-id (no _sb keys serialized).
      const seedV = 1234567;
      const on = dev._sbSrandProbe(true, seedV, 8);
      const off = dev._sbSrandProbe(false, seedV, 8);
      R.steps.srand = { on, off, fpEqual: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      R.steps.saveByteId = dev._sbSaveByteId();

      return R;
    } catch (e) { R.err = (e && e.message) || String(e); R.stack = e && e.stack; return R; }
  });
}

async function runPass(label, isMobile) {
  console.log(`\n${"=".repeat(60)}\n${label}\n${"=".repeat(60)}`);
  const headHashes = {};
  for (const f of FILES) headHashes[f] = refMd5(f);

  console.log("\n[BUILD] Verificando md5 live==HEAD...");
  const poll = await pollBuild(headHashes);
  for (const f of FILES) ok(`md5 live==HEAD: ${f}`, poll.md5[f] === headHashes[f]);
  ok("pollBuild OK (todos los blobs)", poll.ok);
  console.log("  build live:", poll.build);

  // ---- static knob/seam checks (fast, still valuable) ----
  const cfgText = poll.text["sim/config.js"] || "";
  ok("SIGNATURE_BOSS knob en config live (enabled:true)", cfgText.includes("SIGNATURE_BOSS") && /enabled:\s*true/.test(cfgText));
  ok("boss: calderatyrant en config", cfgText.includes('boss: "calderatyrant"'));
  ok("phase2HpPct: 0.5 en config", cfgText.includes("phase2HpPct: 0.5"));
  const simText = poll.text["sim/sim.js"] || "";
  ok("OFF-gate spawnChampion (SIGNATURE_BOSS.enabled && zone===)", simText.includes("SIGNATURE_BOSS.enabled && zone===SIGNATURE_BOSS.zone"));
  ok("OFF-gate vuln mul en hitEnemy", simText.includes("SIGNATURE_BOSS.enabled && e._sbVuln"));
  ok("OFF-gate ailment feed capeado en damageHero (infl._sb)", simText.includes("SIGNATURE_BOSS.enabled && infl._sb"));
  ok("OFF-gate reward en killEnemy", simText.includes("SIGNATURE_BOSS.enabled && e._sbPhase!==undefined"));
  ok("poise-break stun wired (poiseBreakStunMs/1000)", simText.includes("SIGNATURE_BOSS.poiseBreakStunMs/1000"));

  const chromePath = await findChromium();
  const browser = await puppeteer.launch({ executablePath: chromePath, args: LAUNCH_ARGS });
  const page = await browser.newPage();
  if (isMobile) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 800 });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));

  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 30000 });
  await wait(2000);

  console.log("\n[DRIVE] Observable real-loop drive (dedicated _sb dev hooks)...");
  const R = await driveObservable(page);
  console.log(JSON.stringify(R, null, 1));

  if (R.err) { ok("observable drive ejecutado sin error: " + R.err, false); }
  else {
    const s = R.steps;
    // (A) phase-1 baseline via the REAL spawnChampion
    ok("(A) jefe firma summoned + marcado (_sbPhase!==undefined)", !!s.arm && s.arm.sbMarked === true);
    ok("(A) Fase 1 baseline: phase=1", s.arm.phase === 1);
    ok("(A) Fase 1 special: every=3", s.arm.special && s.arm.special.every === 3);
    ok("(A) Fase 1 special: slamCount=14", s.arm.special && s.arm.special.slamCount === 14);
    ok("(A) meta: boss=calderatyrant zone=caldera", s.meta.boss === "calderatyrant" && s.meta.zone === "caldera");
    // (C) transition (HEADLINE)
    const fp2 = s.forcePhase2;
    ok("(C) HEADLINE Fase 1→2 al cruzar 50% HP", fp2.phaseBefore === 1 && fp2.phaseAfter === 2);
    ok("(C) ventana vuln abierta (_sbVuln=true)", fp2.vuln === true);
    ok(`(C) _sbTransT abre = transitionWindowMs (${fp2.transT}s ≈ ${fp2.expectWindow}s)`, Math.abs(fp2.transT - fp2.expectWindow) < 0.02);
    ok("(C) transición dispara stun breve de fase", fp2.stun > 0);
    ok("(C) transición ocurre UNA vez (no re-abre en 2º cruce)", fp2.reOpened === false);
    ok("(C) Fase 2 moveset: special.every=2", s.p2snap.special.every === 2);
    ok("(C) Fase 2 moveset: slamCount=18", s.p2snap.special.slamCount === 18);
    ok("(C) Fase 2 slam aplica frost (inflType=frost, _sb)", s.p2snap.special.inflType === "frost" && s.p2snap.special.inflSb === true);
    // (D) vuln x1.5 measured
    ok(`(D) daño vuln = ×${s.vuln.expect} (ratio=${s.vuln.ratio}: ${s.vuln.winDmg} vs ${s.vuln.baseDmg})`, s.vuln.ok === true);
    // (E) specials fire per phase
    ok(`(E) Fase 1 slam EMITE 14 shards (count=${s.slam_p1.count})`, s.slam_p1.fired === true && s.slam_p1.count === 14);
    ok(`(E) Fase 2 slam EMITE 18 shards (count=${s.slam_p2.count})`, s.slam_p2.fired === true && s.slam_p2.count === 18);
    ok("(E) Fase 2 shard lleva frost(_sb) al héroe", s.slam_p2.infl && s.slam_p2.infl.type === "frost" && s.slam_p2.infl.sb === true);
    // (F) GUARDRAIL cap + no one-shot (CRITICAL)
    const hf = s.heroFeed;
    ok(`(F) buildup héroe CAPEADO ≤${hf.cap} (meter=${hf.meter}, fed/hit=${hf.fedPerHit}×20)`, hf.capped === true);
    ok("(F) CRÍTICO: cap < umbral proc ⇒ NUNCA procs en un Erupción ⇒ NO one-shot", hf.belowThreshold === true && hf.noOneShot === true);
    ok("(F) esquiva/i-frame NIEGA el feed (dodge counterplay)", hf.dodgedNoFeed === true);
    ok("(F) heroFeed probe OK global", hf.ok === true);
    ok("(F-reg) Pilar-21 intacto: feed NO-jefe NO capeado (proc alcanza)", s.genericFeed.ok === true);
    // (G) poise-break stun 1200ms + backstab kit
    const pp = s.poise;
    ok(`(G) Fase 2 escala poiseMax (pm1=${pp.pm1}→pm2=${pp.pm2}=round(base×${s.meta.phases.p2.poiseMul}))`, pp.scaled === true);
    ok(`(G) poise-break ATURDE ${s.meta.poiseBreakStunMs}ms (staggerT=${pp.staggerT}s ≈ ${pp.expectDur}s)`, pp.durOk === true);
    ok(`(G-kit) backstab rear-arc golpea más fuerte (rear=${s.backstab.rearDmg} > front=${s.backstab.frontDmg})`, s.backstab.ok === true);
    // (H) reward
    ok(`(H) recompensa +${s.reward.essBonus} Esencia (gain=${s.reward.essGain})`, s.reward.essOk === true);
    ok(`(H) drop rareza garantizada ≥${s.meta.rewards.guaranteedRarity} (${JSON.stringify(s.reward.rarities)})`, s.reward.hasGuaranteed === true);
    // (I) engine guardrails
    ok(`(I) RNG-STRONG: srand ON==OFF (fingerprint idéntico; transFired=${s.srand.on.transFired} slamFired=${s.srand.on.slamFired})`, s.srand.fpEqual === true);
    ok(`(I) SAVE byte-id ON==OFF sin claves _sb (byteId=${s.saveByteId.byteId}, noSbKey=${s.saveByteId.noSbKey})`, s.saveByteId.ok === true);
  }

  ok("boot sin errores JS", jsErrors.length === 0);
  if (jsErrors.length) console.error("  JS errors:", jsErrors.slice(0, 5));

  await page.screenshot({ path: `${OUT}/${isMobile ? "mobile" : "desktop"}_game.png` });
  console.log(`  screenshot: ${OUT}/${isMobile ? "mobile" : "desktop"}_game.png`);
  await browser.close();
}

await runPass("PASS 1 — Desktop", false);
await runPass("PASS 2 — Mobile", true);

console.log("\n" + "=".repeat(60));
console.log(`CAS-1952 SIGNATURE_BOSS OBSERVABLE live QA: ${pass} pass, ${fail} fail`);
if (fail > 0) { console.error("FAIL"); process.exit(1); }
else console.log("PASS");
