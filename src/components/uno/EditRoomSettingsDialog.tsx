import { useEffect,useState, type FormEvent } from "react";
import { Loader2,SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger } from "@/components/ui/dialog";
import type { RuleSettings,RoomState } from "@/lib/uno/api";
import { errorMessage } from "@/lib/uno/errors";
import { AdvancedRoomSettingsFields } from "./AdvancedRoomSettingsFields";

export function EditRoomSettingsDialog({
  room,onSave
}:{
  room:RoomState["room"];
  onSave:(startingCards:number,rules:RuleSettings)=>Promise<void>;
}){
  const [open,setOpen]=useState(false);
  const [startingCards,setStartingCards]=useState(room.initial_cards);
  const [rules,setRules]=useState<RuleSettings>({...room.rules});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!open)return;
    setStartingCards(room.initial_cards);
    setRules({...room.rules});
    setError(null);
  },[open]);
  async function submit(e:FormEvent){
    e.preventDefault();if(busy)return;
    setBusy(true);setError(null);
    try{
      await onSave(startingCards,rules);
      toast.success("Configurações da sala atualizadas!");
      setOpen(false);
    }catch(err){setError(errorMessage(err));}
    finally{setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v)}}>
    <DialogTrigger asChild>
      <Button variant="glass" className="mt-3 h-11 w-full rounded-xl sm:w-auto">
        <SlidersHorizontal className="size-4"/> Configurações avançadas
      </Button>
    </DialogTrigger>
    <DialogContent onOpenAutoFocus={event=>event.preventDefault()}
      className="glass-strong flex max-h-[90dvh] flex-col overflow-hidden rounded-3xl border-glass-border sm:max-w-lg">
      <DialogHeader className="shrink-0">
        <DialogTitle className="font-display text-xl">Configurações avançadas</DialogTitle>
        <DialogDescription>Estas alterações valem para a próxima partida, inclusive na revanche. Não é possível alterá-las durante uma partida.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y pr-2">
          <AdvancedRoomSettingsFields startingCards={startingCards} rules={rules}
            onStartingCardsChange={setStartingCards} onRulesChange={setRules}/>
        </div>
        {error&&<p role="alert" className="shrink-0 text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="hero" className="h-11 w-full shrink-0 rounded-xl" disabled={busy}>
          {busy&&<Loader2 className="size-4 animate-spin"/>} Salvar alterações
        </Button>
      </form>
    </DialogContent>
  </Dialog>;
}
