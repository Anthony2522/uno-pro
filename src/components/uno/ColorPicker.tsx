import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COLOR_NAMES, COLORS, type CardColor } from "@/lib/uno/cards";
import { cn } from "@/lib/utils";

const BG: Record<CardColor, string> = { r: "bg-uno-r", y: "bg-uno-y", g: "bg-uno-g", b: "bg-uno-b" };

export function ColorPicker({ open, onPick, onClose }: { open: boolean; onPick: (c: CardColor) => void; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong rounded-3xl border-glass-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Escolha a nova cor</DialogTitle>
          <DialogDescription>O próximo jogador terá que seguir essa cor.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              className={cn(
                "flex h-24 items-end rounded-2xl p-3 font-display font-bold text-uno-paper shadow-card transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring active:scale-95 drop-shadow-[0_1px_0_var(--uno-ink)]",
                BG[c],
              )}
            >
              {COLOR_NAMES[c]}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}