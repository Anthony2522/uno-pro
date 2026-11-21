import { Ban, Repeat2, Eye, Bomb, Shield, ShieldOff, ZapOff, Crosshair, Beer, LockKeyhole, Sword, Scan, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {CockroachIcon} from "./CockroachIcon";
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
  if (v === "H") return <Shield className={corner ? "size-[17cqw]" : "size-[48cqw]"} strokeWidth={3}/>;
  if (v === "V") return <img src="/vortice.svg" alt="" draggable={false}
    className={corner ? "h-[16cqw] w-[20cqw] object-contain brightness-0 invert" : "h-[49cqw] w-[66cqw] object-contain"}/>;
  if (v === "C") return <Beer className={corner ? "size-[18cqw]" : "size-[48cqw]"} strokeWidth={2.7}/>;
  if (v === "A") return <CockroachIcon className={corner?"size-[19cqw]":"size-[55cqw]"} style={{"--cockroach-wing-line":"white"} as React.CSSProperties}/>;
  if (v === "L") return <LockKeyhole className={corner ? "size-[18cqw]" : "size-[48cqw]"} strokeWidth={3}/>;
  if (v === "E") return <Sword className={corner ? "size-[18cqw]" : "size-[49cqw]"} strokeWidth={3}/>;
  if(v==="X")return (
    <span className="flex w-[80cqw] flex-col items-center justify-center leading-none">
      <Eye className={corner?"size-[19cqw]":"size-[42cqw]"} strokeWidth={3}/>
      {!corner&&<span className="mt-[3cqw] whitespace-nowrap font-display text-[12.5cqw] font-black not-italic tracking-[-.04em]">DETETIVE</span>}
    </span>
  );
  if(v==="WD")return (
    <span className="flex w-[88cqw] flex-col items-center justify-center leading-none">
      <span className={corner?"text-[15cqw]":"text-[43cqw]"}>×2</span>
      {!corner&&<span className="mt-[2cqw] text-[13cqw] font-black not-italic tracking-tight">DOBRO</span>}
    </span>
  );
  if(v==="B")return (
    <span className="flex w-[85cqw] flex-col items-center justify-center leading-none">
      <Bomb className={corner?"size-[18cqw]":"size-[45cqw]"} strokeWidth={3}/>
      {!corner&&<span className="mt-[2cqw] whitespace-nowrap font-display text-[16cqw] font-black not-italic tracking-[-.02em]">BOMBA</span>}
    </span>
  );
  if(["N","P","M"].includes(v)){
    const Icon=v==="N"?ShieldOff:v==="P"?ZapOff:Crosshair;
    const text=v==="N"?"NEGAÇÃO":v==="P"?"SEM PODERES":"METRALHADORA";
    return <span className="flex w-[88cqw] flex-col items-center justify-center leading-none">
      <Icon className={corner?"size-[18cqw]":"size-[42cqw]"} strokeWidth={3}/>
      {!corner&&<span className="mt-[3cqw] whitespace-nowrap font-display text-[10.5cqw] font-black not-italic tracking-[-.07em]">{text}</span>}
    </span>;
  }
  if (v === "T") return (
    <span className="flex flex-col items-center justify-center leading-none">
      <Repeat2 className={corner ? "size-[15cqw]" : "size-[39cqw]"} strokeWidth={3}/>
      <span className={corner ? "text-[14cqw]" : "text-[33cqw]"}>+2</span>
    </span>
  );
  const label = v === "D" ? "+2" : v === "W4" ? "+4" : v === "W5" ? "+5" : v === "W" ? "" : v;
  return (
    <span className={cn(corner ? "text-[17cqw]" : label.length > 1 ? "text-[36cqw]" : "text-[50cqw]", (v === "6" || v === "9") && "underline decoration-[0.08em] underline-offset-[0.1em]")}>
      {label}
    </span>
  );
}

export function UnoCard({
  card,
  mirrorAs,
  size = "md",
  className,
  rotate = 0,
  animate = false,
}: {
  card: string;
  mirrorAs?: string|null|undefined;
  size?: CardSize;
  className?: string;
  rotate?: number;
  animate?: boolean;
}) {
  const isMirror=card==="Q";
  const face=isMirror?(mirrorAs&&mirrorAs!=="Q"?mirrorAs:null):card;
  const wild = isMirror || isWild(face||"");
  const color = wild ? null : (face?.[0]??null);
  return (
    <div
      role="img"
      aria-label={cardLabel(card,mirrorAs)}
      style={{ ["--rot" as string]: `${rotate}deg`, transform: `rotate(${rotate}deg)` }}
      className={cn(
        "@container relative aspect-[2/3] shrink-0 rounded-[12%] bg-uno-paper p-[6%] shadow-card",
        WIDTH[size],
        isMirror && "uno-mirror-card",
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
          {size !== "xs" && (isMirror&&!face?<span className="relative flex flex-col items-center"><Scan className="size-[42cqw]" strokeWidth={2.5}/><Sparkles className="absolute -right-[14cqw] -top-[8cqw] size-[19cqw]"/></span>:face==="W"?null:<Symbol card={face||card} />)}
        </div>
        {size !== "xs" && (
          <>
            <div className="absolute left-[7%] top-[5%] z-10 font-display font-black italic leading-none text-uno-paper drop-shadow-[0_1px_0_var(--uno-ink)]">
              {isMirror&&!face ? <Scan className="size-[16cqw]"/> : face === "W" ? <span className="block size-[14cqw] rounded-full bg-wild ring-1 ring-uno-paper" /> : <Symbol card={face||card} corner />}
            </div>
            <div className="absolute bottom-[5%] right-[7%] z-10 rotate-180 font-display font-black italic leading-none text-uno-paper drop-shadow-[0_1px_0_var(--uno-ink)]">
              {isMirror&&!face ? <Scan className="size-[16cqw]"/> : face === "W" ? <span className="block size-[14cqw] rounded-full bg-wild ring-1 ring-uno-paper" /> : <Symbol card={face||card} corner />}
            </div>
          </>
        )}
      </div>
      {isMirror&&<>
        <div aria-hidden className="uno-mirror-sheen pointer-events-none absolute inset-[6%] z-20 rounded-[9%]"/>
        <div aria-hidden className="pointer-events-none absolute bottom-[10%] left-[10%] z-30 rounded-full border border-white/80 bg-white/20 px-[5cqw] py-[2cqw] text-[11cqw] font-black not-italic leading-none tracking-wide text-white shadow-[0_0_8px_white]">✧</div>
      </>}
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
        {size !== "xs" && <img src="/logo-uno-pro.webp" alt="" draggable={false} className="relative z-10 w-[95%] scale-110 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" />}
      </div>
    </div>
  );
}