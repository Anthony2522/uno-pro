import type { RuleSettings } from "@/lib/uno/api";
import {CUSTOM_COLOR_CARDS,CUSTOM_WILD_CARDS,type CardSettings,type CustomCardKey} from "@/lib/uno/cardSettings";
import {UnoCard} from "./UnoCard";

const RULE_ITEMS=[
  ["nine","Regra do 9","Com três ou mais participantes, o último a apertar 9 compra cartas."],
  ["repeat","Cartas repetidas","Permite lançar várias cartas do mesmo número ou símbolo, inclusive em cores diferentes."],
  ["sequence","Sequências numéricas","Permite números consecutivos da mesma cor, para cima ou para baixo."],
  ["cut","Corte de turno","Uma carta idêntica à do topo permite roubar a vez."],
] as const;

function CardGroup({title,items,cards,onChange}:{title:string;
  items:readonly {key:CustomCardKey;name:string;count:number;description:string}[];
  cards:CardSettings;onChange:(next:CardSettings)=>void;
}){
  return <section className="space-y-2" aria-label={title}>
    <h3 className="px-1 pt-2 font-display text-sm font-bold text-cyan">{title}</h3>
    {items.map(item=>(
      <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-glass-border/60 bg-navy/40 p-2.5 hover:border-cyan/40">
        <input type="checkbox" checked={cards[item.key]} onChange={e=>onChange({...cards,[item.key]:e.target.checked})}
          className="size-4 shrink-0 accent-cyan" aria-label={item.name}/>
        <UnoCard card={item.key==="A"?"bA@00000000-0000-4000-8000-000000000001":item.key.length>1||["X","B","N","P","M","Q"].includes(item.key)?item.key:"b"+item.key}
          size="sm" className="!w-12 shrink-0"/>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{item.name} <span className="font-normal text-muted-foreground">· {item.count} no baralho</span></span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
        </span>
      </label>
    ))}
  </section>;
}

export function AdvancedRoomSettingsFields({
  startingCards,rules,cards,onStartingCardsChange,onRulesChange,onCardsChange,
}:{
  startingCards:number;rules:RuleSettings;cards:CardSettings;
  onStartingCardsChange:(n:number)=>void;onRulesChange:(rules:RuleSettings)=>void;
  onCardsChange:(cards:CardSettings)=>void;
}){
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Todas as regras e cartas opcionais vêm ativadas. As cartas comuns (números, Volta, Bloqueio, +2, Coringa e +4) permanecem no baralho.</p>
    <section aria-label="Regras opcionais" className="space-y-2">
      <h3 className="px-1 font-display text-sm font-bold text-cyan">Regras da partida</h3>
      {RULE_ITEMS.map(([key,label,description])=>(
        <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-glass-border/60 bg-navy/40 p-3 hover:border-cyan/40">
          <input type="checkbox" checked={rules[key]} onChange={e=>onRulesChange({...rules,[key]:e.target.checked})}
            className="mt-1 size-4 shrink-0 accent-cyan"/>
          <span><span className="block text-sm font-semibold">{label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
        </label>
      ))}
    </section>
    <CardGroup title="Cartas especiais coloridas" items={CUSTOM_COLOR_CARDS} cards={cards} onChange={onCardsChange}/>
    <CardGroup title="Coringas especiais" items={CUSTOM_WILD_CARDS} cards={cards} onChange={onCardsChange}/>
    <label className="block rounded-xl border border-glass-border/60 bg-navy/40 p-3">
      <span className="block text-sm font-semibold">Cartas iniciais por jogador</span>
      <span className="mb-2 block text-xs text-muted-foreground">De 2 a 20 cartas; padrão de 8.</span>
      <select value={startingCards} onChange={e=>onStartingCardsChange(Number(e.target.value))}
        aria-label="Cartas iniciais por jogador"
        className="h-11 w-full rounded-xl border border-glass-border bg-navy px-3 text-sm text-foreground">
        {Array.from({length:19},(_,i)=>i+2).map(n=><option key={n} value={n}>{n} cartas</option>)}
      </select>
    </label>
  </div>;
}
