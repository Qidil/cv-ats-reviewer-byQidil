"use client";

import type { ComponentProps } from "react";
import { DrawablyButton } from "@/lib/drawably";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "icon" | "danger";

/**
 * StyleGuide §7.1 / §8: every button is a sketched drawably control. The mapping keeps the
 * original API so call sites stay unchanged; hover behavior comes from the library alone (P9-D5).
 */
const VARIANTS: Readonly<Record<Variant, { variant: "solid" | "outline"; tone?: "neutral" | "danger"; className: string }>> = {
  primary: { variant: "solid", className: "min-h-11 px-4 text-body font-medium" },
  secondary: { variant: "outline", tone: "neutral", className: "min-h-11 px-4 text-body font-medium" },
  icon: { variant: "outline", tone: "neutral", className: "min-h-11 min-w-11 px-2.5 text-body font-medium" },
  danger: { variant: "solid", tone: "danger", className: "min-h-11 px-4 text-body font-medium" },
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  const style = VARIANTS[variant];
  return (
    <DrawablyButton
      type={type}
      variant={style.variant}
      tone={style.tone}
      className={cn("gap-2", style.className, className)}
      {...props}
    />
  );
}
