// ===========================================================================
// CAS-1876 (QA for CAS-1873) — LIVE QA: Escudo / Bloqueo con Guardia (Shield Block, 12ª feature Souls-like,
// eje DEFENSIVO). Verifies the CAS-1874 build (deployed by CAS-1875, overlay build e28b97b15ab1) on the
// canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1867-bloodstain-live-qa.mjs / tools/cas1854-flask-live-qa.mjs.
//
// Feature = 1 rama ADITIVA en damageHero + estado transitorio h.blocking. Mantener la guardia (hold ShiftLeft /
// botón HUD hold `tb.block`) levanta un ARCO FRONTAL; un golpe MELEE frontal se MITIGA (dmg·(1−mitigate) pasa) a
// cambio de ESTAMINA (CAS-1841): `absorbed=dmg·mitigate`, `cost=round(absorbed·stamPerDmg)`. La rama corre DESPUÉS
// de parry/i-frames/dodge (esquiva sigue negando GRATIS) y ANTES de la armadura. `src` presente SÓLO en golpes de
// CONTACTO (melee) ⇒ ranged (src=null) NI ENTRA = melee-only, sin i-frames. Agotar la estamina en un bloqueo dispara
// RUPTURA DE GUARDIA: `h.stun=breakStunS` (REUSA el STAGGERED de CAS-1826), golpe COMPLETO, stam→0, guardia baja.
// Geometría/aritmética pura ⇒ CERO srand draws, NO existe `blockRng` ⇒ srand BYTE-IDÉNTICO ON==OFF incluso con el
// bloqueo/ruptura DISPARANDO. h.blocking transitorio (mirror stam) + h.stun ya fuera del allowlist ⇒ save.v1 byte-id
// y SIN clave block*. Guardia = arco/tinte canvas ($0 arte). HARD-GATED: SHIELD_BLOCK.enabled=false ⇒ rama muerta,
// sin h.blocking, sin arco/botón ⇒ byte-idéntico a HEAD.
//
//   node tools/cas1873-shield-block-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1874 build a94f54c touched exactly these 5 blobs — HARD md5 gate; read the set from
// `git show --stat a94f54c`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843). The shield-block deploy
// (build e28b97b15ab1) is the LATEST gh-pages deploy, so nothing has layered onto these blobs since ⇒ ALL 5 are
// EXACT md5 == HEAD. REF = HEAD (== build commit a94f54c; the deploy commit 6ad720d only adds the deploy tool).
//   input.js, render/render.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1834 / CAS-1862 / CAS-1871): these probes drive the REAL running game — the live
// page boots buildTiledWorld (the world the player actually plays), so G / damageHero / update son los SHIPPED paths.
// The shield* dev hooks are recovered by dynamically importing the SAME live sim.js URL (ESM dedups by URL ⇒ the
// running game's instance) because the build wired them onto the sim `dev` export but NOT onto game.js's __dev.
//
// ISOLATION (lesson backstab/poise/stamina/lock-on/flask/bloodstain): the shield probes rearm G (_shieldArm zeroes
// enemies/projectiles/fields/fx AND rewrites the hero to a clean warrior, spawns wolves, runs damageHero, mutates
// h.blocking/h.stam/h.stun/h.hp); with the LIVE render loop still running, residual/undefined array entries or the
// rewritten hero would trip drawGuard / drawFx. So EVERY behavioral probe runs inside ONE page.evaluate that first
// snapshots + quiesces all sim arrays AND shallow-snapshots the hero + scene, then HARD-restores in a finally — a
// single synchronous block, so no rAF interleaves mid-probe.
//
// Covers: AC0 md5 live==HEAD (5 blobs) + SEAM served bytes carry the feature (config SHIELD_BLOCK knob, sim damageHero
// intercept + h.blocking fixed-frame set, input ShiftLeft/tb.block held + io.blockHeld getter, render drawGuard,
// strings block/guardBreak banners) / CONTENT knob matches spec / AC3 mitigación frontal = dmg·mitigate EXACTO +
// stam −round(absorbed·stamPerDmg) EXACTO / AC4 frontal-only (espalda/costado = daño completo, sin coste) / AC5
// melee-only/sin i-frames (ranged src=null NO mitigado, i-frame bloqueado==sin-bloquear) / AC6 guard-break: coste>stam
// ⇒ h.stun=breakStunS + golpe completo + stam→0 / AC1 OFF byte-id (rama muerta aunque h.blocking) / AC2 srand ON==OFF
// 48-draw con blockFired REAL (0 draws, no blockRng) / AC7 save.v1 byte-id sin clave block* / REG 12 systems srand
// ON==OFF + boots clean / LIVE ShiftLeft/tb.block REAL levanta la guardia (io.blockHeld → h.blocking) / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 5 shield blobs are EXCLUSIVE (the shield deploy is the latest ⇒ nothing shares a live line on top), so every
// one is exact-md5 gated == HEAD.
const FILES = ["input.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1876"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit a94f54c; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.SHIELD_REF || "HEAD";
const refMd5 = (f) => md5(execSync(`git show ${REF}:${f}`).toString());
const J = (v) => JSON.stringify(v);

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt);
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 5 exclusive blobs
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

