import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./crazy.css";
import { createCrazyWorld } from "./world";
import { makeCrazyVisuals } from "./visuals";
import { crazyPixelRatio, crazyShouldRender } from "./performance";

type Weapon = "sword" | "bow";
type Bot = { mesh: THREE.Group; hp: number; alive: boolean; attackAt: number; jumpAt: number; vy: number; position: THREE.Vector3 };
const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function CrazyArena({onExit}:{onExit:()=>void}){
 const [round,setRound]=useState(0);
 return <CrazyArenaRound key={round} onExit={onExit} onRestart={()=>setRound(v=>v+1)}/>;
}
function CrazyArenaRound({onExit,onRestart}:{onExit:()=>void;onRestart:()=>void}) {
 const mount=useRef<HTMLDivElement>(null);
 const keys=useRef(new Set<string>());
 const ended=useRef(false);
 const actions=useRef({moveX:0,moveY:0,shield:false,attack:false,jump:false,weapon:"sword" as Weapon,yaw:0,pitch:0});
 const [weapon,setWeapon]=useState<Weapon>("sword"),[hp,setHp]=useState(100),[enemyHp,setEnemyHp]=useState(100),[seconds,setSeconds]=useState(0),[winner,setWinner]=useState("");
 const [charge,setCharge]=useState(0);
 useEffect(()=>{if(!winner)return;const target=document.pointerLockElement;if(target&&mount.current?.contains(target))document.exitPointerLock?.();},[winner]);
 const changeWeapon=()=>{if(ended.current)return;const next=actions.current.weapon==="sword"?"bow":"sword";actions.current.weapon=next;actions.current.attack=false;actions.current.shield=false;setWeapon(next);};
 useEffect(()=>{
  const root=mount.current;if(!root)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color("#351c40");scene.fog=new THREE.Fog("#351c40",15,36);
  const camera=new THREE.PerspectiveCamera(75,root.clientWidth/root.clientHeight,.06,80);
  const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(crazyPixelRatio(root.clientWidth,root.clientHeight,devicePixelRatio));renderer.setSize(root.clientWidth,root.clientHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;root.appendChild(renderer.domElement);
  const cleanupWorld=createCrazyWorld(scene);
  const geo=new THREE.BoxGeometry(1,1,1);
  const visuals=makeCrazyVisuals();
   const botRig=visuals.createWarrior("blue");const botGroup=botRig.group;scene.add(botGroup);
   const labelCanvas=document.createElement("canvas");labelCanvas.width=320;labelCanvas.height=82;
  const labelTexture=new THREE.CanvasTexture(labelCanvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
  const labelSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture,depthTest:true}));
  labelSprite.position.set(0,2.55,0);labelSprite.scale.set(2.3,.6,1);botGroup.add(labelSprite);
  const drawBotLife=(health:number)=>{
    const ctx=labelCanvas.getContext("2d");if(!ctx)return;
    ctx.clearRect(0,0,320,82);ctx.fillStyle="#1d0d1cd8";ctx.fillRect(10,2,300,75);
    ctx.fillStyle="#fff";ctx.font="bold 23px sans-serif";ctx.textAlign="center";ctx.fillText("Bot Guerreiro",160,27);
    ctx.fillStyle="#240b0f";ctx.fillRect(24,42,272,26);
    ctx.fillStyle="hsl("+health*1.2+" 95% 48%)";ctx.fillRect(24,42,272*health/100,26);
    ctx.fillStyle="#fff";ctx.font="bold 21px sans-serif";ctx.fillText(health+"%",160,63);
    labelTexture.needsUpdate=true;
  };drawBotLife(100);
  const bot:Bot={mesh:botGroup,hp:100,alive:true,attackAt:0,jumpAt:performance.now()+2600,vy:0,position:new THREE.Vector3(0,0,-4.8)};
  botGroup.position.copy(bot.position);
  const player=new THREE.Vector3(0,0,4.5);
  let vy=0,moveVX=0,moveVZ=0,ground=true,last=performance.now(),lastRendered=0,elapsed=0,lastSecond=-1,finished=false,swordAt=-10000,bowStart=0,lastCharge=-1,arrowObjects:{mesh:THREE.Mesh,velocity:THREE.Vector3,ttl:number}[]=[];
  const view=visuals.createViewWeapons(camera,"red");scene.add(camera);
   const arrowMat=new THREE.MeshLambertMaterial({color:"#e3c6a0"});
  const finish=(result:string)=>{if(finished)return;finished=true;ended.current=true;actions.current.attack=false;actions.current.shield=false;keys.current.clear();const locked=document.pointerLockElement;if(locked&&root.contains(locked))document.exitPointerLock?.();setWinner(result);};
  const hurt=(amount:number)=>{bot.hp=Math.max(0,bot.hp-amount);setEnemyHp(Math.ceil(bot.hp));drawBotLife(Math.ceil(bot.hp));if(bot.hp===0){bot.alive=false;bot.mesh.visible=false;finish("Vitória!");}};
  const launch=(power:number)=>{const direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(actions.current.pitch,actions.current.yaw,0,"YXZ"));const mesh=new THREE.Mesh(geo,arrowMat);mesh.scale.set(.09,.09,.55);mesh.position.copy(camera.position).addScaledVector(direction,.65);scene.add(mesh);arrowObjects.push({mesh,velocity:direction.multiplyScalar(7+power*11),ttl:3});};
  const down=(e:KeyboardEvent)=>{
    if(finished)return;
    if(["Space","KeyE","KeyQ"].includes(e.code))e.preventDefault();
    keys.current.add(e.code);
    if(e.code==="Space"&&!e.repeat)actions.current.jump=true;
    if(e.code==="KeyE"&&!e.repeat)changeWeapon();
    if(e.code==="KeyQ")actions.current.shield=actions.current.weapon==="sword";
    if(e.code==="Escape"&&document.pointerLockElement)document.exitPointerLock?.();
   };
   const up=(e:KeyboardEvent)=>{keys.current.delete(e.code);if(e.code==="KeyQ")actions.current.shield=false;};
   const clearKeys=()=>{keys.current.clear();actions.current.shield=false;actions.current.attack=false;};
   const mouse=(e:MouseEvent)=>{if(!finished&&document.pointerLockElement===renderer.domElement){actions.current.yaw-=e.movementX*.0027;actions.current.pitch=clamp(actions.current.pitch-e.movementY*.0027,-1.35,1.35);}};
   const press=(e:MouseEvent)=>{if(finished||document.pointerLockElement!==renderer.domElement)return;if(e.button===0)actions.current.attack=true;if(e.button===2&&actions.current.weapon==="sword")actions.current.shield=true;};
   const release=(e:MouseEvent)=>{if(e.button===0)actions.current.attack=false;if(e.button===2)actions.current.shield=false;};
   const context=(e:Event)=>e.preventDefault();
   const lockOnPlay=()=>{if(!finished&&matchMedia("(hover:hover) and (pointer:fine)").matches)renderer.domElement.requestPointerLock?.();};
   renderer.domElement.addEventListener("click",lockOnPlay);
   window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",clearKeys);window.addEventListener("mousemove",mouse);
   window.addEventListener("mousedown",press);window.addEventListener("mouseup",release);renderer.domElement.addEventListener("contextmenu",context);
   let frame=0;
  const animate=(now:number)=>{
   frame=requestAnimationFrame(animate);
   if(!crazyShouldRender(now,lastRendered)||document.hidden)return;
   lastRendered=now;const dt=Math.min(.04,(now-last)/1000);last=now;
   if(finished){const locked=document.pointerLockElement;if(locked&&root.contains(locked))document.exitPointerLock?.();}
   if(!finished){elapsed+=dt;if(Math.floor(elapsed)!==lastSecond){lastSecond=Math.floor(elapsed);setSeconds(lastSecond);}}
   const a=actions.current,k=keys.current;
   if(!finished){
    let mx=a.moveX+(k.has("KeyD")?1:0)-(k.has("KeyA")?1:0),mz=-a.moveY+(k.has("KeyS")?1:0)-(k.has("KeyW")?1:0);
    const length=Math.hypot(mx,mz)||1;mx/=length;mz/=length;
    const sin=Math.sin(a.yaw),cos=Math.cos(a.yaw);
    // Minecraft-like responsive acceleration and ground friction, with no diagonal speed boost.
    const desiredX=(mx*cos+mz*sin)*4.0,desiredZ=(-mx*sin+mz*cos)*4.0;
    const traction=Math.min(1,dt*((Math.abs(mx)+Math.abs(mz))>0?17:25));
    moveVX+=(desiredX-moveVX)*traction;moveVZ+=(desiredZ-moveVZ)*traction;
    player.x=clamp(player.x+moveVX*dt,-6.1,6.1);
    player.z=clamp(player.z+moveVZ*dt,-6.1,6.1);
    if(a.jump&&ground){vy=5.3;ground=false;}a.jump=false;
    vy-=15*dt;player.y+=vy*dt;if(player.y<=0){player.y=0;vy=0;ground=true;}
    const dist=bot.position.distanceTo(new THREE.Vector3(player.x,0,player.z));
    if(bot.alive){
     if(dist>1.55){
       const deltaX=player.x-bot.position.x,deltaZ=player.z-bot.position.z;
       const d=Math.max(.01,Math.hypot(deltaX,deltaZ));
       bot.position.x=clamp(bot.position.x+deltaX/d*dt*2.25,-6.1,6.1);
       bot.position.z=clamp(bot.position.z+deltaZ/d*dt*2.25,-6.1,6.1);
     }
     // Both the collision and the animated body honor the 2-block character height.
     if(now>bot.jumpAt && dist>1.65 && bot.position.y<=.01){
       bot.vy=5.3;bot.jumpAt=now+3000+Math.random()*2000;
     }
     bot.vy-=15*dt;bot.position.y=Math.max(0,bot.position.y+bot.vy*dt);
     if(bot.position.y===0)bot.vy=0;
     bot.mesh.position.copy(bot.position);
     const faceX=player.x-bot.position.x,faceZ=player.z-bot.position.z;
     bot.mesh.rotation.y=Math.atan2(-faceX,-faceZ);
     const botWeapon=dist>3.4?"bow":"sword";
     botRig.setEquipment(botWeapon,false);
     botRig.animate(now,dist>1.55,now-bot.attackAt,false,botWeapon);
          if(dist<1.8&&now-bot.attackAt>1100){bot.attackAt=now;const toBot=new THREE.Vector3(bot.position.x-player.x,0,bot.position.z-player.z).normalize();const facing=new THREE.Vector3(-Math.sin(a.yaw),0,-Math.cos(a.yaw));const blocked=a.shield&&a.weapon==="sword"&&facing.dot(toBot)>.2;setHp(h=>{const next=Math.max(0,h-(blocked?2:15));if(next===0)finish("Derrota");return next;});}
    }
    if(a.weapon==="sword"&&a.attack&&!a.shield&&now-swordAt>620){swordAt=now;if(bot.alive&&dist<2.5){const dir=new THREE.Vector3(bot.position.x-player.x,0,bot.position.z-player.z).normalize();const forward=new THREE.Vector3(-Math.sin(a.yaw),0,-Math.cos(a.yaw));if(forward.dot(dir)>.35)hurt(20);}a.attack=false;}
    if(a.weapon==="bow"){if(a.attack){if(!bowStart)bowStart=now;const nextCharge=Math.min(100,Math.floor((now-bowStart)/60)*5);if(nextCharge!==lastCharge){lastCharge=nextCharge;setCharge(nextCharge);}}else if(bowStart){launch(clamp((now-bowStart)/1200,0,1));bowStart=0;lastCharge=-1;setCharge(0);}}else bowStart=0;
    for(const ar of [...arrowObjects]){ar.mesh.position.addScaledVector(ar.velocity,dt);ar.velocity.y-=9*dt;ar.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),ar.velocity.clone().normalize());ar.ttl-=dt;
     if(bot.alive&&ar.mesh.position.distanceTo(bot.position.clone().add(new THREE.Vector3(0,1,0)))<.8){hurt(12);ar.ttl=0;}
     if(ar.ttl<=0||ar.mesh.position.y<0||Math.abs(ar.mesh.position.x)>7.5||Math.abs(ar.mesh.position.z)>7.5){scene.remove(ar.mesh);ar.mesh.geometry.dispose();arrowObjects=arrowObjects.filter(item=>item!==ar);}
    }
   }
   camera.position.set(player.x,player.y+1.65,player.z);camera.rotation.order="YXZ";camera.rotation.y=a.yaw;camera.rotation.x=a.pitch;
   view.setWeapon(a.weapon,a.shield);view.animate(now,now-swordAt,bowStart?Math.min(1,(now-bowStart)/1200):0,Math.hypot(moveVX,moveVZ)>.12);
   renderer.render(scene,camera);
  };frame=requestAnimationFrame(animate);
  const resize=new ResizeObserver(()=>{camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(crazyPixelRatio(root.clientWidth,root.clientHeight,devicePixelRatio));renderer.setSize(root.clientWidth,root.clientHeight);});resize.observe(root);
  return ()=>{cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",clearKeys);window.removeEventListener("mousemove",mouse);window.removeEventListener("mousedown",press);window.removeEventListener("mouseup",release);renderer.domElement.removeEventListener("contextmenu",context);renderer.domElement.removeEventListener("click",lockOnPlay);if(document.pointerLockElement===renderer.domElement)document.exitPointerLock?.();renderer.dispose();cleanupWorld();visuals.dispose();labelTexture.dispose();labelSprite.material.dispose();geo.dispose();arrowMat.dispose();root.removeChild(renderer.domElement);};
 },[]);
 const look=useRef<{id:number,x:number,y:number}|null>(null);
 const stick=useRef<number|null>(null);
 const joystick=(e:React.PointerEvent<HTMLDivElement>)=>{if(stick.current!==null&&stick.current!==e.pointerId)return;stick.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();actions.current.moveX=clamp((e.clientX-r.left-r.width/2)/(r.width*.4),-1,1);actions.current.moveY=clamp((r.height/2-(e.clientY-r.top))/(r.height*.4),-1,1);};
 const clearStick=()=>{stick.current=null;actions.current.moveX=0;actions.current.moveY=0;};
 const lookMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!look.current||look.current.id!==e.pointerId)return;actions.current.yaw-=(e.clientX-look.current.x)*.004;actions.current.pitch=clamp(actions.current.pitch-(e.clientY-look.current.y)*.004,-1.35,1.35);look.current.x=e.clientX;look.current.y=e.clientY;};
 const hold=(key:"shield"|"attack")=>({onPointerDown:(e:React.PointerEvent)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);actions.current[key]=true;},onPointerUp:()=>{actions.current[key]=false;},onPointerCancel:()=>{actions.current[key]=false;}});
 return <div className="crazy-game">
  <div className="crazy-canvas" ref={mount}/>
  <div className="crazy-look" onClick={()=>{if(!ended.current&&!winner&&matchMedia("(hover:hover) and (pointer:fine)").matches)mount.current?.querySelector("canvas")?.requestPointerLock?.();}} onPointerDown={e=>{if(ended.current||!!winner)return;look.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={lookMove} onPointerUp={()=>look.current=null} onPointerCancel={()=>look.current=null}/>
  <header className="crazy-hud"><div className="crazy-brand"><img src="/crazy-battle-logo.webp" alt="Crazy Battle"/><button aria-label="Sair do treino" onClick={onExit}>✕</button></div><strong>⏱ {String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</strong><span>👥 {hp>0?1:0}/{enemyHp>0?2:1}</span></header>
  <span className="sr-only">Vida do bot: {enemyHp}%</span>
  <div className="crazy-crosshair">＋</div>
  <div className="crazy-health"><b>♥</b><strong>{hp}%</strong><div className="crazy-health-track"><div style={{height:hp+"%",background:`hsl(${hp*1.2} 95% 48%)`}}/></div></div>
  <button className="crazy-switch crazy-control" onClick={changeWeapon}>{weapon==="sword"?"🏹":"⚔️"} ⇄</button>
  <div className="crazy-joystick crazy-control" onPointerDown={joystick} onPointerMove={joystick} onPointerUp={clearStick} onPointerCancel={clearStick}><div/></div>
  <div className="crazy-actions">{weapon==="sword"?<><button className="crazy-control" {...hold("shield")}>🛡️</button><button className="crazy-control" {...hold("attack")}>⚔️</button></>:<button className="crazy-control crazy-bow" {...hold("attack")}>🏹 {charge>0?`${charge}%`:""}</button>}<button className="crazy-control crazy-jump" onPointerDown={e=>{e.preventDefault();actions.current.jump=true;}}>⬆</button></div>
  {!winner&&<aside className="crazy-desktop-hints" aria-label="Atalhos de teclado e mouse"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Mover</span></div><div><kbd>ESPAÇO</kbd><span>Pular</span></div><div><kbd>E</kbd><span>Trocar arma</span></div>{weapon==="sword"&&<div><kbd>Q</kbd><span>Segurar escudo</span></div>}<div><kbd>🖱 1</kbd><span>{weapon==="bow"?"Segure e solte":"Atacar"}</span></div><div><kbd>ESC</kbd><span>Soltar cursor</span></div></aside>}
   {winner&&<div className="crazy-result"><h1>{winner}</h1><p>{winner==="Vitória!"?"Você derrotou o bot!":"O bot venceu esta rodada."}</p><button onClick={onRestart}>Jogar novamente</button><button onClick={onExit}>Voltar</button></div>}
 </div>;
}
