import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDownWideNarrow, Eye, Hand, Loader2, Megaphone, RotateCcw, RotateCw, ShieldAlert, SkipForward, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
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
  play: (card: string, color?: CardColor, targetId?: string) => void;
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
  const [pendingDetective,setPendingDetective]=useState(false);
  const [detectiveTarget,setDetectiveTarget]=useState<string|null>(null);
  const [sortMode,setSortMode] = useState<"color"|"number">("number");
  const [clock,setClock] = useState(Date.now());

  const lastMoveId=useRef<number|null>(null);
  const motionTimers=useRef(new Map<number,ReturnType<typeof setTimeout>>());
  const [flights,setFlights]=useState<Array<{id:number;card:string;fromX:number;fromY:number;toX:number;toY:number}>>([]);
  const [pileCover,setPileCover]=useState<{id:number;card:string}|null>(null);
  const handViewportRef=useRef<HTMLDivElement|null>(null);
  const [fitColumns,setFitColumns]=useState(6);
  useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),350);return()=>clearInterval(t);},[]);
  useEffect(()=>()=>{for(const timer of motionTimers.current.values())clearTimeout(timer);},[]);
  const byId = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members]);
  const myTurn = game.current_player === me;
  const current = game.current_player ? byId.get(game.current_player) : undefined;
  const hand = useMemo(()=>{
    const colors=["b","y","g","r"], special=["R","S","W","D","T","W4","W5","X","B"];
    const col=(c:string)=>colors.indexOf(c[0]??"")===-1?4:colors.indexOf(c[0]??"");
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
  const lockedByNotice=(game.effects||[]).some(e=>
    typeof e.show_at==="number" && clock>=e.show_at && clock<e.show_at+2000);
  const canPlay = (c:string) => {
    if(busy || nine)return false;
    if(lockedByNotice && (!myTurn || played.length===0))return false;
    if(!myTurn)return state.room.rules.cut && c===game.top_card && (!pending || (game.pending_uncounterable ? c==="W5" : c==="W5"||c==="W4"||cardValue(c)==="D"||cardValue(c)==="T"));
    if(pending&&!played.length)return game.pending_uncounterable ? c==="W5" : c==="W5"||c==="W4"||cardValue(c)==="D"||cardValue(c)==="T";
    if(!played.length)return isPlayable(c,game.top_card,game.current_color);
    const first=played[0]!,last=played[played.length-1]!;
    const same=cardValue(first)===cardValue(c);
    const diff=Number(cardValue(c))-Number(cardValue(last));
    const sequential=/^\d$/.test(cardValue(c))&&/^\d$/.test(cardValue(last))&&c[0]===last[0]&&Math.abs(diff)===1;
    if(played.length===1)return (state.room.rules.repeat&&same)||(state.room.rules.sequence&&sequential);
    const mode=cardValue(played[0]!)===cardValue(played[1]!)?"repeat":"sequence";
    if(mode==="repeat")return state.room.rules.repeat&&same;
    const prev=Number(cardValue(played[1]!))-Number(cardValue(played[0]!));
    return state.room.rules.sequence&&sequential&&Math.sign(diff)===Math.sign(prev);
  };
  const myCount = hand.length;
  // Row-major arrangement: first row is in sorted order, second row continues it.
  // Prefer one complete row; use two only if all cards cannot fit without shrinking.
  const columnCount=Math.max(1,myCount<=fitColumns?myCount:Math.max(fitColumns,Math.ceil(myCount/2)));
  const handRows=myCount>fitColumns?2:1;
  useEffect(()=>{
    const view=handViewportRef.current;
    if(!view)return;
    const measure=()=>{
      const sample=view.querySelector<HTMLElement>(".uno-hand-card");
      const cw=sample?.getBoundingClientRect().width||56;
      const gap=6;
      const available=Math.max(140,view.clientWidth-16);
      setFitColumns(Math.max(1,Math.floor((available+gap)/(cw+gap))));
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(view);
    window.addEventListener("resize",measure);
    return ()=>{observer.disconnect();window.removeEventListener("resize",measure);};
  },[myCount,sortMode]);
  const canUno = myCount===1||(myCount===2&&myTurn);
  const myPlacement=game.placements?.find(p=>p.id===me);
  const normalDeadline=new Date(game.turn_started_at).getTime()+50000;
  const deadline=game.offline_deadline_at ? Math.min(normalDeadline,new Date(game.offline_deadline_at).getTime()) : normalDeadline;
  const remaining=Math.min(50,Math.max(0,Math.ceil((deadline-clock)/1000)));
  const nineRemaining=nine?Math.max(0,Math.ceil((new Date(nine.deadline).getTime()-clock)/1000)):0;
  const nineReady=!!nine&&nine.eligible.includes(me)&&!nine.pressed.includes(me);
  const feed = describeAction(game.last_action, me);

  // Server-authoritative card moves are sent to every player. Animate a
  // one-second flight from the player's seat/hand to the discard pile.
  useEffect(()=>{
    const moves=game.card_moves||[];
    const newest=moves.at(-1)?.id??0;
    if(lastMoveId.current===null){lastMoveId.current=newest;return;}
    const arrivals=moves.filter(m=>m.id>lastMoveId.current!&&Date.now()-m.at<5000);
    lastMoveId.current=newest;
    if(!arrivals.length)return;
    const discard=document.querySelector<HTMLElement>("[data-discard-pile]");
    if(!discard)return;
    const d=discard.getBoundingClientRect();
    for(const m of arrivals){
      let source:HTMLElement|null=null;
      if(m.by===me){
        source=Array.from(document.querySelectorAll<HTMLElement>("[data-hand-card]"))
          .find(el=>el.dataset.handCard===m.card)??document.querySelector<HTMLElement>("[data-my-hand]");
      }else{
        source=Array.from(document.querySelectorAll<HTMLElement>("[data-player-seat]"))
          .find(el=>el.dataset.playerSeat===m.by)?.querySelector<HTMLElement>("[data-seat-cards]")??null;
      }
      const r=source?.getBoundingClientRect()??discard.getBoundingClientRect();
      const item={id:m.id,card:m.card,
        fromX:r.left+r.width/2-35,fromY:r.top+r.height/2-52,
        toX:d.left+d.width/2-35,toY:d.top+d.height/2-52};
      setFlights(v=>[...v,item]);
      setPileCover({id:m.id,card:m.previous_top});
      const timer=setTimeout(()=>{
        setFlights(v=>v.filter(x=>x.id!==m.id));
        setPileCover(v=>v?.id===m.id?null:v);
        motionTimers.current.delete(m.id);
      },1000);
      motionTimers.current.set(m.id,timer);
    }
  },[game.card_moves,me]);
  function onCard(c: string) {
    if (!canPlay(c)) {sfx("error");toast.error("Essa carta não pode ser jogada agora.",{duration:3000});return;}
    if(c==="X"){setPendingDetective(true);return;}
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
              data-player-seat={p.id}
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
              <div data-seat-cards className="flex h-9 items-center" aria-label={`${p.card_count} cartas`}>
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
        <div className="uno-turn-controls relative z-10 flex shrink-0 items-center justify-center gap-2">
          <div role="status" aria-live="polite"
            className={cn("rounded-full px-3 py-2 font-display text-[11px] font-bold sm:px-5 sm:text-sm",myTurn?"bg-cyan text-navy animate-pulse-ring":"glass")}>
            {myTurn ? ("Sua vez · "+remaining+"s") : current ? `Vez de ${current.nickname}` : "…"}
          </div>
          {myTurn && !nine && (
            <Button variant="hero" className="h-9 shrink-0 rounded-xl px-3 text-xs sm:h-11 sm:px-4 sm:text-sm"
              onClick={pending>0&&!played.length?actions.accept:actions.end} disabled={busy}>
              {busy?<Loader2 className="size-4 animate-spin"/>:<SkipForward className="size-4"/>} Terminar vez
            </Button>
          )}
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
        {myTurn && !!pending && played.length===0 && (hand.some(c=>game.pending_uncounterable?c==="W5":c==="W5"||c==="W4"||cardValue(c)==="D"||cardValue(c)==="T")) && !nine && (
          <div role="alert" className="uno-debt-panel relative z-20 max-w-md rounded-2xl border border-warning/40 bg-navy/95 p-4 text-center shadow-glow">
            <p className="font-display font-bold">Você quer comprar {pending} cartas ou rebater?</p>
            <p className="mt-1 text-sm text-muted-foreground">Escolha uma carta de compra permitida (+5 também pode rebater) ou aceite a penalidade.</p>
            <Button variant="glass" className="mt-3 rounded-xl" onClick={actions.accept} disabled={busy||lockedByNotice}>Comprar {pending} e passar</Button>
          </div>
        )}
        <div className="uno-stack relative z-10 flex items-center gap-4 sm:gap-8">
          <button
            type="button"
            onClick={actions.draw}
            disabled={!myTurn || game.has_drawn || played.length>0 || !!pending || !!nine || lockedByNotice || busy}
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

          <div data-discard-pile className={cn("relative rounded-[14%] ring-4 ring-offset-4 ring-offset-navy transition-all", RING[game.current_color])}>
            <UnoCard key={game.seq + game.top_card} card={game.top_card} size="lg" className="uno-center-card" rotate={((game.seq * 37) % 14) - 7} />
            {pileCover&&(
              <div className="absolute inset-0 z-10"><UnoCard card={pileCover.card} size="lg" className="uno-center-card" /></div>
            )}
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

      {myPlacement&&game.status==="playing"&&(
        <div className="mx-auto mb-2 w-fit rounded-xl border border-warning/50 bg-warning/10 px-4 py-2 text-center text-sm font-bold text-warning">
          🏆 1º colocado! Aguardando o segundo colocado…
        </div>
      )}
      {/* My area */}
      <section data-my-hand aria-label="Sua mão" className={cn("uno-hand shrink-0 z-20 -mx-2 border-t border-glass-border bg-navy/90 px-2 pb-[max(0.3rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl sm:mx-0 sm:rounded-t-3xl sm:border-x",handRows===1?"uno-hand-single":"uno-hand-double")}>
        <div className="uno-hand-toolbar grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 px-1 sm:gap-2">
          <span className="whitespace-nowrap text-[11px] font-bold text-foreground sm:text-sm" title="Cartas na sua mão">{myCount} {myCount===1?"carta":"cartas"}</span>
          <button type="button" title={sortMode==="color"?"Organizado por cor. Clique para organizar por número.":"Organizado por número. Clique para organizar por cor."}
            aria-label={sortMode==="color"?"Ordenar por número":"Ordenar por cor"}
            onClick={()=>setSortMode(v=>v==="color"?"number":"color")}
            className="glass flex h-9 min-w-0 w-full max-w-44 items-center justify-center gap-1 rounded-xl px-1.5 text-xs sm:px-3">
            <ArrowDownWideNarrow className="size-4 shrink-0"/><span className="truncate">{sortMode==="color"?"Por cor":"Por número"}</span>
          </button>
          <Button variant="glass" className="h-9 shrink-0 rounded-xl px-2 text-xs sm:px-3"
            onClick={actions.catchUno} disabled={!game.can_catch_uno||busy}
            title="Desuno: denuncie quem está há 4 segundos com uma carta sem gritar UNO."
            aria-label="Desuno">
            <ShieldAlert className="size-4 shrink-0"/><span>Desuno</span>
          </Button>
          <Button variant="glass" className="h-9 shrink-0 rounded-xl px-2 text-xs sm:px-3" onClick={actions.uno} disabled={busy||!canUno} aria-label="Gritar UNO">
            <Megaphone className="size-4 shrink-0"/><span>UNO</span>
          </Button>
        </div>
        {myTurn && lockedByNotice && played.length===0 && (
          <p className="mt-1 text-center text-xs text-cyan">Aviso na mesa — jogadas liberadas após 2 segundos.</p>
        )}
        {myTurn && game.has_drawn && game.drawn_card && !played.length && (
          <p className="mt-2 px-2 text-center text-sm text-cyan">Você comprou {cardLabel(game.drawn_card)} — jogue qualquer carta válida ou termine a vez.</p>
        )}
        
        <div ref={handViewportRef} className="uno-hand-scroll no-scrollbar mt-1 min-w-0 overflow-x-auto overflow-y-hidden px-2 pb-1 pt-1">
          <div className="uno-hand-grid mx-auto grid w-max grid-flow-row gap-x-1.5 gap-y-1"
            style={{gridTemplateColumns:`repeat(${columnCount}, var(--uno-hand-col))`,gridTemplateRows:`repeat(${handRows}, calc(var(--uno-hand-col) * 1.5))`}}>
            {hand.map((c,i)=>{
              const ok=canPlay(c);
              return (
                <button key={c+"-"+i} data-hand-card={c} type="button" onClick={()=>onCard(c)} aria-label={cardLabel(c)+(myTurn&&ok?" — jogável":"")} aria-disabled={!ok}
                  className={cn("uno-hand-button relative shrink-0 rounded-[12%] transition-all hover:z-10 hover:-translate-y-1 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",myTurn && played.length===0 ? (ok ? "shadow-glow-cyan" : "opacity-65") : "",i===freshIndex&&recentDraw&&clock-recentDraw.at<8000&&"uno-recently-drawn")}>
                  <UnoCard card={c} size="md" className="uno-hand-card"/>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {flights.length>0&&(
        <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
          {flights.map(f=>(
            <div key={f.id} className="uno-play-flight" style={{
              "--start-x":f.fromX+"px","--start-y":f.fromY+"px",
              "--mid-x":(f.fromX+f.toX)/2+"px","--mid-y":((f.fromY+f.toY)/2-52)+"px",
              "--end-x":f.toX+"px","--end-y":f.toY+"px",
            } as CSSProperties}>
              <UnoCard card={f.card} size="md" className="!w-[70px] shadow-glow-cyan"/>
            </div>
          ))}
        </div>
      )}
      {drawFlight!==null && (
        <div key={drawFlight} className="uno-draw-flight pointer-events-none absolute z-40" aria-hidden>
          <CardBack size="md"/>
        </div>
      )}
      <Dialog open={pendingDetective} onOpenChange={setPendingDetective}>
        <DialogContent className="glass-strong rounded-3xl border-glass-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="size-5 text-cyan"/> Coringa Detetive</DialogTitle>
            <DialogDescription>Escolha um jogador para ver as cartas dele por 10 segundos.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {game.turn_order.filter(id=>id!==me).map(id=>{
              const player=byId.get(id);
              return <Button key={id} type="button" variant="glass" className="h-12 justify-start rounded-xl"
                onClick={()=>{setDetectiveTarget(id);setPendingDetective(false);setPendingWild("X")}}>
                <Eye className="size-4"/> {player?.nickname??"Jogador"}
              </Button>;
            })}
          </div>
        </DialogContent>
      </Dialog>
      {game.detective && clock<new Date(game.detective.expires_at).getTime()&&(
        <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-[65] flex justify-center px-3">
          <div className="pointer-events-auto max-h-[68dvh] w-full max-w-2xl overflow-auto rounded-2xl border border-cyan/70 bg-navy/95 p-3 shadow-glow backdrop-blur-xl sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2 text-sm font-bold text-cyan">
              <span className="flex items-center gap-1.5"><Eye className="size-5"/> Detetive · {game.detective.target_name}</span>
              <span>{Math.max(0,Math.ceil((new Date(game.detective.expires_at).getTime()-clock)/1000))}s</span>
            </div>
            <div className="flex max-h-[52dvh] flex-wrap justify-center gap-2 overflow-y-auto p-1">
              {game.detective.cards.map((card,i)=>(
                <div key={i} className="flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-lg bg-background/50 p-1 sm:w-[98px]">
                  <UnoCard card={card} size="lg" className="!w-[72px] !min-w-[72px] !opacity-100 sm:!w-[84px] sm:!min-w-[84px]"/>
                  <span className="max-w-full truncate text-center text-[10px] font-bold text-foreground sm:text-xs" title={cardLabel(card)}>
                    {cardLabel(card)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <ColorPicker
        open={!!pendingWild}
        onClose={() => {setPendingWild(null);setDetectiveTarget(null)}}
        onPick={(color) => {
          const c = pendingWild!;
          setPendingWild(null);
          actions.play(c, color, c==="X"?(detectiveTarget??undefined):undefined);
          setDetectiveTarget(null);
        }}
      />
    </main>
  );
}