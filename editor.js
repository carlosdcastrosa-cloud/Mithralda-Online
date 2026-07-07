// ===========================================================================
// editor.js — CAS-1702 Visual Map Editor (in-browser, $0, separate tool).
// Paints terrain, defines named zones (by real game slot), places entities, and
// exports/loads MapDoc v1 — the EXACT format sim/mapdoc.js consumes, so the
// game plays edited maps directly (real round-trip). This tool never touches
// the live game's sim; it only reads shared vocab + the codec from mapdoc.js.
// ===========================================================================
import { SLOTS, TILES, NPC_MAP, PROP_KINDS, DEFAULT_TYPES, MAPDOC_KEY, MAPDOC_VERSION,
         rleEncode, rleDecodeInto, makeSeedMapDoc } from "./sim/mapdoc.js";

const TS = 32;                                    // world px per tile (matches config.TS)
const $ = id => document.getElementById(id);

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
// Convert editor doc → MapDoc (rle terrain) for export / play.
function docToMapDoc(){
  return { v:MAPDOC_VERSION, name:doc.name, w:doc.w, h:doc.h,
    terrain:{ rle: rleEncode(doc.grid) },
    zones: doc.zones.map(z=>({...z})),
    entities:{
      npcs:doc.entities.npcs.map(n=>({...n})), chests:doc.entities.chests.map(c=>({...c})),
      fragments:doc.entities.fragments.map(f=>({...f})), portals:doc.entities.portals.map(p=>({...p})),
      props:doc.entities.props.map(p=>({...p})),
    } };
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
  const blob=new Blob([JSON.stringify(docToMapDoc(),null,0)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=(doc.name.replace(/[^\w-]+/g,"_")||"mapa")+".mapdoc.json"; a.click();
  URL.revokeObjectURL(a.href); flash("JSON exportado ✓");
}
function importJSON(file){ const rd=new FileReader();
  rd.onload=()=>{ try{ setDoc(docFromMapDoc(JSON.parse(rd.result))); flash("Importado ✓"); }catch(e){ flash("JSON inválido"); } };
  rd.readAsText(file); }
function play(){
  doc.name=$("nameF").value||"Mi Mundo";
  try{ localStorage.setItem(MAPDOC_KEY, JSON.stringify(docToMapDoc())); }catch(e){ flash("No se pudo guardar para jugar"); return; }
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
$("btnPlay").onclick=play;
$("btnSave").onclick=saveNow;
$("btnLoad").onclick=loadFromStorage;
$("btnHelp").onclick=()=>$("help").style.display="flex";
$("btnHelpClose").onclick=()=>$("help").style.display="none";
$("nameF").oninput=()=>{ doc.name=$("nameF").value; autosave(); };

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
// expose for the live QA harness (headless assertions on round-trip)
window.__editor = { get doc(){ return doc; }, docToMapDoc, docFromMapDoc, setDoc, makeSeedMapDoc };
