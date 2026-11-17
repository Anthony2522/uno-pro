import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const rooms = new Map();
const RECONNECT_MS = 30_000;
const RULES = Object.freeze({swordDamage:20,arrowDamage:12,moveSpeed:4,shieldReduction:.9,maxPlayers:8});
const TICK_MS = 50;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clean = (v, n = 24) => String(v ?? "").replace(/[<>\x00-\x1f]/g, "").trim().slice(0, n);
const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const publicRooms = () => [...rooms.values()].filter(r => !r.private).map(r => ({
 code:r.code, name:r.name, status:r.status, players:r.players.size+r.bots.size, max:RULES.maxPlayers
}));
const broadcast = (room, data) => { for (const p of room.players.values()) send(p.ws, data); };
const playerState = p => ({id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,hp:p.hp,weapon:p.weapon,shield:p.shield,alive:p.hp>0,bot:!!p.bot,skin:p.skin,connected:!!p.ws});
const snapshot = room => ({type:"state",code:room.code,status:room.status,host:room.host,seconds:room.seconds,winner:room.winner,
 players:[...room.players.values(),...room.bots.values()].map(playerState),
 arrows:room.arrows.map(a=>({id:a.id,x:a.x,y:a.y,z:a.z}))});
const lobby = room => {broadcast(room, snapshot(room));room.announceRooms?.();};
const randomCode = () => { let c; do {c=randomBytes(4).toString("hex").toUpperCase();}while(rooms.has(c));return c;};
function spawn(p, index){const spots=[[-4,-4],[4,4],[-4,4],[4,-4],[0,5],[5,0],[-5,0],[0,-5]];[p.x,p.z]=spots[index%spots.length];p.y=0;p.hp=100;p.vy=0;p.shield=false;p.weapon="sword";p.cooldown=0;p.chargeAt=0;p.defendUntil=0;p.input={x:0,z:0,jump:false};}
function participant(id,name,ws,bot=false){return {id,name,ws,bot,resumeKey:randomBytes(24).toString("hex"),disconnectedAt:0,skin:"red",x:0,y:0,z:0,yaw:0,pitch:0,hp:100,vy:0,shield:false,weapon:"sword",cooldown:0,chargeAt:0,input:{x:0,z:0,jump:false}};}
function finish(room){const alive=[...room.players.values(),...room.bots.values()].filter(p=>p.hp>0);if(room.status==="playing"&&alive.length<=1){room.status="finished";room.winner=alive[0]?.id??null;broadcast(room,{type:"finished",winner:room.winner});lobby(room);}}
export function calculateCrazyDamage(damage,shield,weapon,yaw,dx,dz){
 const len=Math.hypot(dx,dz)||1;
 const dot=(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/len;
 const blocked=!!shield&&weapon==="sword"&&dot>0.25;
 return {damage:Math.max(1,Math.round(damage*(blocked?1-RULES.shieldReduction:1))),blocked};
}
function hit(room,attacker,target,damage,fromX,fromZ){
 if(target.hp<=0||room.status!=="playing")return;
 const {damage:effective,blocked}=calculateCrazyDamage(damage,target.shield,target.weapon,target.yaw,fromX-target.x,fromZ-target.z);
 target.hp=Math.max(0,target.hp-effective);
 broadcast(room,{type:"hit",target:target.id,attacker:attacker.id,hp:target.hp,blocked});
 finish(room);
}
function attack(room,p,now){
 if(room.status!=="playing"||p.hp<=0||p.weapon!=="sword"||p.shield||now<p.cooldown)return;
 p.cooldown=now+650;
 const forwardX=-Math.sin(p.yaw),forwardZ=-Math.cos(p.yaw);
 for(const t of [...room.players.values(),...room.bots.values()]){
  if(t.id===p.id||t.hp<=0)continue;
  const dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);
  if(d>2.4||Math.abs(t.y-p.y)>1.6||d<.01)continue;
  if((forwardX*dx+forwardZ*dz)/d<.45)continue;
  hit(room,p,t,RULES.swordDamage,p.x,p.z);
 }
 broadcast(room,{type:"swing",id:p.id});
}
function shoot(room,p,now){
 if(room.status!=="playing"||p.hp<=0||p.weapon!=="bow"||!p.chargeAt)return;
 const power=clamp((now-p.chargeAt)/1200,0,1);p.chargeAt=0;
 const speed=8+power*12,cos=Math.cos(p.pitch);
 room.arrows.push({id:randomBytes(4).toString("hex"),owner:p.id,x:p.x,y:p.y+1.5,z:p.z,vx:-Math.sin(p.yaw)*cos*speed,vy:Math.sin(p.pitch)*speed,vz:-Math.cos(p.yaw)*cos*speed,ttl:3});
}
function tick(room){
 if(room.status!=="playing")return;
 const dt=TICK_MS/1000,now=Date.now();room.seconds+=dt;
 for(const p of [...room.players.values(),...room.bots.values()]){
  if(p.hp<=0)continue;
  if(p.bot){
   const enemies=[...room.players.values(),...room.bots.values()].filter(t=>t.hp>0&&t.id!==p.id);
   enemies.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
   const t=enemies[0];if(!t)continue;
   const dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz)||1;
   p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.min(.25,Math.atan2(d*.13,d));
   p.weapon=d>3.4?"bow":"sword";if(p.weapon==="sword"&&d<2.6&&now>(p.defendUntil||0)&&Math.random()<.018)p.defendUntil=now+380;
   p.shield=p.weapon==="sword"&&now<(p.defendUntil||0);
   p.input={x:0,z:d>1.6?-1:0,jump:Math.random()<.002};
   if(p.weapon==="sword"&&d<2.35)attack(room,p,now);
   if(p.weapon==="bow"){if(!p.chargeAt)p.chargeAt=now;else if(now-p.chargeAt>900)shoot(room,p,now);}
  }
  const mx=clamp(Number(p.input.x)||0,-1,1),mz=clamp(Number(p.input.z)||0,-1,1),norm=Math.max(1,Math.hypot(mx,mz));
  const dx=(mx*Math.cos(p.yaw)+mz*Math.sin(p.yaw))/norm;
  const dz=(-mx*Math.sin(p.yaw)+mz*Math.cos(p.yaw))/norm;
  p.x=clamp(p.x+dx*RULES.moveSpeed*dt,-6.1,6.1);p.z=clamp(p.z+dz*RULES.moveSpeed*dt,-6.1,6.1);
  if(p.input.jump&&p.y===0){p.vy=5.3;}p.input.jump=false;
  p.vy-=15*dt;p.y=Math.max(0,p.y+p.vy*dt);if(p.y===0)p.vy=0;
 }
 // Player bodies cannot pass through one another.
 const live=[...room.players.values(),...room.bots.values()].filter(p=>p.hp>0);
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
  const a=live[i],b=live[j];if(Math.abs(a.y-b.y)>1.5)continue;
  let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
  if(d>=.72)continue;
  if(d<.001){dx=.01;dz=0;d=.01;}
  const offset=(.72-d)/2;
  a.x=clamp(a.x-dx/d*offset,-6.1,6.1);a.z=clamp(a.z-dz/d*offset,-6.1,6.1);
  b.x=clamp(b.x+dx/d*offset,-6.1,6.1);b.z=clamp(b.z+dz/d*offset,-6.1,6.1);
 }
 for(const a of [...room.arrows]){
  const px=a.x,py=a.y,pz=a.z;
  a.x+=a.vx*dt;a.y+=a.vy*dt;a.z+=a.vz*dt;a.vy-=9*dt;a.ttl-=dt;
  const owner=room.players.get(a.owner)||room.bots.get(a.owner);
  if(owner)for(const t of [...room.players.values(),...room.bots.values()]){
   if(t.id===a.owner||t.hp<=0)continue;
   const steps=4;let collision=false;
   for(let i=1;i<=steps;i++){const f=i/steps,x=px+(a.x-px)*f,y=py+(a.y-py)*f,z=pz+(a.z-pz)*f;
    if(Math.abs(x-t.x)<.5&&Math.abs(z-t.z)<.5&&y>t.y&&y<t.y+2){collision=true;break;}}
   if(collision){hit(room,owner,t,RULES.arrowDamage,px,pz);a.ttl=0;break;}
  }
  if(a.ttl<=0||a.y<0||a.y>16||Math.abs(a.x)>6.5||Math.abs(a.z)>6.5)room.arrows.splice(room.arrows.indexOf(a),1);
 }
 broadcast(room,snapshot(room));finish(room);
}
export function attachCrazyBattle(server){
 const wss=new WebSocketServer({server,path:"/api/crazy/ws",maxPayload:2048});
 const announceRooms=()=>{const info={type:"rooms",rooms:publicRooms()};for(const client of wss.clients)send(client,info);};
 const heartbeat=setInterval(()=>{
  for(const client of wss.clients){
   if(client.isAlive===false){client.terminate();continue;}
   client.isAlive=false;client.ping();
  }
 },20000);
 const timer=setInterval(()=>{
  const now=Date.now();
  for(const r of rooms.values()){
   for(const p of [...r.players.values()]){
    if(p.disconnectedAt&&now-p.disconnectedAt>RECONNECT_MS){
     r.players.delete(p.id);
     if(r.host===p.id)r.host=r.players.keys().next().value??null;
     finish(r);lobby(r);
    }
   }
   if(r.players.size===0){rooms.delete(r.code);announceRooms();continue;}
   tick(r);
  }
 },TICK_MS);
 wss.on("connection",ws=>{
  ws.isAlive=true;ws.on("pong",()=>{ws.isAlive=true;});
  let id=randomBytes(8).toString("hex");let room=null;let deliberateLeave=false;
  let messages=0,lastWindow=Date.now();
  const fail=message=>send(ws,{type:"error",message});
  ws.on("message",raw=>{
   const time=Date.now();if(time-lastWindow>=1000){lastWindow=time;messages=0;}
   if(++messages>80){ws.close(1008,"Rate limit");return;}
   let msg;try{msg=JSON.parse(raw.toString());}catch{return fail("Mensagem inválida");}
   if(!msg||typeof msg!=="object")return;
   if(msg.type==="list"){send(ws,{type:"rooms",rooms:publicRooms()});return;}
   if(msg.type==="resume"){
    if(room)return fail("Já está em uma sala");
    const r=rooms.get(clean(msg.code,8).toUpperCase());
    const old=r?.players.get(clean(msg.id,20));
    const sent=String(msg.resumeKey||"");
    const expected=old?.resumeKey||"";
    if(!old||old.ws||sent.length!==expected.length||!timingSafeEqual(Buffer.from(sent),Buffer.from(expected)))return fail("Sessão expirada");
    room=r;id=old.id;old.ws=ws;old.disconnectedAt=0;
    send(ws,{type:"joined",id,code:r.code,resumeKey:old.resumeKey,resumed:true});
    lobby(r);return;
   }
   if(msg.type==="create"){
    if(room)return fail("Já está em uma sala");
    if(rooms.size>=100)return fail("Limite de salas atingido");
    const code=randomCode();room={code,name:clean(msg.name||"Arena",36),private:!!msg.private,announceRooms,host:id,status:"lobby",winner:null,seconds:0,players:new Map(),bots:new Map(),arrows:[]};
    const p=participant(id,clean(msg.player||"Jogador"),ws);p.skin=msg.skin==="blue"?"blue":"red";room.players.set(id,p);rooms.set(code,room);send(ws,{type:"joined",id,code,resumeKey:p.resumeKey});lobby(room);return;
   }
   if(msg.type==="join"){
    if(room)return fail("Já está em uma sala");
    const r=rooms.get(clean(msg.code,8).toUpperCase());if(!r)return fail("Sala não encontrada");
    if(r.players.size+r.bots.size>=RULES.maxPlayers)return fail("Sala lotada");
    if(r.status==="playing")return fail("Partida em andamento; aguarde o próximo jogo");
    room=r;const p=participant(id,clean(msg.player||"Jogador"),ws);p.skin=msg.skin==="blue"?"blue":"red";r.players.set(id,p);send(ws,{type:"joined",id,code:r.code,resumeKey:p.resumeKey});lobby(r);return;
   }
   if(!room)return fail("Entre em uma sala primeiro");
   const p=room.players.get(id);if(!p)return;
   if(msg.type==="addBot"&&room.host===id&&room.status!=="playing"&&room.players.size+room.bots.size<RULES.maxPlayers){
    const bot=participant("bot-"+randomBytes(4).toString("hex"),"Bot Guerreiro "+(room.bots.size+1),null,true);bot.skin=room.bots.size%2===0?"blue":"red";room.bots.set(bot.id,bot);lobby(room);
   }
   if(msg.type==="skin"&&room.status!=="playing"){p.skin=msg.skin==="blue"?"blue":"red";lobby(room);return;}
   if(msg.type==="removeBot"&&room.host===id&&room.status!=="playing"){room.bots.delete(String(msg.id));lobby(room);}
   if(msg.type==="start"&&room.host===id&&room.status!=="playing"){
    const all=[...room.players.values(),...room.bots.values()];if(all.length<2)return fail("Adicione pelo menos dois participantes");
    all.forEach((p,i)=>spawn(p,i));room.seconds=0;room.winner=null;room.arrows=[];room.status="playing";lobby(room);
   }
   if(msg.type==="leave"){deliberateLeave=true;ws.close();return;}
   if(room.status!=="playing"||p.hp<=0)return;
   if(msg.type==="input"){
    p.input.x=clamp(Number(msg.x)||0,-1,1);p.input.z=clamp(Number(msg.z)||0,-1,1);
    p.input.jump=!!msg.jump||p.input.jump;
    if(Number.isFinite(msg.yaw))p.yaw=clamp(msg.yaw,-1e5,1e5);
    if(Number.isFinite(msg.pitch))p.pitch=clamp(msg.pitch,-1.35,1.35);
   }
   if(msg.type==="weapon"){p.weapon=p.weapon==="sword"?"bow":"sword";p.shield=false;p.chargeAt=0;}
   if(msg.type==="shield"){p.shield=p.weapon==="sword"&&!!msg.active;}
   if(msg.type==="attack"){attack(room,p,Date.now());}
   if(msg.type==="bowStart"&&p.weapon==="bow"){if(!p.chargeAt)p.chargeAt=Date.now();}
   if(msg.type==="bowRelease"){shoot(room,p,Date.now());}
  });
  ws.on("close",()=>{
   if(!room)return;
   const p=room.players.get(id);
   if(!p||p.ws!==ws)return;
   if(deliberateLeave){room.players.delete(id);if(room.host===id)room.host=room.players.keys().next().value??null;}
   else {p.ws=null;p.disconnectedAt=Date.now();p.input={x:0,z:0,jump:false};p.shield=false;p.chargeAt=0;}
   if(!room.players.size){rooms.delete(room.code);announceRooms();return;}
   finish(room);lobby(room);
  });
 });
 server.on("close",()=>{clearInterval(timer);clearInterval(heartbeat);wss.close();});
 return wss;
}
export function crazyPublicRooms(){return publicRooms();}
