// ===========================================================================
// editor.js — CAS-1702 Visual Map Editor (in-browser, $0, separate tool).
// Paints terrain, defines named zones (by real game slot), places entities, and
// exports/loads MapDoc v1 — the EXACT format sim/mapdoc.js consumes, so the
// game plays edited maps directly (real round-trip). This tool never touches
// the live game's sim; it only reads shared vocab + the codec from mapdoc.js.
// ===========================================================================
import { SLOTS, TILES, NPC_MAP, PROP_KINDS, DEFAULT_TYPES, MAPDOC_KEY, MAPDOC_VERSION,
         rleEncode, rleDecodeInto, makeSeedMapDoc,
         normSlice, sliceGrid, cellRect, autoSlice } from "./sim/mapdoc.js";
import { putAsset, getAllAssets, ASSET_CAP_BYTES } from "./sim/customassets.js";

const TS = 32;                                    // world px per tile (matches config.TS)
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------------------
// CAS-1716 — custom uploaded assets (client-side). `assets` is the live palette
// (id→record{id,path,name,type,dataUrl,w,h,img}); IndexedDB (customassets.js) is
// the durable copy that survives reload. The game NEVER reads IndexedDB — on
// Play/Export we embed only the referenced assets' data URLs into md.assets.
// ---------------------------------------------------------------------------
const assets = new Map();                         // id → record (+ lazily-built .img)
let curAsset = null;                              // selected asset id for the Sello tool
// CAS-1729 — tileset slicing: the active CELL brush. When set (and its .asset ===
// curAsset) the Sello tool stamps that source sub-rect instead of the whole sheet.
// null ⇒ whole-sheet stamp (CAS-1716 behaviour, byte-safe export).
let curCell = null;                               // { asset, col, row, sx, sy, sw, sh } | null
let slicePanelAsset = null;                       // asset id currently shown in the right slice panel
// CAS-1735 — picker zoom. PURE viewport transform: multiplier over the fit scale.
// `1` == fit-width (byte-identical to CAS-1729). Never serialized (UI-only view pref);
// resets to 1 when the panel opens for a NEW asset. drawSlicePanel() re-clamps it.
let sliceZoom = 1;
const BRIDGE_CAP_BYTES = 5 * 1024 * 1024;         // ~5MB localStorage bridge budget (Play/autosave)
// A cached HTMLImageElement per record for canvas drawing (built from its dataUrl).
function assetImg(rec){ if(rec.img) return rec.img; const im=new Image(); im.src=rec.dataUrl; rec.img=im; return im; }
const dataUrlBytes = (u)=> u ? Math.ceil((u.length - (u.indexOf(",")+1)) * 0.75) : 0; // ~base64→bytes
function totalAssetBytes(){ let n=0; for(const r of assets.values()) n+=dataUrlBytes(r.dataUrl); return n; }
// First-level folder of a relative path ("mobs/orc.png" → "mobs"; bare file → "raíz").
function groupOf(path){ const i=(path||"").indexOf("/"); return i>0 ? path.slice(0,i) : "raíz"; }

// ---- terrain colour lookup ----
const TILE_COLOR = {}; for(const t of TILES) TILE_COLOR[t.id] = t.color;

// ---- editor document (terrain kept as a flat grid; entities as lists) -------
let doc = null;   // { v,name,w,h, grid:Uint8Array, zones:[], entities:{npcs,chests,fragments,portals,props} }

// ---- camera / view ----
let zoom = 12;                                    // px per tile on screen
let panX = 40, panY = 40;                         // screen px offset of tile (0,0)

// ---- current tool state ----
let tool = "paint";
let curTile = TILES[3].id;                        // adoquín by default (visible on grass)
let curSlot = "forest";
let curNpc = "healer";
let curProp = PROP_KINDS[0].kind;

const canvas = $("c"), ctx = canvas.getContext("2d");

// ---------------------------------------------------------------------------
// document construction
// ---------------------------------------------------------------------------
function blankDoc(name){
  const w=64, h=48;
  return { v:MAPDOC_VERSION, name:name||"Mi Mundo", w, h,
    grid:new Uint8Array(w*h), zones:[],
    entities:{ npcs:[], chests:[], fragments:[], portals:[], props:[] } };
}
// Convert a MapDoc (rle terrain) → editor doc (flat grid).
function docFromMapDoc(md){
  const w=md.w, h=md.h, grid=new Uint8Array(w*h);
  if(md.terrain && Array.isArray(md.terrain.rle)) rleDecodeInto(md.terrain.rle, grid);
  const e = md.entities||{};
  return { v:md.v||MAPDOC_VERSION, name:md.name||"Mapa", w, h, grid,
    zones:(md.zones||[]).map(z=>({...z})),
    entities:{
      npcs:(e.npcs||[]).map(n=>({...n})), chests:(e.chests||[]).map(c=>({...c})),
      fragments:(e.fragments||[]).map(f=>({...f})), portals:(e.portals||[]).map(p=>({...p})),
      props:(e.props||[]).map(p=>({...p})),
    } };
}
// Convert editor doc → MapDoc (rle terrain) for export / play. When `embedAssets`
// is true AND custom props are placed, embed ONLY the referenced assets' data URLs
// under md.assets (so the game reads them SYNC). With no custom props the `assets`
// key is never added and the props array is unchanged → byte-identical output (AC7).
function docToMapDoc(embedAssets){
  const md = { v:MAPDOC_VERSION, name:doc.name, w:doc.w, h:doc.h,
    terrain:{ rle: rleEncode(doc.grid) },
    zones: doc.zones.map(z=>({...z})),
    entities:{
      npcs:doc.entities.npcs.map(n=>({...n})), chests:doc.entities.chests.map(c=>({...c})),
      fragments:doc.entities.fragments.map(f=>({...f})), portals:doc.entities.portals.map(p=>({...p})),
      props:doc.entities.props.map(p=>({...p})),
    } };
  if(embedAssets){ const refs=referencedAssets(); if(refs) md.assets=refs; }
  return md;
}

