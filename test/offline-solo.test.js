import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {proRpc} from "../server/pro.js";
import {store,makeRoach,roachChainId} from "../server/game.js";

async function bundledRuntime(){
  const result=await build({
    entryPoints:[path.resolve("src/lib/uno/offlineRuntime.ts")],
    bundle:true,platform:"browser",format:"esm",target:"es2022",
    alias:{"node:crypto":path.resolve("src/lib/uno/browserCrypto.js")},
    write:false,logLevel:"silent"
  });
  return "data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64");
}
test("solo offline reuses shared full engine and survives browser reload",async()=>{
  const storage=new Map();
  const saved={localStorage:globalThis.localStorage,window:globalThis.window,
    document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator")};
  globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,String(v))},
    removeItem:k=>storage.delete(k)};
  globalThis.window={setInterval:()=>1};
  globalThis.document={visibilityState:"visible"};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{storage:{persist:async()=>true}}});
  try{
    const url=await bundledRuntime();
    const mod=await import(url+"#one");
    const code=mod.startLocalSolo("OfflineBot");
    assert.match(code,/^OFF[A-Z0-9]{5}$/);
    assert.equal(mod.hasLocalRoom(code),true);
    const state=mod.localRpc("get_room_state",{p_code:code});
    assert.equal(state.room.local_only,true);
    assert.equal(state.members.length,3);
    assert.equal(state.members.filter(p=>p.bot).length,2);
    assert.ok(state.game.my_hand.length>0);
    assert.ok(storage.has("unopro.offline.solo.v2"));
    const initialHand=[...state.game.my_hand];

    const reload=await import(url+"#two");
    assert.equal(reload.hasLocalRoom(code),true);
    const resumed=reload.localRpc("get_room_state",{p_code:code});
    assert.deepEqual(resumed.game.my_hand,initialHand,"hand must be unchanged after reload");
    assert.equal(resumed.room.code,code);
    assert.equal(resumed.game.local_only,true);

    // Simulate lost server memory: local full backup restores the same match.
    const raw=JSON.parse(storage.get("unopro.offline.solo.v2"));
    storage.set("unopro.solo.server-backup.v1",JSON.stringify({...raw,source:"rescued"}));
    storage.delete("unopro.offline.solo.v2");
    const rescue=await import(url+"#three");
    assert.equal(rescue.getRecoverableSoloRoom(code),true);
    assert.equal(rescue.rescueSoloMatch(code),true);
    const recovered=rescue.localRpc("get_room_state",{p_code:code});
    assert.deepEqual(recovered.game.my_hand,initialHand);
  }finally{
    if(saved.localStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=saved.localStorage;
    if(saved.window===undefined)delete globalThis.window;
    else globalThis.window=saved.window;
    if(saved.document===undefined)delete globalThis.document;
    else globalThis.document=saved.document;
    if(saved.navigator)Object.defineProperty(globalThis,"navigator",saved.navigator);
    else delete globalThis.navigator;
  }
});

