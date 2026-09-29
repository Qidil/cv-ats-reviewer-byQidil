"use client";

import type { ReactNode } from "react";
import { DrawablyBadge } from "@/lib/drawably";
import { INK } from "@/lib/drawably/inks";
import { cn } from "@/lib/cn";

export type Tone = "critical" | "advisory" | "pass";

/** StyleGuide §8.1b: each tone draws its sketch in the matching ink; text keeps the darker tone. */
const INK_BY_TONE: Readonly<Record<Tone, string>> = {
  critical: INK.coral,
  advisory: INK.amber,
  pass: INK.emerald,
};

const TEXT: Readonly<Record<Tone, string>> = {
  critical: "text-red-700",
  advisory: "text-amber-800",
  pass: "text-emerald-800",
};

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <DrawablyBadge
      variant="outline"
      stroke={INK_BY_TONE[tone]}
      className={cn("inline-flex shrink-0 items-center px-2 py-0.5 text-small font-medium whitespace-nowrap", TEXT[tone], className)}
    >
      {children}
    </DrawablyBadge>
  );
}