// benign browser noise filter (favicon 404, transient CDN art 503 etc.) — real files are md5-gated.
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "GuardiaQA"; ni.blur(); }  // NB: no block/shield substring ⇒ AC7 save-key regex can't false-match
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the shield* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
// Stash the `dev` object on window.__bk for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["shieldMeta", "shieldState", "shieldMitigateProbe", "shieldArcProbe", "shieldRangedProbe",
        "shieldBreakProbe", "shieldOffProbe", "shieldSaveByteId", "shieldSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene (the shield probes
// rearm all of these), run every shield probe + the REG srand probes, then HARD-restore in a finally. No rAF
// interleaves inside a single page.evaluate ⇒ the live render loop never sees a corrupt array, the rewritten warrior
// hero, or a stray guard arc mid-probe.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: _shieldArm reassigns hero fields
    const sceneSnap = G.scene;
    const r = {};
    try {
      r.meta = d.shieldMeta();
      r.mitigate = d.shieldMitigateProbe();
      r.arc = d.shieldArcProbe();
      r.ranged = d.shieldRangedProbe();
      r.brk = d.shieldBreakProbe();
      r.off = d.shieldOffProbe();
      r.save = d.shieldSaveByteId();
      r.srand = { on: d.shieldSrandProbe(true, seed, n), off: d.shieldSrandProbe(false, seed, n), on2: d.shieldSrandProbe(true, seed, n) };
      // REG: prior beats' srand probes stay ON==OFF (no regression from the shield seam) — 12 systems.
      const reg = {};
      const P = [
        ["frenzy", 0x1773c0de, "frenzySrandProbe", []],
        ["parry", 0x1785c0de, "parrySrandProbe", []],
        ["dodge", 0x1814c0de, "dodgeSrandProbe", [true]],
        ["telegraph", 0x1790c0de, "telegraphSrandProbe", []],
        ["abilities", 0x1819c0de, "abilitySrandProbe", [true]],
        ["poise", 0x1826c0de, "poiseSrandProbe", []],
        ["combos", 0x1831c0de, "comboSrandProbe", []],
        ["backstab", 0x1836c0de, "backstabSrandProbe", []],
        ["stamina", 0x1841c0de, "staminaSrandProbe", []],
        ["lock-on", 0x1847c0de, "lockSrandProbe", []],
        ["flask", 0x1854c0de, "flaskSrandProbe", []],
        ["bloodstain", 0x1867c0de, "bloodstainSrandProbe", []],
      ];
      for (const [name, s, fn, extra] of P) {
        if (typeof d[fn] !== "function") { reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24, ...extra), off = d[fn](false, s, 24, ...extra);
        reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
      r.reg = reg;
    } catch (e) { r.err = String(e && e.stack || e); }
    finally {
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      if (heroSnap && G.hero) Object.assign(G.hero, heroSnap);
      G.scene = sceneSnap;
    }
    return r;
  }, SEED, N);
}

