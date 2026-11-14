import { cn } from "@/lib/utils";

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const text = size === "lg" ? "text-5xl sm:text-6xl" : size === "md" ? "text-2xl" : "text-xl";
  const pill = size === "lg" ? "text-sm px-2.5 py-1 -top-1" : "text-[0.6rem] px-1.5 py-0.5 -top-1";
  return (
    <span className={cn("relative inline-flex select-none items-start font-display font-black leading-none", className)} aria-label="UNO Pro">
      <span className={cn("text-gradient italic tracking-tighter", text)} aria-hidden>
        UNO
      </span>
      <span
        className={cn(
          "relative ml-1 rotate-[-6deg] rounded-md bg-cyan font-display font-extrabold tracking-wider text-navy shadow-glow-cyan",
          pill,
        )}
        aria-hidden
      >
        PRO
      </span>
    </span>
  );
}