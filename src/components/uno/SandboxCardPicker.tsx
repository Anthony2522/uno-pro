import {useState} from "react";
import {FlaskConical,Plus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {StableCardPreview} from "./StableCardPreview";
import {useLanguage} from "@/lib/uno/i18n";

const COLORED=[
  ["R","Volta"],["S","Bloqueio"],["D","+2"],
  ["T","+2 Volta"],["H","Escudo"],["E","Espada"],["L","Cadeado"],
  ["V","Vórtice"],["C","Cerveja"],["A","Barata"],
] as const;
const WILDS=[
  ["W","Coringa"],["W4","+4"],["W5","+5"],["WD","Dobro"],["X","Detetive"],
  ["B","Bomba"],["N","Negação"],["P","Sem Poderes"],["M","Metralhadora"],["Q","Espelho"],
] as const;

export function SandboxCardPicker({disabled,onGrant}:{disabled:boolean;onGrant:(kind:string)=>void}){
  const [open,setOpen]=useState(false);
  const {tr}=useLanguage();
  const choose=(kind:string)=><Button key={kind} type="button" variant="glass"
    className="h-auto min-h-14 justify-start gap-2 rounded-xl px-2 py-2 text-left"
    disabled={disabled} onClick={()=>onGrant(kind)}>
    <StableCardPreview card={kind==="A"?"bA@00000000-0000-4000-8000-000000000001":
      ["W","W4","W5","WD","X","B","N","P","M","Q"].includes(kind)?kind:"b"+kind} width={32}/>
    <span className="min-w-0 flex-1 text-xs font-bold">{tr([...COLORED,...WILDS].find(([k])=>k===kind)?.[1]??kind)}</span>
    <Plus className="size-3.5 shrink-0"/>
  </Button>;
  return <>
    <Button variant="cyan" className="h-9 rounded-xl px-3 text-xs" onClick={()=>setOpen(true)}>
      <FlaskConical className="size-4"/> Pegar qualquer carta
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-strong max-h-[88dvh] overflow-y-auto rounded-3xl border-glass-border sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Sandbox · Adicionar cartas</DialogTitle>
          <DialogDescription>A carta escolhida entra na mão que você está controlando. Cartas coloridas recebem uma cor aleatória.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-cyan">Cartas comuns</h3>
            <Button variant="glass" className="w-full justify-between rounded-xl" disabled={disabled} onClick={()=>onGrant("NUMBER")}>
              Número comum aleatório (0–9) <Plus className="size-4"/>
            </Button>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-cyan">Cartas especiais coloridas</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{COLORED.map(([kind])=>choose(kind))}</div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-cyan">Coringas e coringas especiais</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{WILDS.map(([kind])=>choose(kind))}</div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
