import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Volume2, VolumeX, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "./Logo";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { NicknameForm } from "./NicknameForm";
import { PlayerAvatar } from "./PlayerAvatar";
import { useReadyGuest } from "@/lib/uno/guest";
import { useMuted } from "@/lib/uno/useMuted";
import { useLanguage } from "@/lib/uno/i18n";
import { Input } from "@/components/ui/input";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { guest, rename, isDev, activateDev } = useReadyGuest();
  const { language, toggleLanguage } = useLanguage();
  const [devKey,setDevKey]=useState("");
  const [devBusy,setDevBusy]=useState(false);
  const [devError,setDevError]=useState("");
  const [open, setOpen] = useState(false);
  const [muted, toggleMuted] = useMuted();

  return (
    <header className="sticky top-0 z-30 border-b border-glass-border bg-navy/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6">
        <Link to="/" className="mr-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="UNO Pro — início">
          <Logo size="sm" />
        </Link>
        {children}
        <Button variant="glass" size="iconLg" className="h-10 w-10 shrink-0 rounded-xl p-1" onClick={toggleLanguage}
          aria-label={language==="pt"?"Switch to English":"Mudar para português"}
          title={language==="pt"?"English":"Português"}>
          <span className="text-2xl" aria-hidden>{language==="pt"?"🇺🇸":"🇧🇷"}</span>
        </Button>
        <HowToPlayDialog />
        <Button variant="glass" size="iconLg" onClick={toggleMuted} aria-label={muted ? "Ativar sons" : "Desativar sons"} aria-pressed={!muted}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
        <Button variant="glass" className="h-11 max-w-[11rem] shrink-0 rounded-xl pl-1.5 pr-1.5 sm:pr-3" onClick={() => setOpen(true)} aria-label={`Apelido: ${guest.nickname}. Editar apelido`}>
          <PlayerAvatar id={guest.guest_id} name={guest.nickname} size="sm" />
          <span className="hidden truncate font-semibold sm:inline">{guest.nickname}</span>
          {isDev&&<ShieldCheck className="size-4 text-cyan"/>}
          <Pencil className="hidden size-4 text-muted-foreground sm:inline" />
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
          {guest.nickname.toLocaleLowerCase("pt-BR")==="toninho" && (
            <div className="mt-4 space-y-2 rounded-xl border border-cyan/30 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4"/> Acesso desenvolvedor {isDev?"✓":""}</p>
              {!isDev && <form onSubmit={async e=>{
                e.preventDefault();setDevBusy(true);setDevError("");
                try{await activateDev(devKey);setDevKey("");toast.success("Dev ativado");setOpen(false)}
                catch(err){setDevError(String((err as Error).message??"Senha incorreta"))}
                finally{setDevBusy(false)}
              }} className="flex gap-2">
                <Input type="password" autoComplete="off" value={devKey}
                  onChange={e=>setDevKey(e.target.value)} placeholder="Senha de desenvolvedor" className="min-w-0 flex-1"/>
                <Button disabled={devBusy||!devKey} type="submit" variant="cyan">Autenticar</Button>
              </form>}
              {devError&&<p role="alert" className="text-sm text-destructive">{devError}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </header>
  );
}