// ===========================================================================
// view.js — viewport geometry shared by sim (camera), render and input.
// Plain numbers only; the orchestrator updates VW/VH on resize. The sim reads
// these for the presentation camera but never touches the DOM.
// ===========================================================================
// Tibia-style fixed chrome. The world renders across the whole canvas; opaque HUD panels
// cover a fixed column on the RIGHT (sbw px) and a bottom bar (bbh px: attacks hotbar +
// chat input). The camera re-centres the hero into the remaining game area
// [0..VW-sbw] × [0..VH-bbh]. On narrow/mobile these collapse to 0.
//   sbx()      left edge of the right sidebar        gw()/gh() visible game-area size
//   gcx()/gcy() centre of the visible game area (camera + world-centred overlays follow)
export const view = { VW: (typeof innerWidth !== "undefined" ? innerWidth : 0), VH: (typeof innerHeight !== "undefined" ? innerHeight : 0), sbw: 0, bbh: 0 };
export function zoom(){ return view.VW < 700 ? 1.55 : 1.7; }
view.sbx = function(){ return view.VW - view.sbw; };
view.gw  = function(){ return view.VW - view.sbw; };
view.gh  = function(){ return view.VH - view.bbh; };
view.gcx = function(){ return (view.VW - view.sbw) / 2; };
view.gcy = function(){ return (view.VH - view.bbh) / 2; };
// attach zoom to the view object too, so a single injected `view` exposes both.
view.zoom = zoom;
