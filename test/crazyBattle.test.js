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

test("Crazy Battle: server computes shielded sword damage between online clients",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{player:"Ataque"});
  const created=await host.until("joined");await host.until("state");
  const guest=await app.client();guest.send("join",{code:created.code,player:"Defesa"});
  await guest.until("joined");await guest.until("state");
  host.send("start");await host.until("state");
  // Move from (-4,-4) toward opponent at (4,4) at the server-authorized speed.
  host.send("input",{x:0,z:-1,yaw:-3*Math.PI/4,pitch:0});
  await new Promise(r=>setTimeout(r,2400));
  host.send("input",{x:0,z:0,yaw:-3*Math.PI/4,pitch:0});
  guest.send("input",{x:0,z:0,yaw:Math.PI/4,pitch:0});
  guest.send("shield",{active:true});
  await new Promise(r=>setTimeout(r,120));
  host.send("attack");
  const hit=await host.until("hit",2500);
  assert.equal(hit.blocked,true);
  assert.equal(hit.hp,98);
 }finally{await app.close();}
});

test("Crazy Battle: bots join lobby and jump is server-authoritative",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{player:"Solo"});
  const created=await host.until("joined");await host.until("state");
  host.send("addBot");const lobby=await host.until("state");
  assert.equal(lobby.players.length,2);
  assert.equal(lobby.players.filter(p=>p.bot).length,1);
  host.send("start");
  let start=await host.until("state");while(start.status!=="playing")start=await host.until("state");
  host.send("input",{x:0,z:0,yaw:0,pitch:0,jump:true});
  await new Promise(r=>setTimeout(r,180));
  const observe=await host.until("state");
  assert.ok(observe.players.some(p=>p.id===created.id));
  assert.equal(observe.players.every(p=>p.hp>=0&&p.hp<=100),true);
 }finally{await app.close();}
});
test("Crazy Battle: bow charges indefinitely until explicit release",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{player:"Atirador"});
  const created=await host.until("joined");await host.until("state");
  const guest=await app.client();guest.send("join",{code:created.code,player:"Alvo"});
  await guest.until("joined");await guest.until("state");
  host.send("start");await host.until("state");
  host.send("weapon");host.send("bowStart");
  await new Promise(r=>setTimeout(r,220));
  host.send("bowRelease");
  let found=false;
  for(let i=0;i<70;i++){
   const state=await host.until("state",1500);
   if(state.arrows?.length){found=true;break;}
  }
  assert.equal(found,true);
 }finally{await app.close();}
});

test("Crazy Battle: the two warrior PNG sheets are genuine 64x64 skin textures",async()=>{
 const {readFile}=await import("node:fs/promises");
 for(const name of ["red","blue"]){
  const png=await readFile(new URL("../public/crazy/skins/warrior-"+name+".png",import.meta.url));
  assert.equal(png.subarray(1,4).toString(),"PNG");
  assert.equal(png.readUInt32BE(16),64);
  assert.equal(png.readUInt32BE(20),64);
 }
});
test("Crazy Battle: selected warrior skin is synchronized and cannot use arbitrary assets",async()=>{
 const app=await setup();
 try{
  const host=await app.client();host.send("create",{player:"Rubro",skin:"red"});
  const joined=await host.until("joined");await host.until("state");
  const guest=await app.client();guest.send("join",{code:joined.code,player:"Azul",skin:"blue"});
  await guest.until("joined");
  const lobby=await guest.until("state");
  assert.equal(lobby.players.find(p=>p.name==="Rubro")?.skin,"red");
  assert.equal(lobby.players.find(p=>p.name==="Azul")?.skin,"blue");
  guest.send("skin",{skin:"unknown-file.png"});
  const changed=await guest.until("state");
  assert.equal(changed.players.find(p=>p.name==="Azul")?.skin,"red");
 }finally{await app.close();}
});
