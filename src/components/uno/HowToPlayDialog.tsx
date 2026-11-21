import type {ReactNode} from "react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {BookOpen,Trophy,Hand,MousePointer2,Hash,Layers3,Repeat2,ArrowDownUp,ShieldAlert} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import {StableCardPreview} from "./StableCardPreview";
import {cardValue} from "@/lib/uno/cards";
import {useLanguage} from "@/lib/uno/i18n";
import type {RuleSettings} from "@/lib/uno/api";
import {DEFAULT_CARD_SETTINGS,type CardSettings,type CustomCardKey} from "@/lib/uno/cardSettings";

type Group="basics"|"colored"|"wild";
export type ManualEntry={
  key:string;pt:string;en:string;descPt:string;descEn:string;
  group:Group;card?:string;icon?:LucideIcon;
};
// One source of truth for the full manual and the hand-only quick reference.
export const RULES:ManualEntry[]=[
  {key:"win",group:"basics",pt:"Como vencer",en:"How to win",icon:Trophy,
    descPt:"Você vence ao descartar todas as cartas. O anfitrião escolhe quantos jogadores serão classificados como vencedores (até N−1); a rodada acaba ao atingir esse número.",
    descEn:"Get rid of all your cards to win. The host chooses how many players can finish as winners (up to N−1)."},
  {key:"uno",group:"basics",pt:"Gritar UNO e denunciar DESUNO",en:"Call UNO and catch DESUNO",icon:ShieldAlert,
    descPt:"Quando estiver com uma carta, aperte UNO, no botão próximo ao seu baralho. Se alguém ficar com uma carta e não gritar, após quatro segundos aperte DESUNO para denunciar: a punição é comprar duas cartas.",
    descEn:"When you have one card, press UNO near your hand/deck. If someone forgets UNO, wait four seconds and press DESUNO to catch them: they draw two cards."},
  {key:"nine",group:"basics",pt:"Regra do 9",en:"The 9 challenge",card:"r9",
    descPt:"Com pelo menos três jogadores e uma jogada terminando em 9, todos os adversários precisam apertar 9; o último compra uma carta por cada 9 consecutivo lançado.",
    descEn:"With at least three players and a turn ending in 9, opponents race to press 9. The last to press draws one card per consecutive 9."},
  {key:"cut",group:"basics",pt:"Corte de turno",en:"Jump-in",icon:MousePointer2,
    descPt:"Se possuir uma carta idêntica à carta visível no descarte, pode lançá-la mesmo fora da vez e roubar o turno. O jogo não avisa quando o corte está disponível.",
    descEn:"If you have a card identical to the one on the discard pile, you can play it out of turn. The game does not highlight jump-ins."},
  {key:"repeat",group:"basics",pt:"Cartas repetidas",en:"Repeated cards",card:"b1",
    descPt:"Na mesma vez, jogue várias cartas do mesmo número ou símbolo, mesmo que sejam de cores diferentes. Depende da configuração da sala.",
    descEn:"Play several cards sharing the same number or symbol, even across colors. This can be disabled in room settings."},
  {key:"sequence",group:"basics",pt:"Sequências numéricas",en:"Number sequences",card:"g5",
    descPt:"Na mesma vez, jogue números consecutivos da mesma cor em ordem crescente ou decrescente, como 3–4–5 ou 5–4–3. Depende da configuração da sala.",
    descEn:"Play consecutive numbers of one color in ascending or descending order, such as 3–4–5 or 5–4–3."},
  {key:"draws",group:"basics",pt:"Compras e rebatidas",en:"Draws and counters",icon:Layers3,
    descPt:"Quando não puder jogar, compre uma carta; se ela for válida, poderá jogá-la. Compras +2, +4 e +2 Volta podem ser rebatidas por compras permitidas, acumulando a dívida. O +5 só pode ser rebatido por outro +5. Você também pode aceitar a dívida e passar.",
    descEn:"Draw one card if you cannot play; you may play it if valid. Draw penalties (+2, +4 and +2 Reverse) can be countered with allowed draw cards, stacking the debt. +5 can only be countered by +5. You may accept the debt instead."},
  {key:"R",group:"colored",pt:"Volta",en:"Reverse",card:"bR",
    descPt:"Inverte o sentido de jogo. Em partidas de dois jogadores, funciona como um bloqueio e você joga novamente.",
    descEn:"Reverses the turn direction. With two players, it skips the opponent and gives you another turn."},
  {key:"S",group:"colored",pt:"Bloqueio",en:"Skip",card:"yS",
    descPt:"Faz o próximo jogador perder a vez. Bloqueios lançados em sequência somam seus efeitos.",
    descEn:"Skips the next player. Consecutive Skip cards stack their effects."},
  {key:"D",group:"colored",pt:"Compra +2",en:"Draw +2",card:"rD",
    descPt:"Adiciona duas cartas à dívida do próximo jogador, que pode aceitar ou revidar com outra compra permitida.",
    descEn:"Adds two cards to the next player's draw debt. They may accept it or counter with an allowed draw card."},
  {key:"T",group:"colored",pt:"Compra +2 Volta",en:"Draw +2 Reverse",card:"bT",
    descPt:"Acrescenta duas cartas à dívida e inverte o sentido do jogo. Também pode revidar uma compra compatível.",
    descEn:"Adds two cards to the debt and reverses direction. It can also counter a compatible draw penalty."},
  {key:"H",group:"colored",pt:"Escudo",en:"Shield",card:"bH",
    descPt:"Protege uma única vez contra Bloqueio, compra, Bomba ou Detetive. Não acumula: mesmo jogando duas cartas, só fica com um Escudo ativo.",
    descEn:"Protects once against Skip, draw penalties, Bomb or Detective. It does not stack: multiple cards still grant one active shield."},
  {key:"E",group:"colored",pt:"Espada",en:"Sword",card:"rE",
    descPt:"Ativa uma carga ofensiva não acumulativa: seu próximo ataque de compra acrescenta +3 à dívida. Se outro jogador também usar Espada ao rebater, os bônus se somam. Ao pagar a dívida, todos veem o golpe.",
    descEn:"A non-stacking offensive charge: your next draw attack adds +3 to the debt. If another player uses Sword while countering, the bonuses add up. Everyone sees the sword strike when the debt is paid."},
  {key:"L",group:"colored",pt:"Cadeado",en:"Lock",card:"gL",
    descPt:"Na próxima vez de cada adversário, só é possível jogar cartas da cor do Cadeado, nunca coringas. Negação cancela a restrição para todos.",
    descEn:"On each rival's next turn, only cards of the Lock's color can be played; no wilds. Negation cancels it for everyone."},
  {key:"V",group:"colored",pt:"Vórtice",en:"Vortex",card:"bV",
    descPt:"Puxa e joga automaticamente as demais cartas dessa cor da sua mão, uma por vez, em ordem aleatória. Os efeitos especiais se acumulam.",
    descEn:"Automatically plays every other card of that color from your hand, one by one in random order. Their special effects stack."},
  {key:"C",group:"colored",pt:"Cerveja",en:"Beer",card:"yC",
    descPt:"Na próxima vez dos adversários, o jogo escolhe uma carta válida aleatória. Sem carta válida, compram e jogam automaticamente se puderem; caso contrário passam.",
    descEn:"On opponents' next turns, the game randomly picks a legal move. If none is available, they draw and auto-play if possible, otherwise pass."},
  {key:"A",group:"colored",pt:"Barata",en:"Cockroach",card:"bA@00000000-0000-4000-8000-000000000001",
    descPt:"Quando jogada cria uma cópia que invade um deck inimigo, sem repetir os jogadores.",
    descEn:"When played, it creates a copy that invades another player’s hand, without repeating players."},
  {key:"W",group:"wild",pt:"Coringa comum",en:"Wild",card:"W",
    descPt:"Pode ser jogado sobre qualquer cor ou número. A carta entra no descarte imediatamente e você escolhe a próxima cor.",
    descEn:"Can be played on any color or number. It enters the discard pile immediately, then you choose the new color."},
  {key:"W4",group:"wild",pt:"Coringa +4",en:"Wild +4",card:"W4",
    descPt:"Escolhe uma cor e adiciona quatro cartas à dívida. Pode ser rebatido com outra compra permitida.",
    descEn:"Chooses a color and adds four cards to the draw debt. It can be countered by another allowed draw card."},
  {key:"W5",group:"wild",pt:"Coringa +5",en:"Wild +5",card:"W5",
    descPt:"Escolhe uma cor e adiciona cinco cartas à dívida. Só pode ser rebatido com outro +5 ou Coringa Dobro.",
    descEn:"Chooses a color and adds five cards to the debt. Only another +5 or Double Wild may counter it."},
  {key:"WD",group:"wild",pt:"Coringa Dobro",en:"Double Wild",card:"WD",
    descPt:"Uma carta por baralho, habilitada por padrão. Novas cópias podem surgir após o reabastecimento. Pode rebater qualquer dívida de compra, inclusive +5: dobra o total acumulado e passa imediatamente após escolher a cor. Sem dívida, funciona como coringa comum.",
    descEn:"One card per deck, enabled by default. More copies may appear when the deck refills. Counters any draw debt including +5, doubles the current total and automatically passes after a color is chosen. Without a debt, acts as a regular wild."},
  {key:"X",group:"wild",pt:"Coringa Detetive",en:"Detective Wild",card:"X",
    descPt:"Escolhe um adversário, vê sua mão por até dez segundos e depois seleciona uma cor. Você pode encerrar a inspeção antes.",
    descEn:"Choose an opponent, inspect their hand for up to ten seconds, then pick a color. You may end inspection early."},
  {key:"B",group:"wild",pt:"Coringa Bomba",en:"Bomb Wild",card:"B",
    descPt:"Todos os adversários sem Escudo compram duas cartas, sem perder a vez.",
    descEn:"Every opponent without a Shield draws two cards, without losing their turn."},
  {key:"N",group:"wild",pt:"Coringa Negação",en:"Negation Wild",card:"N",
    descPt:"Cancela um ataque de Bloqueio, uma dívida de compra ou uma restrição de Cadeado/Sem Poderes. Cancela o efeito para todos quando aplicável.",
    descEn:"Cancels an incoming Skip, draw debt or Lock/Powerless restriction. For global restrictions, it cancels the effect for everyone."},
  {key:"P",group:"wild",pt:"Coringa Sem Poderes",en:"Powerless Wild",card:"P",
    descPt:"Na próxima vez, cada adversário só pode jogar números. Negação encerra esse efeito para todos.",
    descEn:"On their next turn, each opponent may only play number cards. Negation ends the effect for everyone."},
  {key:"M",group:"wild",pt:"Coringa Metralhadora",en:"Machine Gun Wild",card:"M",
    descPt:"Revela uma especial de cada adversário e devolve essas cartas ao baralho, embaralhadas. Cada alvo recebe uma carta numérica nova.",
    descEn:"Reveals one special card from each opponent and shuffles those cards back into the deck. Each target gets a replacement number card."},
  {key:"Q",group:"wild",pt:"Coringa Espelho",en:"Mirror Wild",card:"Q",
    descPt:"Copia a arte e os poderes do último coringa real jogado por qualquer pessoa, inclusive você. Sua borda branca e o brilho reflexivo permanecem. Antes do primeiro coringa, tem a aparência própria de Espelho e age como Coringa comum.",
    descEn:"Copies the last real wild card's artwork and effect, even if you played it yourself. Its reflective sheen and white glowing edge remain. Before the first wild, it shows its own Mirror design and acts as a regular Wild."}
];
/** Room manual: show only enabled optional rules and available card types.
 * The home page continues using the complete RULES list unfiltered. */
