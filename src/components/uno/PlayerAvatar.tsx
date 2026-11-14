import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-brand text-primary-foreground",
  "bg-cyan text-navy",
  "bg-uno-r text-uno-paper",
  "bg-uno-g text-navy",
  "bg-uno-y text-navy",
  "bg-uno-b text-uno-paper",
  "bg-brand-soft text-primary-foreground",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function PlayerAvatar({
  id,
  name,
  size = "md",
  online,
  className,
}: {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  className?: string;
}) {
  const dim = size === "sm" ? "size-8 text-sm" : size === "lg" ? "size-14 text-xl" : "size-11 text-base";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span className={cn("inline-flex items-center justify-center rounded-full font-display font-bold uppercase ring-2 ring-navy", dim, PALETTE[hash(id) % PALETTE.length])} aria-hidden>
        {name.trim().charAt(0) || "?"}
      </span>
      {online !== undefined && (
        <span
          className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-navy", online ? "bg-success" : "bg-muted-foreground/60")}
          aria-hidden
        />
      )}
    </span>
  );
}