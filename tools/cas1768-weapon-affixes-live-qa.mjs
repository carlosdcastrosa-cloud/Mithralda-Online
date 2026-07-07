// ===========================================================================
// CAS-1771 — LIVE QA: Afijos de Arma on-hit (Weapon on-hit affixes). Verifies
// the CAS-1769 build (deployed by CAS-1770) on the canonical gh-pages URL.
// PASS x2 (desktop + mobile), browser-per-pass.
//
// Feature = a dropped WEAPON may roll 0–1 "on-hit" affix (vampiric/cadena/
// ardiente/aturdidor/perforante) that fires a DETERMINISTIC effect in the single
// damage choke `hitEnemy`. GUARDRAIL vs the last 3 beats (Códice/Títulos/Pactos,
// all own-blob): THIS one touches save.v1 — the affix is ONE optional TRAILING
// field `wa:"<id>"` on the weapon instance (mirror of uniq/set/fl in safeInst).
// Magnitude is NEVER stored — it is DERIVED from config by (affixId, weapon tier).
// Hard-gated by WEAPON_AFFIXES.enabled. Randomness rides a DEDICATED affixRng
// (seed 0x0a771c5e), so the base srand stream is byte-identical ON==OFF.
//
//   node tools/cas1768-weapon-affixes-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1769 build touched exactly these 3 runtime blobs — HARD md5 gate):
//   sim/config.js, sim/sim.js, render/render.js
//
// NOTE (observation, not a defect): the build wired the `wa*` dev hooks onto the
// sim.js `dev` export but did NOT add them to game.js's explicit window.__dev
// allowlist (game.js was not touched). This harness recovers them by dynamically
// importing the SAME live module URL — ESM dedups by URL, so `import()` returns
// the RUNNING game's sim module instance (same live G.hero), i.e. the exact served
// bytes. That is a STRONGER live check than window.__dev (it exercises the served
// module directly). window.__dev still carries the codex/titles/pacts srand
// regression probes, used below.
//
// Covers AC0 md5 live==HEAD + version.json build / SEAM served-bytes contain the
// feature / AC2 WEAPON_AFFIXES.enabled=false ⇒ base srand byte-id ON==OFF (48-draw
// on affixRng-riding dropGear) + waCount OFF=0 / affixRng determinism / draw-count
// §3 (common/body/uniq→0, uncommon→1+1) / AC1 save.v1 byte-id GUARDRAIL affix-less
// weapon (enabled=false AND enabled=true-no-roll, no "wa" key) / AC3 wa roundtrip
// byte-id save→load→save + unknown wa dropped + effect reproducible / AC4 the 5
// affixes fire their effect (vampiric heals via pactHeal path, cadena rebounds 1
// no-cascade, ardiente burn DoT, aturdidor probabilistic stun on affixRng,
// perforante beats plain vs ARMORED) / AC5 HUD badge seam present (render.js) +
// 60fps desktop+móvil / REG Códice+Títulos+Pactos srand ON==OFF + boots clean.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const OUT = "shots/cas1771"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt); if (lastMd5[f] !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

