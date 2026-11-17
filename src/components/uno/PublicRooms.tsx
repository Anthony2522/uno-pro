import { useEffect,useState } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, RefreshCw, Users, WifiOff, Trash2, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";
import { api,type RejoinableRoom } from "@/lib/uno/api";
import { useReadyGuest } from "@/lib/uno/guest";
import { useLanguage } from "@/lib/uno/i18n";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLobby } from "@/lib/uno/useLobby";
import { CardBack } from "./UnoCard";
import { cn } from "@/lib/utils";

export function PublicRooms({ onCreate }: { onCreate: () => void }) {
  const { rooms, offline, refresh } = useLobby();
  const {guest,isDev}=useReadyGuest();
  const {tr,language}=useLanguage();
  const [recoverable,setRecoverable]=useState<RejoinableRoom[]>([]);
  const [tick,setTick]=useState(Date.now());
  useEffect(()=>{
    let active=true;
    const fetchRooms=()=>api.listRejoinableRooms(guest.token).then(data=>{if(active)setRecoverable(data)}).catch(()=>{});
    void fetchRooms();
    const poll=setInterval(fetchRooms,5000);
    const ticker=setInterval(()=>setTick(Date.now()),1000);
    return()=>{active=false;clearInterval(poll);clearInterval(ticker)};
  },[guest.token]);
  const deletePublic=async(code:string,name:string)=>{
    if(!window.confirm(tr("Excluir esta sala pública?")+" "+name))return;
    try{await api.devDeletePublicRoom(guest.token,code);toast.success(tr("Sala excluída"));void refresh()}
    catch(e){toast.error(String((e as Error).message))}
  };

  return (
    <section aria-labelledby="public-rooms-title" className="glass rounded-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 id="public-rooms-title" className="text-lg font-bold sm:text-xl">Salas públicas</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
          <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden /> ao vivo
        </span>
        <Button variant="ghost" size="icon" className="ml-auto rounded-xl" onClick={() => void refresh()} aria-label="Atualizar lista de salas">
          <RefreshCw />
        </Button>
      </div>

      {recoverable.some(r=>!r.recovery_until||new Date(r.recovery_until).getTime()>tick) && (
        <div className="mb-4 space-y-2" aria-label={language==="en"?"Resume a match":"Retomar partidas"}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-cyan"><RotateCcw className="size-4"/>{language==="en"?"Your matches":"Suas partidas para voltar"}</h3>
          {recoverable.filter(r=>!r.recovery_until||new Date(r.recovery_until).getTime()>tick).map(r=>(
            <div key={r.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan/40 bg-cyan/10 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{r.name} <span className="font-mono text-xs text-cyan">{r.code}</span></p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  {r.local_only?(language==="en"?"Offline on this device":"Offline neste aparelho"):r.solo?(language==="en"?"Solo with bots":"Você + bots"):(language==="en"?"Multiplayer":"Multijogador")}
                  {r.recovery_until&&<span className="ml-1 inline-flex items-center gap-1"><Timer className="size-3"/>{Math.ceil((new Date(r.recovery_until).getTime()-tick)/1000)}s</span>}
                </p>
              </div>
              <Button asChild variant="cyan" className="h-10 rounded-xl">
                <Link to="/sala/$code" params={{code:r.code}}>{r.local_only?(language==="en"?"Play offline":"Jogar offline"):(language==="en"?"Resume match":"Retomar partida")}</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
      {offline && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">
          <WifiOff className="size-4" /> Sem conexão com o servidor. Tentando novamente…
        </p>
      )}

      {rooms === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl bg-secondary/50" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-glass-border px-4 py-10 text-center">
          <div className="relative h-20 w-28" aria-hidden>
            <CardBack size="sm" rotate={-14} className="absolute left-4 top-1" />
            <CardBack size="sm" rotate={0} className="absolute left-8 top-0" />
            <CardBack size="sm" rotate={14} className="absolute left-12 top-1" />
          </div>
          <div>
            <p className="font-display font-bold">Nenhuma sala pública aberta agora</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie a sua e chame a galera — ela aparece aqui na hora.</p>
          </div>
          <Button variant="hero" onClick={onCreate} className="h-11 rounded-xl px-6">Criar sala</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rooms.map((r) => {
            const full = r.player_count >= r.max_players;
            const playing = r.status === "playing";
            const state = playing ? (language==="en"?"Match in progress":"Partida em andamento") : (language==="en"?"Match not started":"Partida ainda não começou");
            return (
              <li key={r.code} className="flex items-center gap-3 rounded-2xl border border-glass-border bg-navy/40 p-3 transition-colors hover:border-cyan/30 sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display font-bold">{r.name}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
                        playing ? "bg-warning/15 text-warning" : full ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
                      )}
                    >
                      {state}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1 truncate"><Crown className="size-3.5 text-warning" aria-hidden /> {r.host_name}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Users className="size-3.5" aria-hidden /> {r.player_count}/{r.max_players}
                      <span className="sr-only">jogadores</span>
                    </span>
                  </p>
                </div>
                {isDev&&<Button variant="glass" size="icon" aria-label={`Excluir sala ${r.name}`}
                  title="Excluir sala" onClick={()=>void deletePublic(r.code,r.name)}
                  className="shrink-0 text-destructive hover:bg-destructive/15"><Trash2 className="size-4"/></Button>}
                {!playing && full ? (
                  <Button variant="soft" disabled className="h-11 rounded-xl">Cheia</Button>
                ) : (
                  <Button asChild variant="cyan" className="h-11 rounded-xl px-5">
                    <Link to="/sala/$code" params={{ code: r.code }} aria-label={language==="en"?`Join room ${r.name}`:`Entrar na sala ${r.name}`}>{playing?(language==="en"?"Watch / Waiting queue":"Assistir / Fila de espera"):(language==="en"?"Join":"Entrar")}</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}