import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { UnoCard } from "./UnoCard";

const RULES: {title: string; text: string; card?: string}[] = [
  {title:"Objetivo",text:"Seja o primeiro a ficar sem cartas. Cada jogador começa com 7 cartas."},
  {title:"Na sua vez",text:"Jogue uma carta compatível e, se quiser, continue com sequências. Aperte Terminar vez. O limite é 60 segundos."},
  {title:"Sequências repetidas",text:"Jogue várias cartas de número ou símbolo igual, mesmo com cores diferentes.",card:"b1"},
  {title:"Sequências numéricas",text:"Jogue 4-5-6 ou 6-5-4 da mesma cor, sem pular números.",card:"g5"},
  {title:"O desafio do 9",text:"Com pelo menos 3 jogadores, todos exceto quem jogou devem apertar 9. O último compra uma carta por 9 jogado.",card:"y9"},
  {title:"Corte",text:"Se tiver exatamente a mesma carta do descarte, pode lançá-la mesmo fora da sua vez; a vez passa a ser sua."},
  {title:"Rebater compras",text:"Use +2 ou +4 para repassar a penalidade acumulada. Sem defesa, compre e passe a vez.",card:"W4"},
  {title:"Comprar",text:"Você pode comprar uma carta por vontade própria e então jogá-la, se servir, ou terminar sua vez."},
  {title:"UNO e denúncia",text:"Aperte UNO discretamente com uma carta. Após 8 segundos, outra pessoa pode segurar Denunciar por 5 segundos; quem esqueceu compra 2."},
  {title:"Tempo",text:"Após 60 segundos, as cartas que você jogou ficam na mesa e a vez termina; se não jogou, compra uma carta e passa."},
  {title:"Bots",text:"O anfitrião pode adicionar bots fáceis ou difíceis durante a espera."},
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
          <DialogDescription>Regras opcionais podem ser ativadas ou desativadas pelo anfitrião antes da partida.</DialogDescription>
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