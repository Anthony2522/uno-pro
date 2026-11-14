import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { UnoCard } from "./UnoCard";

const RULES: { title: string; text: string; card?: string }[] = [
  { title: "Objetivo", text: "Seja o primeiro a ficar sem cartas. Cada jogador começa com 7, e a primeira carta da mesa é sempre um número." },
  { title: "Na sua vez", text: "Jogue uma carta da mesma cor, número ou símbolo da carta do topo. Coringas valem sempre." , card: "g7"},
  { title: "Comprar", text: "Sem jogada (ou se preferir), compre 1 carta. Se ela servir, jogue-a ou passe. Se não servir, a vez passa sozinha." },
  { title: "Pular", text: "O próximo jogador perde a vez.", card: "rS" },
  { title: "Inverter", text: "Muda o sentido do jogo. Com 2 jogadores, funciona como Pular.", card: "yR" },
  { title: "+2", text: "O próximo compra 2 cartas e perde a vez. Não dá para acumular.", card: "bD" },
  { title: "Coringa", text: "Jogue em qualquer carta e escolha a nova cor.", card: "W" },
  { title: "Coringa +4", text: "Escolha a cor; o próximo compra 4 e perde a vez. Pode ser jogado a qualquer momento.", card: "W4" },
  { title: "UNO!", text: "Ficou com 1 carta? Aperte UNO! Se esquecer, alguém pode apertar “Pegar!” e você compra 2. Na sua vez, com 2 cartas, já dá para gritar antes de jogar." },
  { title: "Conexão", text: "Caiu a internet? Você volta como o mesmo jogador ao reabrir o link. Se ficar mais de 30 s fora na sua vez, compra 1 e a vez passa; após 5 min fora, sai da partida." },
];

export function HowToPlayDialog({ trigger }: { trigger?: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="glass" size="sm" className="h-10 rounded-xl">
            <BookOpen /> <span className="hidden sm:inline">Como jogar</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass-strong max-h-[88dvh] overflow-y-auto rounded-3xl border-glass-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Como jogar</DialogTitle>
          <DialogDescription>Regras simples do UNO Pro, iguais para todo mundo na mesa.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {RULES.map((r) => (
            <li key={r.title} className="flex items-start gap-3 rounded-2xl bg-navy/40 p-3">
              {r.card ? <UnoCard card={r.card} size="sm" /> : <span className="mt-1 size-2.5 shrink-0 rounded-full bg-cyan" aria-hidden />}
              <div>
                <p className="font-display text-sm font-bold">{r.title}</p>
                <p className="text-sm text-muted-foreground">{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}