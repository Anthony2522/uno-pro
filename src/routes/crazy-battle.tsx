import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CrazyArena } from "@/components/crazy/CrazyArena";
export const Route=createFileRoute("/crazy-battle")({component:CrazyBattle});
function CrazyBattle(){
 const [playing,setPlaying]=useState(false);
 if(playing)return <CrazyArena onExit={()=>setPlaying(false)}/>;
 return <main className="min-h-dvh bg-gradient-to-b from-[#25080b] via-[#7d1c0a] to-[#160c15] text-white px-5 py-12 flex flex-col items-center justify-center gap-7">
 <img src="/crazy-battle-logo.png" alt="Crazy Battle" className="w-full max-w-sm object-contain" onError={e=>{e.currentTarget.style.display="none";}}/>
 <h1 className="text-4xl font-black text-orange-300">CRAZY BATTLE</h1>
 <p className="text-center max-w-md text-orange-100">Arena voxel 3D · espada, escudo e arco. Primeiro teste jogável contra um bot.</p>
 <button className="rounded-2xl bg-gradient-to-r from-red-600 to-orange-400 px-10 py-5 text-xl font-black shadow-lg" onClick={()=>setPlaying(true)}>⚔️ Jogar contra bot</button>
 <p className="text-sm text-orange-200 text-center">Multiplayer e salas online ainda em desenvolvimento.</p>
 <Link to="/" className="rounded-xl border border-orange-300/60 px-8 py-3">← Voltar ao UNO Pro</Link>
 </main>;
}