// ---------------------------------------------------------------------------
// coordinate helpers
// ---------------------------------------------------------------------------
const scrToTile = (sx,sy) => [ Math.floor((sx-panX)/zoom), Math.floor((sy-panY)/zoom) ];
const tileToScr = (tx,ty) => [ panX+tx*zoom, panY+ty*zoom ];
const inBounds  = (tx,ty) => tx>=0 && ty>=0 && tx<doc.w && ty<doc.h;

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
function resize(){
  const wrap = $("canvasWrap");
  canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight;
  draw();
}
function draw(){
  const W=canvas.width, H=canvas.height;
  ctx.fillStyle="#0a0c11"; ctx.fillRect(0,0,W,H);
  // visible tile range
  const tx0=Math.max(0,Math.floor((-panX)/zoom)), ty0=Math.max(0,Math.floor((-panY)/zoom));
  const tx1=Math.min(doc.w,Math.ceil((W-panX)/zoom)), ty1=Math.min(doc.h,Math.ceil((H-panY)/zoom));
  for(let ty=ty0;ty<ty1;ty++) for(let tx=tx0;tx<tx1;tx++){
    ctx.fillStyle = TILE_COLOR[doc.grid[ty*doc.w+tx]] || "#000";
    ctx.fillRect(panX+tx*zoom, panY+ty*zoom, zoom+0.6, zoom+0.6);
  }
  // grid lines (only when zoomed enough)
  if(zoom>=8){
    ctx.strokeStyle="#ffffff10"; ctx.lineWidth=1; ctx.beginPath();
    for(let tx=tx0;tx<=tx1;tx++){ const x=panX+tx*zoom; ctx.moveTo(x,panY+ty0*zoom); ctx.lineTo(x,panY+ty1*zoom); }
    for(let ty=ty0;ty<=ty1;ty++){ const y=panY+ty*zoom; ctx.moveTo(panX+tx0*zoom,y); ctx.lineTo(panX+tx1*zoom,y); }
    ctx.stroke();
  }
  // world border
  ctx.strokeStyle="#c8a24a80"; ctx.lineWidth=2;
  ctx.strokeRect(panX, panY, doc.w*zoom, doc.h*zoom);
  // zones
  for(const z of doc.zones){
    const [sx,sy]=tileToScr(z.x,z.y), zw=z.w*zoom, zh=z.h*zoom;
    const meta = SLOTS.find(s=>s.id===z.slot);
    ctx.fillStyle="#c8a24a14"; ctx.fillRect(sx,sy,zw,zh);
    ctx.strokeStyle = z.slot==="town" ? "#e8c060" : "#7fd0ff"; ctx.lineWidth=2;
    ctx.setLineDash([6,4]); ctx.strokeRect(sx,sy,zw,zh); ctx.setLineDash([]);
    ctx.fillStyle="#fff"; ctx.font="11px system-ui";
    ctx.fillText((z.name||z.slot)+"  ["+z.slot+(meta?" · T"+meta.tier:"")+"]", sx+4, sy+13);
  }
  // entities
  const px2scr = (px)=> panX + (px/TS)*zoom, py2scr=(py)=> panY + (py/TS)*zoom;
  const dot = (px,py,color,ch)=>{ const x=px2scr(px), y=py2scr(py);
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,Math.max(4,zoom*0.32),0,7); ctx.fill();
    ctx.fillStyle="#000"; ctx.font="bold "+Math.max(8,zoom*0.4)+"px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(ch,x,y+0.5); ctx.textAlign="left"; ctx.textBaseline="alphabetic"; };
  for(const p of doc.entities.props){ const x=px2scr(p.x), y=py2scr(p.y);
    if(p.kind==="custom"){ const r=assets.get(p.asset);
      if(r){ const im=assetImg(r);
        // CAS-1729: a sliced cell (p.sw) previews its sub-rect at cell size; whole sheet otherwise.
        const dw=p.w || (p.sw?p.sw:r.w) || 32, dh=p.h || (p.sw?p.sh:r.h) || 32;
        const w=dw*zoom/TS, h=dh*zoom/TS;
        if(im.complete&&im.naturalWidth){ ctx.imageSmoothingEnabled=false;
          if(p.sw) ctx.drawImage(im, p.sx, p.sy, p.sw, p.sh, x-w/2, y-h, w, h);
          else ctx.drawImage(im, x-w/2, y-h, w, h); }
        else { ctx.strokeStyle="#c8a24a"; ctx.strokeRect(x-w/2,y-h,w,h); } }
      else { ctx.fillStyle="#c8a24a"; ctx.fillRect(x-3,y-3,6,6); }   // missing asset marker
      continue; }
    ctx.fillStyle=p.solid?"#2f7d32":"#6f8f4f"; ctx.fillRect(x-2,y-2,4,4); }
  for(const c of doc.entities.chests)    dot(c.x,c.y,"#e0b040","$");
  for(const f of doc.entities.fragments) dot(f.x,f.y, f.kind==="mp"?"#5090e0":"#e05070","✦");
  for(const p of doc.entities.portals)   dot(p.x,p.y,"#a060e0","◈");
  for(const n of doc.entities.npcs)      dot(n.x,n.y,"#40c0a0",(n.role||"n")[0].toUpperCase());
}

// ---------------------------------------------------------------------------
// editing operations
// ---------------------------------------------------------------------------
function paintTile(tx,ty){ if(inBounds(tx,ty)) doc.grid[ty*doc.w+tx]=curTile; }
function floodFill(tx,ty){
  if(!inBounds(tx,ty)) return;
  const target = doc.grid[ty*doc.w+tx]; if(target===curTile) return;
  const st=[[tx,ty]];
  while(st.length){ const [x,y]=st.pop(); if(!inBounds(x,y)) continue;
    if(doc.grid[y*doc.w+x]!==target) continue;
    doc.grid[y*doc.w+x]=curTile;
    st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]); }
}
function addZone(x,y,w,h){
  if(w<1||h<1) return;
  // one town max (the hub) — replacing keeps the model simple for Carlos.
  if(curSlot==="town") doc.zones = doc.zones.filter(z=>z.slot!=="town");
  const z={ slot:curSlot, name:($("zoneName").value||"").trim() || (SLOTS.find(s=>s.id===curSlot)?.label||curSlot), x,y,w,h };
  if(curSlot!=="town") z.types = (DEFAULT_TYPES[curSlot]||["wolf"]).slice();
  doc.zones.push(z);
}
function placeEntity(px,py){
  if(tool==="npc")      doc.entities.npcs.push({ role:curNpc, x:px, y:py });
  else if(tool==="chest")    doc.entities.chests.push({ x:px, y:py, loot:"gold60" });
  else if(tool==="fragment") doc.entities.fragments.push({ x:px, y:py, kind:"hp" });
  else if(tool==="prop"){ const pk=PROP_KINDS.find(p=>p.kind===curProp); doc.entities.props.push({ x:px, y:py, kind:curProp, solid:pk.solid, r:pk.r }); }
}
// delete: remove nearest entity within a radius, else a zone under the point.
function deleteAt(px,py){
  const R = Math.max(18, TS*0.7);
  const lists = ["npcs","chests","fragments","portals","props"];
  let best=null;
  for(const L of lists) for(let i=0;i<doc.entities[L].length;i++){ const e=doc.entities[L][i];
    const d=Math.hypot(e.x-px, e.y-py); if(d<R && (!best||d<best.d)) best={L,i,d}; }
  if(best){ doc.entities[best.L].splice(best.i,1); return; }
  const tx=px/TS, ty=py/TS;
  for(let i=doc.zones.length-1;i>=0;i--){ const z=doc.zones[i];
    if(tx>=z.x&&tx<z.x+z.w&&ty>=z.y&&ty<z.y+z.h){ doc.zones.splice(i,1); return; } }
}

