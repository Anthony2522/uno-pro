// Runs the exact server UNO engine in the browser when there are no other human players.
// No HTTP requests are used for local turns, bot AI, timers or saved local matches.
// @ts-ignore The existing engine is JavaScript and is also used by the Node server.
import {proRpc,proSweep} from "../../../server/pro.js";
// @ts-ignore Shared Node engine, aliased to browser crypto by Vite.
import {store} from "../../../server/game.js";

const LOCAL_KEY="unopro.offline.solo.v2";
const BACKUP_KEY="unopro.solo.server-backup.v1";
const VERSION=1;
type GuestRecord={id:string;tokenHash:string;nickname:string;last_seen:number;bot?:boolean;difficulty?:string};
type RoomRecord={id:string;code:string;name:string;version:number;hands:[string,unknown][];game:any;members:{guest_id:string}[];[key:string]:any};
type Saved={version:number;code:string;token:string;saved_at:number;room:RoomRecord;guests:GuestRecord[];source:"local"|"rescued";human_id:string};
export type SoloBackup=Omit<Saved,"token"|"source">;
let active:Saved|null=null;
let timer:number|null=null;
let hiddenSince:number|null=null;
let lastSaveVersion=-1;
let storageError=false;
const read=(key:string):Saved|null=>{
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return null;
    const data=JSON.parse(raw) as Saved;
    if(data?.version===VERSION&&typeof data.code==="string"&&typeof data.token==="string"&&data.room?.game&&Array.isArray(data.room.hands))return data;
  }catch {/* older/corrupt data is not a valid local save */}
  return null;
};
function snapshot(){
  if(!active)return null;
  const room=store.roomsByCode.get(active.code) as RoomRecord|undefined;
  if(!room)return null;
  const guests=room.members.map(m=>store.guestsById.get(m.guest_id)).filter(Boolean) as GuestRecord[];
  return {version:VERSION,code:room.code,token:active.token,saved_at:Date.now(),
    source:active.source,human_id:active.human_id,
    room:{...room,hands:[...room.hands] as [string,unknown][]},guests} as Saved;
}
function persist(){
  const data=snapshot();
  if(!data)return;
  try{
    localStorage.setItem(LOCAL_KEY,JSON.stringify(data));
    active=data;storageError=false;
    lastSaveVersion=data.room.version;
  }catch{storageError=true;}
}
function moveClocks(g:any,delta:number){
  if(!delta||g.status!=="playing")return;
  const push=(obj:any,key:string)=>{
    if(typeof obj?.[key]==="number"&&obj[key]>0)obj[key]+=delta;
  };
  for(const k of ["turn_started_at","visual_until","beer_due","wild_pending_since"])push(g,k);
  if(g.vortex_queue)push(g.vortex_queue,"next_at");
  if(g.detective)push(g.detective,"until");
  if(g.skip_reaction)push(g.skip_reaction,"deadline");
  if(g.nine){
    push(g.nine,"deadline");push(g.nine,"started_at");
    for(const id of Object.keys(g.nine.botTimes||{}))g.nine.botTimes[id]+=delta;
  }
  if(g.bot_move)push(g.bot_move,"due");
  if(g.bot_cut)for(const id of Object.keys(g.bot_cut.due||{}))g.bot_cut.due[id]+=delta;
  for(const h of (store.roomsByCode.get(active?.code||"")?.hands||new Map()).values()){
    if(h.uno_since)h.uno_since+=delta;
    if(h.bot_uno_plan?.since)h.bot_uno_plan.since+=delta;
    if(h.bot_uno_plan?.due)h.bot_uno_plan.due+=delta;
  }
}
function hydrate(save:Saved){
  store.guestsById.clear();store.guestsByHash.clear();
  store.rooms.clear();store.roomsByCode.clear();
  const now=Date.now();
  const guests=save.guests.map(guest=>({...guest,last_seen:now}));
  for(const guest of guests){
    store.guestsById.set(guest.id,guest);
    if(!guest.bot)store.guestsByHash.set(guest.tokenHash,guest);
  }
  const room={...save.room,hands:new Map(save.room.hands)};
  const delta=Math.max(0,now-save.saved_at);
  active=save;
  store.rooms.set(room.id,room);store.roomsByCode.set(room.code,room);
  moveClocks(room.game,delta);
  if(room.game){
    room.game.offline_since=null;room.game.solo_paused_at=null;
    room.game.solo_recovery_until=null;room.game.solo_force_pause=false;
  }
  lastSaveVersion=-1;
  persist();startTicker();
}
function startTicker(){
  if(timer!==null)return;
  timer=window.setInterval(()=>{
    if(!active)return;
    const room=store.roomsByCode.get(active.code);
    if(!room)return;
    if(document.visibilityState==="hidden"){
      hiddenSince??=Date.now();
      return;
    }
    if(hiddenSince!==null){
      const gap=Date.now()-hiddenSince;
      hiddenSince=null;moveClocks(room.game,gap);
      for(const guest of store.guestsById.values())guest.last_seen=Date.now();
    }
    try{
      proRpc("whoami",{p_token:active.token});
      proSweep();
      if(room.version!==lastSaveVersion)persist();
    }catch(error){console.error("[offline UNO tick]",error);}
  },350);
}
function ensureLoaded(){
  if(active)return;
  const saved=read(LOCAL_KEY);
  if(saved)hydrate(saved);
}
export function hasLocalRoom(code:string){
  ensureLoaded();
  return active?.code===code.toUpperCase()&&store.roomsByCode.has(active.code);
}
export function getLocalMatch(){
  const saved=read(LOCAL_KEY);
  if(!saved)return null;
  return {code:saved.code,name:saved.room.name,
    playing:saved.room.game?.status==="playing",
    saved_at:saved.saved_at,source:saved.source};
}
export function getSoloServerBackup(){
  const saved=read(BACKUP_KEY);
  if(!saved)return null;
  return {code:saved.code,name:saved.room.name,saved_at:saved.saved_at};
}
export function offlineStorageError(){return storageError;}
export function saveSoloServerBackup(backup:SoloBackup,token:string){
  if(!backup||backup.version!==VERSION||backup.code!==backup.room?.code||!backup.human_id)return;
  // The offline fallback stores only the sole human's full bot-only match locally.
  const data:Saved={...backup,token,source:"rescued"};
  try{localStorage.setItem(BACKUP_KEY,JSON.stringify(data));}catch{storageError=true;}
}
export function rescueSoloMatch(code:string){
  ensureLoaded();
  if(active?.code===code)return true;
  const backup=read(BACKUP_KEY);
  if(!backup||backup.code!==code.toUpperCase())return false;
  hydrate(backup);
  return true;
}
export function getRecoverableSoloRoom(code:string){
  const saved=read(BACKUP_KEY);
  return Boolean(saved&&saved.code===code.toUpperCase());
}
export function startLocalSolo(nickname:string){
  ensureLoaded();
  if(active?.room?.game?.status==="playing")return active.code;
  store.rooms.clear();store.roomsByCode.clear();
  store.guestsById.clear();store.guestsByHash.clear();
  active=null;
  const guest=proRpc("register_guest",{p_nickname:nickname.trim().slice(0,18)||"Jogador"});
  const created=proRpc("create_room",{
    p_token:guest.token,p_name:"Solo offline",p_is_public:false,p_max_players:4,
    p_starting_cards:8,p_winners:2,
    p_rules:{repeat:true,sequence:true,nine:true,cut:true,stack:true}
  });
  const room=store.roomsByCode.get(created.code);
  // Distinct prefix makes an offline room recognizable even without network.
  store.roomsByCode.delete(created.code);
  room.code="OFF"+created.code.slice(0,5);
  store.roomsByCode.set(room.code,room);
  proRpc("add_bot",{p_token:guest.token,p_code:room.code,p_difficulty:"easy"});
  proRpc("add_bot",{p_token:guest.token,p_code:room.code,p_difficulty:"hard"});
  proRpc("start_game",{p_token:guest.token,p_code:room.code});
  active={version:VERSION,source:"local",code:room.code,token:guest.token,
    human_id:guest.guest_id,saved_at:Date.now(),
    guests:[],room:{...room,hands:[...room.hands]}};
  persist();startTicker();
  void navigator.storage?.persist?.().catch(()=>{});
  return room.code as string;
}
export function localRpc<T>(fn:string,args:Record<string,unknown>={}):T{
  ensureLoaded();
  if(!active)throw Error("ROOM_NOT_FOUND");
  if(fn==="leave_room")return {ok:true,rejoinable:true} as T;
  const result=proRpc(fn,{...args,p_token:active.token,p_code:active.code});
  if(fn==="get_room_state" && result?.room){
    result.room.local_only=true;
    result.game.local_only=true;
  }
  if(fn!=="get_room_state"||store.roomsByCode.get(active.code)?.version!==lastSaveVersion)persist();
  return result as T;
}
export function discardFinishedLocalMatch(){
  ensureLoaded();
  if(!active?.room?.game||active.room.game.status!=="finished")return;
  localStorage.removeItem(LOCAL_KEY);active=null;
}
