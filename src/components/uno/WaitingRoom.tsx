import { Bot, Crown, Globe, Loader2, Lock, Play, Trophy, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoomState } from "@/lib/uno/api";
import { PlayerAvatar } from "./PlayerAvatar";
import { CopyInviteButton } from "./RoomTopBar";
import { cn } from "@/lib/utils";

export function WaitingRoom({
  state,
  busy,
  onStart,
  onAddBot,
  onRemoveBot,
}: {
  state: RoomState;
  busy: boolean;
  onStart: () => void;
  onAddBot: (difficulty: "easy" | "hard") => void;
  onRemoveBot: (id: string) => void;
}) {
  const { room, members, me, game } = state;
  const isHost = room.host_id === me;
  const host = members.find((m) => m.is_host);
  const canStart = members.length >= 2;
  const empty = Math.max(0, room.max_players - members.length);
  const lastWinner = game?.status === "finished" && game.winner_id ? members.find((m) => m.id === game.winner_id)?.nickname ?? game.last_action?.name : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pt-10">
      {lastWinner && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm animate-pop">
          <Trophy className="size-5 shrink-0 text-warning" aria-hidden />
          <span>
            <strong>{lastWinner}</strong> venceu a rodada {game!.round}! {isHost ? "Inicie a revanche quando quiser." : "Aguardando o anfitrião iniciar a revanche."}
          </span>
        </div>
      )}

      <section className="glass-strong relative overflow-hidden rounded-3xl p-5 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/50 px-2.5 py-1">
              {room.is_public ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
              {room.is_public ? "Sala pública" : "Sala privada"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/50 px-2.5 py-1">
              <Crown className="size-3.5 text-warning" /> Anfitrião: <strong className="text-foreground">{host?.nickname ?? "—"}</strong>
            </span>
          </div>
          <h1 className="mt-3 break-words text-2xl font-black sm:text-4xl">{room.name}</h1>

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-glass-border bg-navy/50 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Código da sala</p>
              <p className="mt-1 font-display text-3xl font-black tracking-[0.3em] text-cyan sm:text-4xl" aria-label={`Código ${room.code.split("").join(" ")}`}>
                {room.code}
              </p>
            </div>
            <div className="flex gap-2">
              <CopyInviteButton code={room.code} />

            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="players-title" className="glass mt-6 rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="players-title" className="text-lg font-bold">Jogadores</h2>
          <span className="font-display text-sm tabular-nums text-muted-foreground">{members.length}/{room.max_players}</span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <li key={m.id} className={cn("flex items-center gap-3 rounded-2xl border bg-navy/40 p-3 animate-pop", m.id === me ? "border-cyan/40" : "border-glass-border")}>
              <PlayerAvatar id={m.id} name={m.nickname} online={m.online} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.nickname} {m.id === me && <span className="text-sm font-normal text-cyan">(você)</span>}
                </p>
                <p className={cn("text-xs", m.online ? "text-success" : "text-muted-foreground")}>{m.bot ? (m.difficulty==="hard" ? "Bot difícil" : "Bot fácil") : m.online ? "Online" : "Desconectado"}</p>
              </div>
              {m.bot && isHost && (
                <button type="button" title="Remover bot" aria-label={`Remover ${m.nickname}`} onClick={()=>onRemoveBot(m.id)} disabled={busy} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"><X className="size-4" /></button>
              )}
              {m.is_host && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">
                  <Crown className="size-3.5" /> Anfitrião
                </span>
              )}
            </li>
          ))}
          {Array.from({ length: Math.min(empty, 4) }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-glass-border p-3 text-muted-foreground">
              <span className="inline-flex size-11 items-center justify-center rounded-full border border-dashed border-glass-border">
                <UserPlus className="size-4" />
              </span>
              <span className="text-sm">Vaga livre</span>
            </li>
          ))}
        </ul>
      </section>

      {isHost && (
        <section className="glass mt-5 rounded-3xl p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display font-bold"><Bot className="size-5 text-cyan" /> Adicionar bots</h2>
          <p className="mt-2 text-sm text-muted-foreground">Preencha as vagas com jogadores automáticos. O modo fácil escolhe a melhor jogada em 60% das decisões; o difícil sempre prioriza as melhores jogadas disponíveis.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="glass" className="h-11 rounded-xl" disabled={busy||members.length>=room.max_players} onClick={()=>onAddBot("easy")}><Bot /> + Bot fácil</Button>
            <Button variant="cyan" className="h-11 rounded-xl" disabled={busy||members.length>=room.max_players} onClick={()=>onAddBot("hard")}><Bot /> + Bot difícil</Button>
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-glass-border bg-navy/80 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 sm:flex-row">
          {isHost ? (
            <>
              <p className="flex-1 text-center text-sm text-muted-foreground sm:text-left">
                {canStart ? `${members.length} jogadores prontos. Bora?` : "Aguardando mais jogadores (mínimo 2). Mande o link!"}
              </p>
              <Button variant="hero" size="xl" className="w-full sm:w-auto" disabled={!canStart || busy} onClick={onStart}>
                {busy ? <Loader2 className="animate-spin" /> : <Play />} {game ? "Jogar novamente" : "Iniciar partida"}
              </Button>
            </>
          ) : (
            <p className="flex w-full items-center justify-center gap-2 py-3 text-center font-semibold" role="status">
              <Loader2 className="size-4 animate-spin text-cyan" /> Aguardando {host?.nickname ?? "o anfitrião"} iniciar a partida…
            </p>
          )}
        </div>
      </div>
    </main>
  );
}