// ---------------------------------------------------------------------------
// CAS-1716 — custom-asset ingest, palette, and the Sello (stamp) tool
// ---------------------------------------------------------------------------
// Decode a data URL into {w,h} via a throwaway Image (async).
function dimsOf(dataUrl){ return new Promise(res=>{ const im=new Image();
  im.onload=()=>res({w:im.naturalWidth||0,h:im.naturalHeight||0}); im.onerror=()=>res({w:0,h:0}); im.src=dataUrl; }); }
// Read a File → data URL (async).
function fileToDataUrl(file){ return new Promise((res,rej)=>{ const rd=new FileReader();
  rd.onload=()=>res(rd.result); rd.onerror=()=>rej(rd.error); rd.readAsDataURL(file); }); }
// Insert/replace a record in the palette + IndexedDB, enforcing the total cap. Returns
// the record or null if the cap would be exceeded (caller flashes; never throws).
async function ingestRecord(rec){
  const prev = assets.get(rec.id);
  const delta = dataUrlBytes(rec.dataUrl) - (prev?dataUrlBytes(prev.dataUrl):0);
  if(totalAssetBytes() + delta > ASSET_CAP_BYTES){
    flash(`Límite de ~${Math.round(ASSET_CAP_BYTES/1048576)}MB de assets alcanzado — no se añadió "${rec.name}"`); return null; }
  // CAS-1729: a re-upload of the same tileset keeps its remembered slicing config.
  if(prev && prev.slice && !rec.slice) rec.slice = prev.slice;
  assets.set(rec.id, rec);
  try{ await putAsset({ id:rec.id, path:rec.path, name:rec.name, type:rec.type, dataUrl:rec.dataUrl, w:rec.w, h:rec.h, slice:rec.slice }); }
  catch(e){ // QuotaExceededError or no-indexeddb: keep it in-memory for this session, warn once.
    flash("No se pudo guardar en el navegador (cuota); disponible solo esta sesión"); }
  return rec;
}
// Ingest one uploaded File (recursive folder uploads arrive as a flat File list whose
// webkitRelativePath carries the folder structure). Non-images are skipped silently.
async function ingestFile(file){
  if(!file || !(file.type||"").startsWith("image/")) return null;
  const path = file.webkitRelativePath || file.name;
  const dataUrl = await fileToDataUrl(file);
  const { w, h } = await dimsOf(dataUrl);
  return ingestRecord({ id:path, path, name:file.name, type:file.type, dataUrl, w, h });
}
// Ingest a batch of File objects; report the loaded count.
async function ingestFiles(fileList){
  const files = Array.from(fileList||[]);
  let ok=0, skipped=0;
  for(const f of files){ const r = await ingestFile(f); if(r) ok++; else if(!(f.type||"").startsWith("image/")) skipped++; }
  buildAssetPalette();
  if(!curAsset){ const first=assets.keys().next(); if(!first.done) selectAsset(first.value); }
  draw();
  flash(`${ok} imagen(es) cargada(s)${skipped?` · ${skipped} no-imagen ignorada(s)`:""}`);
  return ok;
}
// Re-hydrate the palette from IndexedDB at boot (assets survive reloads).
async function reingestFromDB(){
  try{ const recs = await getAllAssets();
    for(const r of recs) assets.set(r.id, { ...r });
    buildAssetPalette(); draw();
  }catch(e){ /* no IndexedDB (private mode / headless): palette just starts empty */ }
}
// Re-hydrate assets embedded in an imported MapDoc's md.assets block (→ palette + IndexedDB).
async function reingestEmbedded(mdAssets){
  if(!mdAssets) return;
  for(const id in mdAssets){ const a=mdAssets[id]; if(!a||!a.dataUrl) continue;
    const { w, h } = await dimsOf(a.dataUrl);
    await ingestRecord({ id, path:a.path||id, name:a.name||id, type:a.type||"image/png", dataUrl:a.dataUrl, w, h }); }
  buildAssetPalette(); draw();
}
// Collect the md.assets table for ONLY the custom props actually placed (referenced ids).
function referencedAssets(){
  const out={}; const seen=new Set();
  for(const p of doc.entities.props){ if(p.kind!=="custom"||!p.asset||seen.has(p.asset)) continue;
    const r=assets.get(p.asset); if(!r) continue; seen.add(p.asset);
    out[p.asset]={ path:r.path, name:r.name, type:r.type, dataUrl:r.dataUrl }; }
  return seen.size ? out : null;
}
// Place one custom prop (bottom-anchored authored size = the asset's natural px).
// CAS-1729: when a tileset CELL is the active brush for this asset, stamp its source
// sub-rect (sx,sy,sw,sh) and size the prop to the cell; otherwise the whole sheet.
function placeCustom(px,py){ if(!curAsset) return; const r=assets.get(curAsset); if(!r) return;
  const prop={ x:px, y:py, kind:"custom", asset:curAsset, w:r.w||32, h:r.h||32, solid:false, r:0 };
  if(curCell && curCell.asset===curAsset){
    prop.sx=curCell.sx; prop.sy=curCell.sy; prop.sw=curCell.sw; prop.sh=curCell.sh;
    prop.w=curCell.sw; prop.h=curCell.sh; }
  doc.entities.props.push(prop); }