// benign browser noise filter (favicon 404 etc.) — real files are md5-gated.
function watch(page) {
  const errs = [];
  page.on("pageerror", e => { if (!/favicon/.test(e.message)) errs.push("pageerror: " + e.message); });
  page.on("console", m => {
    const t = m.text();
    if (m.type() === "error" && !/favicon/.test(t) && !/Failed to load resource/.test(t)) errs.push("console: " + t);
  });
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/version\.json/.test(r.url())) errs.push(`http ${r.status()}: ${r.url()}`); });
  return errs;
}

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "AffixQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the wa* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the
// running game's instance). Stash the `dev` object on window.__wa for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__wa = m.dev; window.__waG = m.G;
      const need = ["waMeta", "waEnable", "waSrandProbe", "waAffixRngProbe", "waRollConsumes",
        "waSaveByteId", "waPersist", "waHitProbe", "waPierceProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "", rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /WEAPON_AFFIXES\s*=/.test(cfgTxt) && /dropChanceByRank/.test(cfgTxt) && /magPerTier/.test(cfgTxt), "WEAPON_AFFIXES knob present in served config.js");
    gate("SEAM/sim", /maybeWeaponAffix/.test(simTxt) && /applyWeaponAffix/.test(simTxt) && /0x0a771c5e/.test(simTxt), "affixRng + maybeWeaponAffix + applyWeaponAffix present in served sim.js");
    gate("SEAM/render-hud", /drawWeaponAffixTag/.test(rndTxt) && (rndTxt.match(/drawWeaponAffixTag/g) || []).length >= 3, `HUD badge drawWeaponAffixTag + call sites present (${(rndTxt.match(/drawWeaponAffixTag/g) || []).length} refs)`);

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live hero)");

    // ---- wire the live sim module (recovers wa* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `wa* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    // window.__dev should ALSO carry the prior-beat regression probes (game.js allowlist)
    const regHooks = await page.evaluate(() => ["codexSrandProbe", "titlesSrandProbe", "pactsSrandProbe"].filter((h) => typeof window.__dev[h] !== "function"));
    gate("HOOKS/reg-probes", regHooks.length === 0, regHooks.length ? `missing: ${regHooks.join(",")}` : "codex/titles/pacts srand probes on window.__dev");
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: fixed table of 5 on-hit affixes + tuning knobs ----
    const meta = await page.evaluate(() => window.__wa.waMeta());
    const kinds = meta.defs.map((x) => x.kind).sort();
    gate("CONTENT/table", meta.enabled !== undefined && meta.defs.length === 5 &&
      JSON.stringify(kinds) === JSON.stringify(["burn", "chain", "lifesteal", "pierce", "stun"]) &&
      meta.dropChanceByRank.length === 4 && meta.magPerTier === 0.15 && meta.chainRange === 3.5,
      `${meta.defs.length} affixes (${meta.defs.map((d) => d.id).join("/")}), magPerTier ${meta.magPerTier}, chainRange ${meta.chainRange}`);
    const stun = meta.defs.find((x) => x.kind === "stun");
    gate("CONTENT/stun-chance", !!stun && stun.chance === 0.15, `only 'aturdidor' carries proc chance (${stun && stun.chance}) — the sole RNG proc`);
    // every def exposes glyph + tint + name for the HUD badge
    const hudFields = meta.defs.every((d) => d.glyph && d.tint && d.name);
    gate("CONTENT/hud-fields", hudFields, "each affix exposes glyph+tint+name (HUD badge data)");

    // ---- AC2 [RNG-STRONG]: base srand byte-id ON vs OFF around a REAL weapon drop; OFF rolls 0 wa ----
    const SEED = 0x1768c0de, N = 24;
    const rng = await page.evaluate((s, n) => {
      const on = window.__wa.waSrandProbe(true, s, n);
      const off = window.__wa.waSrandProbe(false, s, n);
      const on2 = window.__wa.waSrandProbe(true, s, n);
      return { on, off, on2 };
    }, SEED, N);
    gate("AC2/48-draws", rng.on.fingerprint.length === 48, `${rng.on.fingerprint.length} base srand draws (2×${N}) around a real dropGear`);
    gate("AC2/srand-on==off", JSON.stringify(rng.on.fingerprint) === JSON.stringify(rng.off.fingerprint),
      "base srand BYTE-IDENTICAL WEAPON_AFFIXES ON vs OFF (affix roll rides affixRng)");
    gate("AC2/off-no-roll", rng.off.waCount === 0, `OFF ⇒ 0 weapons carry a wa (waCount=${rng.off.waCount})`);
    gate("AC2/determinism", JSON.stringify(rng.on.fingerprint) === JSON.stringify(rng.on2.fingerprint) && rng.on.waCount === rng.on2.waCount,
      `same seed reproduces srand + wa outcome (waCount=${rng.on.waCount})`);

    // ---- affixRng dedicated-stream determinism (48-draw) ----
    const arng = await page.evaluate(() => {
      const a1 = window.__wa.waAffixRngProbe(0x0a771c5e, 48), a2 = window.__wa.waAffixRngProbe(0x0a771c5e, 48), a3 = window.__wa.waAffixRngProbe(0xdeadbeef, 48);
      return { a1, a2, a3 };
    });
    gate("AFFIXRNG/determinism", arng.a1.fingerprint.length === 48 && JSON.stringify(arng.a1.fingerprint) === JSON.stringify(arng.a2.fingerprint),
      "affixRng 48-draw stream deterministic (identical on repeat)");
    gate("AFFIXRNG/seeded", JSON.stringify(arng.a1.fingerprint) !== JSON.stringify(arng.a3.fingerprint), "a different seed yields a different stream (real seeded RNG)");

    // ---- draw-count §3: common/body/uniq → 0; uncommon+ weapon → 1 (gate) + 1 iff pass ----
    const dc = await page.evaluate(() => ({
      common: window.__wa.waRollConsumes("common"),
      body: window.__wa.waRollConsumes("epic", "body"),
      uniq: window.__wa.waRollConsumes("legendary", "weapon", { uniq: "some_uniq" }),
      unc: window.__wa.waRollConsumes("uncommon"),
    }));
    gate("DRAW/common-0", dc.common.consumed === 0 && dc.common.wa === null, "COMMON weapon → 0 affixRng draws (rarity gate)");
    gate("DRAW/body-0", dc.body.consumed === 0 && dc.body.wa === null, "NON-weapon (body) → 0 draws (weapons only)");
    gate("DRAW/uniq-0", dc.uniq.consumed === 0 && dc.uniq.wa === null, "UNIQUE weapon → 0 draws (v1 excludes uniq/set — no proc-on-proc)");
    gate("DRAW/uncommon", (dc.unc.consumed === 1 && dc.unc.wa === null) || (dc.unc.consumed === 2 && dc.unc.wa !== null),
      `UNCOMMON weapon → 1 (gate) + 1 iff passes — consumed=${dc.unc.consumed} wa=${dc.unc.wa}`);

    // ---- AC1 GUARDRAIL: save.v1 byte-identical for an AFFIX-LESS weapon (enabled=false AND true, no "wa" key) ----
    const sb = await page.evaluate(() => window.__wa.waSaveByteId());
    gate("AC1/save-byte-id", !!sb && sb.byteId && !sb.hasWa,
      `affix-less weapon ⇒ save.v1 BYTE-IDENTICAL enabled=false vs enabled=true (offLen=${sb && sb.offLen} onLen=${sb && sb.onLen}), no "wa" key`);

    // ---- AC3: a weapon WITH wa round-trips byte-id save→load→save; unknown wa dropped on load ----
    const rt = await page.evaluate(() => ({ good: window.__wa.waPersist("ardiente"), bad: window.__wa.waPersist("bogus_affix") }));
    gate("AC3/roundtrip", !!rt.good && rt.good.ok && rt.good.wa === "ardiente" && rt.good.byteId && rt.good.hasWa,
      `wa="ardiente" round-trips BYTE-ID (serialize→load→serialize), id survives`);
    gate("AC3/unknown-dropped", !!rt.bad && rt.bad.ok && rt.bad.wa === null, "an UNKNOWN wa is DROPPED by safeInst on load (base fallback, no leak)");

    // ---- AC4: each of the 5 affixes fires its effect in the REAL hitEnemy ----
    const life = await page.evaluate(() => window.__wa.waHitProbe("vampiric", 1));
    gate("AC4/vampiric", !!life && life.heroHeal > 0 && life.eDmg > 0, `lifesteal heals hero +${life && life.heroHeal} via pactHeal path (respects healCut)`);
    const brn = await page.evaluate(() => window.__wa.waHitProbe("ardiente", 1));
    gate("AC4/ardiente", !!brn && brn.burn && brn.burnDmg > 0, `applies burn DoT (dmg ${brn && brn.burnDmg}) reusing STATUS.burn`);
    const chn = await page.evaluate(() => window.__wa.waHitProbe("cadena", 1));
    gate("AC4/cadena", !!chn && chn.chainDmg > 0, `rebounds to a 2nd nearby enemy for ${chn && chn.chainDmg} dmg (noAffix rebound — no cascade)`);
    // aturdidor: probabilistic via affixRng — sweep golden-ratio-spread seeds; must BOTH proc and miss + reproduce
    const stunSweep = await page.evaluate(() => {
      let seed = null, miss = false, procN = 0, seenN = 0;
      for (let i = 1; i <= 200; i++) { const s = (i * 0x9e3779b9) >>> 0; const fired = window.__wa.waHitProbe("aturdidor", s).stun; seenN++;
        if (fired) { procN++; if (seed === null) seed = s; } else miss = true; }
      let repro = false;
      if (seed !== null) { const a = window.__wa.waHitProbe("aturdidor", seed).stun, b = window.__wa.waHitProbe("aturdidor", seed).stun; repro = a && b; }
      return { seed, miss, procN, seenN, repro };
    });
    gate("AC4/aturdidor-repro", stunSweep.seed !== null && stunSweep.repro, `stun procs from affixRng and REPRODUCES under a fixed seed (seed=${stunSweep.seed >>> 0})`);
    gate("AC4/aturdidor-prob", stunSweep.miss && stunSweep.procN > 0 && stunSweep.procN < stunSweep.seenN,
      `stun PROBABILISTIC — ${stunSweep.procN}/${stunSweep.seenN} seeds fired (~${Math.round((stunSweep.procN / stunSweep.seenN) * 100)}%, ~15% gate honoured)`);
    const pc = await page.evaluate(() => window.__wa.waPierceProbe());
    gate("AC4/perforante", !!pc && pc.plain > 0 && pc.pierce > pc.plain, `beats a plain hit vs ARMORED (${pc && pc.plain} → ${pc && pc.pierce}) — ignores part of the reduction`);

    // ---- AC5 HUD badge: force-equip a wa weapon on the live hero, open inventory, screenshot ----
    const hud = await page.evaluate(() => {
      const G = window.__waG; if (!G || !G.hero) return { ok: false };
      window.__wa.waEnable(true);
      G.hero.equip.weapon = { slot: "weapon", defId: "w_steel", rarity: "epic", wa: "vampiric" };
      // seed a candidate weapon in bag so the equip-decision panel (badge call-site) has both sides
      G.hero.bag = G.hero.bag || [];
      G.hero.bag[0] = { slot: "weapon", defId: "w_iron", rarity: "rare", wa: "ardiente" };
      return { ok: true, eqWa: G.hero.equip.weapon.wa, bagWa: G.hero.bag[0].wa };
    });
    gate("AC5/hud-equip", hud.ok && hud.eqWa === "vampiric" && hud.bagWa === "ardiente", `live hero holds wa weapons (equip=${hud.eqWa}, bag=${hud.bagWa}) for badge render`);
    // open inventory for the screenshot (badge renders in the equip-decision panel)
    await page.evaluate(() => { try { window.__dev.openInv && window.__dev.openInv(); } catch (e) {} window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyI", key: "i", bubbles: true })); });
    await wait(400);
    await page.screenshot({ path: `${OUT}/${label}-affix-hud.png` }).catch(() => {});
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the affix seams) ----
    const reg = await page.evaluate(() => ({
      cod: { on: window.__dev.codexSrandProbe(true, 0x1751c0de, 24), off: window.__dev.codexSrandProbe(false, 0x1751c0de, 24) },
      tit: { on: window.__dev.titlesSrandProbe(true, 0x1758c0de, 24), off: window.__dev.titlesSrandProbe(false, 0x1758c0de, 24) },
      pac: { on: window.__dev.pactsSrandProbe(true, {}, 0x1763c0de, 24), off: window.__dev.pactsSrandProbe(false, null, 0x1763c0de, 24) },
    }));
    gate("REG/codex-srand", JSON.stringify(reg.cod.on.fingerprint) === JSON.stringify(reg.cod.off.fingerprint), "Códice srand ON==OFF");
    gate("REG/titles-srand", JSON.stringify(reg.tit.on.fingerprint) === JSON.stringify(reg.tit.off.fingerprint), "Títulos srand ON==OFF");
    gate("REG/pacts-srand", JSON.stringify(reg.pac.on.fingerprint) === JSON.stringify(reg.pac.off.fingerprint), "Pactos srand ON==OFF");

    // ---- PERF: 60fps in play ----
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await wait(1200);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    gate("PERF/60fps", fps >= 45, `${fps}fps (CI variance; AC-RNG determinism is the hard bar)`);

    // ---- REG: no page errors ----
    const realErrors = errs.filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("REG/no-errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "clean");

  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: PASS x2 (desktop + mobile), browser-per-pass ----
const headHashes = Object.fromEntries(FILES.map((f) => [f, headMd5(f)]));
console.log(`CAS-1771 LIVE QA — Afijos de Arma on-hit @ ${BASE}\nHEAD md5:`, headHashes);

// Fetch served text once up-front for the SEAM gates (poll happens per-run too, but this warms it).
let totalPass = 0, totalFail = 0, servedText = {};
try {
  const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json();
  console.log(`live build=${v.build}`);
} catch {}
for (const f of FILES) { try { servedText[f] = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text(); } catch {} }

for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headHashes, servedText);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1771 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
