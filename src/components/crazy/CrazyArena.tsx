import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./crazy.css";

type Weapon = "sword" | "bow";
type Bot = { mesh: THREE.Group; hp: number; alive: boolean; attackAt: number; position: THREE.Vector3 };
const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function CrazyArena({onExit}:{onExit:()=>void}) {
 const mount=useRef<HTMLDivElement>(null);
 const keys=useRef(new Set<string>());
 const actions=useRef({moveX:0,moveY:0,shield:false,attack:false,jump:false,weapon:"sword" as Weapon,yaw:0,pitch:0});
 const [weapon,setWeapon]=useState<Weapon>("sword"),[hp,setHp]=useState(100),[enemyHp,setEnemyHp]=useState(100),[seconds,setSeconds]=useState(0),[winner,setWinner]=useState("");
 const [charge,setCharge]=useState(0);
 const changeWeapon=()=>{const next=actions.current.weapon==="sword"?"bow":"sword";actions.current.weapon=next;actions.current.attack=false;actions.current.shield=false;setWeapon(next);};
 useEffect(()=>{
  const root=mount.current;if(!root)return;
  const scene=new THREE.Scene();scene.background=new THREE.Color("#351c40");scene.fog=new THREE.Fog("#351c40",15,36);
  const camera=new THREE.PerspectiveCamera(75,root.clientWidth/root.clientHeight,.06,80);
  const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(root.clientWidth,root.clientHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;root.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight("#b8a8ff","#502008",2.3));
  const glow=new THREE.PointLight("#ff6a12",95,18);glow.position.set(0,5,0);scene.add(glow);
  const geo=new THREE.BoxGeometry(1,1,1);
  const mats=["#6b4651","#583b4a","#79515b","#442c3a"].map(c=>new THREE.MeshLambertMaterial({color:c}));
  const lava=new THREE.MeshBasicMaterial({color:"#ff5c0a"});
  const add=(x:number,y:number,z:number,mat:THREE.Material,sx=1,sy=1,sz=1)=>{
   const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);scene.add(mesh);return mesh;
  };
  for(let x=-8;x<8;x++)for(let z=-8;z<8;z++){
   const edge=x===-8||x===7||z===-8||z===7;
   add(x,-.5,z,(x+z)%9===0?lava:mats[(Math.abs(x*13+z*7))%mats.length]);
   if(edge)for(let y=0;y<8;y++)add(x,y+.5,z,mats[(Math.abs(x+y*3+z))%mats.length]);
   if(edge&&((x+z)%4===0))add(x,8.5,z,lava);
  }
  const banner=new THREE.MeshLambertMaterial({color:"#a71916"}),flame=new THREE.MeshBasicMaterial({color:"#ffa300"});
  for(const x of [-5,0,5]){add(x,4,-7.43,banner,1.8,3,.15);add(x,4,-7.31,flame,.45,.9,.08);}
  for(const x of [-5,0,5]){add(x,3.1,-6.9,lava,.35,.45,.4);}
  const skin=new THREE.MeshLambertMaterial({color:"#f5b17f"}),armor=new THREE.MeshLambertMaterial({color:"#bc2923"}),dark=new THREE.MeshLambertMaterial({color:"#33212d"});
  const botGroup=new THREE.Group();scene.add(botGroup);
  function part(parent:THREE.Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material){
   const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);
  }
  part(botGroup,0,1.65,0,.7,.65,.6,skin);part(botGroup,0,1,0,.85,.85,.48,armor);
  for(const x of [-.25,.25])part(botGroup,x,.35,0,.3,.7,.38,dark);
  for(const x of [-.6,.6])part(botGroup,x,1.05,0,.3,.8,.4,armor);
  part(botGroup,0,1.99,0,.8,.22,.65,dark);
  const bot:Bot={mesh:botGroup,hp:100,alive:true,attackAt:0,position:new THREE.Vector3(0,0,-4.8)};
  botGroup.position.copy(bot.position);
  const player=new THREE.Vector3(0,0,4.5);
  let vy=0,ground=true,last=performance.now(),elapsed=0,lastSecond=-1,finished=false,swordAt=0,bowStart=0,arrowObjects:{mesh:THREE.Mesh,velocity:THREE.Vector3,ttl:number}[]=[];
  const swordMat=new THREE.MeshLambertMaterial({color:"#c6c2d0"}),shieldMat=new THREE.MeshLambertMaterial({color:"#71361c"});
  const handSword=new THREE.Mesh(geo,swordMat);handSword.scale.set(.18,.85,.19);scene.add(handSword);
  const handShield=new THREE.Mesh(geo,shieldMat);handShield.scale.set(.75,.95,.18);scene.add(handShield);
  const bow=new THREE.Mesh(geo,shieldMat);bow.scale.set(.12,1.25,.18);scene.add(bow);
  const arrowMat=new THREE.MeshLambertMaterial({color:"#e3c6a0"});
  const hurt=(amount:number)=>{bot.hp=Math.max(0,bot.hp-amount);setEnemyHp(Math.ceil(bot.hp));if(bot.hp===0){bot.alive=false;bot.mesh.visible=false;finished=true;setWinner("Vitória!");}};
  const launch=(power:number)=>{const direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(actions.current.pitch,actions.current.yaw,0,"YXZ"));const mesh=new THREE.Mesh(geo,arrowMat);mesh.scale.set(.09,.09,.55);mesh.position.copy(camera.position).addScaledVector(direction,.65);scene.add(mesh);arrowObjects.push({mesh,velocity:direction.multiplyScalar(7+power*11),ttl:3});};
  const down=(e:KeyboardEvent)=>{keys.current.add(e.code);if(e.code==="Space")actions.current.jump=true;if(e.code==="KeyQ")changeWeapon();if(e.code==="Escape")document.exitPointerLock?.();};
  const up=(e:KeyboardEvent)=>{keys.current.delete(e.code);};
  const mouse=(e:MouseEvent)=>{if(document.pointerLockElement===renderer.domElement){actions.current.yaw-=e.movementX*.0027;actions.current.pitch=clamp(actions.current.pitch-e.movementY*.0027,-1.35,1.35);}};
  const press=(e:MouseEvent)=>{if(e.button===0)actions.current.attack=true;if(e.button===2)actions.current.shield=true;};
  const release=(e:MouseEvent)=>{if(e.button===0)actions.current.attack=false;if(e.button===2)actions.current.shield=false;};
  const context=(e:Event)=>e.preventDefault();
  renderer.domElement.addEventListener("click",()=>{if(matchMedia("(pointer:fine)").matches)renderer.domElement.requestPointerLock?.();});
  window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("mousemove",mouse);
  window.addEventListener("mousedown",press);window.addEventListener("mouseup",release);renderer.domElement.addEventListener("contextmenu",context);
  let frame=0;
  const animate=(now:number)=>{
   frame=requestAnimationFrame(animate);const dt=Math.min(.04,(now-last)/1000);last=now;
   if(!finished){elapsed+=dt;if(Math.floor(elapsed)!==lastSecond){lastSecond=Math.floor(elapsed);setSeconds(lastSecond);}}
   const a=actions.current,k=keys.current;
   if(!finished){
    let mx=a.moveX+(k.has("KeyD")?1:0)-(k.has("KeyA")?1:0),mz=-a.moveY+(k.has("KeyS")?1:0)-(k.has("KeyW")?1:0);
    const length=Math.hypot(mx,mz)||1;mx/=length;mz/=length;
    const sin=Math.sin(a.yaw),cos=Math.cos(a.yaw);
    player.x=clamp(player.x+(mx*cos+mz*sin)*4*dt,-6.9,6.9);
    player.z=clamp(player.z+(-mx*sin+mz*cos)*4*dt,-6.9,6.9);
    if(a.jump&&ground){vy=5.3;ground=false;}a.jump=false;
    vy-=15*dt;player.y+=vy*dt;if(player.y<=0){player.y=0;vy=0;ground=true;}
    const dist=bot.position.distanceTo(new THREE.Vector3(player.x,0,player.z));
    if(bot.alive){
     if(dist>1.5){const dir=new THREE.Vector3(player.x-bot.position.x,0,player.z-bot.position.z).normalize();bot.position.addScaledVector(dir,dt*1.25);bot.mesh.position.copy(bot.position);}
     bot.mesh.rotation.y=Math.atan2(player.x-bot.position.x,player.z-bot.position.z);
     if(dist<1.8&&now-bot.attackAt>1100){bot.attackAt=now;const toBot=new THREE.Vector3(bot.position.x-player.x,0,bot.position.z-player.z).normalize();const facing=new THREE.Vector3(-Math.sin(a.yaw),0,-Math.cos(a.yaw));const blocked=a.shield&&a.weapon==="sword"&&facing.dot(toBot)>.2;setHp(h=>{const next=Math.max(0,h-(blocked?2:15));if(next===0){finished=true;setWinner("Derrota");}return next;});}
    }
    if(a.weapon==="sword"&&a.attack&&!a.shield&&now-swordAt>620){swordAt=now;if(bot.alive&&dist<2.5){const dir=new THREE.Vector3(bot.position.x-player.x,0,bot.position.z-player.z).normalize();const forward=new THREE.Vector3(-Math.sin(a.yaw),0,-Math.cos(a.yaw));if(forward.dot(dir)>.35)hurt(20);}a.attack=false;}
    if(a.weapon==="bow"){if(a.attack){if(!bowStart)bowStart=now;setCharge(Math.min(100,Math.floor((now-bowStart)/12)));}else if(bowStart){launch(clamp((now-bowStart)/1200,0,1));bowStart=0;setCharge(0);}}else bowStart=0;
    for(const ar of [...arrowObjects]){ar.mesh.position.addScaledVector(ar.velocity,dt);ar.velocity.y-=9*dt;ar.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),ar.velocity.clone().normalize());ar.ttl-=dt;
     if(bot.alive&&ar.mesh.position.distanceTo(bot.position.clone().add(new THREE.Vector3(0,1,0)))<.8){hurt(12);ar.ttl=0;}
     if(ar.ttl<=0||ar.mesh.position.y<0||Math.abs(ar.mesh.position.x)>7.5||Math.abs(ar.mesh.position.z)>7.5){scene.remove(ar.mesh);ar.mesh.geometry.dispose();arrowObjects=arrowObjects.filter(item=>item!==ar);}
    }
   }
   camera.position.set(player.x,player.y+1.65,player.z);camera.rotation.order="YXZ";camera.rotation.y=a.yaw;camera.rotation.x=a.pitch;
   const positionHand=(mesh:THREE.Mesh,x:number,y:number,z:number)=>{mesh.position.copy(camera.localToWorld(new THREE.Vector3(x,y,z)));mesh.quaternion.copy(camera.quaternion);};
   handSword.visible=a.weapon==="sword";handShield.visible=a.weapon==="sword";bow.visible=a.weapon==="bow";
   positionHand(handSword,.58,-.5,-.95);handSword.rotation.z-=now-swordAt<210?Math.sin((now-swordAt)/210*Math.PI)*.8:0;
   positionHand(handShield,-.65,a.shield?-.28:-.8,-.85);positionHand(bow,.65,-.4,-1);
   renderer.render(scene,camera);
  };frame=requestAnimationFrame(animate);
  const resize=new ResizeObserver(()=>{camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();renderer.setSize(root.clientWidth,root.clientHeight);});resize.observe(root);
  return ()=>{cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("mousemove",mouse);window.removeEventListener("mousedown",press);window.removeEventListener("mouseup",release);renderer.domElement.removeEventListener("contextmenu",context);renderer.dispose();scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();}});root.removeChild(renderer.domElement);};
 },[]);
 const look=useRef<{id:number,x:number,y:number}|null>(null);
 const stick=useRef<number|null>(null);
 const joystick=(e:React.PointerEvent<HTMLDivElement>)=>{if(stick.current!==null&&stick.current!==e.pointerId)return;stick.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();actions.current.moveX=clamp((e.clientX-r.left-r.width/2)/(r.width*.4),-1,1);actions.current.moveY=clamp((r.height/2-(e.clientY-r.top))/(r.height*.4),-1,1);};
 const clearStick=()=>{stick.current=null;actions.current.moveX=0;actions.current.moveY=0;};
 const lookMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!look.current||look.current.id!==e.pointerId)return;actions.current.yaw-=(e.clientX-look.current.x)*.004;actions.current.pitch=clamp(actions.current.pitch-(e.clientY-look.current.y)*.004,-1.35,1.35);look.current.x=e.clientX;look.current.y=e.clientY;};
 const hold=(key:"shield"|"attack")=>({onPointerDown:(e:React.PointerEvent)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);actions.current[key]=true;},onPointerUp:()=>{actions.current[key]=false;},onPointerCancel:()=>{actions.current[key]=false;}});
 return <div className="crazy-game">
  <div className="crazy-canvas" ref={mount}/>
  <div className="crazy-look" onPointerDown={e=>{look.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={lookMove} onPointerUp={()=>look.current=null} onPointerCancel={()=>look.current=null}/>
  <header className="crazy-hud"><button onClick={onExit}>← Sair</button><strong>⏱ {String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</strong><span>👥 {hp>0?1:0}/{enemyHp>0?2:1}</span></header>
  {enemyHp>0&&<div className="crazy-enemy-hp">Bot Guerreiro <span>{enemyHp}%</span><div style={{width:enemyHp+"%"}}/></div>}
  <div className="crazy-crosshair">＋</div>
  <div className="crazy-health"><b>♥</b><strong>{hp}%</strong><div className="crazy-health-track"><div style={{height:hp+"%",background:`hsl(${hp*1.2} 95% 48%)`}}/></div></div>
  <button className="crazy-switch crazy-control" onClick={changeWeapon}>{weapon==="sword"?"🏹":"⚔️"} ⇄</button>
  <div className="crazy-joystick crazy-control" onPointerDown={joystick} onPointerMove={joystick} onPointerUp={clearStick} onPointerCancel={clearStick}><div/></div>
  <div className="crazy-actions">{weapon==="sword"?<><button className="crazy-control" {...hold("shield")}>🛡️</button><button className="crazy-control" {...hold("attack")}>⚔️</button></>:<button className="crazy-control crazy-bow" {...hold("attack")}>🏹 {charge>0?`${charge}%`:""}</button>}<button className="crazy-control crazy-jump" onPointerDown={e=>{e.preventDefault();actions.current.jump=true;}}>⬆</button></div>
  {winner&&<div className="crazy-result"><h1>{winner}</h1><p>{winner==="Vitória!"?"Você derrotou o bot!":"O bot venceu esta rodada."}</p><button onClick={()=>location.reload()}>Jogar novamente</button><button onClick={onExit}>Voltar</button></div>}
 </div>;
}