// ---------------------------------------------------------------------------
// CAS-1729 — tileset slicing config + cell selection (Tiled-style right panel).
// The slice config lives on the asset record (rec.slice) and persists to IndexedDB
// (editor-only; the game never reads it — a placed cell carries its own sub-rect).
// ---------------------------------------------------------------------------
// Get (auto-initialising) the slice config for a tileset — never null so the panel
// always has a working grid (defaults to a single whole-sheet cell when no grid fits).
function sliceOf(rec){
  if(rec.slice) return rec.slice;
  rec.slice = autoSlice(rec.w||0, rec.h||0) || { tw:rec.w||32, th:rec.h||32, margin:0, spacing:0, ox:0, oy:0 };
  return rec.slice;
}
// Persist a record's slice config (full record; putAsset dedups by id).
async function persistSlice(rec){
  try{ await putAsset({ id:rec.id, path:rec.path, name:rec.name, type:rec.type, dataUrl:rec.dataUrl, w:rec.w, h:rec.h, slice:rec.slice }); }catch(e){}
}
// Lock in cell (col,row) of a tileset as the active stamp brush.
function selectCellInternal(rec, col, row){
  const sl = sliceOf(rec); const rect = cellRect(sl, col, row);
  curCell = { asset:rec.id, col, row, sx:rect.sx, sy:rect.sy, sw:rect.sw, sh:rect.sh };
}
// Read the six numeric inputs into a slice config (interactive panel only).
function readSliceInputs(){
  return normSlice({ tw:+$("slTw").value, th:+$("slTh").value, margin:+$("slMargin").value,
    spacing:+$("slSpacing").value, ox:+$("slOx").value, oy:+$("slOy").value });
}
// Open (or hide) the right slice panel for `id`. Populates inputs from the record's slice.
function openSlicePanel(id){
  const panel=$("slicePanel"); if(!panel) return;
  const r=assets.get(id);
  if(!r || tool!=="stamp"){ panel.style.display="none"; slicePanelAsset=null; return; }
  // CAS-1735: opening a DIFFERENT tileset resets the picker view (zoom→fit, scroll→0).
  if(slicePanelAsset!==id){ sliceZoom=1; const v=$("sliceView"); if(v){ v.scrollLeft=0; v.scrollTop=0; } }
  slicePanelAsset=id; const s=sliceOf(r);
  $("slTw").value=s.tw; $("slTh").value=s.th; $("slMargin").value=s.margin;
  $("slSpacing").value=s.spacing; $("slOx").value=s.ox; $("slOy").value=s.oy;
  panel.style.display="";
  drawSlicePanel();
}
// Redraw the tileset image + grid overlay + selected-cell highlight in the panel.
function drawSlicePanel(){
  const cvs=$("sliceCanvas"); if(!cvs || !slicePanelAsset) return;
  const r=assets.get(slicePanelAsset); if(!r) return;
  const im=assetImg(r); const iw=r.w||im.naturalWidth||32, ih=r.h||im.naturalHeight||32;
  const maxW=232; const dsFit = iw>maxW ? maxW/iw : Math.min(4, maxW/iw);   // fit width (down- or up-scale, ≤4×)
  // CAS-1735: effective scale = fit × user zoom. Spec clamp is [0.5,12]; also cap so the
  // picker canvas never exceeds a memory limit (~4096px/side). sliceZoom==1 ⇒ byte-id to fit.
  const MAXCV=4096, maxZoom=Math.max(1, Math.min(12, MAXCV/(iw*dsFit), MAXCV/(ih*dsFit)));
  sliceZoom=Math.max(0.5, Math.min(maxZoom, sliceZoom||1));
  const ds=dsFit*sliceZoom;
  const cw=Math.max(1,Math.round(iw*ds)), ch=Math.max(1,Math.round(ih*ds));
  cvs.width=cw; cvs.height=ch; cvs._ds=ds;
  // Size the element to its buffer so 1 CSS px == 1 canvas px → clicks map dead-on
  // (fixes a latent CAS-1729 offset from the old width:100% CSS stretch).
  cvs.style.width=cw+"px"; cvs.style.height=ch+"px";
  const zl=$("sliceZoomLbl"); if(zl) zl.textContent=Math.round(sliceZoom*100)+"%";
  const x=cvs.getContext("2d"); x.imageSmoothingEnabled=false;
  x.fillStyle="#0a0c11"; x.fillRect(0,0,cw,ch);
  if(im.complete&&im.naturalWidth) x.drawImage(im,0,0,cw,ch);
  const sl=sliceOf(r); const g=sliceGrid(sl, iw, ih);
  x.strokeStyle="#ffffff55"; x.lineWidth=1;
  for(let c=0;c<=g.cols;c++){ const px=Math.round((sl.ox+sl.margin+c*(sl.tw+sl.spacing))*ds)+0.5;
    x.beginPath(); x.moveTo(px,0); x.lineTo(px,ch); x.stroke(); }
  for(let rr=0;rr<=g.rows;rr++){ const py=Math.round((sl.oy+sl.margin+rr*(sl.th+sl.spacing))*ds)+0.5;
    x.beginPath(); x.moveTo(0,py); x.lineTo(cw,py); x.stroke(); }
  if(curCell && curCell.asset===slicePanelAsset){
    x.fillStyle="#c8a24a44"; x.strokeStyle="#e8c060"; x.lineWidth=2;
    const hx=curCell.sx*ds, hy=curCell.sy*ds, hw=curCell.sw*ds, hh=curCell.sh*ds;
    x.fillRect(hx,hy,hw,hh); x.strokeRect(hx,hy,hw,hh); }
  $("sliceInfo").textContent = `${g.cols}×${g.rows} cuadros · ${sl.tw}×${sl.th}px` + (curCell&&curCell.asset===slicePanelAsset?` · celda (${curCell.col},${curCell.row})`:" · sin celda");
}
// Any slice-input change → update rec.slice, re-clamp the active cell, persist, redraw.
// CAS-1735: sliceZoom SURVIVES a tw/th change (re-clamped inside drawSlicePanel).
function onSliceInput(){
  const r=assets.get(slicePanelAsset); if(!r) return;
  r.slice=readSliceInputs();
  if(curCell && curCell.asset===slicePanelAsset){ const g=sliceGrid(r.slice, r.w, r.h);
    if(curCell.col>=g.cols || curCell.row>=g.rows) curCell=null;
    else selectCellInternal(r, curCell.col, curCell.row); }
  persistSlice(r); drawSlicePanel();
}
// CAS-1735 — resolve the grid cell under a canvas-space pixel (buffer coords, so it is
// zoom/scroll-independent: `ds` already folds the zoom in). Returns {col,row} or null.
// Shared by the pointer handler AND the QA hook so both agree at every zoom level.
function pickAtCanvasPx(x,y){
  const r=assets.get(slicePanelAsset); if(!r) return null;
  const cvs=$("sliceCanvas"); if(!cvs) return null; const ds=cvs._ds||1; const sl=sliceOf(r);
  const ix=x/ds, iy=y/ds;
  const col=Math.floor((ix - sl.ox - sl.margin)/(sl.tw+sl.spacing));
  const row=Math.floor((iy - sl.oy - sl.margin)/(sl.th+sl.spacing));
  const g=sliceGrid(sl, r.w, r.h);
  if(col<0||row<0||col>=g.cols||row>=g.rows) return null;
  return { col, row };
}
// Set the picker zoom (clamped + redrawn inside drawSlicePanel). Returns the effective zoom.
function setSliceZoom(z){ sliceZoom=(+z||1); drawSlicePanel(); return sliceZoom; }
// After a high-zoom selection, scroll the viewport so the gold highlight is visible.
function scrollCellIntoView(){
  const cvs=$("sliceCanvas"), view=$("sliceView"); if(!cvs||!view||!curCell||curCell.asset!==slicePanelAsset) return;
  const ds=cvs._ds||1;
  const x0=curCell.sx*ds, y0=curCell.sy*ds, x1=(curCell.sx+curCell.sw)*ds, y1=(curCell.sy+curCell.sh)*ds;
  if(x0<view.scrollLeft) view.scrollLeft=Math.max(0,x0-8);
  else if(x1>view.scrollLeft+view.clientWidth) view.scrollLeft=x1-view.clientWidth+8;
  if(y0<view.scrollTop) view.scrollTop=Math.max(0,y0-8);
  else if(y1>view.scrollTop+view.clientHeight) view.scrollTop=y1-view.clientHeight+8;
}

