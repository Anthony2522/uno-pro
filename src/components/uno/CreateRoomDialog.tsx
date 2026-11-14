import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Globe, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/uno/api";
import { errorMessage, toGameError } from "@/lib/uno/errors";
import { useReadyGuest } from "@/lib/uno/guest";
import { cn } from "@/lib/utils";

export function CreateRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { guest, resetSession } = useReadyGuest();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [max, setMax] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(`Sala de ${guest.nickname}`.slice(0, 32));
      setError(null);
    }
  }, [open, guest.nickname]);

  const clean = name.replace(/\s+/g, " ").trim();
  const valid = clean.length >= 2 && clean.length <= 32;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("O nome da sala precisa ter de 2 a 32 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { code } = await api.createRoom(guest.token, clean, isPublic, max);
      onOpenChange(false);
      navigate({ to: "/sala/$code", params: { code } });
    } catch (err) {
      if (toGameError(err).code === "INVALID_SESSION") resetSession();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong rounded-3xl border-glass-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Criar sala</DialogTitle>
          <DialogDescription>Você será o anfitrião e poderá iniciar a partida.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="room-name">Nome da sala</Label>
            <div className="relative">
              <Input
                id="room-name"
                value={name}
                maxLength={32}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                className="h-12 rounded-xl border-glass-border bg-navy/60 pr-14 text-base"
                aria-invalid={!!error}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">{clean.length}/32</span>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Visibilidade</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {[
                { v: true, label: "Pública", hint: "Aparece na lista", Icon: Globe },
                { v: false, label: "Privada", hint: "Só com link/código", Icon: Lock },
              ].map(({ v, label, hint, Icon }) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={isPublic === v}
                  onClick={() => setIsPublic(v)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isPublic === v ? "border-cyan bg-cyan/10 shadow-glow-cyan" : "border-glass-border bg-navy/40 hover:border-cyan/40",
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold"><Icon className="size-4" /> {label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Máximo de jogadores</legend>
            <div className="grid grid-cols-7 gap-1.5" role="radiogroup">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={max === n}
                  aria-label={`${n} jogadores`}
                  onClick={() => setMax(n)}
                  className={cn(
                    "h-11 rounded-xl border font-display font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    max === n ? "border-brand-soft bg-gradient-brand text-primary-foreground shadow-glow" : "border-glass-border bg-navy/40 hover:border-brand-soft/50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy || !valid}>
            {busy && <Loader2 className="animate-spin" />} Criar e abrir sala
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}