import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/uno/errors";
import { cn } from "@/lib/utils";

export function cleanNickname(v: string) {
  return v.replace(/\s+/g, " ").trim();
}

export function NicknameForm({
  initial = "",
  submitLabel = "Continuar",
  onSubmit,
  autoFocus = true,
}: {
  initial?: string;
  submitLabel?: string;
  onSubmit: (nickname: string) => Promise<void>;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = cleanNickname(value);
  const valid = clean.length >= 2 && clean.length <= 18;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("O apelido precisa ter de 2 a 18 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(clean);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label htmlFor="nickname" className="sr-only">
        Apelido
      </label>
      <div className="relative">
        <Input
          id="nickname"
          autoFocus={autoFocus}
          autoComplete="nickname"
          maxLength={18}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Seu apelido"
          aria-invalid={!!error}
          aria-describedby="nickname-hint"
          className="h-14 rounded-2xl border-glass-border bg-navy/60 pr-16 text-lg font-semibold placeholder:text-muted-foreground/70 focus-visible:ring-2"
        />
        <span className={cn("absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums", clean.length > 18 ? "text-destructive" : "text-muted-foreground")}>
          {clean.length}/18
        </span>
      </div>
      <p id="nickname-hint" role={error ? "alert" : undefined} className={cn("min-h-5 text-sm", error ? "text-destructive" : "text-muted-foreground")}>
        {error ?? "De 2 a 18 caracteres. Seus amigos vão ver esse nome."}
      </p>
      <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy || !valid}>
        {busy && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}