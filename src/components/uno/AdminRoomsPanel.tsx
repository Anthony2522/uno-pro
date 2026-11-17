import {useCallback,useEffect,useState} from "react";
import {ShieldCheck,Trash2,RefreshCw,Lock,Globe} from "lucide-react";
import {toast} from "sonner";
import {api} from "@/lib/uno/api";
import {useReadyGuest} from "@/lib/uno/guest";
import {Button} from "@/components/ui/button";

type AdminRoom=Awaited<ReturnType<typeof api.adminListRooms>>[number];

/** Tony-only dashboard; list and removal are separately authorized server-side. */
export function AdminRoomsPanel(){
  const {guest,isDev}=useReadyGuest();
  const [rooms,setRooms]=useState<AdminRoom[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    try{const rows=await api.adminListRooms(guest.token);setRooms(rows);setError("");}
    catch(e){setError((e as Error).message);}
  },[guest.token]);
  useEffect(()=>{
    if(!isDev)return;
    void refresh();
    const id=setInterval(()=>void refresh(),7000);
    return()=>clearInterval(id);
  },[isDev,refresh]);
  if(!isDev)return null;
  const remove=async(room:AdminRoom)=>{
    if(!window.confirm(`Encerrar e excluir definitivamente a sala "${room.name}" (${room.code})? Todos os jogadores serão removidos.`))return;
    setBusy(room.code);
    try{await api.adminDeleteRoom(guest.token,room.code);toast.success(`Sala ${room.code} excluída`);await refresh();}
    catch(e){toast.error((e as Error).message)}
    finally{setBusy(null)}
  };
  return <section className="mt-8 rounded-3xl border border-cyan/40 bg-navy/70 p-4 shadow-glow-cyan sm:p-6" aria-label="Administração de salas">
    <div className="mb-3 flex items-center gap-3">
      <ShieldCheck className="size-6 text-cyan"/>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-black">Painel do administrador</h2>
        <p className="text-xs text-muted-foreground">Todas as salas hospedadas no servidor, inclusive privadas e em andamento.</p>
      </div>
      <Button size="icon" variant="glass" aria-label="Atualizar salas" onClick={()=>void refresh()}>
        <RefreshCw className="size-4"/>
      </Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-destructive/15 p-3 text-sm text-destructive">{error}</p>}
    {!rooms.length&&!error&&<p className="py-5 text-center text-sm text-muted-foreground">Não há salas no servidor.</p>}
    <ul className="max-h-96 space-y-2 overflow-y-auto">
      {rooms.map(room=><li key={room.code} className="flex items-center gap-3 rounded-xl border border-glass-border bg-navy/60 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{room.name} <span className="font-mono text-xs text-cyan">{room.code}</span></p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">{room.is_public?<Globe className="size-3"/>:<Lock className="size-3"/>}{room.is_public?"Pública":"Privada"}</span>
            <span>{room.status==="playing"?"Em jogo":"Aguardando"}</span>
            <span>{room.player_count}/{room.max_players} jogadores</span>
            <span>Host: {room.host_name}</span>
          </p>
        </div>
        <Button size="icon" variant="glass" disabled={busy!==null} aria-label={`Excluir sala ${room.code}`}
          onClick={()=>void remove(room)} className="shrink-0 text-destructive hover:bg-destructive/20">
          <Trash2 className="size-4"/>
        </Button>
      </li>)}
    </ul>
    <p className="mt-3 text-xs text-muted-foreground">Partidas offline ficam apenas nos aparelhos dos jogadores e não aparecem neste painel.</p>
  </section>;
}
