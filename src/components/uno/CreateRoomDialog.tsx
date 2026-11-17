import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Globe, Loader2, Lock, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type RuleSettings } from "@/lib/uno/api";
import { errorMessage, toGameError } from "@/lib/uno/errors";
import { useReadyGuest } from "@/lib/uno/guest";
import { cn } from "@/lib/utils";
import { AdvancedRoomSettingsFields } from "./AdvancedRoomSettingsFields";
import {DEFAULT_CARD_SETTINGS,type CardSettings} from "@/lib/uno/cardSettings";
import {startLocalSolo} from "@/lib/uno/offlineRuntime";
import {useLanguage} from "@/lib/uno/i18n";

export function CreateRoomDialog({ open, onOpenChange, offline=false }: { open: boolean; onOpenChange: (o: boolean) => void; offline?:boolean }) {
  const { guest, resetSession } = useReadyGuest();
  const {language}=useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [max, setMax] = useState(6);
  const [winners, setWinners] = useState(2);
  const [startingCards, setStartingCards] = useState(8);
  const [advanced, setAdvanced] = useState(false);
  const [rules, setRules] = useState<RuleSettings>({ repeat:true,sequence:true,nine:true,cut:true,stack:true });
  const [cards,setCards]=useState<CardSettings>({...DEFAULT_CARD_SETTINGS});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName((offline?`Offline de ${guest.nickname}`:`Sala de ${guest.nickname}`).slice(0, 32));
      setError(null);
      setAdvanced(false);
      setStartingCards(8);
      setMax(offline?3:6);
      setWinners(2);
      setCards({...DEFAULT_CARD_SETTINGS});
      setRules({repeat:true,sequence:true,nine:true,cut:true,stack:true});
    }
  }, [open, guest.nickname, offline]);

  const clean = name.replace(/\s+/g, " ").trim();
  const valid = clean.length >= 2 && clean.length <= 32;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("O nome da sala precisa ter de 2 a 32 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const code=offline ? startLocalSolo(guest.nickname,{name:clean,maxPlayers:max,startingCards,winners,rules,cards}) :
        (await api.createRoom(guest.token, clean, isPublic, max, rules, startingCards, winners, cards)).code;
      onOpenChange(false);
      navigate({ to: "/sala/$code", params: { code } });
    } catch (err) {
      if (toGameError(err).code === "INVALID_SESSION") resetSession();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(event)=>event.preventDefault()} className="glass-strong max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y rounded-3xl border-glass-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{offline?"Criar sala offline":"Criar sala"}</DialogTitle>
          <DialogDescription>{offline?"Escolha o número de bots, as regras, as cartas e os vencedores antes de jogar. Sem Wi-Fi durante a partida.":"Você será o anfitrião e poderá iniciar a partida."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="room-name">Nome da sala</Label>
            <div className="relative">
              <Input
                id="room-name"
                value={name}
                maxLength={32}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                className="h-12 rounded-xl border-glass-border bg-navy/60 pr-14 text-base"
                aria-invalid={!!error}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">{clean.length}/32</span>
            </div>
          </div>

          {!offline&&<fieldset className="space-y-2">
            <legend className="text-sm font-medium">Visibilidade</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {[
                { v: true, label: "Pública", hint: "Aparece na lista", Icon: Globe },
                { v: false, label: "Privada", hint: "Só com link/código", Icon: Lock },
              ].map(({ v, label, hint, Icon }) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={isPublic === v}
                  onClick={() => setIsPublic(v)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isPublic === v ? "border-cyan bg-cyan/10 shadow-glow-cyan" : "border-glass-border bg-navy/40 hover:border-cyan/40",
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold"><Icon className="size-4" /> {label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </fieldset>}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{offline?"Quantidade de bots":"Máximo de jogadores"}</legend>
            <select
              value={offline?max-1:max}
              onChange={e=>{
                const next=Number(e.target.value)+(offline?1:0);
                setMax(next);
                setWinners(v=>Math.min(v,next-1));
              }}
              aria-label={offline?"Quantidade de bots":"Máximo de jogadores"}
              className="h-12 w-full rounded-xl border border-glass-border bg-navy px-3 text-base text-foreground"
            >
              {Array.from({length:19},(_,i)=>offline?i+1:i+2).map(n=>(
                <option key={n} value={n}>{n} {offline?(n===1?"bot":"bots"):(n===1?"jogador":"jogadores")}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {language==="en" ? (offline?`You + ${max-1} ${max===2?"bot":"bots"} = ${max} players in the room.`:`Maximum capacity: ${max} players (limit of 20).`) : (offline?`Você + ${max-1} ${max===2?"bot":"bots"} = ${max} jogadores na sala.`:`Capacidade máxima: ${max} jogadores (limite de 20).`)}
            </p>
          </fieldset>


          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Quantidade de vencedores</legend>
            <select value={winners} onChange={e=>setWinners(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-glass-border bg-navy px-3 text-foreground"
              aria-label="Quantidade de vencedores">
              {Array.from({length:max-1},(_,i)=>i+1).map(n=>
                <option key={n} value={n}>{n} {n===1?"vencedor":"vencedores"}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              No início da partida, o limite é ajustado para N − 1, conforme o número de participantes.
            </p>
          </fieldset>
          <div className="rounded-2xl border border-glass-border bg-navy/40 p-3">
            <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 font-semibold text-cyan" onClick={() => setAdvanced(v => !v)} aria-expanded={advanced}>
              <span className="flex items-center gap-2"><SlidersHorizontal className="size-5" /> Configurações avançadas</span>
              {advanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {advanced && (
              <div className="mt-3 border-t border-glass-border pt-3">
                <AdvancedRoomSettingsFields startingCards={startingCards} rules={rules} cards={cards}
                  onStartingCardsChange={setStartingCards} onRulesChange={setRules} onCardsChange={setCards}/> 
              </div>
            )}
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy || !valid}>
            {busy && <Loader2 className="animate-spin" />} {offline?"Iniciar partida offline":"Criar e abrir sala"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}