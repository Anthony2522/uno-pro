import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./crazy.css";
import { createCrazyWorld } from "./world";
export type Fighter={id:string;name:string;x:number;y:number;z:number;yaw:number;pitch:number;hp:number;weapon:string;shield:boolean;alive:boolean;bot:boolean};
export type MatchState={type:string;status:string;seconds:number;winner:string|null;host:string;players:Fighter[];arrows:{id:string;x:number;y:number;z:number}[]};
type Props={ws:WebSocket,id:string,state:MatchState,onExit:()=>void};
export function CrazyOnlineArena({ws,id,state,onExit}:Props){
 const root=useRef<HTMLDivElement>(null),data=useRef(state),input=useRef({x:0,z:0,yaw:0,pitch:0,jump:false});
 const [charge,setCharge]=useState(false);
 const keys=useRef(new Set<string>()),look=useRef<{id:number,x:number,y:number}|null>(null),stick=useRef<number|null>(null);
 const send=(type:string,other:Record<string,unknown>={})=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...other}));};
 data.current=state;
 const me=state.players.find(p=>p.id===id);
 const weapon=me?.weapon||"sword";
 useEffect(()=>{
  const node=root.current;if(!node)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color("#3b1c49");
  const cleanupWorld = createCrazyWorld(scene);
  const cube = new THREE.BoxGeometry(1,1,1);
  const materials = ["#704b56","#543747","#875763","#49303c"].map(color=>new THREE.MeshLambertMaterial({color}));
  const fire = new THREE.MeshBasicMaterial({color:"#ff6512"});
  const red = new THREE.MeshLambertMaterial({color:"#af2119"});
  const skin = new THREE.MeshLambertMaterial({color:"#f7b17b"});
  function block(parent:THREE.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material){const mesh=new THREE.Mesh(cube,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;}
  const fighters=new Map<string,THREE.Group>(),arrows=new Map<string,THREE.Mesh>();
  const nameplates=new Map<string,{sprite:THREE.Sprite,texture:THREE.CanvasTexture,label:string}>();
  function setNameplate(p:Fighter, group:THREE.Group){
    const label=p.name+"|"+p.hp;
    const prior=nameplates.get(p.id);
    if(prior?.label===label)return;
    const canvas=document.createElement("canvas");canvas.width=320;canvas.height=82;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.fillStyle="rgba(18,9,15,.82)";ctx.fillRect(12,2,296,75);
    ctx.font="bold 24px sans-serif";ctx.textAlign="center";ctx.fillStyle="#fff";ctx.fillText(p.name.slice(0,18),160,28);
    ctx.fillStyle="#1b0a13";ctx.fillRect(23,42,274,26);
    const percent=Math.max(0,Math.min(100,p.hp));
    ctx.fillStyle="hsl("+percent*1.2+" 95% 48%)";ctx.fillRect(23,42,274*percent/100,26);
    ctx.font="bold 21px sans-serif";ctx.fillStyle="white";ctx.fillText(percent+"%",160,63);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    if(prior){prior.sprite.material.map=texture;prior.sprite.material.needsUpdate=true;prior.texture.dispose();prior.label=label;}
    else {const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));
      sprite.position.y=2.55;sprite.scale.set(2.35,.61,1);group.add(sprite);nameplates.set(p.id,{sprite,texture,label});}
  }
  function makeFighter(){const group=new THREE.Group();block(group,0,1.65,0,.7,.65,.6,skin);block(group,0,1,0,.85,.85,.5,red);block(group,0,1.99,0,.8,.2,.65,materials[3]!);for(const x of [-.25,.25])block(group,x,.35,0,.3,.7,.4,materials[3]!);for(const x of [-.6,.6])block(group,x,1.05,0,.3,.8,.4,red);scene.add(group);return group;}
  const blade=block(camera,.58,-.48,-.9,.18,.85,.18,new THREE.MeshLambertMaterial({color:"#e5d9df"}));
  const shield=block(camera,-.58,-.6,-.85,.75,.95,.17,materials[2]!);
  const bow=block(camera,.62,-.45,-.95,.15,1.15,.2,materials[2]!);scene.add(camera);
  const keyDown=(e:KeyboardEvent)=>{keys.current.add(e.code);if(e.code==="Space")input.current.jump=true;if(e.code==="KeyQ")send("weapon");};
  const keyUp=(e:KeyboardEvent)=>keys.current.delete(e.code);
  const mouse=(e:MouseEvent)=>{if(document.pointerLockElement===renderer.domElement){input.current.yaw-=e.movementX*.003;input.current.pitch=Math.max(-1.35,Math.min(1.35,input.current.pitch-e.movementY*.003));}};
  const mouseDown=(e:MouseEvent)=>{if(document.pointerLockElement!==renderer.domElement)return;if(e.button===0){if(data.current.players.find(p=>p.id===id)?.weapon==="bow")send("bowStart");else send("attack");}if(e.button===2)send("shield",{active:true});};
  const mouseUp=(e:MouseEvent)=>{if(e.button===0)send("bowRelease");if(e.button===2)send("shield",{active:false});};
  const prevent=(e:Event)=>e.preventDefault();
  renderer.domElement.addEventListener("click",()=>{if(matchMedia("(pointer:fine)").matches)renderer.domElement.requestPointerLock?.();});
  renderer.domElement.addEventListener("contextmenu",prevent);
  window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);window.addEventListener("mousemove",mouse);window.addEventListener("mousedown",mouseDown);window.addEventListener("mouseup",mouseUp);
  let frame=0,last=performance.now(),network=0;
  function animate(now:number){
   frame=requestAnimationFrame(animate);const dt=Math.min(.05,(now-last)/1000);last=now;
   const s=data.current,local=s.players.find(p=>p.id===id),i=input.current;
   if(keys.current.size){i.x=(keys.current.has("KeyD")?1:0)-(keys.current.has("KeyA")?1:0);i.z=(keys.current.has("KeyS")?1:0)-(keys.current.has("KeyW")?1:0);}
   if(local){camera.position.lerp(new THREE.Vector3(local.x,local.y+1.65,local.z),Math.min(1,dt*18));camera.rotation.order="YXZ";camera.rotation.set(i.pitch,i.yaw,0);blade.visible=local.weapon==="sword";shield.visible=local.weapon==="sword";shield.position.y=local.shield?-.25:-.6;bow.visible=local.weapon==="bow";}
   for(const p of s.players){if(p.id===id||!p.alive){const g=fighters.get(p.id);if(g)g.visible=false;continue;}let g=fighters.get(p.id);if(!g){g=makeFighter();fighters.set(p.id,g);}g.visible=true;g.position.lerp(new THREE.Vector3(p.x,p.y,p.z),Math.min(1,dt*12));g.rotation.y=p.yaw;setNameplate(p,g);}
   for(const a of s.arrows||[]){let m=arrows.get(a.id);if(!m){m=block(scene,0,0,0,.1,.1,.55,materials[1]!);arrows.set(a.id,m);}m.position.lerp(new THREE.Vector3(a.x,a.y,a.z),Math.min(1,dt*16));}
   for(const [aid,m] of arrows)if(!(s.arrows||[]).some(a=>a.id===aid)){scene.remove(m);arrows.delete(aid);}
   if(now-network>50){network=now;if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"input",...i}));i.jump=false;}
   renderer.render(scene,camera);
  }frame=requestAnimationFrame(animate);
  const observer=new ResizeObserver(()=>{camera.aspect=node.clientWidth/node.clientHeight;camera.updateProjectionMatrix();renderer.setSize(node.clientWidth,node.clientHeight);});observer.observe(node);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp);window.removeEventListener("mousemove",mouse);window.removeEventListener("mousedown",mouseDown);window.removeEventListener("mouseup",mouseUp);renderer.domElement.removeEventListener("contextmenu",prevent);renderer.dispose();cleanupWorld();for(const plate of nameplates.values()){plate.texture.dispose();plate.sprite.material.dispose();}cube.dispose();for(const m of materials)m.dispose();fire.dispose();red.dispose();skin.dispose();node.removeChild(renderer.domElement);};
 },[id,ws]);
 const pointerMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!look.current||look.current.id!==e.pointerId)return;input.current.yaw-=(e.clientX-look.current.x)*.004;input.current.pitch=Math.max(-1.35,Math.min(1.35,input.current.pitch-(e.clientY-look.current.y)*.004));look.current.x=e.clientX;look.current.y=e.clientY;};
 const joystick=(e:React.PointerEvent<HTMLDivElement>)=>{if(stick.current!==null&&stick.current!==e.pointerId)return;stick.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();input.current.x=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.4)));input.current.z=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/(r.height*.4)));};
 const hold=(type:string,endType?:string)=>({onPointerDown:(e:React.PointerEvent)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);send(type,{active:true});},onPointerUp:()=>send(endType||type,{active:false}),onPointerCancel:()=>send(endType||type,{active:false})});
 return <div className="crazy-game"><div className="crazy-canvas" ref={root}/><div className="crazy-look" onPointerDown={e=>{look.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={pointerMove} onPointerUp={()=>look.current=null} onPointerCancel={()=>look.current=null}/>
 <header className="crazy-hud"><button onClick={onExit}>← Sair</button><strong>⏱ {Math.floor(state.seconds/60).toString().padStart(2,"0")}:{Math.floor(state.seconds%60).toString().padStart(2,"0")}</strong><span>👥 {state.players.filter(p=>p.alive).length}/{state.players.length}</span></header>
 <div className="crazy-crosshair">＋</div><div className="crazy-health"><b>♥</b><strong>{me?.hp??0}%</strong><div className="crazy-health-track"><div style={{height:(me?.hp??0)+"%",background:`hsl(${(me?.hp??0)*1.2} 95% 48%)`}}/></div></div>
 <button className="crazy-switch crazy-control" onClick={()=>{send("weapon");}}> {weapon==="sword"?"🏹":"⚔️"} ⇄</button>
 <div className="crazy-joystick crazy-control" onPointerDown={joystick} onPointerMove={joystick} onPointerUp={()=>{stick.current=null;input.current.x=0;input.current.z=0;}} onPointerCancel={()=>{stick.current=null;input.current.x=0;input.current.z=0;}}><div/></div>
 <div className="crazy-actions">{weapon==="sword"?<><button className="crazy-control" {...hold("shield")}>🛡️</button><button className="crazy-control" onPointerDown={e=>{e.preventDefault();send("attack");}}>⚔️</button></>:<button className="crazy-control crazy-bow" {...hold("bowStart","bowRelease")} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setCharge(true);send("bowStart");}} onPointerUp={()=>{setCharge(false);send("bowRelease");}}>🏹 {charge?"●":""}</button>}<button className="crazy-control crazy-jump" onPointerDown={e=>{e.preventDefault();input.current.jump=true;}}>⬆</button></div>
 {state.status==="finished"&&<div className="crazy-result"><h1>{state.winner===id?"Vitória!":"Fim da partida"}</h1><p>{state.players.find(p=>p.id===state.winner)?.name||"Ninguém"} venceu!</p>{state.host===id&&<button onClick={()=>send("start")}>Jogar novamente</button>}<button onClick={onExit}>Sair da sala</button></div>}
 </div>;
}
