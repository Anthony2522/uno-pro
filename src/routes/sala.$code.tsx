import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/uno/AppHeader";
import { GameTable, type GameActions } from "@/components/uno/GameTable";
import { ConnectionBanner, CopyInviteButton, LeaveButton } from "@/components/uno/RoomTopBar";
import { WaitingRoom } from "@/components/uno/WaitingRoom";
import { WinnerOverlay } from "@/components/uno/WinnerOverlay";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/uno/api";
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
        else if (a?.type === "uno") sfx("uno");
        else if (a?.type === "play") sfx("play");
        else if (a?.type === "draw" || a?.type === "draw_pass" || a?.type === "catch") sfx("draw");
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
  const showWinner = !!(finished && g.winner_id && dismissedRound !== g.round && g.turn_order.includes(state.me));

  const actions: GameActions = {
    play: (card, color) => act(() => api.playCard(token, code, card, color)),
    draw: () =>
      act(async () => {
        const r = await api.drawCard(token, code);
        sfx("draw");
        if (r.card && !r.playable) toast("A carta comprada não serve — a vez passou.");
        if (!r.card) toast("O baralho acabou — a vez passou.");
      }),
    pass: () => act(() => api.passTurn(token, code)),
    uno: () => act(() => api.callUno(token, code)),
    catchUno: (t) => act(() => api.catchUno(token, code, t)),
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
    <div className="flex min-h-dvh flex-col">
      <AppHeader>
        <div className="mr-1 hidden min-w-0 flex-col items-end text-right md:flex">
          <span className="max-w-[14rem] truncate text-sm font-semibold">{state.room.name}</span>
          <span className="font-display text-xs tracking-widest text-cyan">{state.room.code}{g && playing ? ` · rodada ${g.round}` : ""}</span>
        </div>
        {playing && <CopyInviteButton code={state.room.code} compact />}
        <LeaveButton inGame={playing} onConfirm={() => void doLeave()} />
      </AppHeader>
      <ConnectionBanner show={connection === "reconnecting"} />
      {playing ? <GameTable state={state} busy={busy} actions={actions} /> : <WaitingRoom state={state} busy={busy} onStart={start} />}
      <WinnerOverlay
        open={showWinner}
        winnerName={winnerName}
        isMe={g?.winner_id === state.me}
        isHost={isHost}
        busy={busy}
        canRematch={state.members.length >= 2}
        onRematch={start}
        onClose={() => g && setDismissedRound(g.round)}
      />
    </div>
  );
}