test("a full server solo snapshot can be resumed in the browser after ROOM_NOT_FOUND",async()=>{
  const player=proRpc("register_guest",{p_nickname:"Recuperado"});
  const {code}=proRpc("create_room",{p_token:player.token,p_name:"Sala perdida",p_max_players:4});
  proRpc("add_bot",{p_token:player.token,p_code:code,p_difficulty:"hard"});
  proRpc("add_bot",{p_token:player.token,p_code:code,p_difficulty:"easy"});
  proRpc("start_game",{p_token:player.token,p_code:code});
  const serverHand=[...store.roomsByCode.get(code).hands.get(player.guest_id).cards];
  const snapshot=proRpc("export_solo_snapshot",{p_token:player.token,p_code:code});
  const map=new Map([["unopro.solo.server-backup.v1",
    JSON.stringify({...snapshot,token:player.token,source:"rescued"})]]);
  const saved={localStorage:globalThis.localStorage,window:globalThis.window,
    document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator")};
  globalThis.localStorage={getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,String(value))}};
  globalThis.window={setInterval:()=>1};
  globalThis.document={visibilityState:"visible"};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{storage:{persist:async()=>true}}});
  try{
    const moduleUrl=await bundledRuntime();
    const browser=await import(moduleUrl+"#server-rescue");
    assert.equal(browser.getRecoverableSoloRoom(code),true);
    assert.equal(browser.rescueSoloMatch(code),true);
    const restored=browser.localRpc("get_room_state",{p_code:code});
    assert.deepEqual(restored.game.my_hand,serverHand);
    assert.equal(restored.members.filter(x=>x.bot).length,2);
    assert.equal(restored.room.local_only,true);
  }finally{
    if(saved.localStorage===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=saved.localStorage;
    if(saved.window===undefined)delete globalThis.window;
    else globalThis.window=saved.window;
    if(saved.document===undefined)delete globalThis.document;
    else globalThis.document=saved.document;
    if(saved.navigator)Object.defineProperty(globalThis,"navigator",saved.navigator);
    else delete globalThis.navigator;
  }
});

test("sala offline aceita configurações antes de iniciar: número de bots, vencedores, regras e cartas",async()=>{
  const data=new Map();
  const saved={storage:globalThis.localStorage,window:globalThis.window,document:globalThis.document,
    navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator")};
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  globalThis.window={setInterval:()=>1};
  globalThis.document={visibilityState:"visible",addEventListener:()=>{}};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{storage:{persist:async()=>true}}});
  try{
    const runtime=await import((await bundledRuntime())+"#configured");
    const options={
      name:"Partida personalizada",maxPlayers:5,startingCards:6,winners:1,
      rules:{repeat:false,sequence:false,nine:false,cut:false,stack:true},
      cards:{T:false,H:false,E:true,L:true,V:false,C:false,A:false,W5:false,X:false,B:true,N:true,P:true,M:false,Q:true}
    };
    const code=runtime.startLocalSolo("Jogador",options);
    const state=runtime.localRpc("get_room_state",{p_code:code});
    assert.equal(state.members.length,5,"um humano mais quatro bots");
    assert.equal(state.members.filter(member=>member.bot).length,4);
    assert.equal(state.room.name,options.name);
    assert.equal(state.room.initial_cards,6);
    assert.equal(state.room.winners_target,1);
    assert.equal(state.room.rules.nine,false);
    assert.equal(state.room.rules.repeat,false);
    assert.equal(state.room.cards_enabled.V,false);
    assert.equal(state.room.cards_enabled.M,false);
    assert.equal(state.room.cards_enabled.E,true);
    assert.equal(state.game.my_hand.length,6);
    const snapshot=JSON.parse(data.get("unopro.offline.solo.v2"));
    assert.equal(snapshot.room.cards_enabled.T,false);
    assert.equal(snapshot.room.members.length,5);
  }finally{
    if(saved.storage===undefined)delete globalThis.localStorage;else globalThis.localStorage=saved.storage;
    if(saved.window===undefined)delete globalThis.window;else globalThis.window=saved.window;
    if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;
    if(saved.navigator)Object.defineProperty(globalThis,"navigator",saved.navigator);else delete globalThis.navigator;
  }
});

