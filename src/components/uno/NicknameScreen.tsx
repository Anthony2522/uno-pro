import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { Logo } from "./Logo";
import { NicknameForm } from "./NicknameForm";
import { CardBack, UnoCard } from "./UnoCard";
import { useGuest } from "@/lib/uno/guest";

export function NicknameScreen() {
  const { register, lastName } = useGuest();
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => {
    const m = window.location.pathname.match(/\/sala\/([A-Za-z0-9]+)/);
    setInvite(m?.[1] ? m[1].toUpperCase() : null);
  }, []);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-6 top-[12%] animate-float opacity-70 [--rot:-18deg] sm:left-[12%]"><UnoCard card="rD" size="lg" rotate={-18} /></div>
        <div className="absolute -right-8 top-[18%] animate-float opacity-60 [animation-delay:1.2s] sm:right-[14%]"><UnoCard card="W4" size="lg" rotate={14} /></div>
        <div className="absolute bottom-[8%] left-[6%] hidden animate-float opacity-50 [animation-delay:0.6s] sm:block"><CardBack size="lg" rotate={10} /></div>
        <div className="absolute bottom-[10%] right-[8%] hidden animate-float opacity-50 [animation-delay:2s] sm:block"><UnoCard card="b7" size="md" rotate={-10} /></div>
      </div>
      <section className="glass-strong relative w-full max-w-md rounded-3xl p-6 sm:p-8 animate-pop">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <h1 className="text-center text-2xl font-bold sm:text-3xl">Como podemos te chamar?</h1>
        <p className="mt-2 text-center text-muted-foreground">Sem cadastro, sem e-mail. Só um apelido e bora jogar.</p>
        {invite && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm">
            <Ticket className="size-5 shrink-0 text-cyan" aria-hidden />
            <span>
              Você foi convidado para a sala <strong className="font-display tracking-widest">{invite}</strong>. Depois do apelido, você entra direto.
            </span>
          </div>
        )}
        <div className="mt-6">
          <NicknameForm initial={lastName} onSubmit={register} />
        </div>
      </section>
    </main>
  );
}