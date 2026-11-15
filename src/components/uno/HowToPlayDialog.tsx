import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, Trophy, Hand, ArrowDownUp, Timer, Users, Eye, Crown, Zap, Layers3, ShieldAlert, MousePointer2 } from "lucide-react";
import { UnoCard } from "./UnoCard";
import { useLanguage } from "@/lib/uno/i18n";
import type { LucideIcon } from "lucide-react";

type Rule={pt:string;en:string;descPt:string;descEn:string;card?:string;icon?:LucideIcon};
const RULES:Rule[]=[
  {pt:"Objetivo e classificação",en:"Goal and placements",descPt:"A quantidade de vencedores é configurada pelo anfitrião (máximo de N−1 jogadores). A partida acaba quando essa quantidade vence.",descEn:"The host chooses how many players can win (up to N−1). The match ends when that many finish.",icon:Trophy},
  {pt:"Começando a partida",en:"Starting the match",descPt:"O primeiro jogador e o sentido são aleatórios. Todos recebem 8 cartas por padrão (de 2 a 20, a critério do anfitrião).",descEn:"The first player and direction are random. Players receive 8 cards by default (the host may choose 2–20).",icon:Users},
  {pt:"Sua vez",en:"Your turn",descPt:"Jogue uma ou mais cartas compatíveis e aperte Terminar vez. O limite é 50 segundos, sem travas durante avisos. Duas vezes seguidas sem agir até o limite removem o jogador.",descEn:"Play one or more compatible cards and press End turn. You have 50 seconds, and announcements never block actions. Two consecutive inactive timeouts remove a player.",icon:Hand},
  {pt:"Comprar carta",en:"Drawing a card",descPt:"Você pode comprar uma carta e ainda jogar qualquer carta válida da sua mão. Sem jogada, compre e passe.",descEn:"You may draw a card and still play any valid card from your hand. With no playable card, draw and pass.",icon:Layers3},
  {pt:"Repetições",en:"Repeated cards",descPt:"Jogue várias cartas com o mesmo valor ou símbolo, inclusive em cores diferentes.",descEn:"Play multiple cards with the same value or symbol, even across different colors.",card:"b1"},
  {pt:"Sequências numéricas",en:"Number runs",descPt:"Jogue números em ordem crescente ou decrescente da mesma cor, como 4–5–6 ou 6–5–4.",descEn:"Play ascending or descending consecutive numbers of the same color, e.g. 4–5–6 or 6–5–4.",card:"g5"},
  {pt:"Bloqueio e inversão",en:"Skip and reverse",descPt:"Bloqueios acumulam. Duas inversões se anulam. Em duelos de dois, a inversão comum permite jogar de novo.",descEn:"Skips stack. Two reverse cards cancel out. In a two-player match, an ordinary reverse lets you go again.",card:"yS"},
  {pt:"Compras e rebatidas",en:"Draw penalties and stacking",descPt:"+2 e +4 podem ser rebatidos com qualquer compra permitida, sem restrição de cor. O somatório passa ao próximo.",descEn:"+2 and +4 may be countered with any allowed draw card, regardless of color. The sum passes to the next player.",card:"W4"},
  {pt:"+2 Volta",en:"+2 Reverse",descPt:"Soma +2 e inverte o sentido, inclusive ao rebater. Em partidas com dois jogadores, funciona como +2 normal, sem repetir a vez.",descEn:"Adds 2 and reverses direction, including while countering. With two players, it works like a regular +2 and does not give an extra turn.",card:"bT"},
  {pt:"Coringa +5",en:"Wild +5",descPt:"Soma cinco cartas e permite escolher uma cor. Só outro +5 pode rebatê-lo.",descEn:"Adds five cards and lets you choose a color. Only another +5 can counter it.",card:"W5"},
  {pt:"Coringa Detetive",en:"Detective Wild",descPt:"Escolha um adversário, examine a mão dele por até dez segundos e só então escolha a cor. Toque para encerrar a inspeção antes.",descEn:"Pick an opponent, inspect their hand for up to ten seconds and then choose a color. Tap to finish early.",card:"X"},
  {pt:"Coringa Bomba",en:"Bomb Wild",descPt:"Há somente um no baralho. Todos os seus adversários compram duas cartas, mas ninguém perde a vez.",descEn:"Only one per deck. Every opponent draws two cards, but no one loses their turn.",card:"B"},
  {pt:"Coringa Negação",en:"Negation Wild",descPt:"Uma única carta. Pode anular um Bloqueio, +2, +4 ou +5 contra você, ou cancelar a restrição Sem Poderes.",descEn:"One card. Negates an incoming Skip, +2, +4 or +5, or cancels a Powerless restriction.",card:"N"},
  {pt:"Coringa Sem Poderes",en:"Powerless Wild",descPt:"Restringe a próxima vez de cada adversário a cartas numéricas. Uma Negação encerra o efeito para todos.",descEn:"Restricts each opponent’s next turn to number cards. Negation ends the effect for everyone.",card:"P"},
  {pt:"Coringa Metralhadora",en:"Machine Gun Wild",descPt:"Revela uma especial de cada rival, devolve todas ao baralho embaralhado e entrega uma numérica nova com brilho temporário.",descEn:"Reveals one special card per opponent, shuffles those cards into the draw deck and replaces them with glowing number cards.",card:"M"},
  {pt:"Escudo",en:"Shield",descPt:"Duas cartas por cor. Protege uma única vez contra Bloqueio, compra (+2, +4 ou +5), Bomba ou Detetive. Não acumula: dois escudos continuam valendo uma proteção.",descEn:"Two per color. Protects once against Skip, draw attacks (+2, +4 or +5), Bomb or Detective. Non-stacking: playing two still gives just one protection.",card:"bH"},
  {pt:"Vórtice",en:"Vortex",descPt:"Duas por cor. Puxa automaticamente todas as outras cartas dessa cor da sua mão, uma a uma em ordem aleatória. Os efeitos especiais se somam e a vez termina.",descEn:"Two per color. Automatically plays every other card of its color from your hand in random order. Special effects accumulate, and your turn ends.",card:"bV"},
  {pt:"Cerveja",en:"Beer",descPt:"Uma por cor. Na próxima vez de cada adversário, o jogo escolhe automaticamente uma jogada válida ao acaso. Se não houver, compra uma carta, joga se puder, ou passa.",descEn:"One per color. On each opponent's next turn, the game randomly plays one legal card for them. With none available, they draw one and automatically play it if legal, otherwise pass.",card:"yC"},
  {pt:"Desafio do 9",en:"The 9 challenge",descPt:"Com três ou mais jogadores, só vale se o descarte terminar em 9. Quem for último a apertar compra uma carta por cada 9 final.",descEn:"With 3+ players, the top discarded card must be 9. The last to press draws a card for every consecutive 9 at the end.",card:"r9"},
  {pt:"Corte",en:"Jump-in",descPt:"Se tiver exatamente a carta do topo, pode cortar fora da vez e roubar a jogada. O jogo não indica cortes possíveis.",descEn:"If you hold the exact top card, you can jump in out of turn. The game does not reveal jump-in opportunities.",icon:MousePointer2},
  {pt:"Gritar e denunciar UNO",en:"Call and catch UNO",descPt:"Com uma carta, grite UNO discretamente. Depois de quatro segundos, um adversário pode apertar Desuno para denunciar todos que não gritaram. A punição é +2 por pessoa.",descEn:"At one card, call UNO quietly. After four seconds, an opponent can tap Desuno to catch everyone who forgot. Penalty: +2 each.",icon:ShieldAlert},
  {pt:"Organizar as cartas",en:"Sort your hand",descPt:"Alterne entre ordenar por cor e por valor. A segunda linha continua a sequência da primeira.",descEn:"Switch between color and number ordering. The second row continues the ordering from the first.",icon:ArrowDownUp},
  {pt:"Tempo limite",en:"Turn timer",descPt:"Você tem 50 segundos para a jogada. Se já lançou cartas, elas ficam; se não, compra uma carta e passa.",descEn:"You have 50 seconds. Already-played cards stay; if you played nothing, draw one and pass.",icon:Timer},
  {pt:"Bots",en:"Bots",descPt:"O anfitrião pode adicionar bots fáceis e difíceis. Eles jogam, cortam, gritam e denunciam UNO.",descEn:"The host can add easy or hard bots. They play, jump in, call and catch UNO.",icon:Crown},
];

