import { cn } from "@/lib/utils";

export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes={sm:"h-12 w-[110px]",md:"h-20 w-44",lg:"h-44 w-72 sm:h-52 sm:w-80"};
  return <img src="/logo-uno-pro.webp" alt="UNO Pro" draggable={false} className={cn("block select-none object-contain drop-shadow-[0_3px_12px_rgba(91,62,245,0.4)]",sizes[size],className)}/>;
}
