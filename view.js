// ===========================================================================
// view.js — viewport geometry shared by sim (camera), render and input.
// Plain numbers only; the orchestrator updates VW/VH on resize. The sim reads
// these for the presentation camera but never touches the DOM.
// ===========================================================================
export const view = { VW: (typeof innerWidth !== "undefined" ? innerWidth : 0), VH: (typeof innerHeight !== "undefined" ? innerHeight : 0) };
export function zoom(){ return view.VW < 700 ? 1.55 : 1.7; }
// attach zoom to the view object too, so a single injected `view` exposes both.
view.zoom = zoom;
