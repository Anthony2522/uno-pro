import { Ban, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardLabel, cardValue, isWild } from "@/lib/uno/cards";

const INNER_BG: Record<string, string> = {
  r: "bg-uno-r",
  y: "bg-uno-y",
  g: "bg-uno-g",
  b: "bg-uno-b",
};
const INK: Record<string, string> = {
  r: "text-uno-r",
  y: "text-uno-y",
  g: "text-uno-g",
  b: "text-uno-b",
};

export type CardSize = "xs" | "sm" | "md" | "lg";
const WIDTH: Record<CardSize, string> = {
  xs: "w-7",
  sm: "w-12",
  md: "w-[4.25rem] sm:w-[5.25rem]",
  lg: "w-24 sm:w-32",
};

function Symbol({ card, corner }: { card: string; corner?: boolean }) {
  const v = cardValue(card);
  if (v === "S") return <Ban className={corner ? "size-[16cqw]" : "size-[44cqw]"} strokeWidth={3} />;
  if (v === "R") return <Repeat2 className={corner ? "size-[16cqw]" : "size-[46cqw]"} strokeWidth={3} />;
  const label = v === "D" ? "+2" : v === "W4" ? "+4" : v === "W" ? "" : v;
  return (
    <span className={cn(corner ? "text-[17cqw]" : label.length > 1 ? "text-[36cqw]" : "text-[50cqw]", (v === "6" || v === "9") && "underline decoration-[0.08em] underline-offset-[0.1em]")}>
      {label}
    </span>
  );
}

export function UnoCard({
  card,
  size = "md",
  className,
  rotate = 0,
  animate = false,
}: {
  card: string;
  size?: CardSize;
  className?: string;
  rotate?: number;
  animate?: boolean;
}) {
  const wild = isWild(card);
  const color = wild ? null : card[0];
  return (
    <div
      role="img"
      aria-label={cardLabel(card)}
      style={{ ["--rot" as string]: `${rotate}deg`, transform: `rotate(${rotate}deg)` }}
      className={cn(
        "@container relative aspect-[2/3] shrink-0 rounded-[12%] bg-uno-paper p-[6%] shadow-card",
        WIDTH[size],
        animate && "animate-card-in",
        className,
      )}
    >
      <div className={cn("relative flex h-full w-full items-center justify-center overflow-hidden rounded-[9%]", wild ? "bg-uno-w" : INNER_BG[color!])}>
        <div
          className={cn(
            "absolute left-1/2 top-1/2 h-[92%] w-[66%] -translate-x-1/2 -translate-y-1/2 rotate-[28deg] rounded-[50%]",
            wild ? "bg-wild" : "bg-uno-paper",
          )}
        />
        <div
          className={cn(
            "relative z-10 flex items-center justify-center font-display font-black italic leading-none",
            wild ? "text-uno-paper drop-shadow-[0_2px_0_var(--uno-ink)]" : INK[color!],
          )}
        >
          {size !== "xs" && <Symbol card={card} />}
        </div>
        {size !== "xs" && (
          <>
            <div className="absolute left-[7%] top-[5%] z-10 font-display font-black italic leading-none text-uno-paper drop-shadow-[0_1px_0_var(--uno-ink)]">
              {card === "W" ? <span className="block size-[14cqw] rounded-full bg-wild ring-1 ring-uno-paper" /> : <Symbol card={card} corner />}
            </div>
            <div className="absolute bottom-[5%] right-[7%] z-10 rotate-180 font-display font-black italic leading-none text-uno-paper drop-shadow-[0_1px_0_var(--uno-ink)]">
              {card === "W" ? <span className="block size-[14cqw] rounded-full bg-wild ring-1 ring-uno-paper" /> : <Symbol card={card} corner />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function CardBack({ size = "md", className, rotate = 0 }: { size?: CardSize; className?: string; rotate?: number }) {
  return (
    <div
      aria-hidden
      style={{ transform: `rotate(${rotate}deg)` }}
      className={cn("@container relative aspect-[2/3] shrink-0 rounded-[12%] bg-uno-paper p-[6%] shadow-card", WIDTH[size], className)}
    >
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[9%] bg-navy-2">
        <div className="absolute left-1/2 top-1/2 h-[92%] w-[66%] -translate-x-1/2 -translate-y-1/2 rotate-[28deg] rounded-[50%] bg-gradient-brand" />
        {size !== "xs" && (
          <span className="relative z-10 -rotate-[18deg] font-display text-[22cqw] font-black italic leading-none text-uno-paper drop-shadow-[0_2px_0_var(--navy)]">
            UNO
          </span>
        )}
      </div>
    </div>
  );
}