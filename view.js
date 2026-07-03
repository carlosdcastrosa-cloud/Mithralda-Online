// ===========================================================================
// view.js — viewport geometry shared by sim (camera), render and input.
// Plain numbers only; the orchestrator updates VW/VH on resize. The sim reads
// these for the presentation camera but never touches the DOM.
// ===========================================================================
// gx = width of the FIXED left sidebar (Tibia-style). The world still renders across the
// whole canvas; the opaque sidebar covers the left `gx` px and the camera re-centres the
// hero into the remaining game area [gx..VW]. On narrow/mobile the sidebar collapses (gx=0)
// and only a small floating minimap is shown. gcx() = centre X of the visible game area.
export const view = { VW: (typeof innerWidth !== "undefined" ? innerWidth : 0), VH: (typeof innerHeight !== "undefined" ? innerHeight : 0), gx: 0 };
export function zoom(){ return view.VW < 700 ? 1.55 : 1.7; }
// visible game-area geometry (right of the sidebar)
view.gw = function(){ return view.VW - view.gx; };
view.gcx = function(){ return view.gx + (view.VW - view.gx) / 2; };
// attach zoom to the view object too, so a single injected `view` exposes both.
view.zoom = zoom;