test("sala offline permite escolher 19 bots (20 jogadores no total)",async()=>{
  const data=new Map();
  const saved={storage:globalThis.localStorage,window:globalThis.window,document:globalThis.document,
    navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator")};
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  globalThis.window={setInterval:()=>1};
  globalThis.document={visibilityState:"visible",addEventListener:()=>{}};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{storage:{persist:async()=>true}}});
  try{
    const runtime=await import((await bundledRuntime())+"#twenty-players");
    const code=runtime.startLocalSolo("Anfitrião",{name:"19 bots",maxPlayers:20,
      startingCards:8,winners:2,
      rules:{repeat:true,sequence:true,nine:true,cut:true,stack:true},
      cards:{T:true,H:true,E:true,L:true,V:true,C:true,A:true,W5:true,X:true,B:true,N:true,P:true,M:true,Q:true}
    });
    const state=runtime.localRpc("get_room_state",{p_code:code});
    assert.equal(state.room.max_players,20);
    assert.equal(state.members.length,20);
    assert.equal(state.members.filter(m=>m.bot).length,19);
    assert.equal(new Set(state.members.map(m=>m.nickname)).size,20);
    assert.equal(state.game.my_hand.length,8);
  }finally{
    if(saved.storage===undefined)delete globalThis.localStorage;else globalThis.localStorage=saved.storage;
    if(saved.window===undefined)delete globalThis.window;else globalThis.window=saved.window;
    if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;
    if(saved.navigator)Object.defineProperty(globalThis,"navigator",saved.navigator);else delete globalThis.navigator;
  }
});

