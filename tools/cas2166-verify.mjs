// CAS-2166 Build DARK verify — SECOND_WIND / Segundo Aliento (mec #41).
// Drives the REAL sim dev probes (DOM-free, deep-proxy stubs) against the working-tree sim.js.
// Focus: the nova now pushes the REAL knockback channel (e.knockX/e.knockY, which updateEnemies
// integrates + decays) so enemies ACTUALLY displace — the previous e.vx/e.vy write was inert.
import * as sim from "../sim/sim.js";
import { SECOND_WIND } from "../sim/config.js";

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("SWBot", "warrior");
const d = sim.dev;
const pass = (b) => b ? "PASS" : "**FAIL**";
let ok = true;
const chk = (label, cond) => { ok = ok && cond; console.log(`  ${pass(cond)}  ${label}`); };

console.log(`\n##### CAS-2166 SECOND_WIND DARK build verify — enabled(cfg)=${SECOND_WIND.enabled} #####`);

// AC1 lethal-negate + clamp + charge consume + i-frame armed + REAL nova displacement
const on = d.secondWindProbe({ enabled: true, probeIframe: true, probeNoCharge: false });
console.log("ON:", JSON.stringify(on));
chk("AC1 survived a lethal hit (hp>0)", on.survived === true);
chk(`AC1 hp clamped to ceil(maxHp*${SECOND_WIND.surviveHpFrac})=${on.hpExpected}`, on.hpAfter === on.hpExpected);
chk("AC1 charge consumed (1→0)", on.chargeBefore === 1 && on.chargeAfter === 0);
chk("AC1 i-frame window armed", on.iframeArmed === true && on.iframeT > 0);
chk("AC2 NOVA: enemy INSIDE radius actually MOVED OUTWARD (real knockX integ.)", on.novaInMovedOut === true && on.novaInDisp > 0.5);
chk("AC2 NOVA: enemy OUTSIDE radius UNTOUCHED (no disp)", on.novaOutMovedOut === false && Math.abs(on.novaOutDisp) < 0.01);
chk("AC3 VFX floater ¡SEGUNDO ALIENTO! present", on.floated === true);
chk("AC4 i-frame IGNORES a follow-up hit (no death same tick)", on.iframeIgnoresHit === true);

// AC5 once-per-rest: no charge ⇒ the next lethal hit KILLS (hp<=0, no second clamp)
const noChg = d.secondWindProbe({ enabled: true, probeNoCharge: true });
chk("AC5 once-per-rest: with 0 charge a lethal hit DIES (no re-save)", noChg.noChargeDies === true);

// AC6 OFF byte-id: disabled ⇒ dies normally (no clamp, no nova)
const off = d.secondWindProbe({ enabled: false });
console.log("OFF:", JSON.stringify({survived:off.survived, hpAfter:off.hpAfter, novaInMovedOut:off.novaInMovedOut, floated:off.floated}));
chk("AC6 OFF: lethal hit is NOT negated (hp<=0)", off.survived === false && off.hpAfter <= 0);
chk("AC6 OFF: no nova (enemy not moved)", off.novaInMovedOut === false);
chk("AC6 OFF: no floater", off.floated === false);

// AC7 determinism: identical output twice
const a = JSON.stringify(d.secondWindProbe({ enabled: true }));
const b = JSON.stringify(d.secondWindProbe({ enabled: true }));
chk("AC7 deterministic (probe ON == probe ON)", a === b);

// AC8 RNG-neutral STRONG: srand fingerprint ON == OFF byte-identical (0 draws in the deny path)
const fpOn = d.secondWindSrandFp(true, 1234, 40);
const fpOff = d.secondWindSrandFp(false, 1234, 40);
chk("AC8 srand ON == OFF byte-identical (0 draws, 40-draw fp)", fpOn === fpOff);
console.log(`  fpOn[0..40]=${fpOn.slice(0,40)}...`);

console.log(`\n##### RESULT: ${ok ? "ALL PASS ✅" : "FAIL ❌"} #####\n`);
process.exit(ok ? 0 : 1);
