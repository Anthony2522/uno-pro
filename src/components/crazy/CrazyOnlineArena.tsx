import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./crazy.css";
import { createCrazyWorld } from "./world";
import { makeCrazyVisuals, normalizeWarriorSkin, type WarriorRig } from "./visuals";
import { crazyPixelRatio, crazyShouldRender } from "./performance";
export type Fighter={id:string;name:string;x:number;y:number;z:number;yaw:number;pitch:number;hp:number;weapon:string;shield:boolean;alive:boolean;bot:boolean;skin?:"red"|"blue"};
export type MatchState={type:string;status:string;seconds:number;winner:string|null;host:string;players:Fighter[];arrows:{id:string;x:number;y:number;z:number}[]};
type Props={ws:WebSocket,id:string,state:MatchState,onExit:()=>void};
export function CrazyOnlineArena({ws,id,state,onExit}:Props){
 const root=useRef<HTMLDivElement>(null),data=useRef(state),input=useRef({x:0,z:0,yaw:0,pitch:0,jump:false});
 const [charge,setCharge]=useState(false),[chargePower,setChargePower]=useState(0);
 const chargeStarted=useRef(0);
 const swingAt=useRef(-10000);
 const otherSwings=useRef(new Map<string,number>());
 const [impact,setImpact]=useState<{key:number,type:"taken"|"dealt"}|null>(null);
 const keys=useRef(new Set<string>()),look=useRef<{id:number,x:number,y:number}|null>(null),stick=useRef<number|null>(null);
 const send=(type:string,other:Record<string,unknown>={})=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...other}));};
 data.current=state;
 const me=state.players.find(p=>p.id===id);
 const weapon=me?.weapon||"sword";
 useEffect(()=>{
  const onHit=(event:MessageEvent)=>{
   try{
    const msg=JSON.parse(event.data);
    if(msg.type==="swing"&&typeof msg.id==="string"){otherSwings.current.set(msg.id,performance.now());return;}
    if(msg.type==="state"&&(msg.status==="finished"||msg.players?.find((p:Fighter)=>p.id===id)?.hp===0)){
      const locked=document.pointerLockElement;
      if(locked&&root.current?.contains(locked))document.exitPointerLock?.();
      return;
    }
    if(msg.type!=="hit")return;
    if(msg.target===id)setImpact({key:Date.now(),type:"taken"});
    else if(msg.attacker===id)setImpact({key:Date.now(),type:"dealt"});
   }catch{}
  };
  ws.addEventListener("message",onHit);
  return()=>ws.removeEventListener("message",onHit);
 },[ws,id]);
 useEffect(()=>{
   if(state.status!=="playing"||(me?.hp??0)<=0){
     const locked=document.pointerLockElement;
     if(locked&&root.current?.contains(locked))document.exitPointerLock?.();
     keys.current.clear();
   }
 },[state.status,me?.hp]);
 useEffect(()=>{
  const node=root.current;if(!node)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color("#3b1c49");
  const camera=new THREE.PerspectiveCamera(75,node.clientWidth/node.clientHeight,.05,60);
  const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(crazyPixelRatio(node.clientWidth,node.clientHeight,devicePixelRatio));
  renderer.setSize(node.clientWidth,node.clientHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  node.appendChild(renderer.domElement);
  const cleanupWorld = createCrazyWorld(scene);
  const cube = new THREE.BoxGeometry(1,1,1);
  const materials = ["#704b56","#543747","#875763","#49303c"].map(color=>new THREE.MeshLambertMaterial({color}));
  const fire = new THREE.MeshBasicMaterial({color:"#ff6512"});
  const red = new THREE.MeshLambertMaterial({color:"#af2119"});
  const skin = new THREE.MeshLambertMaterial({color:"#f7b17b"});
  function block(parent:THREE.Object3D,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material){const mesh=new THREE.Mesh(cube,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;}
  const visuals=makeCrazyVisuals();
   const fighters=new Map<string,WarriorRig>(),arrows=new Map<string,THREE.Mesh>();
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
  function makeFighter(skin:"red"|"blue"){
     const rig=visuals.createWarrior(skin);scene.add(rig.group);return rig;
   }
   const weapons=visuals.createViewWeapons(camera,"red");scene.add(camera);
   const isPlaying=()=>data.current.status==="playing"&&(data.current.players.find(p=>p.id===id)?.hp??0)>0;
   const keyDown=(e:KeyboardEvent)=>{
     if(!isPlaying())return;
     if(["Space","KeyE","KeyQ"].includes(e.code))e.preventDefault();
     keys.current.add(e.code);
     if(e.code==="Space"&&!e.repeat)input.current.jump=true;
     if(e.code==="KeyE"&&!e.repeat)send("weapon");
     if(e.code==="KeyQ"&&!e.repeat)send("shield",{active:true});
     if(e.code==="Escape"&&document.pointerLockElement)document.exitPointerLock?.();
   };
   const keyUp=(e:KeyboardEvent)=>{keys.current.delete(e.code);if(e.code==="KeyQ")send("shield",{active:false});};
   const clearKeys=()=>{keys.current.clear();send("shield",{active:false});};
   const mouse=(e:MouseEvent)=>{if(isPlaying()&&document.pointerLockElement===renderer.domElement){input.current.yaw-=e.movementX*.003;input.current.pitch=Math.max(-1.35,Math.min(1.35,input.current.pitch-e.movementY*.003));}};
   const mouseDown=(e:MouseEvent)=>{if(!isPlaying()||document.pointerLockElement!==renderer.domElement)return;
     if(e.button===0){if(data.current.players.find(p=>p.id===id)?.weapon==="bow"){chargeStarted.current=performance.now();setCharge(true);send("bowStart");}else{swingAt.current=performance.now();send("attack");}}
     if(e.button===2)send("shield",{active:true});
   };
   const mouseUp=(e:MouseEvent)=>{if(e.button===0&&chargeStarted.current){chargeStarted.current=0;setCharge(false);setChargePower(0);send("bowRelease");}if(e.button===2)send("shield",{active:false});};
   const prevent=(e:Event)=>e.preventDefault();
   const unlockAfterFinish=()=>{const locked=document.pointerLockElement;if(!isPlaying()&&locked&&root.current?.contains(locked))document.exitPointerLock?.();};
   document.addEventListener("pointerlockchange",unlockAfterFinish);
   const lockOnPlay=()=>{if(isPlaying()&&matchMedia("(hover:hover) and (pointer:fine)").matches&&document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock?.();};
   renderer.domElement.addEventListener("click",lockOnPlay);renderer.domElement.addEventListener("contextmenu",prevent);
   window.addEventListener("keydown",keyDown);window.addEventListener("keyup",keyUp);window.addEventListener("blur",clearKeys);
   window.addEventListener("mousemove",mouse);window.addEventListener("mousedown",mouseDown);window.addEventListener("mouseup",mouseUp);
   let frame=0,last=performance.now(),lastRendered=0,network=0,lastPercent=-1;
  function animate(now:number){
   frame=requestAnimationFrame(animate);
   if(document.hidden||!crazyShouldRender(now,lastRendered))return;
   lastRendered=now;const dt=Math.min(.05,(now-last)/1000);last=now;
   if(!isPlaying()){unlockAfterFinish();if(data.current.status==="finished")return;}
   const s=data.current,local=s.players.find(p=>p.id===id),i=input.current;
   if(keys.current.size){i.x=(keys.current.has("KeyD")?1:0)-(keys.current.has("KeyA")?1:0);i.z=(keys.current.has("KeyS")?1:0)-(keys.current.has("KeyW")?1:0);}else if(stick.current===null){i.x=0;i.z=0;}
   const elapsedSwing=now-swingAt.current;
   const currentWeapon=local?.weapon==="bow"?"bow":"sword";
   weapons.setWeapon(currentWeapon,!!local?.shield);
   weapons.animate(now,elapsedSwing,chargeStarted.current?Math.min(1,(now-chargeStarted.current)/1200):0,Math.hypot(i.x,i.z)>.05);
   if(local){camera.position.lerp(new THREE.Vector3(local.x,local.y+1.65,local.z),Math.min(1,dt*18));camera.rotation.order="YXZ";camera.rotation.set(i.pitch,i.yaw,0);}
   for(const p of s.players){
     if(p.id===id||!p.alive){const rig=fighters.get(p.id);if(rig)rig.group.visible=false;continue;}
     let rig=fighters.get(p.id);
     if(!rig){rig=makeFighter(normalizeWarriorSkin(p.skin));fighters.set(p.id,rig);}
     rig.group.visible=true;
     if(rig.skin!==normalizeWarriorSkin(p.skin))rig.setSkin(normalizeWarriorSkin(p.skin));
     const moved=Math.hypot(p.x-rig.group.position.x,p.z-rig.group.position.z)>.005;
     rig.group.position.lerp(new THREE.Vector3(p.x,p.y,p.z),Math.min(1,dt*12));
     rig.group.rotation.y=p.yaw;
     setNameplate(p,rig.group);
     rig.setEquipment(p.weapon==="bow"?"bow":"sword",p.shield);
     rig.animate(now,moved,now-(otherSwings.current.get(p.id)??-10000),p.shield,p.weapon==="bow"?"bow":"sword");
   }
   for(const a of s.arrows||[]){let m=arrows.get(a.id);if(!m){m=block(scene,0,0,0,.1,.1,.55,materials[1]!);arrows.set(a.id,m);}m.position.lerp(new THREE.Vector3(a.x,a.y,a.z),Math.min(1,dt*16));}
   for(const [aid,m] of arrows)if(!(s.arrows||[]).some(a=>a.id===aid)){scene.remove(m);arrows.delete(aid);}
   if(now-network>50){network=now;if(chargeStarted.current){const percent=Math.min(100,Math.floor((now-chargeStarted.current)/60)*5);if(percent!==lastPercent){lastPercent=percent;setChargePower(percent);}}else lastPercent=-1;if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"input",...i}));i.jump=false;}
   renderer.render(scene,camera);
  }frame=requestAnimationFrame(animate);
  const observer=new ResizeObserver(()=>{camera.aspect=node.clientWidth/node.clientHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(crazyPixelRatio(node.clientWidth,node.clientHeight,devicePixelRatio));renderer.setSize(node.clientWidth,node.clientHeight);});observer.observe(node);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener("pointerlockchange",unlockAfterFinish);window.removeEventListener("keydown",keyDown);window.removeEventListener("keyup",keyUp);window.removeEventListener("blur",clearKeys);window.removeEventListener("mousemove",mouse);window.removeEventListener("mousedown",mouseDown);window.removeEventListener("mouseup",mouseUp);renderer.domElement.removeEventListener("contextmenu",prevent);renderer.domElement.removeEventListener("click",lockOnPlay);
   if(document.pointerLockElement===renderer.domElement)document.exitPointerLock?.();
   renderer.dispose();cleanupWorld();visuals.dispose();for(const plate of nameplates.values()){plate.texture.dispose();plate.sprite.material.dispose();}cube.dispose();for(const m of materials)m.dispose();fire.dispose();red.dispose();skin.dispose();node.removeChild(renderer.domElement);};
 },[id,ws]);
 const pointerMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!look.current||look.current.id!==e.pointerId)return;input.current.yaw-=(e.clientX-look.current.x)*.004;input.current.pitch=Math.max(-1.35,Math.min(1.35,input.current.pitch-(e.clientY-look.current.y)*.004));look.current.x=e.clientX;look.current.y=e.clientY;};
 const joystick=(e:React.PointerEvent<HTMLDivElement>)=>{if(stick.current!==null&&stick.current!==e.pointerId)return;stick.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();input.current.x=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.4)));input.current.z=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/(r.height*.4)));};
 const hold=(type:string,endType?:string)=>({onPointerDown:(e:React.PointerEvent)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);send(type,{active:true});},onPointerUp:()=>send(endType||type,{active:false}),onPointerCancel:()=>send(endType||type,{active:false})});
 return <div className="crazy-game"><div className="crazy-canvas" ref={root}/><div className="crazy-look" onClick={()=>{if(state.status==="playing"&&(me?.hp??0)>0&&matchMedia("(hover:hover) and (pointer:fine)").matches){root.current?.querySelector("canvas")?.requestPointerLock?.();}}} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(state.status!=="playing"||(me?.hp??0)<=0)return;look.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={pointerMove} onPointerUp={()=>look.current=null} onPointerCancel={()=>look.current=null}/>
 <header className="crazy-hud"><div className="crazy-brand"><img src="/crazy-battle-logo.webp" alt="Crazy Battle"/><button aria-label="Sair da partida" onClick={onExit}>✕</button></div><strong>⏱ {Math.floor(state.seconds/60).toString().padStart(2,"0")}:{Math.floor(state.seconds%60).toString().padStart(2,"0")}</strong><span>👥 {state.players.filter(p=>p.alive).length}/{state.players.length}</span></header>
 <div className="crazy-crosshair">＋</div>
 {impact&&<div key={impact.key} className={impact.type==="taken"?"crazy-impact-taken":"crazy-impact-dealt"} aria-hidden="true"/>}<div className="crazy-health"><b>♥</b><strong>{me?.hp??0}%</strong><div className="crazy-health-track"><div style={{height:(me?.hp??0)+"%",background:`hsl(${(me?.hp??0)*1.2} 95% 48%)`}}/></div></div>
 <button className="crazy-switch crazy-control" onClick={()=>{send("weapon");}}> {weapon==="sword"?"🏹":"⚔️"} ⇄</button>
 {(me?.hp??0)>0&&<div className="crazy-joystick crazy-control" onPointerDown={joystick} onPointerMove={joystick} onPointerUp={()=>{stick.current=null;input.current.x=0;input.current.z=0;}} onPointerCancel={()=>{stick.current=null;input.current.x=0;input.current.z=0;}}><div/></div>}
 {(me?.hp??0)>0&&<div className="crazy-actions">{weapon==="sword"?<><button className="crazy-control" {...hold("shield")}>🛡️</button><button className="crazy-control" onPointerDown={e=>{e.preventDefault();swingAt.current=performance.now();send("attack");}}>⚔️</button></>:<button className="crazy-control crazy-bow" {...hold("bowStart","bowRelease")} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);chargeStarted.current=performance.now();setCharge(true);send("bowStart");}} onPointerUp={()=>{chargeStarted.current=0;setCharge(false);setChargePower(0);send("bowRelease");}} onPointerCancel={()=>{chargeStarted.current=0;setCharge(false);setChargePower(0);send("bowRelease");}}>🏹 {charge?`${chargePower}%`:""}</button>}<button className="crazy-control crazy-jump" onPointerDown={e=>{e.preventDefault();input.current.jump=true;}}>⬆</button></div>}
 {(me?.hp??0)>0&&state.status==="playing"&&<aside className="crazy-desktop-hints" aria-label="Controles de teclado e mouse"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Mover</span></div><div><kbd>ESPAÇO</kbd><span>Pular</span></div><div><kbd>E</kbd><span>Trocar arma</span></div>{weapon==="sword"&&<div><kbd>Q</kbd><span>Segurar escudo</span></div>}<div><kbd>🖱 1</kbd><span>{weapon==="bow"?"Segure e solte":"Atacar"}</span></div><div><kbd>ESC</kbd><span>Liberar cursor</span></div></aside>}
 {state.status==="playing"&&(me?.hp??0)===0&&<div className="crazy-defeated">Você foi derrotado. Acompanhe a batalha!</div>}
 {state.status==="finished"&&<div className="crazy-result"><h1>{state.winner===id?"Vitória!":"Fim da partida"}</h1><p>{state.players.find(p=>p.id===state.winner)?.name||"Ninguém"} venceu!</p><div className="crazy-results-list">{[...state.players].sort((a,b)=>(b.hp-a.hp)).map(p=><div key={p.id}><span>{p.id===state.winner?"🏆":p.hp===0?"💀":"⚔️"} {p.name}</span><b>{p.hp}%</b></div>)}</div>{state.host===id&&<button onClick={()=>send("start")}>Jogar novamente</button>}<button onClick={onExit}>Sair da sala</button></div>}
 </div>;
}
