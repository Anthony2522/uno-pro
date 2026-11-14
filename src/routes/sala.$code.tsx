import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Ban, Bomb, Loader2, Repeat2, Scissors, Megaphone, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/uno/AppHeader";
import { GameTable, type GameActions } from "@/components/uno/GameTable";
import { ConnectionBanner, CopyInviteButton, LeaveButton } from "@/components/uno/RoomTopBar";
import { WaitingRoom } from "@/components/uno/WaitingRoom";
import { WinnerOverlay } from "@/components/uno/WinnerOverlay";
import { Button } from "@/components/ui/button";
import { api, type GameState, type RuleSettings } from "@/lib/uno/api";
import { errorMessage, toGameError } from "@/lib/uno/errors";
import { sfx } from "@/lib/uno/sound";
import { useRoom } from "@/lib/uno/useRoom";

export const Route = createFileRoute("/sala/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Sala ${params.code.toUpperCase()} — UNO Pro` },
      { name: "description", content: "Você foi convidado para uma partida de UNO Pro. Entre com seu apelido e jogue em tempo real." },
      { property: "og:title", content: `Bora jogar UNO? Sala ${params.code.toUpperCase()}` },
      { property: "og:description", content: "Clique para entrar na sala e jogar UNO com os amigos — sem cadastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { code: rawCode } = Route.useParams();
  const code = rawCode.toUpperCase();
  const navigate = useNavigate();
  const { state, fatal, connection, refresh, leave, token } = useRoom(code);
  const [busy, setBusy] = useState(false);
  const [dismissedRound, setDismissedRound] = useState<number | null>(null);
  const [specialEffect,setSpecialEffect] = useState<GameState["effects"][number]|null>(null);
  const lastEffectId = useRef<number|null>(null);
  const lastEffectRound = useRef<number|null>(null);
  const specialTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const prev = useRef<{ seq: number; turn: string | null; status: string | null; members: number } | null>(null);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        sfx("error");
        toast.error(errorMessage(e));
      } finally {
        setBusy(false);
        void refresh();
      }
    },
    [refresh],
  );

  // Every special card event is queued; spectators see all effects, including fast combos.
  const effectQueue=useRef<GameState["effects"]>([]);
  const effectShowing=useRef(false);
  const showNextEffect=useCallback(()=>{
    const event=effectQueue.current.shift();
    if(!event){effectShowing.current=false;setSpecialEffect(null);return;}
    effectShowing.current=true;
    setSpecialEffect(event);
    sfx(event.type==="color_wave"?"wild":event.type);
    if(specialTimer.current)clearTimeout(specialTimer.current);
    specialTimer.current=setTimeout(showNextEffect,5000);
  },[]);
  useEffect(()=>{
    const events=state?.game?.effects;
    const round=state?.game?.round ?? null;
    if(round!==lastEffectRound.current){
      lastEffectRound.current=round;
      lastEffectId.current=events?.at(-1)?.id ?? 0;
      effectQueue.current=[];
      effectShowing.current=false;
      setSpecialEffect(null);
      if(specialTimer.current)clearTimeout(specialTimer.current);
      return;
    }
    if(!events?.length)return;
    const currentMax=events.at(-1)?.id ?? 0;
    const next=events.filter(e=>e.id>(lastEffectId.current??0));
    lastEffectId.current=currentMax;
    if(next.length){
      effectQueue.current.push(...next);
      if(!effectShowing.current)showNextEffect();
    }
  },[state?.game?.effects,state?.game?.round,showNextEffect]);
  useEffect(()=>()=>{if(specialTimer.current)clearTimeout(specialTimer.current);},[]);

  // Sounds on state transitions.
  useEffect(() => {
    if (!state) return;
    const g = state.game;
    const p = prev.current;
    const cur = { seq: g?.seq ?? -1, turn: g?.current_player ?? null, status: g?.status ?? null, members: state.members.length };
    if (p) {
      if (cur.members > p.members) sfx("join");
      if (g && cur.seq !== p.seq) {
        const a = g.last_action;
        if (g.status === "finished" && p.status === "playing") sfx("win");
        else if (a?.type === "play" || a?.type === "cut") {
          if(a.card && !["W","W4","W5"].includes(a.card) && !["R","S","D"].includes(a.card.slice(1)))sfx("play");
        }
        else if (a?.type === "draw" || a?.type === "auto_draw" || a?.type === "draw_pass" || a?.type === "catch") sfx("draw");
        if (g.status === "playing" && cur.turn === state.me && p.turn !== state.me) setTimeout(() => sfx("turn"), 180);
        if (a?.target === state.me && a.n) toast(`${a.name} fez você comprar ${a.n}!`);
      }
    }
    prev.current = cur;
  }, [state]);

  const doLeave = async () => {
    await leave();
    navigate({ to: "/" });
  };

  if (fatal) {
    const gameStarted = fatal.code === "GAME_STARTED";
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <main className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-8" />
          </div>
          <h1 className="mt-5 text-2xl font-black">
            {fatal.code === "ROOM_NOT_FOUND" ? "Sala não encontrada" : fatal.code === "ROOM_FULL" ? "Sala cheia" : gameStarted ? "Partida em andamento" : "Não foi possível entrar"}
          </h1>
          <p className="mt-2 text-muted-foreground">{fatal.message}</p>
          <div className="mt-6 flex gap-2">
            <Button asChild variant="hero" className="h-12 rounded-xl px-6"><Link to="/">Voltar ao início</Link></Button>
            {(gameStarted || fatal.code === "ROOM_FULL") && (
              <Button variant="glass" className="h-12 rounded-xl" onClick={() => window.location.reload()}>Tentar de novo</Button>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-dvh">
        <AppHeader />
        <ConnectionBanner show={connection === "reconnecting"} />
        <div className="flex flex-col items-center gap-3 pt-24 text-muted-foreground" role="status">
          <Loader2 className="size-8 animate-spin text-cyan" />
          Entrando na sala {code}…
        </div>
      </div>
    );
  }

  const g = state.game;
  const playing = state.room.status === "playing" && g?.status === "playing";
  const isHost = state.room.host_id === state.me;
  const finished = g?.status === "finished";
  const winner = finished && g.winner_id ? state.members.find((m) => m.id === g.winner_id) : undefined;
  const winnerName = winner?.nickname ?? (g?.winner_id ? "Alguém" : "");
  const showWinner = !!(finished && g.winner_id && dismissedRound !== g.round);

  const actions: GameActions = {
    play: (card, color, targetId) => act(() => api.playCard(token, code, card, color, targetId)),
    draw: () =>
      act(async () => {
        const r = await api.drawCard(token, code);
        sfx("draw");
        if (r.auto_passed) toast("Sem jogada possível: você comprou e a vez passou automaticamente.");
        else if (r.card) toast("Carta comprada. Você pode jogar qualquer carta compatível.");
        if (!r.card) toast("O baralho acabou.");
      }),
    end: () => act(() => api.endTurn(token, code)),
    accept: () => act(() => api.acceptDraw(token, code)),
    pressNine: () => act(() => api.pressNine(token, code)),
    uno: () => act(() => api.callUno(token, code)),
    catchUno: () => act(() => api.catchUno(token, code)),
  };
  const start = () =>
    act(async () => {
      try {
        await api.startGame(token, code);
        setDismissedRound(null);
      } catch (e) {
        throw toGameError(e);
      }
    });

  return (
    <div className={playing ? "flex h-dvh min-h-0 flex-col overflow-hidden" : "flex min-h-dvh flex-col"}>
      <AppHeader>
        <div className="mr-1 hidden min-w-0 flex-col items-end text-right md:flex">
          <span className="max-w-[14rem] truncate text-sm font-semibold">{state.room.name}</span>
          <span className="font-display text-xs tracking-widest text-cyan">{state.room.code}{g && playing ? ` · rodada ${g.round}` : ""}</span>
        </div>
        {playing && <CopyInviteButton code={state.room.code} compact />}
        <LeaveButton inGame={playing} onConfirm={() => void doLeave()} />
      </AppHeader>
      <ConnectionBanner show={connection === "reconnecting"} />
      {specialEffect && playing && (
        specialEffect.type==="color_wave" ? (
          <div key={specialEffect.id}
            className={"uno-color-wave uno-color-wave-"+(specialEffect.color || "b")}
            role="status" aria-label="Uma nova cor foi escolhida" />
        ) : (
          <div key={specialEffect.id} className={"uno-special-overlay uno-effect-"+specialEffect.type} aria-live="assertive" role="status">
            <div className="uno-special-badge">
              <div className="uno-effect-title" aria-hidden>
                {specialEffect.type==="skip" ? <Ban className="size-16 sm:size-24" strokeWidth={3.2}/> :
                 specialEffect.type==="reverse" ? <Repeat2 className="size-16 sm:size-24" strokeWidth={3}/> :
                 specialEffect.type==="cut" ? <Scissors className="size-16 sm:size-24" strokeWidth={3}/> :
                 specialEffect.type==="catch" ? <ShieldAlert className="size-16 sm:size-24" strokeWidth={3}/> :
                 specialEffect.type==="bomb" ? <Bomb className="size-16 sm:size-24" strokeWidth={3}/> :
                 specialEffect.type==="penalty" ? <span className="text-6xl sm:text-8xl">+{specialEffect.n ?? 2}</span> :
                 specialEffect.type==="uno" ? <Megaphone className="size-16 sm:size-24" strokeWidth={3}/> :
                 <span className="text-5xl">↶</span>}
              </div>
              {specialEffect.type==="bomb" ? (
                <span className="uno-effect-player">BOMBA! Todos os adversários compram 2 cartas</span>
              ) : specialEffect.type==="skip" ? (
                <>
                  {(specialEffect.n??1)>1&&(
                    <span className="text-xl font-black text-warning">
                      {(specialEffect.n??1)===2?"Bloqueio em dobro":
                       (specialEffect.n??1)===3?"Bloqueio triplo":
                       `Bloqueio ×${specialEffect.n}`}
                    </span>
                  )}
                  <span className="uno-effect-player">
                    {specialEffect.name} <span className="mx-1 text-cyan">→</span>{" "}
                    {(specialEffect.target_names?.length?specialEffect.target_names:[specialEffect.target_name??"Jogador"]).join(" · ")}
                  </span>
                </>
              ) : (specialEffect.type==="penalty" || specialEffect.type==="cut" || specialEffect.type==="catch") ? (
                <span className="uno-effect-player">
                  {specialEffect.reason==="nine"
                    ? `${specialEffect.target_name??specialEffect.name} +${specialEffect.n??1} · Regra do 9`
                    : <>{specialEffect.name} <span className="mx-1 text-cyan">→</span> {specialEffect.target_name??"Jogador"}</>}
                </span>
              ) : (
                <span className="uno-effect-player">
                  {specialEffect.type==="uno" ? specialEffect.name+" gritou UNO!" :
                  specialEffect.type==="reverse" ? (
                    (specialEffect.n??1)>1
                      ? `${specialEffect.name} jogou ${specialEffect.n} Voltas! ${(specialEffect.n??1)%2===0?"Sentido mantido.":"Sentido invertido."}`
                      : (g?.turn_order.length===2
                        ? specialEffect.name+" jogou Volta!"
                        : specialEffect.name+" inverteu o sentido!")
                  ) :
                  specialEffect.name}
                </span>
              )}
            </div>
          </div>
        )
      )}
      {playing ? <GameTable state={state} busy={busy} actions={actions} /> : <WaitingRoom state={state} busy={busy} onStart={start} onAddBot={(difficulty)=>act(()=>api.addBot(token,code,difficulty))} onRemoveBot={(id)=>act(()=>api.removeBot(token,code,id))}
        onUpdateSettings={async (startingCards:number,rules:RuleSettings)=>{
          await api.updateRoomSettings(token,code,startingCards,rules);
          void refresh();
        }} />}
      <WinnerOverlay
        open={showWinner}
        winnerName={winnerName}
        isMe={g?.winner_id === state.me}
        secondWinnerName={state.members.find(m=>m.id===g?.second_winner_id)?.nickname??""}
        secondIsMe={g?.second_winner_id===state.me}
        isHost={isHost}
        busy={busy}
        canRematch={state.members.length >= 2}
        onRematch={start}
        onClose={() => g && setDismissedRound(g.round)}
      />
    </div>
  );
}