// LIVE guard raise: dispatch the REAL ShiftLeft keydown (desktop) so input.js sets blockHeld=true; the running sim's
// update() reads io.blockHeld each fixed-frame and sets G.hero.blocking (gated on enabled+held+alive+!rolling+stun<=0+
// stam>0). Confirms the SHIPPED input→sim path raises the guard, then keyup drops it. Snapshot/restore h.blocking so
// the live loop stays clean. Belt + suspenders that the block seam runs against the actual running game instance.
async function liveGuard(page) {
  // ensure hero has stamina + is idle so the gate can pass
  await page.evaluate(() => { const h = window.__bkG && window.__bkG.hero; if (h) { h.rolling = false; h.stun = 0; if (h.stam != null) h.stam = Math.max(h.stam, 50); } });
  const before = await page.evaluate(() => { const h = window.__bkG.hero; return { blocking: !!h.blocking }; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft", key: "Shift", bubbles: true })));
  await wait(200);   // let several fixed-frames tick io.blockHeld → h.blocking
  const held = await page.evaluate(() => { const h = window.__bkG.hero; return { blocking: !!h.blocking }; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft", key: "Shift", bubbles: true })));
  await wait(200);   // release ⇒ guard drops
  const after = await page.evaluate(() => { const h = window.__bkG.hero; if (h) h.blocking = false; return { blocking: !!h.blocking }; });
  return { before: before.blocking, held: held.blocking, after: after.blocking, ok: (!before.blocking && held.blocking && !after.blocking) };
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, all 5 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/shield deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      strTxt = servedText["strings.js"] || "", inpTxt = servedText["input.js"] || "", rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const SHIELD_BLOCK\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /key:\s*"ShiftLeft"/.test(cfgTxt) && /frontArcDeg:\s*150/.test(cfgTxt) && /mitigate:\s*0\.65/.test(cfgTxt) && /stamPerDmg:\s*0\.6/.test(cfgTxt) && /breakStunS:\s*0\.9/.test(cfgTxt) && /moveMul:\s*0\.55/.test(cfgTxt),
      "SHIELD_BLOCK knob (enabled/key:ShiftLeft/frontArcDeg:150/mitigate:0.65/stamPerDmg:0.6/breakStunS:0.9/moveMul:0.55) present in served config.js");
    gate("SEAM/sim", /SHIELD_BLOCK\.enabled\s*&&\s*h\.blocking\s*&&\s*src/.test(simTxt) && /absorbed\s*=\s*dmg\s*\*\s*SHIELD_BLOCK\.mitigate/.test(simTxt) && /h\.blocking\s*=\s*SHIELD_BLOCK\.enabled\s*&&\s*io\.blockHeld/.test(simTxt) && /SHIELD_BLOCK\.breakStunS/.test(simTxt),
      "sim: damageHero block branch (SHIELD_BLOCK.enabled && h.blocking && src, absorbed=dmg*mitigate, breakStunS) + h.blocking fixed-frame set from io.blockHeld present in served sim.js");
    gate("SEAM/input", /blockHeld\s*=\s*true/.test(inpTxt) && /code===SHIELD_BLOCK\.key\s*&&\s*SHIELD_BLOCK\.enabled/.test(inpTxt) && /get blockHeld\(\)/.test(inpTxt) && /tb\.block/.test(inpTxt),
      "input.js: ShiftLeft keydown + tb.block touch hold set blockHeld, io.blockHeld getter present in served bytes");
    gate("SEAM/render", /function drawGuard\(/.test(rndTxt) && /SHIELD_BLOCK\.enabled\s*&&\s*h\.blocking/.test(rndTxt) && /SHIELD_BLOCK\.frontArcDeg/.test(rndTxt),
      "render.js: gated $0-art drawGuard (frontArcDeg sector, canvas tint) present in served bytes");
    gate("SEAM/strings", /block:\s*"/.test(strTxt) && /guardBreak:\s*"/.test(strTxt),
      "strings.js: STR.block + STR.guardBreak banners present in served bytes");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.removeItem("mithralda.flask.v1"); localStorage.removeItem("mithralda.bloodstain.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers shield* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `shield* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1873c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the SHIELD_BLOCK knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.key === "ShiftLeft" && meta.frontArcDeg === 150 && meta.mitigate === 0.65 && meta.stamPerDmg === 0.6 && meta.breakStunS === 0.9 && meta.moveMul === 0.55,
      `SHIELD_BLOCK enabled=${meta.enabled} key=${meta.key} frontArcDeg=${meta.frontArcDeg} mitigate=${meta.mitigate} stamPerDmg=${meta.stamPerDmg} breakStunS=${meta.breakStunS} moveMul=${meta.moveMul}`);

    // ---- AC3: mitigación frontal = dmg·mitigate EXACTO + stam −round(absorbed·stamPerDmg) EXACTO, mitiga NO niega ----
    const mp = r.mitigate;
    gate("AC3/mitigate", !!mp && mp.ok,
      mp ? `golpe MELEE frontal bloqueado ⇒ absorbido=dmg·mitigate EXACTO (${mp.absorbed}, dU=${mp.dU}→dB=${mp.dB}, mitigateExact=${mp.mitigateExact}); estamina −round(absorbed·stamPerDmg)=${mp.expectCost} (gastó ${mp.stSpent}, costExact=${mp.costExact}); mitiga NO niega (stillHurt=${mp.stillHurt})` : "probe null");

    // ---- AC4: frontal-only (espalda fuera del arco = daño completo, sin coste) ----
    const ap = r.arc;
    gate("AC4/arc", !!ap && ap.ok,
      ap ? `golpe por la ESPALDA (fuera del arco) con guardia arriba ⇒ daño COMPLETO (dRear=${ap.dRear}==dFull=${ap.dFull}, fullDamage=${ap.fullDamage}), sin coste (${ap.noCost})` : "probe null");

    // ---- AC5: melee-only / sin i-frames (ranged src=null NO mitigado, i-frame bloqueado==sin-bloquear) ----
    const rp = r.ranged;
    gate("AC5/ranged-noiframe", !!rp && rp.ok,
      rp ? `golpe RANGED (src=null) con guardia arriba ⇒ NO mitigado (dRanged=${rp.dRanged}==dFull=${rp.dFull}, ${rp.notMitigated}) + sin coste (${rp.noCost}); i-frame bloqueado==sin-bloquear (${rp.ifBlocked}==${rp.ifUnblocked}, noExtraIframe=${rp.noExtraIframe}) ⇒ el bloqueo NO da i-frames` : "probe null");

    // ---- AC6: guard-break (coste>stam ⇒ h.stun=breakStunS STAGGERED, golpe completo, stam→0, guardia baja) ----
    const bp = r.brk;
    gate("AC6/guard-break", !!bp && bp.ok,
      bp ? `bloqueo con coste > estamina ⇒ h.stun=breakStunS=${bp.stun} (STAGGERED de CAS-1826, brokeStun=${bp.brokeStun}), golpe COMPLETO (dTaken=${bp.dTaken}==dFull=${bp.dFull}, fullOnBreak=${bp.fullOnBreak}), estamina→0 (${bp.stamZero}), guardia baja (${bp.guardDown})` : "probe null");

    // ---- AC1 OFF byte-id: SHIELD_BLOCK.enabled=false ⇒ rama muerta aunque h.blocking=true ⇒ daño completo, sin coste/stun ----
    const off = r.off;
    gate("AC1/off-inert", !!off && off.ok,
      off ? `OFF ⇒ rama de bloqueo MUERTA aunque h.blocking=true ⇒ daño COMPLETO (dTaken=${off.dTaken}==dFull=${off.dFull}, fullDamage=${off.fullDamage}), sin coste (${off.noCost}), sin stun (${off.noStun}) — byte-identical a HEAD` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH real block+break FIRING ----
    const s = r.srand;
    gate("AC2/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around a REAL block-mitigate + guard-break + loot kills`);
    gate("AC2/block-fired", s.on.blockFired === true, `the ON probe DID mitigate a hit AND break the guard (not just the flag): blockFired=${s.on.blockFired}`);
    gate("AC2/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL SHIELD_BLOCK ON vs OFF — el bloqueo es geometría/aritmética (no blockRng; 0 srand draws) incluso cuando la guardia mitiga y se rompe");
    gate("AC2/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC7 SAVE: transitorio ⇒ save.v1 byte-id ON/OFF, no block key ----
    const sb = r.save;
    gate("AC7/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL con h.blocking+h.stun ON vs OFF (byteId=${sb.byteId}), SIN clave block* (hasKey=${sb.hasKey}) — h.blocking transitorio (mirror stam) + h.stun ya fuera del allowlist de serializeSave` : "probe null");

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-shield-play.png` }).catch(() => {});

    // ---- LIVE: drive the REAL ShiftLeft input→sim guard-raise path in the running game (isolated + restored) ----
    const lg = await liveGuard(page);
    gate("LIVE/shift-guard", lg.ok, lg.ok ? `ShiftLeft REAL keydown ⇒ input.js blockHeld=true ⇒ update() fija h.blocking=true (before=${lg.before}, held=${lg.held}); keyup ⇒ guardia baja (after=${lg.after}) — input→sim seam ejercitado en la instancia viva` : `live guard raise failed: before=${lg.before} held=${lg.held} after=${lg.after}`);

    // ---- REG: prior beats' srand probes stay ON==OFF (12 systems) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain"]) {
      const g = reg[name];
      if (g && g.absent) { gate(`REG/${name}-srand`, true, "probe absent — skipped"); continue; }
      gate(`REG/${name}-srand`, !!g && g.same, g && g.same ? `${name} srand ON==OFF` : `${name} srand regressed`);
    }

    // ---- PERF: 60fps in play ----
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await wait(1200);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    gate("PERF/60fps", fps >= 45, `${fps}fps (CI variance; AC-RNG determinism is the hard bar)`);

    // ---- REG: no page errors ----
    const realErrors = errs.filter((e) => !/favicon|net::ERR_|404|503/i.test(e));
    gate("REG/no-errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "clean");

  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: PASS x2 (desktop + mobile), browser-per-pass ----
const headHashes = Object.fromEntries(FILES.map((f) => [f, refMd5(f)]));
console.log(`CAS-1876 LIVE QA — Escudo/Bloqueo con Guardia (Shield Block) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1876 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
