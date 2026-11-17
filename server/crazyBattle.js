import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const rooms = new Map();
const clients = new WeakMap();
const TICK_MS = 50;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clean = (v, n = 24) => String(v ?? "").replace(/[<>\\x00-\\x1f]/g, "").trim().slice(0, n);
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const publicRooms = () => [...rooms.values()].filter(r => !r.private).map(r => ({
 code:r.code, name:r.name, status:r.status, players:r.players.size+r.bots.size, max:8
}));
const broadcast = (room, data) => { for (const p of room.players.values()) send(p.ws, data); };
const playerState = p => ({id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,hp:p.hp,weapon:p.weapon,shield:p.shield,alive:p.hp>0,bot:!!p.bot});
const snapshot = room => ({type:"state",code:room.code,status:room.status,host:room.host,seconds:room.seconds,winner:room.winner,
 players:[...room.players.values(),...room.bots.values()].map(playerState),
 arrows:room.arrows.map(a=>({id:a.id,x:a.x,y:a.y,z:a.z}))});
const lobby = room => broadcast(room, snapshot(room));
const randomCode = () => { let c; do {c=randomBytes(4).toString("hex").toUpperCase();}while(rooms.has(c));return c;};
function spawn(p, index){const spots=[[-4,-4],[4,4],[-4,4],[4,-4],[0,5],[5,0],[-5,0],[0,-5]];[p.x,p.z]=spots[index%spots.length];p.y=0;p.hp=100;p.vy=0;p.shield=false;p.weapon="sword";p.cooldown=0;p.chargeAt=0;p.input={x:0,z:0,jump:false};}
function participant(id,name,ws,bot=false){return {id,name,ws,bot,x:0,y:0,z:0,yaw:0,pitch:0,hp:100,vy:0,shield:false,weapon:"sword",cooldown:0,chargeAt:0,input:{x:0,z:0,jump:false}};}
function finish(room){const alive=[...room.players.values(),...room.bots.values()].filter(p=>p.hp>0);if(room.status==="playing"&&alive.length<=1){room.status="finished";room.winner=alive[0]?.id??null;broadcast(room,{type:"finished",winner:room.winner});}}
function hit(room,attacker,target,damage,fromX,fromZ){
 if(target.hp<=0||room.status!=="playing")return;
 const dx=fromX-target.x,dz=fromZ-target.z,len=Math.hypot(dx,dz)||1;
 const forwardX=-Math.sin(target.yaw),forwardZ=-Math.cos(target.yaw);
 const blocked=target.shield&&target.weapon==="sword"&&(forwardX*dx+forwardZ*dz)/len>0.25;
 target.hp=Math.max(0,target.hp-Math.max(1,Math.round(damage*(blocked?.1:1))));
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
  hit(room,p,t,20,p.x,p.z);
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
   p.yaw=Math.atan2(-dx,-dz);p.pitch=0;
   p.weapon=d>3.4?"bow":"sword";p.shield=p.weapon==="sword"&&Math.random()<.015;
   p.input={x:0,z:d>1.6?-1:0,jump:Math.random()<.002};
   if(p.weapon==="sword"&&d<2.35)attack(room,p,now);
   if(p.weapon==="bow"){if(!p.chargeAt)p.chargeAt=now;else if(now-p.chargeAt>900)shoot(room,p,now);}
  }
  const mx=clamp(Number(p.input.x)||0,-1,1),mz=clamp(Number(p.input.z)||0,-1,1),norm=Math.max(1,Math.hypot(mx,mz));
  const dx=(mx*Math.cos(p.yaw)+mz*Math.sin(p.yaw))/norm;
  const dz=(-mx*Math.sin(p.yaw)+mz*Math.cos(p.yaw))/norm;
  p.x=clamp(p.x+dx*4*dt,-6.9,6.9);p.z=clamp(p.z+dz*4*dt,-6.9,6.9);
  if(p.input.jump&&p.y===0){p.vy=5.3;}p.input.jump=false;
  p.vy-=15*dt;p.y=Math.max(0,p.y+p.vy*dt);if(p.y===0)p.vy=0;
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
   if(collision){hit(room,owner,t,12,px,pz);a.ttl=0;break;}
  }
  if(a.ttl<=0||a.y<0||a.y>16||Math.abs(a.x)>7.5||Math.abs(a.z)>7.5)room.arrows.splice(room.arrows.indexOf(a),1);
 }
 broadcast(room,snapshot(room));finish(room);
}
export function attachCrazyBattle(server){
 const wss=new WebSocketServer({server,path:"/api/crazy/ws",maxPayload:2048});
 const timer=setInterval(()=>{for(const r of rooms.values())tick(r);},TICK_MS);
 wss.on("connection",ws=>{
  const id=randomBytes(8).toString("hex");let room=null;
  const fail=message=>send(ws,{type:"error",message});
  ws.on("message",raw=>{
   let msg;try{msg=JSON.parse(raw.toString());}catch{return fail("Mensagem inválida");}
   if(!msg||typeof msg!=="object")return;
   if(msg.type==="list"){send(ws,{type:"rooms",rooms:publicRooms()});return;}
   if(msg.type==="create"){
    if(room)return fail("Já está em uma sala");
    const code=randomCode();room={code,name:clean(msg.name||"Arena",36),private:!!msg.private,host:id,status:"lobby",winner:null,seconds:0,players:new Map(),bots:new Map(),arrows:[]};
    const p=participant(id,clean(msg.player||"Jogador"),ws);room.players.set(id,p);rooms.set(code,room);clients.set(ws,room);send(ws,{type:"joined",id,code});lobby(room);return;
   }
   if(msg.type==="join"){
    if(room)return fail("Já está em uma sala");
    const r=rooms.get(clean(msg.code,8).toUpperCase());if(!r)return fail("Sala não encontrada");
    if(r.players.size+r.bots.size>=8)return fail("Sala lotada");
    if(r.status==="playing")return fail("Partida em andamento; aguarde o próximo jogo");
    room=r;const p=participant(id,clean(msg.player||"Jogador"),ws);r.players.set(id,p);clients.set(ws,r);send(ws,{type:"joined",id,code:r.code});lobby(r);return;
   }
   if(!room)return fail("Entre em uma sala primeiro");
   const p=room.players.get(id);if(!p)return;
   if(msg.type==="addBot"&&room.host===id&&room.status!=="playing"&&room.players.size+room.bots.size<8){
    const bot=participant("bot-"+randomBytes(4).toString("hex"),"Bot Guerreiro",null,true);room.bots.set(bot.id,bot);lobby(room);
   }
   if(msg.type==="removeBot"&&room.host===id&&room.status!=="playing"){room.bots.delete(String(msg.id));lobby(room);}
   if(msg.type==="start"&&room.host===id&&room.status!=="playing"){
    const all=[...room.players.values(),...room.bots.values()];if(all.length<2)return fail("Adicione pelo menos dois participantes");
    all.forEach((p,i)=>spawn(p,i));room.seconds=0;room.winner=null;room.arrows=[];room.status="playing";lobby(room);
   }
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
   if(!room)return;room.players.delete(id);
   if(room.host===id)room.host=room.players.keys().next().value??null;
   if(!room.players.size){rooms.delete(room.code);return;}
   finish(room);lobby(room);
  });
 });
 server.on("close",()=>{clearInterval(timer);wss.close();});
 return wss;
}
export function crazyPublicRooms(){return publicRooms();}