let lastStamp=null;                               // last stamp world-pos for drag spacing
function stampAt(px,py){
  if(!curAsset) return; const r=assets.get(curAsset); if(!r) return;
  const spacing=Math.max(12, Math.min(r.w||24, r.h||24)*0.75);   // continuous-stamp spacing (world px)
  if(lastStamp && Math.hypot(px-lastStamp[0],py-lastStamp[1])<spacing) return;
  placeCustom(px,py); lastStamp=[px,py];
}

function selectAsset(id){ curAsset=id;
  document.querySelectorAll("#assetGroups .asw").forEach(n=>n.classList.toggle("on", n.dataset.id===id));
  // CAS-1729: the cell brush belongs to a specific tileset — switching assets drops it,
  // and (in the Sello tool) opens the slice panel for the newly selected tileset.
  if(curCell && curCell.asset!==id) curCell=null;
  if(tool==="stamp") openSlicePanel(id); }
function buildAssetPalette(){
  const wrap=$("assetGroups"); if(!wrap) return; wrap.innerHTML="";
  const groups=new Map();
  for(const r of assets.values()){ const g=groupOf(r.path); (groups.get(g)||groups.set(g,[]).get(g)).push(r); }
  $("assetEmpty").style.display = assets.size ? "none" : "";
  for(const [g,list] of groups){
    const gd=document.createElement("div"); gd.className="agroup";
    const gh=document.createElement("div"); gh.className="ghead"; gh.textContent=`${g} (${list.length})`; gd.appendChild(gh);
    const sw=document.createElement("div"); sw.className="aswatches"; gd.appendChild(sw);
    for(const r of list){ const b=document.createElement("div"); b.className="asw"+(r.id===curAsset?" on":""); b.dataset.id=r.id;
      b.title=r.path;
      const im=document.createElement("img"); im.src=r.dataUrl; im.alt=r.name;
      const nm=document.createElement("span"); nm.textContent=r.name;
      b.appendChild(im); b.appendChild(nm);
      b.onclick=()=>selectAsset(r.id); sw.appendChild(b); }
    wrap.appendChild(gd);
  }
}

// ---------------------------------------------------------------------------
// pointer handling
// ---------------------------------------------------------------------------
let dragging=false, panning=false, spaceDown=false, dragStart=null, lastPan=null;
canvas.addEventListener("contextmenu", e=>e.preventDefault());
canvas.addEventListener("pointerdown", e=>{
  canvas.setPointerCapture(e.pointerId);
  const sx=e.offsetX, sy=e.offsetY;
  if(e.button===2 || e.button===1 || spaceDown){ panning=true; lastPan=[sx,sy]; return; }
  dragging=true; dragStart=[sx,sy];
  const [tx,ty]=scrToTile(sx,sy);
  const px=(tx+0.5)*TS, py=(ty+0.5)*TS;
  if(tool==="paint") paintTile(tx,ty);
  else if(tool==="erase"){ if(inBounds(tx,ty)) doc.grid[ty*doc.w+tx]=TILES[0].id; }
  else if(tool==="fill") floodFill(tx,ty);
  else if(tool==="npc"||tool==="chest"||tool==="fragment"||tool==="prop") placeEntity(px,py);
  else if(tool==="stamp"){ lastStamp=null; stampAt(px,py); }
  else if(tool==="delete") deleteAt((tx+0.5)*TS,(ty+0.5)*TS);
  // "zone" handled on pointerup (drag rect)
  draw(); autosave();
});
canvas.addEventListener("pointermove", e=>{
  const sx=e.offsetX, sy=e.offsetY;
  const [tx,ty]=scrToTile(sx,sy);
  $("status").textContent = inBounds(tx,ty) ? `tile ${tx},${ty}` : `— · zoom ${zoom}px`;
  if(panning){ panX+=sx-lastPan[0]; panY+=sy-lastPan[1]; lastPan=[sx,sy]; draw(); return; }
  if(!dragging) return;
  if(tool==="paint"){ paintTile(tx,ty); draw(); }
  else if(tool==="erase"){ if(inBounds(tx,ty)) doc.grid[ty*doc.w+tx]=TILES[0].id; draw(); }
  else if(tool==="stamp"){ stampAt((tx+0.5)*TS,(ty+0.5)*TS); draw(); }
  else if(tool==="zone"){ draw(); // preview rect
    const [ax,ay]=dragStart; ctx.strokeStyle="#e8c060"; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.strokeRect(Math.min(ax,sx),Math.min(ay,sy),Math.abs(sx-ax),Math.abs(sy-ay)); ctx.setLineDash([]); }
});
canvas.addEventListener("pointerup", e=>{
  const sx=e.offsetX, sy=e.offsetY;
  if(panning){ panning=false; }
  else if(dragging && tool==="zone"){
    const [ax,ay]=dragStart; const [t0x,t0y]=scrToTile(Math.min(ax,sx),Math.min(ay,sy));
    const [t1x,t1y]=scrToTile(Math.max(ax,sx),Math.max(ay,sy));
    const x=Math.max(0,Math.min(t0x,doc.w-1)), y=Math.max(0,Math.min(t0y,doc.h-1));
    const w=Math.min(doc.w-x,Math.max(1,t1x-t0x+1)), h=Math.min(doc.h-y,Math.max(1,t1y-t0y+1));
    addZone(x,y,w,h);
  }
  dragging=false; draw(); autosave(); updateMapInfo();
});
canvas.addEventListener("wheel", e=>{
  e.preventDefault();
  const sx=e.offsetX, sy=e.offsetY;
  const [tx,ty]=[(sx-panX)/zoom,(sy-panY)/zoom];
  const nz = Math.max(3, Math.min(40, zoom * (e.deltaY<0?1.15:0.87)));
  panX = sx - tx*nz; panY = sy - ty*nz; zoom = nz; draw();
}, { passive:false });
window.addEventListener("keydown", e=>{ if(e.code==="Space"){ spaceDown=true; canvas.style.cursor="grab"; } });
window.addEventListener("keyup",   e=>{ if(e.code==="Space"){ spaceDown=false; canvas.style.cursor="crosshair"; } });

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------
let saveTimer=null;
function autosave(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{
  try{ localStorage.setItem(MAPDOC_KEY, JSON.stringify(docToMapDoc())); $("status").textContent="guardado ✓"; }catch(e){}
}, 400); }
function saveNow(){ try{ localStorage.setItem(MAPDOC_KEY, JSON.stringify(docToMapDoc())); flash("Guardado en el navegador ✓"); }catch(e){ flash("No se pudo guardar"); } }
function loadFromStorage(){
  try{ const raw=localStorage.getItem(MAPDOC_KEY); if(!raw){ flash("No hay mapa guardado"); return; }
    setDoc(docFromMapDoc(JSON.parse(raw))); flash("Mapa cargado ✓"); }catch(e){ flash("Archivo inválido"); }
}
function flash(msg){ const s=$("status"); s.textContent=msg; }

