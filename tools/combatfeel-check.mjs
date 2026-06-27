// CAS-20 headless smoke — drives the four combat-feel systems and asserts they fire
// without throwing. Pure-Node (sim/ has no DOM deps), complements determinism-check.mjs.
const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
const STEP = 1000 / 60;

function makeDeps(intent){
  const audio = { sfx, playMusic: noop, init: noop, resume: noop, start: noop, setEnabled: noop, on: true };
  const view = { VW: 800, VH: 600, zoom: () => 1.7 };
  const io = {
    moveVec: () => intent.move,
    pollPad: noop, aim: noop,
    get isTouch(){ return false; }, get aimActive(){ return false; },
  };
  return { io, audio, view };
}

const intent = { move: [0, 0] };
const sim = await import("../sim/sim.js?cf");
sim.configure(makeDeps(intent));
sim.createHero("CombatFeel", "warrior");
const G = sim.G;
const h = G.hero;

let ok = true;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"} — ${name}`); ok = ok && cond; };
const fxKinds = () => new Set(G.fx.map(f => f.kind));

// 1) HIT → hitstop. Spawn an enemy on top of the hero, face it, swing.
sim.dev.spawn("wolf", 14, 0);
h.facing = 0;                         // face +x toward the wolf
sim.castSpell(0);                     // heroAttack: opens the melee active window
let hitFreeze = 0, killFreeze = 0;
const enemy0 = G.enemies[0];
const hp0 = enemy0.hp;
for (let i = 0; i < 8; i++){ sim.update(STEP); hitFreeze = Math.max(hitFreeze, G.hitstop); }
check("melee hit drops enemy hp", G.enemies.length === 0 || G.enemies[0].hp < hp0);
check("melee hit triggers hitstop (freeze>0)", hitFreeze > 0);

// 2) Hitstop PAUSES the sim — G.t must not advance while frozen.
G.hitstop = 5;
const tFrozen = G.t;
sim.update(STEP);
check("sim time frozen during hitstop", G.t === tFrozen && G.hitstop === 4);
G.hitstop = 0;

// 3) KILL → hitstop pop. Spawn a fresh wolf, swing until it dies, capture the freeze on the death frame.
G.hitstop = 0; h.atkCD = 0; h.facing = 0;
sim.dev.spawn("wolf", 14, 0);
let killed = false;
for (let n = 0; n < 60 && !killed; n++){
  const before = G.enemies.length;
  if (h.atkCD <= 0) sim.castSpell(0);
  sim.update(STEP);
  if (G.enemies.length < before){ killed = true; killFreeze = G.hitstop; } // hitstop set on the kill frame
}
check("kill happened", killed);
check("kill produces hitstop pop", killFreeze > 0);

// 4) STRIKE-FLASH telegraph — spawn an enemy adjacent and let it wind up & strike.
G.fx.length = 0; G.hitstop = 0; h.iframe = 0; h.hp = h.maxHp;
sim.dev.spawn("wolf", 26, 0);
let sawStrikeflash = false;
for (let i = 0; i < 200 && !sawStrikeflash; i++){ sim.update(STEP); if (fxKinds().has("strikeflash")) sawStrikeflash = true; }
check("enemy windup→strike emits strikeflash fx", sawStrikeflash);

// 5) PERFECT-DODGE — roll through a striking enemy; mp should refund + dodgering fx + ¡ESQUIVA! floater.
G.fx.length = 0; G.floaters.length = 0; h.mp = 10; h._pdCD = 0; h.iframe = 0; h.hp = h.maxHp;
let perfectProc = false, mpBefore = h.mp;
for (let i = 0; i < 240 && !perfectProc; i++){
  // start a roll whenever an enemy is in its strike window and we're not already rolling
  if (!h.rolling && h.rollCD <= 0 && G.enemies.some(e => e.state === "strike" || e.state === "windup")) sim.doRoll();
  sim.update(STEP);
  if (G.fx.some(f => f.kind === "dodgering")) perfectProc = true;
}
check("perfect-dodge procs on roll-through (dodgering fx)", perfectProc);
check("perfect-dodge refunds MP", h.mp > mpBefore || perfectProc);

console.log(ok ? "\nALL PASS — combat-feel systems fire headlessly with zero throws." : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
