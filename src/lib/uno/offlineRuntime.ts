// Runs the exact server UNO engine in the browser when there are no other human players.
// No HTTP requests are used for local turns, bot AI, timers or saved local matches.
// @ts-ignore The existing engine is JavaScript and is also used by the Node server.
import {proRpc,proSweep} from "../../../server/pro.js";
// @ts-ignore Shared Node engine, aliased to browser crypto by Vite.
import {store,makeRoach} from "../../../server/game.js";

const LOCAL_KEY="unopro.offline.solo.v2";
const BACKUP_KEY="unopro.solo.server-backup.v1";
const SANDBOX_KEY="unopro.offline.sandbox.v1";
const VERSION=1;
type GuestRecord={id:string;tokenHash:string;nickname:string;last_seen:number;bot?:boolean;difficulty?:string};
type RoomRecord={id:string;code:string;name:string;version:number;hands:[string,unknown][];game:any;members:{guest_id:string}[];[key:string]:any};
type Saved={version:number;code:string;token:string;saved_at:number;room:RoomRecord;guests:GuestRecord[];source:"local"|"rescued"|"sandbox";human_id:string;sandbox_opponent_token?:string;sandbox_opponent_id?:string;sandbox_selected_id?:string};
export type SoloBackup=Omit<Saved,"token"|"source">;
let active:Saved|null=null;
let timer:number|null=null;
let hiddenSince:number|null=null;
let visibilityHandlerInstalled=false;
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
    sandbox_opponent_token:active.sandbox_opponent_token,sandbox_opponent_id:active.sandbox_opponent_id,sandbox_selected_id:active.sandbox_selected_id,
    room:{...room,hands:[...room.hands] as [string,unknown][]},guests} as Saved;
}
function persist(){
  const data=snapshot();
  if(!data)return;
  try{
    localStorage.setItem(active?.source==="sandbox"?SANDBOX_KEY:LOCAL_KEY,JSON.stringify(data));
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
    if(!guest.bot || save.source==="sandbox")store.guestsByHash.set(guest.tokenHash,guest);
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
  if(!visibilityHandlerInstalled){
    visibilityHandlerInstalled=true;
    document.addEventListener?.("visibilitychange",()=>{
      if(document.visibilityState==="hidden")hiddenSince??=Date.now();
    });
  }
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
      // Sandbox controls two human seats in a single local browser. Both seats
      // stay present; they are never kicked just for not having a second tab.
      if(active.source==="sandbox")for(const member of room.members){
        const g=store.guestsById.get(member.guest_id);
        if(g)g.last_seen=Date.now();
      }
      proSweep();
      if(room.version!==lastSaveVersion)persist();
    }catch(error){console.error("[offline UNO tick]",error);}
  },350);
}
function ensureLoaded(){
  if(active)return;
  const saved=read(LOCAL_KEY)??read(SANDBOX_KEY);
  if(saved)hydrate(saved);
}
export function hasLocalRoom(code:string){
  const normalized=code.toUpperCase();
  if(active?.code===normalized&&store.roomsByCode.has(normalized))return true;
  const saved=[read(LOCAL_KEY),read(SANDBOX_KEY)].find(x=>x?.code===normalized);
  if(!saved)return false;
  if(active)persist(); // preserve the previous match before swapping engines
  hydrate(saved);
  return true;
}
export function getLocalSandbox(){
  const saved=read(SANDBOX_KEY);
  if(!saved)return null;
  return {code:saved.code,name:saved.room.name,
    playing:saved.room.game?.status==="playing",saved_at:saved.saved_at};
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
  void navigator.storage?.persist?.().catch(()=>{});
  return true;
}
export function getRecoverableSoloRoom(code:string){
  const saved=read(BACKUP_KEY);
  return Boolean(saved&&saved.code===code.toUpperCase());
}
export type OfflineRoomConfig={
  name:string; maxPlayers:number; startingCards:number; winners:number;
  /** Optional for compatibility with older callers; creation UI sends both counts. */
  easyBots?:number; hardBots?:number;
  rules:{repeat:boolean;sequence:boolean;nine:boolean;cut:boolean;stack:boolean};
  cards:Record<string,boolean>;
};
export function startLocalSolo(nickname:string,options?:OfflineRoomConfig){
  ensureLoaded();
  if(active?.source!=="sandbox"&&active?.room?.game?.status==="playing")return active.code;
  const botCount=(options?.maxPlayers??3)-1;
  const explicit=options?.easyBots!==undefined||options?.hardBots!==undefined;
  const easyBots=explicit?(options?.easyBots??0):Math.ceil(botCount/2);
  const hardBots=explicit?(options?.hardBots??0):Math.floor(botCount/2);
  if(!Number.isInteger(botCount)||botCount<1||botCount>19||
    !Number.isInteger(easyBots)||!Number.isInteger(hardBots)||
    easyBots<0||hardBots<0||easyBots+hardBots!==botCount)
    throw new Error("Selecione de 1 a 19 bots e confira a soma das dificuldades.");
  store.rooms.clear();store.roomsByCode.clear();
  store.guestsById.clear();store.guestsByHash.clear();
  active=null;
  const guest=proRpc("register_guest",{p_nickname:nickname.trim().slice(0,18)||"Jogador"});
  const created=proRpc("create_room",{
    p_token:guest.token,p_name:options?.name||"Solo offline",p_is_public:false,
    p_max_players:options?.maxPlayers??3,
    p_starting_cards:options?.startingCards??8,p_winners:options?.winners??2,
    p_rules:options?.rules??{repeat:true,sequence:true,nine:true,cut:true,stack:true},
    p_cards_enabled:options?.cards
  });
  const room=store.roomsByCode.get(created.code);
  // Distinct prefix makes an offline room recognizable even without network.
  store.roomsByCode.delete(created.code);
  room.code="OFF"+created.code.slice(0,5);
  store.roomsByCode.set(room.code,room);
  // Create exactly the chosen number of easy and hard opponents.
  for(let i=0;i<botCount;i++)proRpc("add_bot",{
    p_token:guest.token,p_code:room.code,p_difficulty:i<easyBots?"easy":"hard"
  });
  proRpc("start_game",{p_token:guest.token,p_code:room.code});
  active={version:VERSION,source:"local",code:room.code,token:guest.token,
    human_id:guest.guest_id,saved_at:Date.now(),
    guests:[],room:{...room,hands:[...room.hands]}};
  persist();startTicker();
  void navigator.storage?.persist?.().catch(()=>{});
  return room.code as string;
}

