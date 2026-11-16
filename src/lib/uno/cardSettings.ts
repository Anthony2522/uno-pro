/** Optional custom cards. W, W4, R, S and D are permanent UNO Pro essentials. */
export const CUSTOM_COLOR_CARDS=[
  {key:"T",name:"Compra +2 Volta",count:8,description:"Compra duas e inverte o sentido."},
  {key:"H",name:"Escudo",count:8,description:"Defende uma vez contra ataques."},
  {key:"E",name:"Espada",count:8,description:"Seu próximo ataque de compra adiciona +3 à dívida."},
  {key:"L",name:"Cadeado",count:8,description:"Restringe cada rival à cor do Cadeado."},
  {key:"V",name:"Vórtice",count:8,description:"Puxa todas as suas cartas daquela cor."},
  {key:"C",name:"Cerveja",count:4,description:"Força jogadas aleatórias dos adversários."},
] as const;
export const CUSTOM_WILD_CARDS=[
  {key:"W5",name:"Coringa +5",count:2,description:"Só outro +5 pode rebater."},
  {key:"X",name:"Coringa Detetive",count:1,description:"Revela temporariamente a mão de um rival."},
  {key:"B",name:"Coringa Bomba",count:1,description:"Cada adversário compra duas cartas."},
  {key:"N",name:"Coringa Negação",count:1,description:"Anula um efeito contra você."},
  {key:"P",name:"Coringa Sem Poderes",count:1,description:"Rivais só jogam cartas numéricas."},
  {key:"M",name:"Coringa Metralhadora",count:1,description:"Revela e devolve especiais ao baralho."},
  {key:"Q",name:"Coringa Espelho",count:1,description:"Copia o último coringa real jogado."},
] as const;
export type CustomCardKey=typeof CUSTOM_COLOR_CARDS[number]["key"]|typeof CUSTOM_WILD_CARDS[number]["key"];
export type CardSettings=Record<CustomCardKey,boolean>;
export const DEFAULT_CARD_SETTINGS:CardSettings={
  T:true,H:true,E:true,L:true,V:true,C:true,
  W5:true,X:true,B:true,N:true,P:true,M:true,Q:true
};
export function enabledCardSettings(changes?:Partial<CardSettings>):CardSettings{
  return {...DEFAULT_CARD_SETTINGS,...changes};
}
