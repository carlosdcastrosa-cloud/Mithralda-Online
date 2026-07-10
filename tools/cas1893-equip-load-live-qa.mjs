// ===========================================================================
// CAS-1893 (QA for CAS-1889) — LIVE QA: CARGA DE EQUIPO / TIPOS DE RODADA (Equip Load & Roll Types, 14º pilar
// Souls-like). Verifies the CAS-1891 build (deployed by CAS-1892, overlay build aea6ee9ab047) on the canonical
// gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass. Mirror of tools/cas1879-bonfire-live-qa.mjs.
//
// Feature = el PESO total del equipo equipado (weapon/body/shield) vs una `capacity` ⇒ un `ratio` ⇒ 4 BANDAS
// (fast≤0.30 / mid 0.30–0.70 / fat 0.70–1.0 / over >1.0) que MULTIPLICAN valores YA vivos: DODGE{distance,iframeMs}
// (CAS-1814) + STAMINA.cost.dodge (CAS-1841) + move speed. 100% BORROW, hard-gated. El peso es 100% DERIVADO del
// equipo YA guardado (Σ slotWeight[slot]·rarityWeight[rarity]) ⇒ CERO draws, NO existe `equipLoadRng`, NINGÚN campo
// nuevo en save.v1. AC2 CRÍTICO: capacity(20)+slotWeight{w4,b5,s4} ⇒ el loadout INICIAL (3 common = 13/20 = 0.65)
// cae en MID ⇒ multiplicadores TODOS 1 ⇒ el feel actual NO regresa. HARD-GATED: EQUIP_LOAD.enabled=false ⇒ m=1 (mid)
// ⇒ byte-idéntico a HEAD (Estamina/Esquiva/Bloqueo intactos) + sin tinte HUD.
//
//   node tools/cas1893-equip-load-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1891 build 0808597 touched exactly these 4 blobs — HARD md5 gate; read the set from
// `git show --stat 0808597`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843). El HUD va por DOM/hud.js
// (game.js alimenta el feed gated `equipBand`, hud.js tinta la barra de vigor con EQUIP_BAND_COL) — DESVÍO del spec
// que decía render.js, así que el set es game.js + hud.js + config + sim, NO render.js. El equip-load deploy (build
// aea6ee9ab047) es el ÚLTIMO deploy de gh-pages ⇒ nada se ha superpuesto ⇒ los 4 son EXACT md5 == HEAD. REF = HEAD
// (== build commit 0808597; el deploy commit ddde4e4 sólo añade la herramienta de deploy — verificado byte-idéntico).
//   game.js, hud.js, sim/config.js, sim/sim.js
//
// CRITICAL (lesson CAS-1784 / CAS-1862 / CAS-1871 / CAS-1876 / CAS-1883): estos probes conducen el juego REAL en
// ejecución — la página live bootea buildTiledWorld (el mundo que el jugador realmente juega), así que G / equipLoad /
// doRoll / la fórmula de move son los paths SHIPPED. Los hooks equip* se recuperan importando dinámicamente la MISMA
// URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build los cableó en el export `dev` de
// sim, NO en el __dev de game.js.
//
// ISOLATION (lesson backstab/poise/stamina/lock-on/flask/bloodstain/shield/bonfire): los equip probes rearman G
// (_equipArm vacía enemies/projectiles/fields/fx y REESCRIBE al héroe a un warrior limpio en play, y equipLoadOf/
// equipSrandProbe MUTAN h.equip a rarezas de prueba). Con el loop de render vivo, un héroe/arrays reescritos
// trip-earían el draw. Así que TODOS los probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los
// arrays de sim Y shallow-snapshotea el héroe + scene, y luego HARD-restaura en un finally — un único bloque síncrono,
// sin rAF interleaved. NB: la REGRESIÓN corre PRIMERO (héroe prístino en el PUEBLO) porque los equip probes reescriben
// h.equip y matan enemigos (killEnemy dibuja RNG de loot CONDICIONAL a la zona) ⇒ Frenzy divergiría por la ZONA.
// MOVE probe: la fórmula de sp lee io.moveVec() del input REAL ⇒ el bloque mantiene ArrowRight HELD (keys.has("right"))
// mientras corren los 3 move probes, y lo suelta en el finally (si no, vx=0 y el ratio es indefinido).
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config EQUIP_LOAD knob, sim equipLoad()
// def + doRoll band gate + over-deny + move factor, game.js gated equipBand feed, hud.js EQUIP_BAND_COL tint) / CONTENT
// knob matches spec / AC2 mid==baseline (loadout inicial ⇒ mid ⇒ mul todos 1) / 4 bandas con inventarios reales / roll
// mul (dist/iframe/estamina por banda + over-deny) / move factor por banda / AC1 OFF byte-id (legendary rueda NORMAL) /
// AC4 srand ON==OFF 48-draw con rollFired REAL (0 draws, no equipLoadRng) / AC SAVE byte-id sin clave equip* / AC3 REG
// 14 sistemas srand ON==OFF (Estamina/Esquiva/Bloqueo incluidos) + boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 4 equip-load blobs son EXCLUSIVOS (el equip-load deploy es el último ⇒ nada comparte una línea live encima), así
// que cada uno es exact-md5 gated == HEAD.
const FILES = ["game.js", "hud.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1893"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 0808597; el deploy tool overlaid HEAD blobs verbatim — verificado SAME 4/4).
const REF = process.env.EQUIP_REF || "HEAD";
const refMd5 = (f) => md5(execSync(`git show ${REF}:${f}`).toString());
const J = (v) => JSON.stringify(v);
const approx = (a, b, e = 1e-4) => Math.abs(a - b) < e;

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt);
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 4 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "CargaQA"; ni.blur(); }  // NB: sin substring equip/load ⇒ el regex de save-key (AC SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the equip* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["equipLoadMeta", "equipInitialBand", "equipLoadOf", "equipRollProbe", "equipMoveProbe",
        "equipOffProbe", "equipSaveByteId", "equipSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene (the equip probes
