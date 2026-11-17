import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CrazyArena } from "@/components/crazy/CrazyArena";
import { CrazyOnlineArena, type MatchState } from "@/components/crazy/CrazyOnlineArena";
export const Route=createFileRoute("/crazy-battle")({component:CrazyBattle});
type PublicRoom={code:string;name:string;players:number;max:number;status:string};
function CrazyBattle(){
 const [offline,setOffline]=useState(false),[name,setName]=useState(()=>localStorage.getItem("crazy-name")||"Jogador"),[roomName,setRoomName]=useState("Arena de fogo"),[privateRoom,setPrivateRoom]=useState(false);
 const [rooms,setRooms]=useState<PublicRoom[]>([]),[code,setCode]=useState(""),[joined,setJoined]=useState(""),[myId,setMyId]=useState(""),[state,setState]=useState<MatchState|null>(null),[error,setError]=useState(""),[connected,setConnected]=useState(false);
 const socket=useRef<WebSocket|null>(null);
 useEffect(()=>{
  let disposed=false, retry:ReturnType<typeof setTimeout>|undefined,attempt=0;
  function connect(){
   if(disposed)return;
   const ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/api/crazy/ws");
   socket.current=ws;
   ws.onopen=()=>{
    setConnected(true);setError("");attempt=0;
    let previous:null|{code:string;id:string;resumeKey:string}=null;
    try{previous=JSON.parse(sessionStorage.getItem("crazy-session")||"null");}catch{}
    if(previous?.resumeKey)ws.send(JSON.stringify({type:"resume",...previous}));
    else{
     ws.send(JSON.stringify({type:"list"}));
     const invitation=new URLSearchParams(location.search).get("room");
     if(invitation)ws.send(JSON.stringify({type:"join",code:invitation,player:localStorage.getItem("crazy-name")||"Jogador"}));
    }
   };
   ws.onmessage=e=>{
    try{
     const msg=JSON.parse(e.data);
     if(msg.type==="rooms")setRooms(msg.rooms);
     if(msg.type==="joined"){
      setJoined(msg.code);setMyId(msg.id);
      sessionStorage.setItem("crazy-session",JSON.stringify({code:msg.code,id:msg.id,resumeKey:msg.resumeKey}));
     }
     if(msg.type==="state")setState(msg);
     if(msg.type==="error"){
      setError(msg.message);
      if(msg.message==="Sessão expirada"){
       sessionStorage.removeItem("crazy-session");setJoined("");setMyId("");setState(null);
      }
     }
    }catch{setError("Erro ao interpretar dados da sala.");}
   };
   ws.onclose=()=>{
    if(disposed)return;
    setConnected(false);setError("Conexão perdida — tentando reconectar...");
    retry=setTimeout(connect,Math.min(1200*2**Math.min(4,++attempt),10000));
   };
  }
  connect();
  return()=>{disposed=true;clearTimeout(retry);socket.current?.close();};
 },[]);
 const send=(type:string,data:Record<string,unknown>={})=>{if(socket.current?.readyState!==WebSocket.OPEN){setError("Servidor indisponível");return;}setError("");socket.current.send(JSON.stringify({type,...data}));};
 const exitRoom=()=>{sessionStorage.removeItem("crazy-session");send("leave");location.assign("/crazy-battle");};
 const join=(code:string)=>{localStorage.setItem("crazy-name",name);send("join",{code,player:name});};
 if(offline)return <CrazyArena onExit={()=>setOffline(false)}/>;
 if(joined&&state&&socket.current){
  if(state.status==="playing"||state.status==="finished")return <CrazyOnlineArena ws={socket.current} id={myId} state={state} onExit={exitRoom}/>;
  return <main className="min-h-dvh bg-gradient-to-b from-[#210b17] to-[#74200b] text-white p-6 flex flex-col items-center justify-center gap-5">
   <h1 className="text-3xl font-black text-orange-300">⚔️ Lobby Crazy Battle</h1><p>Sala <b>{joined}</b> · {state.players.length}/8 participantes</p>
   <button className="rounded-xl bg-white/15 px-5 py-3" onClick={()=>navigator.clipboard?.writeText(location.origin+"/crazy-battle?room="+joined)}>Copiar convite</button>
   <div className="w-full max-w-md rounded-2xl bg-black/40 p-5 space-y-3">{state.players.map(p=><div key={p.id} className="flex justify-between border-b border-white/20 pb-2"><span>{p.bot?"🤖":"👤"} {p.name}</span><span>{p.id===state.host?"👑 Anfitrião":""}</span>{p.bot&&state.host===myId&&<button onClick={()=>send("removeBot",{id:p.id})}>Remover</button>}</div>)}</div>
   {state.host===myId&&<><button className="rounded-xl bg-orange-600 px-8 py-3 font-bold" onClick={()=>send("addBot")}>+ Adicionar bot</button><button className="rounded-xl bg-red-600 px-8 py-4 font-black" onClick={()=>send("start")}>Iniciar partida</button></>}
   {state.host!==myId&&<p>Aguardando o anfitrião iniciar...</p>}
   {error&&<p role="alert" className="text-yellow-200">{error}</p>}
   <button onClick={exitRoom} className="underline">Sair da sala</button>
  </main>;
 }
 return <main className="min-h-dvh bg-gradient-to-b from-[#25080b] via-[#7d1c0a] to-[#160c15] text-white px-5 py-12 flex flex-col items-center gap-7">
 <h1 className="text-5xl font-black text-orange-300 drop-shadow-lg">🔥 CRAZY BATTLE</h1>
 <p className="text-center max-w-md text-orange-100">Combate voxel 3D em primeira pessoa. Crie uma arena, convide amigos ou desafie bots.</p>
 <label className="w-full max-w-md">Seu nome<input maxLength={24} className="mt-2 w-full rounded-xl bg-black/40 p-3" value={name} onChange={e=>setName(e.target.value)}/></label>
 <div className="w-full max-w-md rounded-2xl bg-black/35 p-5 space-y-4"><h2 className="text-xl font-bold">Criar sala online</h2>
 <input className="w-full rounded-xl bg-black/40 p-3" maxLength={36} value={roomName} onChange={e=>setRoomName(e.target.value)}/>
 <label className="flex gap-3 items-center"><input type="checkbox" checked={privateRoom} onChange={e=>setPrivateRoom(e.target.checked)}/> Sala privada (somente por código)</label>
 <button className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-500 p-4 font-black" onClick={()=>{localStorage.setItem("crazy-name",name);send("create",{name:roomName,private:privateRoom,player:name});}}>Criar sala</button></div>
 <div className="w-full max-w-md rounded-2xl bg-black/35 p-5 space-y-3"><h2 className="text-xl font-bold">Entrar por código</h2><div className="flex gap-2"><input placeholder="Código da sala" className="min-w-0 flex-1 rounded-xl bg-black/40 p-3 uppercase" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button className="rounded-xl bg-orange-600 px-4" onClick={()=>join(code)}>Entrar</button></div>
 <h2 className="pt-3 text-xl font-bold">Salas públicas</h2><button className="text-sm underline" onClick={()=>send("list")}>Atualizar lista</button>
 {rooms.length===0?<p className="text-orange-200">Nenhuma sala pública disponível.</p>:rooms.map(r=><div key={r.code} className="flex items-center justify-between gap-3 border-b border-white/20 py-3"><div><strong>{r.name}</strong><p className="text-xs">{r.players}/{r.max} · {r.status==="playing"?"Em andamento":r.status==="finished"?"Encerrada":"Aguardando"}</p></div><button disabled={r.status==="playing"} className="rounded-xl bg-orange-600 px-4 py-2 disabled:opacity-40" onClick={()=>join(r.code)}>Entrar</button></div>)}</div>
 <button className="rounded-xl border border-orange-300/60 px-8 py-3" onClick={()=>setOffline(true)}>⚔️ Treino offline contra bot</button>
 {!connected&&<p className="text-yellow-300">Conectando ao servidor...</p>}{error&&<p role="alert" className="text-yellow-200">{error}</p>}
 <Link to="/" className="rounded-xl border border-orange-300/60 px-8 py-3">← Voltar ao UNO Pro</Link>
 </main>;
}