test("backup de partida solo offline mantém a cadeia da Barata após perda do servidor",async()=>{
  const player=proRpc("register_guest",{p_nickname:"BarataOffline"});
  const {code}=proRpc("create_room",{p_token:player.token,p_name:"Barata salva",p_max_players:3});
  proRpc("add_bot",{p_token:player.token,p_code:code,p_difficulty:"easy"});
  proRpc("add_bot",{p_token:player.token,p_code:code,p_difficulty:"hard"});
  proRpc("start_game",{p_token:player.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  const original=makeRoach("r"),id=roachChainId(original);
  room.hands.get(player.guest_id).cards=[original,"g4"];
  g.turn_idx=g.turn_order.indexOf(player.guest_id);
  g.turn_cards=[];g.turn_mode=null;g.pending_draw=0;g.nine=null;
  g.discard_pile=["r4"];g.current_color="r";
  proRpc("play_card",{p_token:player.token,p_code:code,p_card:original});
  const recipient=g.roach_chains[id].received[0];
  const copied=room.hands.get(recipient).cards.find(c=>roachChainId(c)===id);
  assert.ok(copied,"cópia circula antes de desconectar");
  const backup=proRpc("export_solo_snapshot",{p_token:player.token,p_code:code});
  const data=new Map([["unopro.solo.server-backup.v1",
    JSON.stringify({...backup,token:player.token,source:"rescued"})]]);
  const saved={storage:globalThis.localStorage,window:globalThis.window,document:globalThis.document,
    navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator")};
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  globalThis.window={setInterval:()=>1};
  globalThis.document={visibilityState:"visible",addEventListener:()=>{}};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{storage:{persist:async()=>true}}});
  try{
    const runtime=await bundledRuntime();
    const browser=await import(runtime+"#roach-rescue");
    assert.equal(browser.rescueSoloMatch(code),true);
    const local=browser.localRpc("export_solo_snapshot");
    assert.deepEqual(local.room.game.roach_chains[id].received,[recipient]);
    const hands=new Map(local.room.hands);
    assert.ok(hands.get(recipient).cards.includes(copied),"mesma cópia, com mesma cor e cadeia");
    const reloaded=await import(runtime+"#roach-refresh");
    const snapshot=reloaded.localRpc("export_solo_snapshot");
    assert.deepEqual(snapshot.room.game.roach_chains[id].received,[recipient]);
    assert.equal(snapshot.room.game.roach_chains[id].completed,false);
  }finally{
    if(saved.storage===undefined)delete globalThis.localStorage;else globalThis.localStorage=saved.storage;
    if(saved.window===undefined)delete globalThis.window;else globalThis.window=saved.window;
    if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;
    if(saved.navigator)Object.defineProperty(globalThis,"navigator",saved.navigator);else delete globalThis.navigator;
  }
});

test("Sandbox offline tem dois humanos controláveis, cartas à vontade e não substitui partida offline",async()=>{
  const data=new Map(),saved={storage:globalThis.localStorage,window:globalThis.window,document:globalThis.document,
    navigator:Object.getOwnPropertyDescriptor(globalThis,"navigator")};
  globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  globalThis.window={setInterval:()=>1};
  globalThis.document={visibilityState:"visible",addEventListener:()=>{}};
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{storage:{persist:async()=>true}}});
  try{
    const url=await bundledRuntime(),runtime=await import(url+"#sandbox-first");
    const offlineCode=runtime.startLocalSolo("Jogador");
    assert.match(offlineCode,/^OFF/);
    const offlineCopy=data.get("unopro.offline.solo.v2");
    const sandboxCode=runtime.startLocalSandbox("Tester");
    assert.match(sandboxCode,/^SBX[A-Z0-9]{5}$/);
    const first=runtime.localRpc("get_room_state",{p_code:sandboxCode});
    assert.equal(first.room.is_public,false);
    assert.equal(first.room.sandbox,true);
    assert.equal(first.game.sandbox,true);
    assert.equal(first.members.filter(p=>p.bot).length,0);
    assert.equal(first.members.length,2);
    const original=first.me;
    const next=first.members.find(p=>p.id!==original).id;
    const handA=[...first.game.my_hand];
    assert.deepEqual(runtime.localRpc("sandbox_switch",{p_target_id:next}),{ok:true});
    const other=runtime.localRpc("get_room_state",{p_code:sandboxCode});
    assert.equal(other.me,next);
    assert.notEqual(original,other.me);
    const before=other.game.my_hand.length;
    const num=runtime.localRpc("sandbox_grant_card",{p_kind:"NUMBER"});
    assert.match(num.card,/^[rygb][0-9]$/);
    const special=runtime.localRpc("sandbox_grant_card",{p_kind:"E"});
    assert.match(special.card,/^[rygb]E$/);
    const wild=runtime.localRpc("sandbox_grant_card",{p_kind:"W5"});
    assert.equal(wild.card,"W5");
    const roach=runtime.localRpc("sandbox_grant_card",{p_kind:"A"});
    assert.match(roach.card,/^[rygb]A@/);
    assert.throws(()=>runtime.localRpc("sandbox_grant_card",{p_kind:"arbitrary script"}),/INVALID_CARD/);
    assert.equal(runtime.localRpc("get_room_state",{p_code:sandboxCode}).game.my_hand.length,before+4);
    runtime.localRpc("sandbox_switch",{p_target_id:original});
    assert.deepEqual(runtime.localRpc("get_room_state",{p_code:sandboxCode}).game.my_hand,handA,
      "a mão de um jogador não revela nem herda cartas do outro");
    assert.equal(data.get("unopro.offline.solo.v2"),offlineCopy,
      "Sandbox guarda em chave própria e não substitui a sala offline");
    assert.ok(data.has("unopro.offline.sandbox.v1"));
    assert.ok(!runtime.localRpc("list_public_rooms").some(r=>r.code===sandboxCode),"Sandbox não é público");
    const reload=await import(url+"#sandbox-second");
    assert.equal(reload.hasLocalRoom(sandboxCode),true);
    assert.equal(reload.localRpc("get_room_state").me,original);
    assert.equal(reload.hasLocalRoom(offlineCode),true);
    assert.equal(reload.localRpc("get_room_state").room.code,offlineCode);
    assert.equal(reload.discardOfflineMatch(),true);
    assert.equal(data.has("unopro.offline.solo.v2"),false);
    assert.equal(reload.hasLocalRoom(sandboxCode),true,"Excluir offline não apaga sandbox");
  }finally{
    if(saved.storage===undefined)delete globalThis.localStorage;else globalThis.localStorage=saved.storage;
    if(saved.window===undefined)delete globalThis.window;else globalThis.window=saved.window;
    if(saved.document===undefined)delete globalThis.document;else globalThis.document=saved.document;
    if(saved.navigator)Object.defineProperty(globalThis,"navigator",saved.navigator);else delete globalThis.navigator;
  }
});
