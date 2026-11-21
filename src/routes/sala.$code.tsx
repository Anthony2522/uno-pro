import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Ban, Bomb, Loader2, Scissors, Megaphone, Shield, ShieldAlert, ShieldOff, ZapOff, Crosshair, Beer, LockKeyhole, Sword, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/uno/AppHeader";
import { GameTable, type GameActions } from "@/components/uno/GameTable";
import { UnoCard } from "@/components/uno/UnoCard";
import {CockroachIcon} from "@/components/uno/CockroachIcon";
import {RoachTransferAnimation,ROACH_TOTAL_MS} from "@/components/uno/RoachTransferAnimation";
import {COLOR_NAMES,type CardColor} from "@/lib/uno/cards";
import { cardLabel } from "@/lib/uno/cards";
import { useLanguage } from "@/lib/uno/i18n";
import { ConnectionBanner, CopyInviteButton, LeaveButton } from "@/components/uno/RoomTopBar";
import { WaitingRoom } from "@/components/uno/WaitingRoom";
import { WinnerOverlay } from "@/components/uno/WinnerOverlay";
import { Button } from "@/components/ui/button";
import { api, type GameState, type RuleSettings } from "@/lib/uno/api";
import type {CardSettings} from "@/lib/uno/cardSettings";
import { errorMessage, toGameError } from "@/lib/uno/errors";
import { sfx } from "@/lib/uno/sound";
import { useRoom } from "@/lib/uno/useRoom";
import {offlineStorageError} from "@/lib/uno/offlineRuntime";

