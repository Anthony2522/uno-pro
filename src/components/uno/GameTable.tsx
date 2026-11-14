import { useMemo, useState } from "react";
import { Hand, Loader2, Megaphone, RotateCcw, RotateCw, SkipForward, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { RoomState } from "@/lib/uno/api";
import { cardLabel, COLOR_NAMES, isPlayable, isWild, sortHand, type CardColor } from "@/lib/uno/cards";
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
  pass: () => void;
  uno: () => void;
  catchUno: (target: string) => void;
};

export function GameTable({ state, busy, actions }: { state: RoomState; busy: boolean; actions: GameActions }) {
  const game = state.game!;
  const me = state.me;
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const byId = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members]);
  const myTurn = game.current_player === me;
  const current = game.current_player ? byId.get(game.current_player) : undefined;
  const hand = useMemo(() => sortHand(game.my_hand), [game.my_hand]);

  // Opponents in seat order, starting with whoever plays after me.
  const opponents = useMemo(() => {
    const order = game.turn_order;
    const myIdx = order.indexOf(me);
    const rotated = myIdx >= 0 ? [...order.slice(myIdx + 1), ...order.slice(0, myIdx)] : order;
    return rotated.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
  }, [game.turn_order, me, byId]);

  const canPlay = (c: string) =>
    myTurn && !busy && isPlayable(c, game.top_card, game.current_color) && (!game.has_drawn || c === game.drawn_card);

  const myCount = hand.length;
  const meMember = byId.get(me);
  const canUno = !meMember?.uno_called && (myCount === 1 || (myCount === 2 && myTurn));
  const feed = describeAction(game.last_action, me);

  function onCard(c: string) {
    if (!myTurn) {
      toast("Ainda não é a sua vez.");
      return;
    }
    if (!canPlay(c)) {
      sfx("error");
      toast.error(game.has_drawn ? "Depois de comprar, só dá para jogar a carta comprada ou passar." : "Essa carta não combina com a mesa.");
      return;
    }
    if (isWild(c)) setPendingWild(c);
    else actions.play(c);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-2 sm:px-6">
      {/* Opponents */}
      <section aria-label="Adversários" className="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 pb-2 pt-3 sm:justify-center">
        {opponents.map((p) => {
          const turn = game.current_player === p.id;
          const catchable = p.card_count === 1 && !p.uno_called;
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
              {p.uno_called && p.card_count === 1 && (
                <span className="absolute -right-1.5 -top-1.5 rotate-6 rounded-lg bg-uno-r px-1.5 py-0.5 font-display text-[0.65rem] font-black text-uno-paper shadow-card animate-pop">UNO!</span>
              )}
              {catchable && (
                <Button size="sm" variant="destructive" className="h-7 rounded-lg text-xs" onClick={() => actions.catchUno(p.id)} disabled={busy}>
                  Pegar! Não gritou UNO
                </Button>
              )}
            </div>
          );
        })}
      </section>

      {/* Table */}
      <section aria-label="Mesa" className="relative flex flex-1 flex-col items-center justify-center gap-4 py-4">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto aspect-square w-[min(90vw,32rem)] -translate-y-1/2 rounded-full bg-felt" aria-hidden />
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "relative z-10 rounded-full px-5 py-2 font-display text-sm font-bold sm:text-base",
            myTurn ? "bg-cyan text-navy animate-pulse-ring" : "glass",
          )}
        >
          {myTurn ? "Sua vez!" : current ? `Vez de ${current.nickname}` : "…"}
        </div>

        <div className="relative z-10 flex items-center gap-6 sm:gap-10">
          <button
            type="button"
            onClick={actions.draw}
            disabled={!myTurn || game.has_drawn || busy}
            aria-label={`Comprar carta. ${game.draw_count} cartas no baralho`}
            className={cn(
              "group relative rounded-[12%] transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default",
              myTurn && !game.has_drawn && "hover:-translate-y-1 hover:rotate-[-3deg]",
            )}
          >
            <CardBack size="lg" className="absolute left-1 top-1 opacity-60" />
            <CardBack size="lg" className="absolute left-0.5 top-0.5 opacity-80" />
            <CardBack size="lg" className={cn("relative", myTurn && !game.has_drawn && "shadow-glow")} />
            <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-navy px-2 py-0.5 font-display text-xs font-bold tabular-nums ring-1 ring-glass-border">
              {game.draw_count}
            </span>
          </button>

          <div className={cn("rounded-[14%] ring-4 ring-offset-4 ring-offset-navy transition-all", RING[game.current_color])}>
            <UnoCard key={game.seq + game.top_card} card={game.top_card} size="lg" animate rotate={((game.seq * 37) % 14) - 7} />
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 text-sm">
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
      <section aria-label="Sua mão" className="sticky bottom-0 z-20 -mx-2 border-t border-glass-border bg-navy/85 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:mx-0 sm:rounded-t-3xl sm:border-x">
        <div className="flex flex-wrap items-center justify-center gap-2 px-2">
          <p className="mr-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Sua mão</span> · {myCount} carta{myCount === 1 ? "" : "s"}
            {meMember?.uno_called && myCount === 1 && <span className="ml-2 rounded-md bg-uno-r px-1.5 py-0.5 font-display text-xs font-black text-uno-paper">UNO!</span>}
          </p>
          {myTurn && !game.has_drawn && (
            <Button variant="glass" className="h-11 rounded-xl" onClick={actions.draw} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Hand />} Comprar
            </Button>
          )}
          {myTurn && game.has_drawn && (
            <Button variant="glass" className="h-11 rounded-xl" onClick={actions.pass} disabled={busy}>
              <SkipForward /> Passar
            </Button>
          )}
          {canUno && (
            <Button className="h-11 rounded-xl bg-uno-r font-display font-black text-uno-paper shadow-card hover:bg-uno-r/90 animate-pulse-ring" onClick={actions.uno} disabled={busy}>
              <Megaphone /> UNO!
            </Button>
          )}
        </div>
        {myTurn && game.has_drawn && game.drawn_card && (
          <p className="mt-2 px-2 text-center text-sm text-cyan">Você comprou {cardLabel(game.drawn_card)} — jogue-a ou passe a vez.</p>
        )}
        <div className="no-scrollbar mt-1 flex overflow-x-auto px-3 pb-1 pt-6">
          <div className="mx-auto flex">
            {hand.map((c, i) => {
              const ok = canPlay(c);
              return (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  onClick={() => onCard(c)}
                  aria-label={`${cardLabel(c)}${ok ? " — jogável" : ""}`}
                  aria-disabled={!ok}
                  className={cn(
                    "relative shrink-0 rounded-[12%] transition-all duration-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
                    i > 0 && "-ml-7 sm:-ml-6",
                    ok ? "-translate-y-4 hover:z-10 hover:-translate-y-6" : myTurn ? "opacity-55 saturate-50" : "hover:-translate-y-1",
                    game.has_drawn && c === game.drawn_card && "z-10",
                  )}
                >
                  <UnoCard card={c} size="md" className={cn(ok && "shadow-glow-cyan")} />
                </button>
              );
            })}
          </div>
        </div>
      </section>

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