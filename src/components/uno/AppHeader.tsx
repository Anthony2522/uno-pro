import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "./Logo";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { NicknameForm } from "./NicknameForm";
import { PlayerAvatar } from "./PlayerAvatar";
import { useReadyGuest } from "@/lib/uno/guest";
import { useMuted } from "@/lib/uno/useMuted";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { guest, rename } = useReadyGuest();
  const [open, setOpen] = useState(false);
  const [muted, toggleMuted] = useMuted();

  return (
    <header className="sticky top-0 z-30 border-b border-glass-border bg-navy/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6">
        <Link to="/" className="mr-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="UNO Pro — início">
          <Logo size="sm" />
        </Link>
        {children}
        <HowToPlayDialog />
        <Button variant="glass" size="iconLg" onClick={toggleMuted} aria-label={muted ? "Ativar sons" : "Desativar sons"} aria-pressed={!muted}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
        <Button variant="glass" className="h-11 max-w-[11rem] rounded-xl pl-1.5 pr-3" onClick={() => setOpen(true)} aria-label={`Apelido: ${guest.nickname}. Editar apelido`}>
          <PlayerAvatar id={guest.guest_id} name={guest.nickname} size="sm" />
          <span className="truncate font-semibold">{guest.nickname}</span>
          <Pencil className="text-muted-foreground" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-strong rounded-3xl border-glass-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Editar apelido</DialogTitle>
            <DialogDescription>Todos nas suas salas verão o novo nome na hora.</DialogDescription>
          </DialogHeader>
          <NicknameForm
            initial={guest.nickname}
            submitLabel="Salvar"
            onSubmit={async (n) => {
              await rename(n);
              setOpen(false);
              toast.success("Apelido atualizado!");
            }}
          />
        </DialogContent>
      </Dialog>
    </header>
  );
}