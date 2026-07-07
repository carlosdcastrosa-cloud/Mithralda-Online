// ===========================================================================
// sim/customassets.js — CAS-1716 editor-only IndexedDB store for uploaded custom
// image assets (folders of sprites the designer stamps into a map).
// ---------------------------------------------------------------------------
// The GAME never imports this: at ?map= the game reads the referenced assets
// SYNC from the MapDoc's embedded `md.assets` block (data URLs) — no async
// IndexedDB on the load-time path. This module is purely the EDITOR's
// persistence so an uploaded folder survives a reload. Records are
// `{id,path,name,type,dataUrl,w,h}` keyed by `id` (the relative path, so a
// re-upload of the same file dedups instead of piling up duplicates).
// ===========================================================================
export const ASSET_DB    = "mithralda.editor.assets.v1";  // IndexedDB namespace (AC4)
export const ASSET_STORE = "assets";
// Soft cap across ALL stored assets. IndexedDB origin quota is far larger, but a
// runaway upload would bloat the editor's boot reingest and the play/export
// embed; ~40MB keeps a full sprite folder comfortable while staying well under
// typical quotas. On exceed the editor flashes a message and refuses the add
// (never throws) — see editor.js ingestFile.
export const ASSET_CAP_BYTES = 40 * 1024 * 1024;

function openDB(){
  return new Promise((res, rej) => {
    if(typeof indexedDB === "undefined"){ rej(new Error("no-indexeddb")); return; }
    const rq = indexedDB.open(ASSET_DB, 1);
    rq.onupgradeneeded = () => { const db = rq.result;
      if(!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath:"id" }); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror   = () => rej(rq.error);
  });
}
const store = (db, mode) => db.transaction(ASSET_STORE, mode).objectStore(ASSET_STORE);

export async function putAsset(rec){
  const db = await openDB();
  return new Promise((res, rej) => { const rq = store(db, "readwrite").put(rec);
    rq.onsuccess = () => res(rec); rq.onerror = () => rej(rq.error); });
}
export async function getAllAssets(){
  const db = await openDB();
  return new Promise((res, rej) => { const rq = store(db, "readonly").getAll();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); });
}
export async function deleteAsset(id){
  const db = await openDB();
  return new Promise((res, rej) => { const rq = store(db, "readwrite").delete(id);
    rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error); });
}
export async function clearAssets(){
  const db = await openDB();
  return new Promise((res, rej) => { const rq = store(db, "readwrite").clear();
    rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error); });
}