export function HowToPlayDialog({trigger}:{trigger?:React.ReactNode}){
  const {language}=useLanguage();
  const en=language==="en";
  return <Dialog>
    <DialogTrigger asChild>{trigger??<Button variant="glass" size="sm" className="h-10 rounded-xl" aria-label={en?"How to play":"Como jogar"}>
      <BookOpen className="size-5"/><span className="hidden sm:inline">{en?"How to play":"Como jogar"}</span>
    </Button>}</DialogTrigger>
    <DialogContent className="glass-strong max-h-[86dvh] overflow-y-auto rounded-3xl border-glass-border sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">{en?"How to play":"Como jogar"}</DialogTitle>
        <DialogDescription>{en?"Optional rules are configured when the room is created.":"As regras opcionais podem ser ajustadas ao criar a sala."}</DialogDescription>
      </DialogHeader>
      <ul className="space-y-2.5">
        {RULES.map((r,i)=>{
          const Icon=r.icon;
          return <li key={r.pt} className="flex min-h-[90px] items-center gap-3 rounded-2xl border border-glass-border/50 bg-navy/50 p-3">
            <div className="flex h-[84px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan/20 bg-gradient-to-br from-brand/30 to-cyan/15">
              {r.card?<UnoCard card={r.card} size="sm" className="!w-[53px] !rounded-lg"/>:
                Icon?<Icon className="size-9 text-cyan drop-shadow-[0_0_12px_rgba(34,211,238,.5)]" strokeWidth={1.8}/>:<Zap className="size-9 text-cyan"/>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-foreground"><span className="mr-1.5 text-cyan/80">{i+1}.</span>{en?r.en:r.pt}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{en?r.descEn:r.descPt}</p>
            </div>
          </li>;
        })}
      </ul>
    </DialogContent>
  </Dialog>;
}
