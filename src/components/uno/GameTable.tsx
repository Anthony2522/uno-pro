import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ArrowDownWideNarrow, Hand, Loader2, Megaphone, RotateCcw, RotateCw, ShieldAlert, SkipForward, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { RoomState } from "@/lib/uno/api";
import { cardLabel, cardValue, COLOR_NAMES, isPlayable, isWild, type CardColor } from "@/lib/uno/cards";
import { describeAction } from "@/lib/uno/describe";
import { sfx } from "@/lib/uno/sound";
import { cn } from "@/lib/utils";
import { ColorPicker } from "./ColorPicker";
import { PlayerAvatar } from "./PlayerAvatar";
import { CardBack, UnoCard } from "./UnoCard";

const RING: Record<string, string> = { r: "ring-uno-r", y: "ring-uno-y", g: "ring-uno-g", b: "ring-uno-b" };
const DOT: Record<string, string> = { r: "bg-uno-r", y: "bg-uno-y", g: "bg-uno-g", b: "bg-uno-b" };

export type GameActions = {
  play: (card: string, color?: CardColor) => void;
  draw: () => void;
  end: () => void;
  accept: () => void;
  pressNine: () => void;
  uno: () => void;
  catchUno: () => void;
};

export function GameTable({ state, busy, actions }: { state: RoomState; busy: boolean; actions: GameActions }) {
  const game = state.game!;
  const me = state.me;
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const [sortMode,setSortMode] = useState<"color"|"number">("color");
  const [clock,setClock] = useState(Date.now());
  const [hold,setHold] = useState(0);
  const holdStart = useRef<number|null>(null);
  const interval = useRef<ReturnType<typeof setInterval>|null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),350);return()=>clearInterval(t);},[]);
  useEffect(()=>()=>{if(interval.current)clearInterval(interval.current);if(holdTimer.current)clearTimeout(holdTimer.current);},[]);
  const byId = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members]);
  const myTurn = game.current_player === me;
  const current = game.current_player ? byId.get(game.current_player) : undefined;
  const hand = useMemo(()=>{
    const colors=["b","y","g","r"], special=["R","S","W","D","W4","W5"];
    const col=(c:string)=>colors.indexOf(c[0])===-1?4:colors.indexOf(c[0]);
    const rank=(c:string)=>{const v=cardValue(c);return /^\d$/.test(v)?Number(v):10+Math.max(0,special.indexOf(v));};
    return [...game.my_hand].sort((a,b)=>sortMode==="color"?(col(a)-col(b)||rank(a)-rank(b)):(rank(a)-rank(b)||col(a)-col(b)));
  },[game.my_hand,sortMode]);

  // Opponents in seat order, starting with whoever plays after me.
  const opponents = useMemo(() => {
    const order = game.turn_order;
    const myIdx = order.indexOf(me);
    const rotated = myIdx >= 0 ? [...order.slice(myIdx + 1), ...order.slice(0, myIdx)] : order;
    return rotated.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
  }, [game.turn_order, me, byId]);


  const pending = game.pending_draw || 0;
  const [recentDraw,setRecentDraw] = useState<{card:string;nonce:number;at:number}|null>(null);
  const [drawFlight,setDrawFlight] = useState<number|null>(null);
  const lastSeenDraw = useRef<number|null>(null);
  useEffect(()=>{
    const d=game.last_draw;
    if(!d || lastSeenDraw.current===d.nonce)return;
    lastSeenDraw.current=d.nonce;
    const age=Date.now()-new Date(d.at).getTime();
    if(age<0||age>8000)return;
    setRecentDraw({card:d.card,nonce:d.nonce,at:new Date(d.at).getTime()});
    if(age<1500)setDrawFlight(d.nonce);
    const t=setTimeout(()=>setDrawFlight(v=>v===d.nonce?null:v),Math.max(100,750-age));
    return ()=>clearTimeout(t);
  },[game.last_draw?.nonce]);
  const freshIndex=recentDraw?hand.lastIndexOf(recentDraw.card):-1;
  const played = game.turn_cards || [];
  const nine = game.nine;
  const canPlay = (c:string) => {
    if(busy || nine)return false;
    if(!myTurn)return state.room.rules.cut && c===game.top_card && (!pending || (!game.pending_uncounterable && (c==="W4"||cardValue(c)==="D")));
    if(pending&&!played.length)return !game.pending_uncounterable && (c==="W4"||cardValue(c)==="D");
    if(!played.length)return isPlayable(c,game.top_card,game.current_color);
    const first=played[0],last=played[played.length-1];
    const same=cardValue(first)===cardValue(c);
    const diff=Number(cardValue(c))-Number(cardValue(last));
    const sequential=/^\d$/.test(cardValue(c))&&/^\d$/.test(cardValue(last))&&c[0]===last[0]&&Math.abs(diff)===1;
    if(played.length===1)return (state.room.rules.repeat&&same)||(state.room.rules.sequence&&sequential);
    const mode=cardValue(played[0])===cardValue(played[1])?"repeat":"sequence";
    if(mode==="repeat")return state.room.rules.repeat&&same;
    const prev=Number(cardValue(played[1]))-Number(cardValue(played[0]));
    return state.room.rules.sequence&&sequential&&Math.sign(diff)===Math.sign(prev);
  };
  const myCount = hand.length;
  const canUno = myCount===1||(myCount===2&&myTurn);
  const remaining=Math.max(0,Math.ceil((new Date(game.turn_started_at).getTime()+60000-clock)/1000));
  const nineRemaining=nine?Math.max(0,Math.ceil((new Date(nine.deadline).getTime()-clock)/1000)):0;
  const nineReady=!!nine&&nine.eligible.includes(me)&&!nine.pressed.includes(me);
  const feed = describeAction(game.last_action, me);
  const stopHold = () => {
    if(interval.current)clearInterval(interval.current);
    if(holdTimer.current)clearTimeout(holdTimer.current);
    interval.current=null;holdTimer.current=null;holdStart.current=null;setHold(0);
  };
  const beginHold=(e:PointerEvent<HTMLButtonElement>)=>{
    if(!game.can_catch_uno||busy)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stopHold();holdStart.current=Date.now();
    interval.current=setInterval(()=>setHold(Math.min(100,(Date.now()-(holdStart.current||Date.now()))/50)),50);
    holdTimer.current=setTimeout(()=>{actions.catchUno();stopHold();},5000);
  };

  function onCard(c: string) {
    if (!canPlay(c)) {sfx("error");toast.error("Essa carta não pode ser jogada agora.");return;}
    if (isWild(c)) setPendingWild(c);
    else actions.play(c);
  }

  return (
    <main className="uno-game mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-2 sm:px-6">
      {/* Opponents */}
      <section aria-label="Adversários" className="uno-opponents no-scrollbar -mx-2 flex shrink-0 gap-2 overflow-x-auto px-2 pb-1 pt-1 sm:justify-center">
        {opponents.map((p) => {
          const turn = game.current_player === p.id;

          return (
            <div
              key={p.id}
              className={cn(
                "glass relative flex min-w-[8.5rem] shrink-0 flex-col gap-2 rounded-2xl p-2.5 transition-all",
                turn && "shadow-glow-cyan",
                !p.online && "opacity-70",
              )}
              aria-current={turn ? "true" : undefined}
            >
              <div className="flex items-center gap-2">
                <PlayerAvatar id={p.id} name={p.nickname} size="sm" online={p.online} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{p.nickname}</p>
                  <p className={cn("text-[0.7rem]", turn ? "font-semibold text-cyan" : "text-muted-foreground")}>
                    {turn ? "Jogando…" : p.online ? `${p.card_count} carta${p.card_count === 1 ? "" : "s"}` : (
                      <span className="inline-flex items-center gap-1"><WifiOff className="size-3" /> offline</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex h-9 items-center" aria-label={`${p.card_count} cartas`}>
                {Array.from({ length: Math.min(p.card_count, 8) }).map((_, i) => (
                  <CardBack key={i} size="xs" className={cn(i > 0 && "-ml-4")} />
                ))}
                <span className="ml-2 font-display text-sm font-bold tabular-nums">{p.card_count}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* Table */}
      <section aria-label="Mesa" className="uno-table relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-2">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto aspect-square w-[min(90vw,32rem)] -translate-y-1/2 rounded-full bg-felt" aria-hidden />
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "relative z-10 rounded-full px-5 py-2 font-display text-sm font-bold sm:text-base",
            myTurn ? "bg-cyan text-navy animate-pulse-ring" : "glass",
          )}
        >
          {myTurn ? ("Sua vez · "+remaining+"s") : current ? `Vez de ${current.nickname}` : "…"}
        </div>


        {nine && (
          <div className="uno-nine-panel relative z-20 w-full max-w-md rounded-2xl border border-cyan/50 bg-navy/95 p-4 text-center shadow-glow-cyan">
            <p className="font-display text-lg font-black">DESAFIO DO 9 · {nineRemaining}s</p>
            {nineReady ? (
              <button type="button" disabled={busy} onClick={actions.pressNine} className="mt-2 size-24 rounded-full bg-cyan font-display text-6xl font-black text-navy shadow-glow-cyan active:scale-95">9</button>
            ) : <p className="mt-2 text-sm text-muted-foreground">{nine.source===me?"Você está salvo!":"Aguardando os demais jogadores…"}</p>}
            <p className="mt-2 text-sm text-muted-foreground">O último a apertar compra {nine.count} carta(s).</p>
          </div>
        )}
        {myTurn && !!pending && (hand.some(c=>c==="W4"||cardValue(c)==="D")) && !nine && (
          <div role="alert" className="uno-debt-panel relative z-20 max-w-md rounded-2xl border border-warning/40 bg-navy/95 p-4 text-center shadow-glow">
            <p className="font-display font-bold">Você quer comprar {pending} cartas ou rebater?</p>
            <p className="mt-1 text-sm text-muted-foreground">Escolha um +2 ou +4 da mão para rebater ou aceite a compra.</p>
            <Button variant="glass" className="mt-3 rounded-xl" onClick={actions.accept} disabled={busy}>Comprar {pending} e passar</Button>
          </div>
        )}
        <div className="uno-stack relative z-10 flex items-center gap-4 sm:gap-8">
          <button
            type="button"
            onClick={actions.draw}
            disabled={!myTurn || game.has_drawn || played.length>0 || !!pending || !!nine || busy}
            aria-label={`Comprar carta. ${game.draw_count} cartas no baralho`}
            className={cn(
              "group relative rounded-[12%] transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default",
              myTurn && !game.has_drawn && "hover:-translate-y-1 hover:rotate-[-3deg]",
            )}
          >
            <CardBack size="lg" className="uno-center-card absolute left-1 top-1 opacity-60" />
            <CardBack size="lg" className="uno-center-card absolute left-0.5 top-0.5 opacity-80" />
            <CardBack size="lg" className={cn("uno-center-card relative", myTurn && !game.has_drawn && "shadow-glow")} />
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-navy px-2 py-0.5 font-display text-xs font-bold tabular-nums ring-1 ring-glass-border">
              {game.draw_count}
            </span>
          </button>

          <div className={cn("rounded-[14%] ring-4 ring-offset-4 ring-offset-navy transition-all", RING[game.current_color])}>
            <UnoCard key={game.seq + game.top_card} card={game.top_card} size="lg" className="uno-center-card" animate rotate={((game.seq * 37) % 14) - 7} />
          </div>
        </div>

        <div className="uno-table-status relative z-10 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5">
            <span className={cn("size-3 rounded-full", DOT[game.current_color])} aria-hidden /> Cor: <strong>{COLOR_NAMES[game.current_color as CardColor]}</strong>
          </span>
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5">
            {game.direction === 1 ? <RotateCw className="size-4 animate-spin-slow text-cyan" /> : <RotateCcw className="size-4 animate-spin-slow text-cyan [animation-direction:reverse]" />}
            {game.direction === 1 ? "Sentido horário" : "Sentido anti-horário"}
          </span>
        </div>

        {feed && (
          <p key={game.seq} className="relative z-10 max-w-md text-balance px-4 text-center text-sm text-muted-foreground animate-pop" aria-live="polite">
            {feed}
          </p>
        )}
      </section>

      {/* My area */}
      <section aria-label="Sua mão" className="uno-hand shrink-0 z-20 -mx-2 border-t border-glass-border bg-navy/90 px-2 pb-[max(0.3rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl sm:mx-0 sm:rounded-t-3xl sm:border-x">
        <div className="flex flex-wrap items-center gap-2 px-2">
          <p className="mr-auto text-sm text-muted-foreground"><strong className="text-foreground">Sua mão</strong> · {myCount} carta(s)</p>
          <button type="button" title="Alterar organização" onClick={()=>setSortMode(v=>v==="color"?"number":"color")} className="glass inline-flex h-9 items-center gap-1 rounded-xl px-2 text-xs">
            <ArrowDownWideNarrow className="size-4" /> {sortMode==="color"?"Por cor":"Por número"}
          </button>
          <div className="flex flex-col items-center gap-1">
            <button type="button" onPointerDown={beginHold} onPointerUp={stopHold} onPointerCancel={stopHold} onLostPointerCapture={stopHold} disabled={!game.can_catch_uno||busy} aria-label="Segure 5 segundos para denunciar UNO" className="glass flex h-9 items-center gap-1 rounded-xl px-2 text-xs disabled:opacity-45">
              <svg viewBox="0 0 24 24" width="21" height="21" className="-rotate-90" aria-hidden>
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3"/>
                <circle cx="12" cy="12" r="9" fill="none" stroke="#67e8f9" strokeWidth="3" strokeDasharray="56.55" strokeDashoffset={56.55*(1-hold/100)}/>
              </svg>
              <ShieldAlert className="size-4"/> Denunciar
            </button>
            <Button variant="glass" className="h-9 rounded-xl px-3 text-xs" onClick={actions.uno} disabled={busy||!canUno}>
              <Megaphone className="size-4"/> UNO
            </Button>
          </div>
          {myTurn && !nine && (
            <Button variant="hero" className="h-11 rounded-xl px-4" onClick={pending>0&&!played.length?actions.accept:actions.end} disabled={busy}>
              {busy?<Loader2 className="animate-spin"/>:<SkipForward/>} Terminar vez
            </Button>
          )}
        </div>
        {myTurn && game.has_drawn && game.drawn_card && !played.length && (
          <p className="mt-2 px-2 text-center text-sm text-cyan">Você comprou {cardLabel(game.drawn_card)} — jogue qualquer carta válida ou termine a vez.</p>
        )}
        {!myTurn && state.room.rules.cut && <p className="mt-1 text-center text-xs text-muted-foreground">Corte: jogue uma carta idêntica à do descarte para roubar a vez.</p>}
        <div className="uno-hand-scroll no-scrollbar mt-1 overflow-x-auto overflow-y-hidden px-2 pb-1 pt-1">
          <div className="uno-hand-grid grid w-max min-w-full grid-flow-col grid-rows-2 justify-center gap-x-1.5 gap-y-1">
            {hand.map((c,i)=>{
              const ok=canPlay(c);
              return (
                <button key={c+"-"+i} type="button" onClick={()=>onCard(c)} aria-label={cardLabel(c)+(ok?" — jogável":"")} aria-disabled={!ok}
                  className={cn("uno-hand-button relative shrink-0 rounded-[12%] transition-all hover:z-10 hover:-translate-y-1 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",played.length===0 ? (ok ? "shadow-glow-cyan" : "opacity-65") : "",i===freshIndex&&recentDraw&&clock-recentDraw.at<8000&&"uno-recently-drawn")}>
                  <UnoCard card={c} size="md" className="uno-hand-card"/>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {drawFlight!==null && (
        <div key={drawFlight} className="uno-draw-flight pointer-events-none absolute z-40" aria-hidden>
          <CardBack size="md"/>
        </div>
      )}
      <ColorPicker
        open={!!pendingWild}
        onClose={() => setPendingWild(null)}
        onPick={(color) => {
          const c = pendingWild!;
          setPendingWild(null);
          actions.play(c, color);
        }}
      />
    </main>
  );
}