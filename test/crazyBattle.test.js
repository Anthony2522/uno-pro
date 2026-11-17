import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { attachCrazyBattle, calculateCrazyDamage } from "../server/crazyBattle.js";

async function setup(){
 const server=http.createServer((_req,res)=>res.end("ok"));attachCrazyBattle(server);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="ws://127.0.0.1:"+server.address().port+"/api/crazy/ws";
 const sockets=[];
 async function client(){
  const ws=new WebSocket(url);sockets.push(ws);
  await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
  const messages=[];ws.on("message",raw=>messages.push(JSON.parse(raw.toString())));
  const send=(type,extra={})=>ws.send(JSON.stringify({type,...extra}));
  const until=async(type,timeout=2000)=>{
   const started=Date.now();
   while(Date.now()-started<timeout){const idx=messages.findIndex(m=>m.type===type);if(idx>=0)return messages.splice(idx,1)[0];await new Promise(r=>setTimeout(r,10));}
   throw new Error("Timed out waiting for "+type);
  };
  return {send,until,ws};
 }
 return {client,close:async()=>{for(const ws of sockets)ws.close();await new Promise(resolve=>server.close(resolve));}};
}
test("Crazy Battle: private rooms, joining, bots and match start",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{name:"Teste",private:true,player:"Host"});
  const joined=await host.until("joined");assert.match(joined.code,/^[A-F0-9]{8}$/);
  await host.until("state");
  const guest=await app.client();guest.send("list");const list=await guest.until("rooms");
  assert.equal(list.rooms.some(r=>r.code===joined.code),false);
  guest.send("join",{code:joined.code,player:"Convidado"});
  await guest.until("joined");const state=await guest.until("state");assert.equal(state.players.length,2);
  host.send("start");const playing=await host.until("state");assert.ok(["lobby","playing"].includes(playing.status));
  const later=await host.until("state");assert.equal(later.status,"playing");
 }finally{await app.close();}
});
test("Crazy Battle: cannot start a one-player room",async()=>{
 const app=await setup();
 try{const host=await app.client();host.send("create",{player:"Solo"});await host.until("joined");await host.until("state");host.send("start");const err=await host.until("error");assert.match(err.message,/dois participantes/);}
 finally{await app.close();}
});

test("Crazy Battle: frontal shield blocks exactly 90% of damage",()=>{
 const front=calculateCrazyDamage(20,true,"sword",0,0,-1);
 assert.deepEqual(front,{damage:2,blocked:true});
 const back=calculateCrazyDamage(20,true,"sword",0,0,1);
 assert.deepEqual(back,{damage:20,blocked:false});
 const without=calculateCrazyDamage(20,false,"sword",0,0,-1);
 assert.deepEqual(without,{damage:20,blocked:false});
 const bow=calculateCrazyDamage(20,true,"bow",0,0,-1);
 assert.deepEqual(bow,{damage:20,blocked:false});
});
test("Crazy Battle: joining twice or forging starts cannot hijack lobby",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{player:"Host"});
  const joined=await host.until("joined");await host.until("state");
  const guest=await app.client();guest.send("join",{code:joined.code,player:"Guest"});
  await guest.until("joined");await guest.until("state");
  guest.send("start");host.send("list");const before=await host.until("rooms");assert.equal(before.rooms.find(r=>r.code===joined.code)?.status,"lobby");
  host.send("start");const played=await host.until("state");
  assert.ok(played.players.length>=2);
  guest.send("join",{code:joined.code,player:"Impostor"});
  const error=await guest.until("error");assert.match(error.message,/Já está em uma sala/);
 }finally{await app.close();}
});
test("Crazy Battle: disconnected player can resume with verified token",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{player:"Host"});
  const joined=await host.until("joined");await host.until("state");
  assert.ok(joined.resumeKey.length>=32);
  host.ws.close();await new Promise(r=>setTimeout(r,30));
  const impostor=await app.client();
  impostor.send("resume",{code:joined.code,id:joined.id,resumeKey:"not-the-token"});
  const denied=await impostor.until("error");assert.match(denied.message,/Sessão expirada/);
  const restored=await app.client();restored.send("resume",{code:joined.code,id:joined.id,resumeKey:joined.resumeKey});
  const accepted=await restored.until("joined");assert.equal(accepted.id,joined.id);
 }finally{await app.close();}
});
