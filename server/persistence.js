// Optional durable state for a single UNO Pro Node instance.
// Configure UPSTASH_REDIS_REST_URL/TOKEN on Render; NEVER send the token to the browser.
import {store} from "./game.js";
import fs from "node:fs/promises";
import path from "node:path";
const url=process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/,"");
const token=process.env.UPSTASH_REDIS_REST_TOKEN;
const key=process.env.UNO_REDIS_KEY||"unopro:live-state:v1";
const filePath=process.env.UNO_STATE_FILE||path.join(process.cwd(),".uno-state.json");
export const remotePersistenceEnabled=()=>Boolean(url&&token);
export const persistenceEnabled=()=>true;
export function serializeState(){
  return {version:1,saved_at:Date.now(),
    guests:[...store.guestsById.values()].map(g=>({...g})),
    tokens:[...store.guestsByHash].map(([hash,guest])=>[hash,guest.id]),
    rooms:[...store.rooms.values()].map(r=>({
      ...r,hands:[...r.hands].map(([id,hand])=>[id,hand])
    }))
  };
}
export function hydrateState(snapshot){
  if(!snapshot||snapshot.version!==1||!Array.isArray(snapshot.guests)||!Array.isArray(snapshot.rooms)||
    !Array.isArray(snapshot.tokens))throw Error("Invalid UNO Pro save format");
  const guests=new Map(),tokens=new Map(),rooms=new Map(),codes=new Map();
  for(const guest of snapshot.guests){
    if(!guest||typeof guest.id!=="string")continue;
    guests.set(guest.id,guest);
  }
  for(const [hash,id] of snapshot.tokens){
    if(typeof hash==="string"&&guests.has(id))tokens.set(hash,guests.get(id));
  }
  for(const r of snapshot.rooms){
    if(!r||typeof r.id!=="string"||typeof r.code!=="string"||!Array.isArray(r.hands))continue;
    const room={...r,hands:new Map(r.hands)};
    rooms.set(room.id,room);codes.set(room.code,room);
  }
  store.guestsById=guests;store.guestsByHash=tokens;
  store.rooms=rooms;store.roomsByCode=codes;
}
async function command(...args){
  if(!persistenceEnabled())return null;
  const response=await fetch(url,{method:"POST",headers:{
    Authorization:"Bearer "+token,"Content-Type":"application/json"
  },body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error("Upstash Redis HTTP "+response.status);
  const data=await response.json();
  if(data.error)throw Error("Upstash Redis: "+String(data.error));
  return data.result;
}
export async function restoreState(){
  try{
    const saved=remotePersistenceEnabled()?await command("GET",key):await fs.readFile(filePath,"utf8").catch(error=>{if(error.code==="ENOENT")return null;throw error});
    if(saved){hydrateState(JSON.parse(saved));return true;}
  }catch(error){console.error("[persistence] could not restore:",error);
    // Do not silently serve an empty game after a storage outage.
    throw error;
  }
  return false;
}
let version=0,savedVersion=0,timer=null,active=null;
export function scheduleSave(){
  if(!persistenceEnabled())return;
  version++;
  if(timer)return;
  timer=setTimeout(()=>{timer=null;void flushState().catch(e=>console.error("[persistence] save failed:",e));},350);
  timer.unref?.();
}
export async function flushState(){
  if(!persistenceEnabled())return;
  if(active){await active;if(savedVersion>=version)return;}
  if(savedVersion>=version)return;
  const target=version,payload=JSON.stringify(serializeState());
  active=remotePersistenceEnabled()?command("SET",key,payload):(async()=>{
    const temp=filePath+".tmp";
    await fs.mkdir(path.dirname(filePath),{recursive:true});
    await fs.writeFile(temp,payload,{encoding:"utf8",mode:0o600});
    await fs.rename(temp,filePath);
  })();
  try{await active;savedVersion=target;}
  finally{active=null}
  if(savedVersion<version){ // Catch updates arriving during an in-flight write.
    await flushState();
  }
}