/** Private, browser-only two-seat match. Never sent to any server lobby. */
export function startLocalSandbox(nickname:string){
  if(active)persist();
  store.rooms.clear();store.roomsByCode.clear();
  store.guestsById.clear();store.guestsByHash.clear();
  active=null;
  const owner=proRpc("register_guest",{p_nickname:nickname.trim().slice(0,18)||"Jogador"});
  const other=proRpc("register_guest",{p_nickname:"Jogador 2"});
  const created=proRpc("create_room",{
    p_token:owner.token,p_name:"Sandbox de "+owner.nickname,p_is_public:false,
    p_max_players:2,p_starting_cards:8,p_winners:1,
    p_rules:{repeat:true,sequence:true,nine:true,cut:true,stack:true},
  });
  const room=store.roomsByCode.get(created.code);
  store.roomsByCode.delete(created.code);
  room.code="SBX"+created.code.slice(0,5);
  store.roomsByCode.set(room.code,room);
  proRpc("join_room",{p_token:other.token,p_code:room.code});
  proRpc("start_game",{p_token:owner.token,p_code:room.code});
  active={version:VERSION,source:"sandbox",code:room.code,token:owner.token,
    human_id:owner.guest_id,sandbox_opponent_id:other.guest_id,
    sandbox_opponent_token:other.token,sandbox_selected_id:owner.guest_id,
    saved_at:Date.now(),guests:[],room:{...room,hands:[...room.hands]}};
  persist();startTicker();
  void navigator.storage?.persist?.().catch(()=>{});
  return room.code as string;
}
const SANDBOX_COLOR_CARDS=new Set(["R","S","D","T","H","E","L","V","C","A"]);
const SANDBOX_WILDS=new Set(["W","W4","W5","X","B","N","P","M","Q"]);
const SANDBOX_COLORS=["r","b","g","y"];
function sandboxGrant(kind:string){
  if(!active||active.source!=="sandbox")throw Error("SANDBOX_ONLY");
  const room=store.roomsByCode.get(active.code);
  if(!room||room.game?.status!=="playing")throw Error("GAME_NOT_ACTIVE");
  const target=active.sandbox_selected_id??active.human_id;
  const hand=room.hands.get(target);
  if(!hand)throw Error("NOT_MEMBER");
  const color=SANDBOX_COLORS[Math.floor(Math.random()*SANDBOX_COLORS.length)]!;
  let card:string;
  if(kind==="NUMBER")card=color+Math.floor(Math.random()*10);
  else if(SANDBOX_COLOR_CARDS.has(kind))card=kind==="A"?makeRoach(color):color+kind;
  else if(SANDBOX_WILDS.has(kind))card=kind;
  else throw Error("INVALID_CARD");
  hand.cards.push(card);
  hand.uno_called=false;hand.uno_since=null;hand.bot_uno_plan=null;
  room.version=(room.version||0)+1;
  persist();
  return {ok:true,card};
}
export function localRpc<T>(fn:string,args:Record<string,unknown>={}):T{
  ensureLoaded();
  if(!active)throw Error("ROOM_NOT_FOUND");
  if(fn==="leave_room")return {ok:true,rejoinable:true} as T;
  if(fn==="sandbox_switch"){
    if(active.source!=="sandbox")throw Error("SANDBOX_ONLY");
    const target=String(args["p_target_id"]||"");
    if(![active.human_id,active.sandbox_opponent_id].includes(target))throw Error("NOT_MEMBER");
    if(store.guestsById.get(target)?.bot)throw Error("BOT_CONTROLLED");
    active.sandbox_selected_id=target;persist();
    return {ok:true} as T;
  }
  if(fn==="sandbox_toggle_bot"){
    if(active.source!=="sandbox")throw Error("SANDBOX_ONLY");
    const target=active.sandbox_selected_id===active.human_id?active.sandbox_opponent_id!:active.human_id;
    const guest=store.guestsById.get(target);
    const room=store.roomsByCode.get(active.code);
    if(!guest||!room)throw Error("NOT_MEMBER");
    guest.bot=!guest.bot;
    guest.difficulty=guest.bot?"hard":undefined;
    if(room.game)room.game.bot_move=null;
    room.version=(room.version||0)+1;
    persist();
    return {ok:true,enabled:!!guest.bot} as T;
  }
  if(fn==="sandbox_grant_card")return sandboxGrant(String(args["p_kind"]||"")) as T;
  const selectedToken=active.source==="sandbox"&&active.sandbox_selected_id===active.sandbox_opponent_id
    ?active.sandbox_opponent_token!:active.token;
  const result=proRpc(fn,{...args,p_token:selectedToken,p_code:active.code});
  if(fn==="get_room_state" && result?.room){
    result.room.local_only=true;
    result.game.local_only=true;
    if(active.source==="sandbox"){
      result.room.sandbox=true;
      result.room.sandbox_bot_id=store.guestsById.get(active.sandbox_selected_id===active.human_id?active.sandbox_opponent_id!:active.human_id)?.bot?(active.sandbox_selected_id===active.human_id?active.sandbox_opponent_id:active.human_id):null;
      result.game.sandbox=true;
    }
  }
  if(fn!=="get_room_state"||store.roomsByCode.get(active.code)?.version!==lastSaveVersion)persist();
  return result as T;
}
/** Explicitly delete a local bot-only game and its backup from this device. */
export function discardOfflineMatch(){
  const local=read(LOCAL_KEY),backup=read(BACKUP_KEY);
  try{
    localStorage.removeItem(LOCAL_KEY);
    if(!local||!backup||backup.code===local.code)localStorage.removeItem(BACKUP_KEY);
  }catch{storageError=true;return false;}
  if(active && active.source!=="sandbox" && (!local||active.code===local.code)){
    active=null;
    store.rooms.clear();store.roomsByCode.clear();
    store.guestsById.clear();store.guestsByHash.clear();
    lastSaveVersion=-1;
  }
  return true;
}
/** Remove only the private Sandbox save on this device. */
export function discardSandboxMatch(){
  const saved=read(SANDBOX_KEY);
  try{localStorage.removeItem(SANDBOX_KEY);}catch{storageError=true;return false;}
  if(active?.source==="sandbox"&&(!saved||active.code===saved.code)){
    active=null;store.rooms.clear();store.roomsByCode.clear();
    store.guestsById.clear();store.guestsByHash.clear();lastSaveVersion=-1;
  }
  return true;
}
export function discardFinishedLocalMatch(){
  ensureLoaded();
  if(active?.source==="sandbox"||!active?.room?.game||active.room.game.status!=="finished")return;
  localStorage.removeItem(LOCAL_KEY);active=null;
}