function setDoc(d){ doc=d; $("nameF").value=doc.name;
  // frame the whole map to fit
  const wrap=$("canvasWrap"); zoom=Math.max(4,Math.min(20, Math.floor(Math.min(wrap.clientWidth/(doc.w+4), wrap.clientHeight/(doc.h+4)))));
  panX=(wrap.clientWidth-doc.w*zoom)/2; panY=(wrap.clientHeight-doc.h*zoom)/2; updateMapInfo(); resize(); autosave(); }
  // CAS-1693 fix: resize() sizes the canvas to the pane BEFORE drawing. Previously setDoc
  // called draw() directly, but the canvas kept its default 300×150 (resize was only bound to
  // the window 'resize' event, which never fires at boot) — so the map, centered in the ~1000px
  // pane, was drawn entirely outside the tiny canvas → fully black screen.

function updateMapInfo(){
  const nZ=doc.zones.length, nE=doc.entities.npcs.length+doc.entities.chests.length+doc.entities.fragments.length;
  $("mapInfo").innerHTML = `${doc.w}×${doc.h} tiles · ${nZ} zona(s) · ${nE} entidad(es) · ${doc.entities.props.length} props`;
}

// ---------------------------------------------------------------------------
// export / import / play
// ---------------------------------------------------------------------------
function exportJSON(){
  doc.name=$("nameF").value||"Mi Mundo";
  // Embed referenced custom assets so the exported file is self-contained (round-trip).
  const blob=new Blob([JSON.stringify(docToMapDoc(true),null,0)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=(doc.name.replace(/[^\w-]+/g,"_")||"mapa")+".mapdoc.json"; a.click();
  URL.revokeObjectURL(a.href); flash("JSON exportado ✓");
}
function importJSON(file){ const rd=new FileReader();
  rd.onload=()=>{ try{ const md=JSON.parse(rd.result); setDoc(docFromMapDoc(md));
      if(md.assets) reingestEmbedded(md.assets);   // re-hydrate embedded custom assets → palette + IndexedDB
      flash("Importado ✓"); }catch(e){ flash("JSON inválido"); } };
  rd.readAsText(file); }
function play(){
  doc.name=$("nameF").value||"Mi Mundo";
  const md=docToMapDoc(true);                       // embed referenced custom assets for the game (sync bridge)
  const json=JSON.stringify(md);
  if(json.length > BRIDGE_CAP_BYTES){
    flash(`El mapa con sus assets supera ~${Math.round(BRIDGE_CAP_BYTES/1048576)}MB — reduce/optimiza imágenes para Jugar`); return; }
  try{ localStorage.setItem(MAPDOC_KEY, json); }
  catch(e){ flash("No se pudo guardar para jugar (cuota del navegador)"); return; }
  window.open("./index.html?map=local","_blank");
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
const TOOLS = [
  { id:"paint",   label:"🖌 Pintar" }, { id:"fill", label:"🪣 Relleno" },
  { id:"erase",   label:"⌫ Borrar terreno" }, { id:"zone", label:"▢ Zona" },
  { id:"npc",     label:"☻ NPC" }, { id:"chest", label:"$ Cofre" },
  { id:"fragment",label:"✦ Fragmento" }, { id:"prop", label:"♣ Prop" },
  { id:"stamp",   label:"🔖 Sello" },
  { id:"delete",  label:"✕ Borrar ent." },
];
const HINTS = {
  paint:"Arrastra para pintar el terreno seleccionado.",
  fill:"Clic para rellenar un área del mismo terreno.",
  erase:"Arrastra para volver a Hierba.",
  zone:"Elige slot + nombre, arrastra un rectángulo. El slot da tier/jefe/botín/mobs.",
  npc:"Clic para colocar el NPC elegido (la Sanadora es el punto de reaparición).",
  chest:"Clic para colocar un cofre.",
  fragment:"Clic para colocar un fragmento de vitalidad/maná.",
  prop:"Clic para colocar decoración (árboles, rocas…).",
  stamp:"Sube assets y elige uno; a la derecha recorta el tileset en su grilla y escoge un cuadro. Clic=1, arrastra=serie.",
  delete:"Clic sobre una entidad o zona para eliminarla.",
};
function buildTools(){ const el=$("tools"); el.innerHTML="";
  for(const t of TOOLS){ const b=document.createElement("div"); b.className="tool"+(t.id===tool?" on":""); b.textContent=t.label;
    b.onclick=()=>selectTool(t.id); el.appendChild(b); } }
function selectTool(id){ tool=id;
  document.querySelectorAll("#tools .tool").forEach((n,i)=>n.classList.toggle("on",TOOLS[i].id===id));
  $("terrainPal").style.display=(id==="paint"||id==="fill")?"":"none";
  $("zonePal").style.display=id==="zone"?"":"none";
  $("npcPal").style.display=id==="npc"?"":"none";
  $("propPal").style.display=id==="prop"?"":"none";
  $("assetPal").style.display=id==="stamp"?"":"none";
  // CAS-1729: the right slice panel only exists in the Sello tool with a tileset selected.
  if(id==="stamp" && curAsset) openSlicePanel(curAsset); else { $("slicePanel").style.display="none"; slicePanelAsset=null; }
  $("hint").textContent=HINTS[id]||""; }
function buildTiles(){ const el=$("tiles"); el.innerHTML="";
  for(const t of TILES){ const b=document.createElement("div"); b.className="sw"+(t.id===curTile?" on":"");
    b.innerHTML=`<span class="chip" style="background:${t.color}"></span>${t.label}`;
    b.onclick=()=>{ curTile=t.id; document.querySelectorAll("#tiles .sw").forEach((n,i)=>n.classList.toggle("on",TILES[i].id===curTile)); };
    el.appendChild(b); } }
function buildSlots(){ const sel=$("slotSel"); sel.innerHTML="";
  for(const s of SLOTS){ const o=document.createElement("option"); o.value=s.id; o.textContent=`${s.label} · T${s.tier}${s.safe?" (seguro)":""}`; sel.appendChild(o); }
  sel.value=curSlot; sel.onchange=()=>{ curSlot=sel.value; }; }
function buildNpcs(){ const el=$("npcs"); el.innerHTML="";
  for(const role in NPC_MAP){ const d=NPC_MAP[role]; const b=document.createElement("div"); b.className="sw"+(role===curNpc?" on":"");
    b.innerHTML=`<span class="chip" style="background:#40c0a0"></span>${d.label}`;
    b.onclick=()=>{ curNpc=role; document.querySelectorAll("#npcs .sw").forEach(n=>n.classList.remove("on")); b.classList.add("on"); };
    el.appendChild(b); } }
function buildProps(){ const el=$("props"); el.innerHTML="";
  for(const p of PROP_KINDS){ const b=document.createElement("div"); b.className="sw"+(p.kind===curProp?" on":"");
    b.innerHTML=`<span class="chip" style="background:${p.solid?"#2f7d32":"#6f8f4f"}"></span>${p.label}`;
    b.onclick=()=>{ curProp=p.kind; document.querySelectorAll("#props .sw").forEach(n=>n.classList.remove("on")); b.classList.add("on"); };
    el.appendChild(b); } }

// top-bar buttons
$("btnSeed").onclick=()=>{ setDoc(docFromMapDoc(makeSeedMapDoc())); flash("Plantilla cargada"); };
$("btnBlank").onclick=()=>{ setDoc(blankDoc($("nameF").value)); flash("Mapa vacío"); };
$("btnExport").onclick=exportJSON;
$("btnImport").onclick=()=>$("fileIn").click();
$("fileIn").onchange=e=>{ if(e.target.files[0]) importJSON(e.target.files[0]); e.target.value=""; };
// CAS-1716: folder upload — prefer webkitdirectory; fall back to multi-file when unsupported.
$("btnUpload").onclick=()=>{ const di=$("dirIn");
  if("webkitdirectory" in di) di.click(); else $("filesIn").click(); };
$("dirIn").onchange=e=>{ if(e.target.files&&e.target.files.length){ selectTool("stamp"); ingestFiles(e.target.files); } e.target.value=""; };
$("filesIn").onchange=e=>{ if(e.target.files&&e.target.files.length){ selectTool("stamp"); ingestFiles(e.target.files); } e.target.value=""; };
$("btnPlay").onclick=play;
$("btnSave").onclick=saveNow;
$("btnLoad").onclick=loadFromStorage;
$("btnHelp").onclick=()=>$("help").style.display="flex";
$("btnHelpClose").onclick=()=>$("help").style.display="none";
$("nameF").oninput=()=>{ doc.name=$("nameF").value; autosave(); };

// CAS-1729 — slice panel wiring: numeric inputs edit the grid; clicking a cell on the
// tileset canvas picks the active brush; "hoja entera" clears it back to whole-sheet.
for(const k of ["slTw","slTh","slMargin","slSpacing","slOx","slOy"]){ const el=$(k); if(el) el.addEventListener("input", onSliceInput); }
// CAS-1735 — pointer on the picker: a click (no move) selects a cell; a drag pans the
// zoomed viewport. Threshold keeps the two from fighting (mirrors the map canvas pattern).
(function wireSliceCanvas(){ const cvs=$("sliceCanvas"); if(!cvs) return;
  let dwn=null, moved=false;
  cvs.addEventListener("pointerdown", e=>{
    if(!assets.get(slicePanelAsset)) return;
    try{ cvs.setPointerCapture(e.pointerId); }catch(_){}
    const v=$("sliceView");
    dwn={ ox:e.offsetX, oy:e.offsetY, cx:e.clientX, cy:e.clientY, sl:v?v.scrollLeft:0, st:v?v.scrollTop:0 };
    moved=false; });
  cvs.addEventListener("pointermove", e=>{
    if(!dwn) return; const v=$("sliceView"); if(!v) return;
    const dx=e.clientX-dwn.cx, dy=e.clientY-dwn.cy;
    if(!moved && (Math.abs(dx)>3 || Math.abs(dy)>3)){ moved=true; cvs.style.cursor="grabbing"; }
    if(moved){ v.scrollLeft=dwn.sl-dx; v.scrollTop=dwn.st-dy; } });
  const end=e=>{ if(!dwn) return; const wasMoved=moved; const ox=dwn.ox, oy=dwn.oy; dwn=null; cvs.style.cursor="crosshair";
    if(wasMoved) return;                                   // was a pan, not a pick
    const r=assets.get(slicePanelAsset); if(!r) return;
    const c=pickAtCanvasPx(ox,oy); if(!c) return;
    selectCellInternal(r, c.col, c.row); persistSlice(r); drawSlicePanel(); scrollCellIntoView();
    flash(`Cuadro (${c.col},${c.row}) — séllalo en el mapa`); };
  cvs.addEventListener("pointerup", end);
  cvs.addEventListener("pointercancel", ()=>{ dwn=null; moved=false; cvs.style.cursor="crosshair"; });
  // Wheel over the picker → zoom, ANCHORED to the cursor (the buffer point under the
  // pointer stays put). preventDefault so the page/panel doesn't scroll. offsetX/Y are
  // buffer px because the canvas CSS size == its backing store (no stretch).
  cvs.addEventListener("wheel", e=>{ if(!slicePanelAsset) return; e.preventDefault();
    const view=$("sliceView"); const oldDs=cvs._ds||1, ox=e.offsetX, oy=e.offsetY;
    const oldSL=view?view.scrollLeft:0, oldST=view?view.scrollTop:0;
    setSliceZoom(sliceZoom * (e.deltaY<0 ? 1.15 : 0.87));
    if(view){ const ratio=(cvs._ds||1)/oldDs;                 // keep image point under cursor fixed
      view.scrollLeft=ox*(ratio-1)+oldSL; view.scrollTop=oy*(ratio-1)+oldST; } }, { passive:false });
}());
// CAS-1735 — zoom control buttons.
{ const zi=$("slZoomIn"), zo=$("slZoomOut"), zf=$("slZoomFit");
  if(zi) zi.onclick=()=>setSliceZoom(sliceZoom*1.25);
  if(zo) zo.onclick=()=>setSliceZoom(sliceZoom*0.8);
  if(zf) zf.onclick=()=>{ const v=$("sliceView"); if(v){ v.scrollLeft=0; v.scrollTop=0; } setSliceZoom(1); flash("Zoom ajustado"); }
}
// CAS-1735 — picker keyboard shortcuts (panel open, focus not in a numeric input):
//   +/= zoom-in, - zoom-out, 0 fit; arrows nudge the selected cell (precision picking).
window.addEventListener("keydown", e=>{
  const panel=$("slicePanel"); if(!panel || panel.style.display==="none" || !slicePanelAsset) return;
  const ae=document.activeElement; if(ae && ae.tagName==="INPUT") return;
  if(e.key==="+"||e.key==="="){ e.preventDefault(); setSliceZoom(sliceZoom*1.25); return; }
  if(e.key==="-"||e.key==="_"){ e.preventDefault(); setSliceZoom(sliceZoom*0.8); return; }
  if(e.key==="0"){ e.preventDefault(); const v=$("sliceView"); if(v){ v.scrollLeft=0; v.scrollTop=0; } setSliceZoom(1); return; }
  if(!curCell || curCell.asset!==slicePanelAsset) return;
  if(!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
  e.preventDefault();
  const r=assets.get(slicePanelAsset); if(!r) return; const g=sliceGrid(sliceOf(r), r.w, r.h);
  let c=curCell.col, rr=curCell.row;
  if(e.key==="ArrowLeft")c--; else if(e.key==="ArrowRight")c++; else if(e.key==="ArrowUp")rr--; else rr++;
  c=Math.max(0,Math.min(g.cols-1,c)); rr=Math.max(0,Math.min(g.rows-1,rr));
  selectCellInternal(r, c, rr); persistSlice(r); drawSlicePanel(); scrollCellIntoView();
});
const _sliceClose=$("sliceClose"); if(_sliceClose) _sliceClose.onclick=()=>{ $("slicePanel").style.display="none"; slicePanelAsset=null; };
const _sliceWhole=$("sliceWhole"); if(_sliceWhole) _sliceWhole.onclick=()=>{ curCell=null; drawSlicePanel(); flash("Pincel: hoja entera"); };

window.addEventListener("resize", resize);

// ---------------------------------------------------------------------------
// boot: prefer the last saved map; otherwise the seed (Carlos's first artifact).
// ---------------------------------------------------------------------------
buildTools(); buildTiles(); buildSlots(); buildNpcs(); buildProps(); selectTool("paint");
(function boot(){
  let start=null;
  try{ const raw=localStorage.getItem(MAPDOC_KEY); if(raw) start=docFromMapDoc(JSON.parse(raw)); }catch(e){}
  if(!start) start=docFromMapDoc(makeSeedMapDoc());
  setDoc(start);
  if(!localStorage.getItem("mithralda.editor.seen")){ $("help").style.display="flex"; try{localStorage.setItem("mithralda.editor.seen","1");}catch(e){} }
})();
reingestFromDB();   // CAS-1716: re-hydrate uploaded assets from IndexedDB (async; palette fills when ready)

// expose for the live QA harness (headless assertions on round-trip). CAS-1716 adds
// headless asset helpers because there is no file-picker in headless: ingestAsset
// simulates one uploaded file, listAssets reads the palette, stampCustom places a prop.
window.__editor = { get doc(){ return doc; }, docToMapDoc, docFromMapDoc, setDoc, makeSeedMapDoc,
  // Simulate one uploaded file (name + data URL). Non-image data URLs are ignored
  // (mirrors the real folder-upload filter). Returns the record (or null if capped/ignored).
  async ingestAsset(name, dataUrl){
    const mime=(/^data:([^;,]+)/.exec(dataUrl||"")||[])[1]||"";
    if(!mime.startsWith("image/")) return null;
    const { w, h } = await dimsOf(dataUrl);
    const path=name; const rec=await ingestRecord({ id:path, path, name, type:mime, dataUrl, w, h });
    buildAssetPalette(); if(rec && !curAsset) selectAsset(rec.id); draw(); return rec; },
  listAssets(){ return Array.from(assets.values()).map(r=>({ id:r.id, path:r.path, name:r.name, w:r.w, h:r.h, group:groupOf(r.path) })); },
  // Place a custom prop of `assetId` at world px (px,py). Returns the placed prop.
  stampCustom(assetId, px, py){ const prev=curAsset; curAsset=assetId; placeCustom(px,py); curAsset=prev;
    draw(); autosave(); updateMapInfo(); return doc.entities.props[doc.entities.props.length-1]; },
  // CAS-1729 tileset slicing — headless authoring (no file picker / no canvas clicks):
  //   setSlice   — define+persist a tileset's grid config; returns the normalized config.
  //   sliceGrid  — how many columns/rows fit under that config.
  //   cellRect   — the source sub-rect {sx,sy,sw,sh} of a cell.
  //   selectCell — set the active cell brush (returns it); stampCell — place a sliced prop.
  //   curCell    — read the active cell brush (or null).
  setSlice(assetId, cfg){ const r=assets.get(assetId); if(!r) return null; r.slice=normSlice(cfg); persistSlice(r);
    if(slicePanelAsset===assetId) drawSlicePanel(); return r.slice; },
  sliceGrid(assetId){ const r=assets.get(assetId); if(!r) return null; return sliceGrid(sliceOf(r), r.w, r.h); },
  cellRect(assetId, col, row){ const r=assets.get(assetId); if(!r) return null; return cellRect(sliceOf(r), col, row); },
  selectCell(assetId, col, row){ const r=assets.get(assetId); if(!r) return null; selectCellInternal(r, col, row);
    if(slicePanelAsset===assetId) drawSlicePanel(); return curCell?{...curCell}:null; },
  clearCell(){ curCell=null; if(slicePanelAsset) drawSlicePanel(); },
  stampCell(assetId, col, row, px, py){ const r=assets.get(assetId); if(!r) return null; selectCellInternal(r, col, row);
    const prev=curAsset; curAsset=assetId; placeCustom(px,py); curAsset=prev; draw(); autosave(); updateMapInfo();
    return doc.entities.props[doc.entities.props.length-1]; },
  get curCell(){ return curCell?{...curCell}:null; },
  sliceOf(assetId){ const r=assets.get(assetId); return r?{...sliceOf(r)}:null; },
  // CAS-1735 picker zoom (UI-only view transform) — probes for the QA harness.
  //   setSliceZoom(z) — clamp+redraw, returns effective zoom;  get sliceZoom — current.
  //   pickAtCanvasPx(x,y) — {col,row}|null the pointer handler resolves at the current
  //   zoom (proves click-mapping is zoom-neutral without synthesising DOM events).
  setSliceZoom(z){ return setSliceZoom(z); },
  sliceZoomFit(){ const v=$("sliceView"); if(v){ v.scrollLeft=0; v.scrollTop=0; } return setSliceZoom(1); },
  get sliceZoom(){ return sliceZoom; },
  pickAtCanvasPx(x,y){ return pickAtCanvasPx(x,y); },
  selectAsset, selectTool, referencedAssets, reingestEmbedded };