export const Route = createFileRoute("/sala/$code")({
  head: ({ params }) => ({
    meta: [
      { title: "Jogue UNO pro: o UNO melhorado" },
      { name: "description", content: "Jogue com amigos online e contra bots" },
      { property: "og:title", content: "Jogue UNO pro: o UNO melhorado" },
      { property: "og:description", content: "Jogue com amigos online e contra bots" },
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
  const {language,tr}=useLanguage();
  const { state, fatal, connection, refresh, leave, token } = useRoom(code);
  const [busy, setBusy] = useState(false);
  const [dismissedRound, setDismissedRound] = useState<number | null>(null);
  const [effectsClock,setEffectsClock] = useState(Date.now());
  const [dismissedEffects,setDismissedEffects] = useState<Set<string>>(()=>new Set());
  const lastEffectId = useRef<number|null>(null);
  const effectId=(round:number,id:number)=>`${code}:${round}:${id}`;
  // Clicking anywhere dismisses currently displayed banners, the large Double
  // Wild notice and Sonner toasts, without preventing the underlying action.
  const dismissableIds=(state?.game?.effects||[])
    .filter(e=>(e.type==="shield_defense"||!["roach","reverse","color_wave","shield_armed","roach_end","sword_armed","sword_boost"].includes(e.type))&&
      effectsClock>=e.show_at&&effectsClock<e.show_at+(e.type==="double"?3000:e.type==="shield_defense"?3300:5000))
    .map(e=>effectId(state?.game?.round??0,e.id))
    .filter(id=>!dismissedEffects.has(id));
  const dismissKey=dismissableIds.join("|");
  useEffect(()=>{
    const onPress=()=>{
      if(dismissableIds.length)setDismissedEffects(prev=>new Set([...prev,...dismissableIds]));
      toast.dismiss();
    };
    window.addEventListener("pointerdown",onPress,true);
    return ()=>window.removeEventListener("pointerdown",onPress,true);
  },[dismissKey]);
  const queuedNoticeShown=useRef(false);
  useEffect(()=>{
    if(!state)return;
    const queued=!!state.members.find(m=>m.id===state.me)?.spectator;
    if(queued && state.game?.status==="playing" && !queuedNoticeShown.current){
      toast.info(language==="en"?"Match in progress: you are in the waiting queue. Please wait for the next round.":"Partida em andamento, você está na fila de espera. Aguarde a próxima partida.",{duration:8000});
      queuedNoticeShown.current=true;
    }
    if(!queued)queuedNoticeShown.current=false;
  },[state,language]);
  const lastEffectRound = useRef<number|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setEffectsClock(Date.now()),250);return()=>clearInterval(timer);},[]);
  const prev = useRef<{ seq: number; turn: string | null; status: string | null; members: number } | null>(null);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        sfx("error");
        toast.error(tr(errorMessage(e)));
      } finally {
        setBusy(false);
        void refresh();
      }
    },
    [refresh,tr],
  );

  // One shared five-second window. More than two notifications appear
  // together in a compact stack; no event blocks the player's actions.
  useEffect(()=>{
    const events=state?.game?.effects||[];
    const round=state?.game?.round??null;
    if(round!==lastEffectRound.current){
      lastEffectRound.current=round;
      lastEffectId.current=events.at(-1)?.id??0;
      return;
    }
    const next=events.filter(e=>e.id>(lastEffectId.current??0));
    if(events.length)lastEffectId.current=events.at(-1)?.id??0;
    for(const event of next){
      if(event.type==="roach"||event.type==="reverse"||event.type==="color_wave")continue; // No extra reverse or color-choice announcement sound.
      sfx(event.type==="double"?"draw4":event.type==="vortex"?"wild":event.type==="beer"||event.type==="beer_forced"||event.type==="lock"||event.type==="sword_armed"||event.type==="roach_end"?"play":event.type==="sword_boost"?"draw4":event.type);
    }
  },[state?.game?.effects,state?.game?.round]);

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
        if (a?.target === state.me && a.n) toast(language==="en"?`${a.name} made you draw ${a.n} cards!`:`${a.name} fez você comprar ${a.n}!`);
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
  const visibleEffects=playing?(g?.effects||[]).filter(e=>
    !["shield_defense","roach","reverse","color_wave","shield_armed","roach_end","sword_armed","sword_boost","double"].includes(e.type) &&
    !dismissedEffects.has(effectId(g?.round??0,e.id)) &&
    effectsClock>=e.show_at&&effectsClock<e.show_at+5000).slice(-3):[];
  const doubleEffects=playing?(g?.effects||[]).filter(e=>e.type==="double"&&
    !dismissedEffects.has(effectId(g?.round??0,e.id)) &&
    effectsClock>=e.show_at&&effectsClock<e.show_at+3000).slice(-1):[];
  // Always play the server event on every client, including the recipient and
  // the final play of a round. Use its event ID and timestamp for synchronization.
  const roachTransfers=(g?.effects||[]).filter(e=>e.type==="roach"&&effectsClock>=e.show_at&&effectsClock<e.show_at+ROACH_TOTAL_MS);
  const shieldDefenses=playing?(g?.effects||[]).filter(e=>e.type==="shield_defense"&&
    !dismissedEffects.has(effectId(g?.round??0,e.id))&&
    effectsClock>=e.show_at&&effectsClock<e.show_at+3300):[];
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
      }),
    end: () => act(() => api.endTurn(token, code)),
    accept: () => act(() => api.acceptDraw(token, code)),
    pressNine: () => act(() => api.pressNine(token, code)),
    uno: () => act(() => api.callUno(token, code)),
    catchUno: () => act(() => api.catchUno(token, code)),
    negate: (color) => act(() => api.negateEffect(token,code,color)),
    resolveDetective: (color) => act(() => api.resolveDetective(token,code,color)),
    resolveWildColor: (color) => act(() => api.resolveWildColor(token,code,color)),
    acceptSkip: () => act(() => api.acceptSkip(token,code)),
    sandboxSwitch: state.room.sandbox ? (id)=>act(()=>api.sandboxSwitch(code,id)) : undefined,
    sandboxToggleBot: state.room.sandbox ? ()=>act(()=>api.sandboxToggleBot(code)) : undefined,
    sandboxGrant: state.room.sandbox ? (kind)=>act(async()=>{
      const result=await api.sandboxGrantCard(code,kind);
      toast.success(tr("Carta adicionada à sua mão!"));
      return result;
    }) : undefined,
  };
  const updateWinners=(n:number)=>act(()=>api.updateWinners(token,code,n));
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
      <AppHeader manualRules={state.room.rules} manualCards={state.room.cards_enabled}>
        <div className="mr-1 hidden min-w-0 flex-col items-end text-right md:flex">
          <span className="max-w-[14rem] truncate text-sm font-semibold">{state.room.name}</span>
          <span className="font-display text-xs tracking-widest text-cyan">{state.room.code}{g && playing ? ` · ${language==="en"?"round":"rodada"} ${g.round}` : ""}</span>
        </div>
        {state.room.local_only && <span className="inline-flex items-center gap-1 rounded-full border border-cyan/40 bg-cyan/10 px-2 py-1 text-xs font-bold text-cyan"><WifiOff className="size-3.5"/> Offline</span>}
        {playing && !state.room.local_only && <CopyInviteButton code={state.room.code} compact />}
        <LeaveButton inGame={playing} onConfirm={() => void doLeave()} />
      </AppHeader>
      <ConnectionBanner show={connection === "reconnecting"} />
      {state.room.local_only&&offlineStorageError()&&(
        <p role="alert" className="relative z-40 bg-destructive/20 px-3 py-2 text-center text-xs font-bold text-destructive">
          Seu navegador bloqueou o salvamento local. Libere espaço ou dados do site antes de fechar a partida.
        </p>
      )}

      {doubleEffects.map(e=>(
        <div key={effectId(g?.round??0,e.id)} role="status" aria-live="assertive"
          className="pointer-events-none fixed inset-0 z-[76] flex items-center justify-center px-4">
          <div className="w-full max-w-2xl animate-pop rounded-3xl border-2 border-cyan/70 bg-navy/95 px-6 py-8 text-center shadow-glow-cyan sm:px-10 sm:py-12">
            <div className="font-display text-6xl font-black leading-none text-cyan sm:text-8xl">×2</div>
            <p className="mt-4 font-display text-2xl font-black leading-snug text-foreground sm:text-4xl">
              {language==="en"?`${e.name} doubled and passed to the next player!`:`${e.name} dobrou e passou para o próximo!`}
            </p>
            <p className="mt-3 font-display text-lg font-bold text-warning sm:text-2xl">
              {language==="en"?"Current draw debt":"Dívida atual"}: +{e.n}
            </p>
          </div>
        </div>
      ))}
      {visibleEffects.length>0&&(
        <div className="pointer-events-none fixed inset-x-0 top-[11rem] sm:top-[12rem] z-[54] mx-auto flex w-full max-w-lg flex-col gap-2 px-3" role="status" aria-live="polite">
          {visibleEffects.map(e=>(
            <div key={e.id}
              className={"glass-strong flex min-h-12 flex-wrap items-center gap-3 rounded-2xl border border-cyan/40 bg-navy/95 px-3 py-2 text-sm shadow-glow animate-pop uno-notice-"+e.type}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/25 text-cyan">
                {e.type==="skip"?<Ban className="size-6"/>:
                 e.type==="bomb"?<Bomb className="size-6"/>:
                 e.type==="negation"?<ShieldOff className="size-6"/>:
                 e.type==="powerless"?<ZapOff className="size-6"/>:
                 e.type==="machinegun"?<Crosshair className="size-6"/>:
                 e.type==="vortex"?<img src="/vortice.svg" alt="" className="h-6 w-6 object-contain brightness-0 invert"/>:
                 e.type==="roach"||e.type==="roach_end"?<CockroachIcon className="size-7 text-cyan"/>:
                 e.type==="beer"||e.type==="beer_forced"?<Beer className="size-6"/>:
                 e.type==="lock"?<LockKeyhole className="size-6"/>:
                 e.type==="sword_armed"||e.type==="sword_boost"||e.type==="sword_strike"?<Sword className="size-6"/>:
                 e.type==="shield_armed"||e.type==="shield_defense"?<Shield className="size-6"/>:
                 e.type==="uno"?<Megaphone className="size-6"/>:
                 e.type==="cut"?<Scissors className="size-6"/>:
                 e.type==="catch"?<ShieldAlert className="size-6"/>:
                 e.type==="penalty"?<span className="font-bold">+{e.n??2}</span>:
                 <span className="size-6 rounded-full" style={{background:({r:"#e94b58",y:"#ffd34c",g:"#2fc18c",b:"#48beff"} as Record<string,string>)[e.color??"b"]}}/>}
              </span>
              <p className="min-w-0 flex-1 text-balance font-display font-bold leading-snug">
                {e.type==="skip"?(
                  (e.n??1)>1?`${language==="en"?"Skip":"Bloqueio"} ×${e.n}: ${(e.target_names||[e.target_name]).filter(Boolean).join(" · ")}`:
                  `${e.name} → ${e.target_name??"Jogador"}`
                ):
                e.type==="penalty"?e.reason==="nine"?
                  `${e.target_name??(language==="en"?"Player":"Jogador")} +${e.n} · ${language==="en"?"9 rule":"Regra do 9"}`:
                  language==="en"?`${e.target_name??"Player"} drew ${e.n??2} cards`:`${e.target_name??"Jogador"} comprou ${e.n??2} cartas`:
                e.type==="bomb"?"Bomba: adversários sem Escudo compraram +2":
                e.type==="machinegun"?"Metralhadora: cartas especiais reveladas e devolvidas ao baralho":
                 e.type==="shield_armed"?language==="en"?`${e.name} activated Shield`:`${e.name} ativou Escudo`:
                 e.type==="vortex"?language==="en"?`${e.name} activated Vortex: ${e.n??0} cards pulled`:`${e.name} ativou Vórtice: ${e.n??0} carta(s) puxada(s)`:
                 e.type==="roach"?language==="en"?
                   `${e.name} passed a ${({"r":"red","y":"yellow","g":"green","b":"blue"} as Record<string,string>)[e.copy_color??"b"]} Roach to ${e.target_name??"another player"}!`:
                   `${e.name} enviou uma Barata ${COLOR_NAMES[(e.copy_color??"b") as CardColor]} para ${e.target_name??"outro jogador"}!`:
                 e.type==="roach_end"?language==="en"?
                   `${e.name} ended this Roach chain — no new copy.`:
                   `${e.name} encerrou a cadeia da Barata: sem nova cópia!`:
                 e.type==="beer"?"Cerveja: os adversários jogarão automaticamente":
                 e.type==="beer_forced"?`${e.name}: jogada aleatória pela Cerveja`:
                 e.type==="lock"?language==="en"?`Lock: next turn, opponents may only play ${({r:"red",y:"yellow",g:"green",b:"blue"} as Record<string,string>)[e.color??"b"]} cards (no wilds).`:`Cadeado: na próxima vez, adversários só poderão usar cartas ${({r:"vermelhas",y:"amarelas",g:"verdes",b:"azuis"} as Record<string,string>)[e.color??"b"]}, sem coringas.`:
                 e.type==="sword_armed"?language==="en"?`${e.name} activated Sword (+3 to the next attack)`:`${e.name} ativou Espada (+3 no próximo ataque)`:
                 e.type==="sword_boost"?language==="en"?`Sword: +${e.n??3} added to the draw debt`:`Espada: +${e.n??3} somados à dívida`:
                 e.type==="sword_strike"?language==="en"?`Sword hit ${e.target_name??"a player"}!`:`Espada atingiu ${e.target_name??"um jogador"}!`:
                 e.type==="shield_defense"?language==="en"?`${e.target_name??e.name} was protected by Shield`:`${e.target_name??e.name} foi defendido(a) pelo Escudo`:
                e.type==="powerless"?"Sem Poderes: próxima vez de cada adversário só com números":
                e.type==="negation"?"Negação: efeito anulado":
                e.type==="uno"?language==="en"?`${e.name} called UNO!`:`${e.name} gritou UNO!`:
                e.type==="cut"?language==="en"?`${e.name} jumped in against ${e.target_name??"a player"}`:`${e.name} cortou ${e.target_name??"um jogador"}`:
                e.type==="catch"?language==="en"?`${e.name} reported ${e.target_name??"a player"} for not calling UNO!`:`${e.name} denunciou ${e.target_name??"um jogador"}`:
                e.name}
              </p>
              {e.type==="machinegun" && !!e.revealed?.length && (
                <div className="flex w-full flex-wrap justify-center gap-3 border-t border-cyan/20 pt-2">
                  {e.revealed.map((entry,i)=>(
                    <div key={entry.target+"-"+i} className="flex min-w-16 flex-col items-center gap-1">
                      <UnoCard card={entry.card} size="sm" className="!w-12"/>
                      <span className="text-center text-[10px] font-semibold text-cyan">{entry.target_name}</span>
                      <span className="max-w-24 text-center text-[10px] text-muted-foreground">{cardLabel(entry.card)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {playing && (g?.effects||[]).some(e=>e.type==="sword_strike"&&
        !dismissedEffects.has(effectId(g?.round??0,e.id))&&
        effectsClock>=e.show_at&&effectsClock<e.show_at+2400) && (
        <div className="uno-sword-attack pointer-events-none fixed inset-0 z-[77] flex items-center justify-center overflow-hidden" role="status" aria-live="polite">
          <div className="uno-sword-burst" aria-hidden />
          <Sword className="uno-sword-blade h-[min(42vw,220px)] w-[min(42vw,220px)] text-amber-200 drop-shadow-[0_0_25px_rgba(255,195,50,0.95)]" strokeWidth={2.4} aria-hidden />
          <div className="uno-sword-impact absolute bottom-[28%] rounded-xl bg-navy/90 px-4 py-2 text-center font-display text-sm font-black text-amber-200 shadow-glow">
            {language==="en"?"SWORD STRIKE!":"GOLPE DE ESPADA!"}
          </div>
        </div>
      )}
      {shieldDefenses.length>0 && (
        <div className="pointer-events-none fixed inset-0 z-[76] flex flex-col items-center justify-center gap-3 px-3">
          {shieldDefenses.map(e=>(
            <div key={e.id} role="status" className="uno-shield-defense flex w-full max-w-lg flex-col items-center gap-2 rounded-3xl border-2 border-cyan/80 bg-navy/95 px-6 py-5 text-center shadow-glow-cyan">
              <div className="uno-shield-shatter relative h-28 w-28" aria-hidden="true">
                <Shield className="uno-shield-left absolute inset-0 h-full w-full text-cyan" strokeWidth={2.8}/>
                <Shield className="uno-shield-right absolute inset-0 h-full w-full text-cyan" strokeWidth={2.8}/>
                <svg className="uno-shield-fracture absolute inset-0 h-full w-full" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                  <path d="M48 6L57 32L43 50L58 67L49 95" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="uno-shield-text font-display text-lg font-black text-white sm:text-2xl">
                {language==="en"?`${e.target_name??e.name} was protected by the Shield`:`${e.target_name??e.name} foi defendido(a) pelo Escudo`}
              </p>
            </div>
          ))}
        </div>
      )}
      {state.members.find(m=>m.id===state.me)?.spectator && <div role="status" className="mx-auto mb-3 w-full max-w-5xl rounded-xl border border-cyan/40 bg-cyan/10 px-4 py-3 text-sm font-semibold text-cyan">{language==="en"?"Match in progress: you are in the waiting queue. Please wait for the next round.":"Partida em andamento, você está na fila de espera. Aguarde a próxima partida."}</div>}
      {playing ? <GameTable state={state} busy={busy} actions={actions} /> : <WaitingRoom state={state} busy={busy} onStart={start} onAddBot={(difficulty)=>act(()=>api.addBot(token,code,difficulty))} onRemoveBot={(id)=>act(()=>api.removeBot(token,code,id))}
        onUpdateWinners={updateWinners}
        onUpdateSettings={async (startingCards:number,rules:RuleSettings,cards:CardSettings)=>{
          await api.updateRoomSettings(token,code,startingCards,rules,cards);
          void refresh();
        }} />}
      {roachTransfers.map(event=>(
        <RoachTransferAnimation key={`${g?.round??0}-${event.id}`}
          event={event} me={state.me} language={language}/>
      ))}
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
        placements={g?.placements??[]}
        viewerId={state.me}
        onClose={() => g && setDismissedRound(g.round)}
      />
    </div>
  );
}