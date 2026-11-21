import { useState } from "react";
import { Check, Copy, Link2, LogOut, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {useLanguage} from "@/lib/uno/i18n";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function useCopyInvite(code: string) {
  const {tr}=useLanguage();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const copy = async (kind: "link" | "code") => {
    const text = kind === "link" ? `${window.location.origin}/sala/${code}` : code;
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      toast.success(tr(kind === "link" ? "Link de convite copiado!" : "Código copiado!"));
      setTimeout(() => setCopied(null), 1800);
    } else {
      toast.error(tr("Não foi possível copiar. Copie manualmente:") + " " + text);
    }
  };
  return { copied, copy };
}

export function CopyInviteButton({ code, compact }: { code: string; compact?: boolean }) {
  const { copied, copy } = useCopyInvite(code);
  return (
    <Button variant="cyan" className="h-11 rounded-xl" onClick={() => void copy("link")}>
      {copied === "link" ? <Check /> : <Link2 />}
      {compact ? <span className="hidden sm:inline">Convidar</span> : "Copiar link de convite"}
    </Button>
  );
}

export function CopyCodeButton({ code }: { code: string }) {
  const { copied, copy } = useCopyInvite(code);
  return (
    <Button variant="glass" className="h-11 rounded-xl" onClick={() => void copy("code")} aria-label={`Copiar código ${code}`}>
      {copied === "code" ? <Check /> : <Copy />} Código
    </Button>
  );
}

export function ConnectionBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-16 z-40 mx-auto flex w-fit items-center gap-2 rounded-b-2xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-lg">
      <WifiOff className="size-4" /> Conexão instável — reconectando…
    </div>
  );
}

export function LeaveButton({ onConfirm, inGame }: { onConfirm: () => void; inGame: boolean }) {
  const {language}=useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="glass" size="iconLg" onClick={() => setOpen(true)} aria-label="Sair da sala" title="Sair da sala">
        <LogOut />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="glass-strong rounded-3xl border-glass-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Sair da sala?</AlertDialogTitle>
            <AlertDialogDescription>
              {inGame ? (language==="en"?"Leaving removes you from this match and frees your seat for others.":"Ao sair, você deixará a partida e sua vaga ficará disponível para outros jogadores.") : (language==="en"?"You can return using the same link if a seat is available.":"Você pode voltar depois pelo mesmo link, se ainda houver vaga.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Ficar</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
              Sair da sala
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}