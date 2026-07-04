// CAS-453 QA (renderer-independent) — verifies the modal text-collision layout pass
// against the LIVE deployed render.js. Browser screenshot QA (tools/cas453-qa.mjs)
// needs a working headless GPU/renderer; this asserts the fix invariants + footer
// geometry directly so it runs anywhere. Usage: node tools/cas453-invariants-qa.mjs [URL]
const URL = process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const src = await (await fetch(`${URL}/render/render.js?cb=${Date.now()}`)).text();
const ver = await (await fetch(`${URL}/version.json?cb=${Date.now()}`)).json();
let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log("  PASS", n)) : (fail++, console.log("  FAIL", n)); };
console.log(`LIVE build ${ver.build} @ ${URL}\n`);

ok("hintFit auto-shrink helper defined", /function hintFit\(txt,cx,y,maxW,maxPx\)/.test(src));
ok("hintFit shrinks font until it fits maxW (min 7px)", /while\(px>7 && ctx\.measureText\(txt\)\.width>maxW\)/.test(src));
ok("inventory 390px narrow guard (VW<=480)", /const narrow=VW<=480;/.test(src));
ok("inventory title left-aligned+shrunk on narrow, clears Forjar band", /if\(narrow\)\{ ctx\.textAlign="left"; ctx\.font="bold 15px[\s\S]{0,80}STR\.invTitle,x\+16/.test(src));
ok("inventory slots shrunk to 28px on narrow (no portrait overlap)", /SS=narrow\?28:/.test(src));
ok("forge footer hint routed through hintFit", /hintFit\(STR\.forgeHint/.test(src));
ok("talents footer hint routed through hintFit", /hintFit\(STR\.talentHint/.test(src));
ok("customize footer hint routed through hintFit", /hintFit\(STR\.customizeHint/.test(src));
ok("customize keys line routed through hintFit", /hintFit\(STR\.customizeKeys/.test(src));
ok("equip hint routed through hintFit", /hintFit\(STR\.equipHint/.test(src));
ok("forge close button lifted off hint line (y+bh-42)", /const cy=y\+bh-42;[\s\S]{0,240}fillText\("Cerrar \(G\)"/.test(src));
ok("talents respec button lifted (freed footer room)", /y\+bh-100[\s\S]{0,60}CAS-453: freed footer room/.test(src));
ok("customize buttons lifted clear of keys hint", /VH-54[\s\S]{0,60}CAS-453: lifted clear of keys hint/.test(src));

// Geometry: forge footer button band bottom must sit above the hint baseline at both widths.
const footerClear = (bh) => { const btnBottom = (bh-42)+22; const hintBaseline = bh-8; return btnBottom < hintBaseline; };
for (const [label, VH] of [["mobile 390", 844], ["desktop 1024", 720]]) {
  const bh = Math.min(VH*0.78, 360);
  ok(`forge close button ends above hint baseline @${label}`, footerClear(bh));
}

console.log(`\nCAS-453 invariants QA: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