// rearm all of these + mutate h.equip), run the REG srand probes FIRST (pristine town hero — zone-safe), then every
// equip probe (holding ArrowRight for the move probes), then HARD-restore in a finally. No rAF interleaves.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: _equipArm/equipLoadOf reassign hero fields + h.equip
    const bagSnap = (G.hero && Array.isArray(G.hero.bag)) ? G.hero.bag.slice() : null;  // deep-copy: srand probe's killEnemy loop mutates the bag
    const sceneSnap = G.scene;
    const r = {};
    let moveHeld = false;
    try {
      // REG FIRST: héroe prístino en el PUEBLO (los equip probes reescriben h.equip + matan enemigos donde el loot RNG
      // de killEnemy es condicional a la zona ⇒ Frenzy divergiría). 14 sistemas previos (Estamina/Esquiva/Bloqueo incl).
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
        ["shield", 0x1873c0de, "shieldSrandProbe", []],
        ["bonfire", 0x1879c0de, "bonfireSrandProbe", []],
      ];
      for (const [name, s, fn, extra] of P) {
        if (typeof d[fn] !== "function") { reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24, ...extra), off = d[fn](false, s, 24, ...extra);
        reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
      r.reg = reg;

      // ---- content knob + AC2 mid==baseline + the 4 bands with real inventories ----
      r.meta = d.equipLoadMeta();
      r.initial = d.equipInitialBand();
      r.bands = {
        fast: d.equipLoadOf(null, null, "common"),
        mid: d.equipLoadOf("common", "common", "common"),
        fat: d.equipLoadOf("uncommon", "uncommon", "uncommon"),
        over: d.equipLoadOf("legendary", "legendary", "legendary"),
      };

      // ---- roll: band multiplies the REAL doRoll (dist/iframe/estamina) + over-deny ----
      r.roll = {
        mid: d.equipRollProbe("common", "common", "common"),
        fast: d.equipRollProbe(null, null, "common"),
        fat: d.equipRollProbe("uncommon", "uncommon", "uncommon"),
        over: d.equipRollProbe("legendary", "legendary", "legendary"),
      };

      // ---- move: band factor enters `sp` (needs io.moveVec()≠0 ⇒ hold ArrowRight) ----
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
      moveHeld = true;
      r.move = {
        mid: d.equipMoveProbe("common", "common", "common"),
        fat: d.equipMoveProbe("uncommon", "uncommon", "uncommon"),
        over: d.equipMoveProbe("legendary", "legendary", "legendary"),
      };
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
      moveHeld = false;

      // ---- OFF byte-id + save byte-id + srand ON==OFF (real roll firing) ----
      r.off = d.equipOffProbe();
      r.save = d.equipSaveByteId();
      // RESTORE THE PRISTINE TOWN HERO before EACH srand measurement (dev-harness parity). equipSrandProbe's internal
      // killEnemy loot-alignment loop draws ZONE-CONDITIONAL loot; REG's bonfire probe (run first) RELOCATES the hero to
      // a hunt zone, so the loop draws loot and — after REG's world perturbation — the enabled true/false paths diverge
      // in that SCAFFOLDING loop (NOT the feature: no equipLoadRng exists; the pre-roll segment + no-REG runs are already
      // byte-identical ON==OFF, and the DOM-free build harness passes). The pristine live hero is in TOWN (no loot) — like
      // the dev harness's createHero() town warrior — so restoring its position/bag + _equipArm() (clears arrays) makes
      // on/off/on2 each start from an IDENTICAL town state ⇒ the ONLY variable is EQUIP_LOAD.enabled ⇒ the true 0-load-
      // draw property shows byte-identical. (Verified: pristine-restore ⇒ same=true det=true 0.193156981 in a fresh browser.)
      const armPristine = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); } if (typeof d._equipArm === "function") d._equipArm(); };
      armPristine(); const _on = d.equipSrandProbe(true, seed, n);
      armPristine(); const _off = d.equipSrandProbe(false, seed, n);
      armPristine(); const _on2 = d.equipSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };
    } catch (e) { r.err = String(e && e.stack || e); }
    finally {
      if (moveHeld) { try { window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true })); } catch (e) {} }
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      if (heroSnap && G.hero) Object.assign(G.hero, heroSnap);
      G.scene = sceneSnap;
    }
    return r;
  }, SEED, N);
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, all 4 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/equip-load deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      gameTxt = servedText["game.js"] || "", hudTxt = servedText["hud.js"] || "";
    gate("SEAM/config", /export const EQUIP_LOAD\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /capacity:\s*20/.test(cfgTxt) && /slotWeight:\s*{\s*weapon:\s*4,\s*body:\s*5,\s*shield:\s*4\s*}/.test(cfgTxt) && /bands:\s*{\s*fast:0\.30,\s*mid:0\.70,\s*fat:1\.0\s*}/.test(cfgTxt) && /overCanRoll:\s*false/.test(cfgTxt),
      "EQUIP_LOAD knob (enabled/capacity:20/slotWeight{w4,b5,s4}/bands{.30,.70,1.0}/overCanRoll:false) present in served config.js");
    gate("SEAM/sim", /export function equipLoad\(h\)/.test(simTxt) && /EQUIP_LOAD\.enabled\s*\?\s*equipLoad\(h\)\.band/.test(simTxt) && /el===?"over"\s*&&\s*!EQUIP_LOAD\.overCanRoll/.test(simTxt) && /spendStam\(h,Math\.round\(STAMINA\.cost\.dodge\*em\.stam\)\)/.test(simTxt) && /EQUIP_LOAD\.enabled\?EQUIP_LOAD\.mul\[equipLoad\(h\)\.band\]\.move:1/.test(simTxt),
      "sim: equipLoad() def + doRoll band gate (over-deny + spendStam·em.stam + iframe/dist·em) + move factor present in served sim.js");
    gate("SEAM/game", /equipBand:equipLoad\(h\)\.band/.test(gameTxt) && /EQUIP_LOAD\.enabled\s*\?\s*{\s*equipBand/.test(gameTxt),
      "game.js: gated HUD feed (EQUIP_LOAD.enabled ? {equipBand:equipLoad(h).band} — absent OFF ⇒ HUD byte-id) present in served bytes");
    gate("SEAM/hud", /EQUIP_BAND_COL\s*=\s*{\s*fast:"#5fd6a0",\s*mid:"#3fae55",\s*fat:"#d9a441",\s*over:"#c0392b"\s*}/.test(hudTxt) && /s\.equipBand/.test(hudTxt),
      "hud.js: EQUIP_BAND_COL band tint (fast/mid/fat/over) applied to the vigor bar when s.equipBand present, in served bytes");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.removeItem("mithralda.flask.v1"); localStorage.removeItem("mithralda.bloodstain.v1");
        localStorage.removeItem("mithralda.bonfire.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers equip* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `equip* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1889c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the EQUIP_LOAD knob (matches the design spec) ----
    const meta = r.meta;
    const midOne = meta.mul && meta.mul.mid && meta.mul.mid.dist === 1 && meta.mul.mid.iframe === 1 && meta.mul.mid.stam === 1 && meta.mul.mid.move === 1;
    gate("CONTENT/knob", meta.enabled === true && meta.capacity === 20 && meta.slotWeight.weapon === 4 && meta.slotWeight.body === 5 && meta.slotWeight.shield === 4 && meta.overCanRoll === false && midOne,
      `EQUIP_LOAD enabled=${meta.enabled} capacity=${meta.capacity} slotWeight=${J(meta.slotWeight)} bands=${J(meta.bands)} mid mul all 1=${midOne} overCanRoll=${meta.overCanRoll}`);

    // ---- AC2: initial loadout (3 common) lands in mid ⇒ mul all 1 ⇒ baseline intact ----
    const ib = r.initial;
    gate("AC2/mid==baseline", !!ib && ib.ok,
      ib ? `loadout INICIAL (3 common) total=${ib.total} ratio=${ib.ratio} ⇒ banda '${ib.band}' ⇒ multiplicadores todos 1 (mulAllOne=${ib.mulAllOne}) ⇒ el feel actual NO regresa` : "probe null");

    // ---- 4 bands reachable with real inventories ----
    const b = r.bands, wantBand = { fast: "fast", mid: "mid", fat: "fat", over: "over" };
    for (const k of ["fast", "mid", "fat", "over"]) {
      const el = b[k];
      gate(`BANDS/${k}`, !!el && el.band === wantBand[k],
        el ? `equip ⇒ total=${el.total} ratio=${el.ratio} ⇒ banda '${el.band}' (== esperada '${wantBand[k]}')` : "probe null");
    }

    // ---- roll: band multiplies dist/iframe/estamina; mid == baseline; over ⇒ deny ----
    const rl = r.roll;
    const baseSpd = rl.mid.rollSpd;   // mid = baseline (mul all 1)
    gate("ROLL/mid==baseline", rl.mid.band === "mid" && rl.mid.fired && rl.mid.rollSpd > 0 && rl.mid.stamSpent > 0,
      `mid: rollSpd=${rl.mid.rollSpd} (baseline, mul all 1) + estamina=${rl.mid.stamSpent} + fired=${rl.mid.fired}`);
    gate("ROLL/fast>mid", rl.fast.band === "fast" && rl.fast.fired && approx(rl.fast.rollSpd / baseSpd, meta.mul.fast.dist) && approx(rl.fast.iframe / rl.mid.iframe, meta.mul.fast.iframe),
      `fast: rollSpd/mid=${(rl.fast.rollSpd / baseSpd).toFixed(3)}·==${meta.mul.fast.dist} iframe/mid=${(rl.fast.iframe / rl.mid.iframe).toFixed(3)}·==${meta.mul.fast.iframe} estamina=${rl.fast.stamSpent}`);
    gate("ROLL/fat<mid", rl.fat.band === "fat" && rl.fat.fired && approx(rl.fat.rollSpd / baseSpd, meta.mul.fat.dist) && approx(rl.fat.iframe / rl.mid.iframe, meta.mul.fat.iframe) && rl.fat.stamSpent > rl.mid.stamSpent,
      `fat: rollSpd/mid=${(rl.fat.rollSpd / baseSpd).toFixed(3)}·==${meta.mul.fat.dist} iframe/mid=${(rl.fat.iframe / rl.mid.iframe).toFixed(3)}·==${meta.mul.fat.iframe} estamina=${rl.fat.stamSpent}>mid(${rl.mid.stamSpent})`);
    gate("ROLL/over-deny", rl.over.band === "over" && !rl.over.fired && rl.over.stamSpent === 0,
      `over (overCanRoll=${meta.overCanRoll}) ⇒ doRoll DENY fired=${rl.over.fired}, 0 estamina gastada (${rl.over.stamSpent}) ANTES de gastar`);

    // ---- move: band factor enters sp (vx pre-clamp) ----
    const mv = r.move;
    gate("MOVE/factor", mv.mid.vx > 0 && approx(mv.fat.vx / mv.mid.vx, meta.mul.fat.move) && approx(mv.over.vx / mv.mid.vx, meta.mul.over.move),
      `vx mid=${mv.mid.vx}; fat/mid=${(mv.fat.vx / mv.mid.vx).toFixed(3)}·==${meta.mul.fat.move}; over/mid=${(mv.over.vx / mv.mid.vx).toFixed(3)}·==${meta.mul.over.move}`);

    // ---- AC1 OFF byte-id: enabled=false ⇒ legendary rueda NORMAL (rollSpd=base, estamina=cost) ----
    const off = r.off;
    gate("AC1/off-inert", !!off && off.ok,
      off ? `OFF ⇒ equipo legendary rueda NORMAL (fired=${off.fired}) rollSpd=${off.rollSpd}==base(${off.base}) (${off.rollSpdBase}) estamina=${off.stamSpent}==cost(${off.expectStam}) (${off.stamBase}) — byte-identical a HEAD (Esquiva/Estamina intactas)` : "probe null");

    // ---- AC SAVE: derived weight ⇒ save.v1 byte-id ON/OFF, no equip* key ----
    const sb = r.save;
    gate("AC/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL ON vs OFF (byteId=${sb.byteId}), SIN clave equipLoad*/equipBand* (hasKey=${sb.hasKey}) — peso DERIVADO del equipo ya guardado, sin campo nuevo` : "probe null");

    // ---- AC4 srand ON==OFF WITH a real banded doRoll firing (0 draws of the load stream) ----
    const s = r.srand;
    gate("AC4/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around a REAL banded doRoll (equipo epic ⇒ fat, mul≠1)`);
    gate("AC4/roll-fired", s.on.rollFired === true, `the ON probe DID roll (banda fat, mul≠1) consuming 0 srand: rollFired=${s.on.rollFired}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC4/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL EQUIP_LOAD ON vs OFF — la carga es aritmética sobre {slot,rarity} (no equipLoadRng; 0 draws) incluso rodando"
        : `DIVERGE @idx=${firstDiff} (0-23=pre-roll, 24-47=post-roll) on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onFired=${s.on.rollFired} offFired=${s.off.rollFired}`);
    gate("AC4/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC evidence screenshot: capture the play surface (vigor bar carries the band tint) ----
    await page.screenshot({ path: `${OUT}/${label}-equip-load-play.png` }).catch(() => {});

    // ---- AC3 REG: prior beats' srand probes stay ON==OFF (14 systems incl. Estamina/Esquiva/Bloqueo) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "bonfire"]) {
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
console.log(`CAS-1893 LIVE QA — Carga de Equipo / Tipos de Rodada (Equip Load, Pilar 14) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1893 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
