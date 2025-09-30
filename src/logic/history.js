import { createStore, getMany, setMany, del, keys } from "https://cdn.jsdelivr.net/npm/idb-keyval@6.2.1/+esm";

const DB_NAME="landmark-db", STORE="history", LOCAL="landmark_history";
const MAX_AGE_MS = 5*24*60*60*1000;
const store = createStore(DB_NAME, STORE);

const keyOf = (r)=> `${r.id}-${r.createdAt}`;
const now = ()=> Date.now();
const isExpired = (r)=> now() - r.createdAt > MAX_AGE_MS;

async function migrate(){
  try{
    const raw = localStorage.getItem(LOCAL);
    if(!raw) return;
    const arr = JSON.parse(raw||"[]"); if(!Array.isArray(arr)||!arr.length) return;
    const kv = arr.map(r=>[keyOf(r), r]); await setMany(kv, store);
    localStorage.removeItem(LOCAL);
    console.info(`[history] migrated ${arr.length}`);
  }catch(e){ console.warn("[history] migrate error", e); }
}

export async function saveRecord(rec){
  if(!rec?.id || !rec?.createdAt) throw new Error("Invalid record");
  await setMany([[keyOf(rec), rec]], store);
}

export async function listRecords(){
  const k = await keys(store); if(!k.length) return [];
  const vals = await getMany(k, store);
  vals.sort((a,b)=>(b?.createdAt||0)-(a?.createdAt||0));
  return vals;
}

export async function deleteRecordsByIds(ids){
  const set = new Set(ids);
  const k = await keys(store);
  let n=0;
  for(const key of k){
    const id = String(key).slice(0, String(key).lastIndexOf("-"));
    if(set.has(id)){ await del(key, store); n++; }
  }
  return n;
}

export async function cleanupHistory(){
  await migrate();
  const k = await keys(store); if(!k.length) return 0;
  const vals = await getMany(k, store);
  let n=0;
  for(let i=0;i<k.length;i++){
    const r = vals[i]; if(r && isExpired(r)){ await del(k[i], store); n++; }
  }
  if(n) console.info(`[history] removed ${n} expired`);
  return n;
}

export function toCSV(list){
  const header = ["id","createdAt","slot","x","y","conf"];
  const out = [header.join(",")];
  for(const r of list){
    for(const slot of ["front","side","nose"]){
      const lms = (r.landmarks?.[slot])||[];
      if(!lms.length) out.push([r.id,r.createdAt,slot,"","",""].join(","));
      else for(const p of lms) out.push([r.id,r.createdAt,slot,p.x,p.y,p.conf??""].join(","));
    }
  }
  return out.join("\n");
}