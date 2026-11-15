import { Loader2, Play, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { UnoCard } from "./UnoCard";

export function WinnerOverlay({
  open, winnerName, secondWinnerName, secondIsMe, isMe, isHost, busy, canRematch, onRematch, onClose, placements, viewerId,
}: {
  open: boolean; winnerName: string; secondWinnerName: string; secondIsMe: boolean; isMe: boolean; isHost: boolean; busy: boolean; canRematch: boolean;
  onRematch: () => void; onClose: () => void;
  placements?: Array<{id:string;name:string;rank:number}>;viewerId?:string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong overflow-hidden rounded-3xl border-glass-border text-center sm:max-w-md">
        <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center gap-2 opacity-70" aria-hidden>
          <UnoCard card="W4" size="sm" rotate={-20} className="animate-float [--rot:-20deg]" />
          <UnoCard card="y7" size="sm" rotate={8} className="animate-float [--rot:8deg] [animation-delay:0.5s]" />
          <UnoCard card="gS" size="sm" rotate={22} className="animate-float [--rot:22deg] [animation-delay:1s]" />
        </div>
        <div className="mx-auto mt-14 flex size-20 items-center justify-center rounded-full bg-gradient-brand shadow-glow animate-pop">
          <Trophy className="size-10 text-primary-foreground" />
        </div>
        <DialogTitle className="font-display text-3xl font-black">{isMe ? "Você venceu!" : `${winnerName} venceu!`}</DialogTitle>
        {!!placements?.length&&<div className="mt-2 flex flex-col items-center gap-1 rounded-xl border border-cyan/20 bg-navy/40 p-3">
          {placements.map(p=><p key={p.id} className="font-display text-sm font-bold">
            {p.rank===1?"🥇":p.rank===2?"🥈":p.rank===3?"🥉":"🏆"} {p.rank}º {p.id===viewerId?"Você":p.name}
          </p>)}
        </div>}
        {!placements?.length&&secondWinnerName&&<div className="mt-2 flex flex-col items-center gap-1 rounded-xl border border-cyan/20 bg-navy/40 p-3">
          <p className="font-display text-sm font-bold text-warning">🥇 1º {winnerName}</p>
          <p className="font-display text-sm font-bold text-cyan">🥈 2º {secondIsMe?"Você":secondWinnerName}</p>
        </div>}
        <DialogDescription>{isMe ? "Mão zerada. Que jogada!" : "Fim da rodada. Revanche?"}</DialogDescription>
        <div className="mt-2 flex flex-col gap-2">
          {isHost ? (
            <Button variant="hero" size="xl" onClick={onRematch} disabled={busy || !canRematch}>
              {busy ? <Loader2 className="animate-spin" /> : <Play />} Jogar novamente
            </Button>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Aguardando o anfitrião iniciar a revanche…</p>
          )}
          {isHost && !canRematch && <p className="text-sm text-muted-foreground">É preciso pelo menos 2 jogadores na sala.</p>}
          <Button variant="glass" className="h-11 rounded-xl" onClick={onClose}>Ver sala de espera</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}