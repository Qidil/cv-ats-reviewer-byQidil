import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "critical" | "advisory" | "pass";

/** StyleGuide §7.2 / §8: light mode badge tones with high contrast on white surfaces. */
const TONES: Readonly<Record<Tone, string>> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  advisory: "border-amber-200 bg-amber-50 text-amber-800",
  pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
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
