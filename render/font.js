// ===========================================================================
// render/font.js — CAS-1610: SINGLE source of truth for UI typography.
//
// Replaces the old inline typewriter-monospace literals (258 usos across
// the renderer + DOM chrome) with ONE pixel-bitmap family baked via PixelLab
// (assets/ui/MithraldaPixel.ttf, ~10KB). Every canvas font string references
// `FF`, so changing the game's typeface is a 1-line edit here.
//
// The family stack ALWAYS ends in the generic `monospace` (never the old
// typewriter face). That fallback covers two cases without breaking a paint:
//   1) the webfont has not finished loading yet (first frames), and
//   2) glyphs the pixel font lacks (accents É/Ó/ñ, symbols ☠/⚔/✦) — the
//      browser does per-glyph fallback to a system monospace for those.
// ===========================================================================

// Canvas / CSS family stack. Keep the size/weight in the caller's font string;
// this is only the family tail: `ctx.font = "bold 12px "+FF`.
export const FF = "'MithraldaPixel', monospace";

// Matches sprites.js ASSET_V cache-bust so a redeploy re-fetches a changed font.
const ASSET_V = (typeof globalThis !== "undefined" && globalThis.__BUILD) ? ("?v=" + globalThis.__BUILD) : "";
const FONT_URL = "./assets/ui/MithraldaPixel.ttf" + ASSET_V;

let _loaded = false;
// True once the pixel webfont is registered and ready for ctx/DOM use.
export function uiFontReady(){ return _loaded; }

// Registers the webfont with the document so BOTH canvas (ctx.font) and DOM
// (CSS font-family) can render it. Resolves regardless of outcome — on any
// failure we simply keep the monospace fallback and the game paints normally.
export async function loadUIFont(){
  try{
    if(typeof document === "undefined" || !document.fonts || typeof FontFace === "undefined") return false;
    const ff = new FontFace("MithraldaPixel", "url(" + FONT_URL + ")");
    await ff.load();
    document.fonts.add(ff);
    _loaded = true;
  }catch(e){
    _loaded = false;   // keep monospace fallback; NEVER the old typewriter monospace
  }
  return _loaded;
}
