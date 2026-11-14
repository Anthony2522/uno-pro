import { forwardRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseRoomCode } from "@/lib/uno/cards";

export const JoinByCode = forwardRef<HTMLInputElement>(function JoinByCode(_props, ref) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = parseRoomCode(value);
    if (!code) {
      setError("Digite um código de sala válido (ex.: K7MX2P) ou cole o link do convite.");
      return;
    }
    navigate({ to: "/sala/$code", params: { code } });
  }

  return (
    <section aria-labelledby="join-code-title" className="glass rounded-3xl p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="size-5 text-cyan" aria-hidden />
        <h2 id="join-code-title" className="text-lg font-bold">Tem um código?</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Salas privadas não aparecem na lista. Digite o código ou cole o link que seu amigo mandou.</p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" noValidate>
        <label htmlFor="room-code" className="sr-only">Código ou link da sala</label>
        <Input
          id="room-code"
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Código ou link"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error}
          className="h-12 rounded-xl border-glass-border bg-navy/60 font-display text-base tracking-widest placeholder:font-sans placeholder:tracking-normal"
        />
        <Button type="submit" variant="hero" className="h-12 rounded-xl px-6">Entrar</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
});