export function rulesForRoom(roomRules:RuleSettings,roomCards:Partial<CardSettings>):ManualEntry[]{
  const enabled={...DEFAULT_CARD_SETTINGS,...roomCards};
  const optionalBasics:Record<string,keyof RuleSettings>={
    nine:"nine",cut:"cut",repeat:"repeat",sequence:"sequence"
  };
  const permanentCards=new Set(["R","S","D","W","W4"]);
  return RULES.filter(entry=>{
    if(entry.group==="basics"){
      const rule=optionalBasics[entry.key];
      return !rule||roomRules[rule]===true;
    }
    if(permanentCards.has(entry.key))return true;
    return enabled[entry.key as CustomCardKey]===true;
  }).map(entry=>{
    // The buy-a-card rule is always in force, but debt stacking is optional.
    if(entry.key==="draws"){
      if(!roomRules.stack)return {...entry,pt:"Compras",en:"Drawing cards",
        descPt:"Se não tiver uma carta válida, compre uma. Se ela puder ser jogada, você pode usá-la. Dívidas de compra não podem ser rebatidas ou acumuladas nesta sala; o jogador atingido compra as cartas e passa.",
        descEn:"If you have no playable card, draw one. If it is playable, you may use it. Draw debts cannot be countered or stacked in this room; the affected player draws and passes."};
      const extraPt=[
        enabled.W5?(enabled.WD?"O +5 só pode ser rebatido com outro +5 ou Coringa Dobro.":"O +5 só pode ser rebatido com outro +5."):null,
        enabled.WD?"O Coringa Dobro dobra o total acumulado da dívida.":null
      ].filter(Boolean).join(" ");
      const extraEn=[
        enabled.W5?(enabled.WD?"+5 can only be countered by another +5 or Double Wild.":"+5 can only be countered by another +5."):null,
        enabled.WD?"Double Wild doubles the entire accumulated debt.":null
      ].filter(Boolean).join(" ");
      return {...entry,
        descPt:`Se não tiver carta válida, compre uma; se for possível, jogue-a. As dívidas de compra podem ser rebatidas por cartas permitidas, somando o saldo. ${extraPt} Você também pode aceitar a dívida e passar.`,
        descEn:`If you have no playable card, draw one; you may play it if valid. Draw debts can be countered by permitted cards, stacking the balance. ${extraEn} You may also accept the debt and pass.`};
    }
    if(entry.key==="D"&&!roomRules.stack)return {...entry,
      descPt:"Obriga o próximo jogador a comprar duas cartas. Nesta sala, não é possível rebater.",
      descEn:"Forces the next player to draw two cards. Countering is disabled in this room."};
    if(entry.key==="T"&&!roomRules.stack)return {...entry,
      descPt:"Acrescenta duas cartas à compra obrigatória e inverte o sentido. Nesta sala, não é possível rebater.",
      descEn:"Adds two cards to the mandatory draw and reverses direction. Countering is disabled in this room."};
    if(entry.key==="W4"&&!roomRules.stack)return {...entry,
      descPt:"Escolhe uma cor e obriga o próximo jogador a comprar quatro cartas. Nesta sala, não é possível rebater.",
      descEn:"Chooses a color and forces the next player to draw four cards. Countering is disabled in this room."};
    if(entry.key==="W5"){
      if(!roomRules.stack)return {...entry,
        descPt:"Escolhe uma cor e obriga o próximo jogador a comprar cinco cartas. Nesta sala, não é possível rebater.",
        descEn:"Chooses a color and forces the next player to draw five cards. Countering is disabled in this room."};
      if(!enabled.WD)return {...entry,
        descPt:"Escolhe uma cor e adiciona cinco cartas à dívida. Só pode ser rebatido com outro +5.",
        descEn:"Chooses a color and adds five cards to the debt. Only another +5 can counter it."};
    }
    if(entry.key==="WD"&&!roomRules.stack)return {...entry,
      descPt:"Uma por baralho, podendo aparecer novamente após reabastecimentos. Com rebatidas desativadas nesta sala, funciona apenas como coringa comum para escolher a cor.",
      descEn:"One per deck; more may appear after refills. With countering disabled in this room, it works only as a regular wild to choose the color."};
    if(entry.key==="E"&&!roomRules.stack)return {...entry,
      descPt:"Ativa uma carga ofensiva não acumulativa: seu próximo ataque de compra acrescenta +3 à dívida. O golpe é exibido quando a dívida é paga. Rebatidas estão desativadas.",
      descEn:"Activates a non-stacking offensive charge: your next draw attack adds +3 to the debt. The strike appears when the debt is paid. Countering is disabled."};
    if(entry.key==="L"&&!enabled.N)return {...entry,
      descPt:"Na próxima vez de cada adversário, só é possível jogar cartas da cor do Cadeado, nunca coringas.",
      descEn:"On each opponent's next turn, only cards matching the Lock's color are allowed, never wilds."};
    if(entry.key==="P"&&!enabled.N)return {...entry,
      descPt:"Na próxima vez, cada adversário só pode jogar cartas numéricas.",
      descEn:"On their next turn, each opponent can only play number cards."};
    if(entry.key==="N")return {...entry,
      descPt:`Cancela um Bloqueio ou uma dívida de compra${enabled.L?" ou a restrição de Cadeado":""}${enabled.P?" ou Sem Poderes":""}. Se a restrição for global, cancela para todos.`,
      descEn:`Cancels a Skip or draw debt${enabled.L?", a Lock restriction":""}${enabled.P?", or Powerless":""}. Global restrictions are canceled for everyone.`};
    if(entry.key==="H"&&(!enabled.B||!enabled.X))return {...entry,
      descPt:`Protege uma vez contra Bloqueio ou compras${enabled.B?", Bomba":""}${enabled.X?" ou Detetive":""}. Não acumula: duas cartas Escudo ainda concedem só uma proteção.`,
      descEn:`Protects once against Skip or draw penalties${enabled.B?", Bomb":""}${enabled.X?", or Detective":""}. Does not stack: multiple Shields still give only one protection.`};
    return entry;
  });
}
const MINI_ORDER=["W4","W5","WD","X","B","N","P","M","Q","W","H","E","L","V","C","A","T","D","S","R"];
export function rulesForHand(cards:readonly string[]){
  const values=new Set(cards.map(cardValue));
  return MINI_ORDER.filter(key=>values.has(key)).map(key=>RULES.find(r=>r.key===key)!).filter(Boolean);
}
export function RuleRows({entries,numbered=false}:{entries:ManualEntry[];numbered?:boolean}){
  const {language}=useLanguage();const en=language==="en";
  return <ul className="space-y-2.5">
    {entries.map((r,i)=>{const Icon=r.icon;
      return <li key={r.key} className="flex min-h-[85px] items-center gap-3 rounded-2xl border border-glass-border/50 bg-navy/50 p-3">
        <div className="flex h-[80px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan/20 bg-gradient-to-br from-brand/30 to-cyan/15">
          {r.card?<StableCardPreview card={r.card} width={53}/>:
          Icon?<Icon className="size-9 text-cyan"/>:<Hand className="size-9 text-cyan"/>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-foreground">
            {numbered&&<span className="mr-1.5 text-cyan/80">{i+1}.</span>}{en?r.en:r.pt}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{en?r.descEn:r.descPt}</p>
        </div>
      </li>;
    })}
  </ul>;
}
const GROUPS:{id:Group;pt:string;en:string}[]=[
  {id:"basics",pt:"Como jogar",en:"How to play"},
  {id:"colored",pt:"Cartas especiais coloridas",en:"Colored special cards"},
  {id:"wild",pt:"Coringas",en:"Wild cards"}
];
export function HowToPlayDialog({trigger,roomRules,roomCards}:{
  trigger?:ReactNode;
  roomRules?:RuleSettings|undefined;
  roomCards?:Partial<CardSettings>|undefined;
}){
  const {language}=useLanguage(),en=language==="en";
  const entries=roomRules&&roomCards?rulesForRoom(roomRules,roomCards):RULES;
  return <Dialog>
    <DialogTrigger asChild>{trigger??<Button variant="glass" size="sm" className="h-10 rounded-xl">
      <BookOpen className="size-5"/>{en?"How to play":"Como jogar"}
    </Button>}</DialogTrigger>
    <DialogContent className="glass-strong flex max-h-[88dvh] flex-col overflow-hidden rounded-3xl border-glass-border sm:max-w-xl">
      <DialogHeader className="shrink-0">
        <DialogTitle className="font-display text-2xl">{en?"UNO Pro rulebook":"Manual de regras"}</DialogTitle>
        <DialogDescription>{roomRules&&roomCards
          ?(en?"Only the rules and cards enabled for this room.":"Somente regras e cartas habilitadas nesta sala.")
          :(en?"First learn the basic rules, then browse each special card.":"Primeiro as regras, depois cada carta especial, por categoria.")}
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-2">
        {GROUPS.filter(group=>entries.some(r=>r.group===group.id)).map(group=><section key={group.id}>
          <h3 className="sticky top-0 z-10 mb-2 rounded-xl bg-navy px-3 py-2 font-display text-base font-bold text-cyan">{en?group.en:group.pt}</h3>
          <RuleRows entries={entries.filter(r=>r.group===group.id)} numbered={group.id==="basics"}/>
        </section>)}
      </div>
    </DialogContent>
  </Dialog>;
}
export function HandCardsGuide({cards,trigger}:{cards:readonly string[];trigger:ReactNode}){
  const {language}=useLanguage(),en=language==="en";
  const entries=rulesForHand(cards);
  return <Dialog>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="glass-strong flex max-h-[85dvh] flex-col overflow-hidden rounded-3xl border-glass-border sm:max-w-xl">
      <DialogHeader className="shrink-0">
        <DialogTitle className="font-display text-xl">{en?"What do my cards do?":"O que minhas cartas fazem?"}</DialogTitle>
        <DialogDescription>{en?"Only the special cards currently in your hand.":"Só as cartas não comuns que estão na sua mão agora, sem repetições."}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
        {entries.length?<RuleRows entries={entries}/>:
          <p className="rounded-xl border border-glass-border bg-navy/50 p-4 text-sm text-muted-foreground">
            {en?"Your hand only has number cards.":"Sua mão tem apenas cartas numéricas por enquanto."}
          </p>}
      </div>
    </DialogContent>
  </Dialog>;
}
