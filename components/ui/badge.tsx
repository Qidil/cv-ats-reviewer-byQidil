import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "critical" | "advisory" | "pass";

/** StyleGuide §7.2 gives the red and amber badges; pass follows the same recipe in emerald. */
const TONES: Readonly<Record<Tone, string>> = {
  critical: "border-red-800/60 bg-red-950/50 text-red-400",
  advisory: "border-amber-800/60 bg-amber-950/50 text-amber-400",
  pass: "border-emerald-800/60 bg-emerald-950/50 text-emerald-400",
};

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-small font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
