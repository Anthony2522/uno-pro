import type { RuleSettings } from "@/lib/uno/api";

const RULE_ITEMS = [
  ["repeat","Cartas repetidas","Jogue duas ou mais cartas com o mesmo número ou símbolo, mesmo com cores diferentes."],
  ["sequence","Sequências numéricas","Jogue números consecutivos da mesma cor em ordem crescente ou decrescente."],
  ["nine","Desafio do 9","Com 3 ou mais jogadores, o último a apertar 9 compra uma carta por 9 jogado."],
  ["cut","Corte de turno","Quem tiver a carta exatamente igual à mesa pode jogar fora da vez."],
  ["stack","Rebater +2 e +4","Acumule compras e permita que o próximo jogador rebata ou aceite a punição."],
] as const;

export function AdvancedRoomSettingsFields({
  startingCards,rules,onStartingCardsChange,onRulesChange,
}:{
  startingCards:number;rules:RuleSettings;
  onStartingCardsChange:(n:number)=>void;
  onRulesChange:(rules:RuleSettings)=>void;
}) {
  return <div className="space-y-3">
    <label className="block rounded-xl border border-glass-border/60 bg-navy/40 p-3">
      <span className="block text-sm font-semibold">Cartas iniciais por jogador</span>
      <span className="mb-2 block text-xs text-muted-foreground">Quantidade distribuída no começo de cada partida (padrão: 8).</span>
      <select value={startingCards} onChange={e=>onStartingCardsChange(Number(e.target.value))}
        aria-label="Cartas iniciais por jogador"
        className="h-11 w-full rounded-xl border border-glass-border bg-navy px-3 text-sm text-foreground">
        {Array.from({length:19},(_,i)=>i+2).map(n=><option key={n} value={n}>{n} cartas</option>)}
      </select>
    </label>
    <p className="text-xs text-muted-foreground">As regras ficam ativadas por padrão. Desmarque as que não quiser utilizar nesta sala.</p>
    {RULE_ITEMS.map(([key,label,description])=>(
      <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-glass-border/60 bg-navy/40 p-3 hover:border-cyan/40">
        <input type="checkbox" checked={rules[key]} onChange={e=>onRulesChange({...rules,[key]:e.target.checked})}
          className="mt-1 size-4 shrink-0 accent-cyan"/>
        <span><span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
      </label>
    ))}
  </div>;
}
