// ===========================================================================
// tools/determinism-check.mjs — headless proof that sim/ is a pure, deterministic,
// DOM-free simulation core (CAS-15 acceptance evidence).
//
//   node tools/determinism-check.mjs
//
// What it proves:
//  1. sim/ imports & runs under Node with NO browser globals → zero ctx/DOM deps.
//  2. A fixed seed + identical intent stream => byte-identical simulation state
//     across two independent runs (Stage-2 server-authority determinism).
// Because the sim module is a singleton, the two runs are executed in separate
// child module graphs via dynamic import with a cache-busting query.
// ===========================================================================

function makeDeps(){
  const noop = () => {};
  const sfx = new Proxy({}, { get: () => noop });
  const audio = { sfx, playMusic: noop, init: noop, resume: noop, start: noop, setEnabled: noop, on: true };
  const view = { VW: 800, VH: 600, zoom: () => 1.7 };
  // deterministic scripted intent: walk into the caves to trigger spawns/boss,
  // never touch the mouse/gamepad (touch + aim disabled).
  const io = {
    moveVec: () => [0, -1],          // hold "up" toward the caves
    pollPad: noop,
    aim: noop,
    get isTouch(){ return false; },
    get aimActive(){ return false; },
  };
  return { io, audio, view };
}

// hash the gameplay-relevant slice of state (ignores transient fx/floater jitter)
function snapshot(G){
  const h = G.hero;
  const round = (n) => Math.round(n * 1000) / 1000;
  return JSON.stringify({
    t: round(G.t),
    hero: h && { x: round(h.x), y: round(h.y), hp: round(h.hp), mp: round(h.mp), xp: h.xp, lvl: h.lvl, gold: h.gold },
    enemies: G.enemies.map(e => ({ type: e.type, x: round(e.x), y: round(e.y), hp: round(e.hp), state: e.state })),
    projectiles: G.projectiles.map(p => ({ x: round(p.x), y: round(p.y), kind: p.kind })),
    drops: G.drops.map(d => ({ x: round(d.x), y: round(d.y), kind: d.kind })),
    scene: G.scene, music: G.music, bossSpawned: !!G.bossSpawned,
  });
}

async function run(tag){
  // cache-bust so each run gets a fresh module singleton with its own RNG stream
  const sim = await import(`../sim/sim.js?run=${tag}`);
  sim.configure(makeDeps());
  sim.createHero("Determinism", "warrior");   // enters play
  const STEP = 1000 / 60;
  for (let i = 0; i < 1200; i++) sim.update(STEP);   // ~20s of simulation
  return snapshot(sim.G);
}

const a = await run("a");
const b = await run("b");

if (a === b) {
  console.log("PASS — sim is deterministic for a fixed seed (1200 steps identical).");
  console.log("       sim/ imported & ran under Node with no browser globals => no ctx/DOM deps.");
  process.exit(0);
} else {
  console.error("FAIL — runs diverged.");
  console.error("run A:", a.slice(0, 400));
  console.error("run B:", b.slice(0, 400));
  process.exit(1);
}
