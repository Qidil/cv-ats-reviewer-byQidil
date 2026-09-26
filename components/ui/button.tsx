import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "icon" | "danger";

/**
 * StyleGuide §7.1. min-h-11 keeps every button at the 44 px tap target (NFR-06); an icon button
 * has no text to widen it, so it carries the width as well.
 */
const VARIANTS: Readonly<Record<Variant, string>> = {
  primary: "bg-action-strong text-white hover:bg-action-hover active:bg-action-active",
  secondary: "border border-strong text-primary hover:bg-surface-elevated",
  icon: "min-w-11 px-2.5 text-secondary hover:bg-surface-elevated hover:text-primary",
  danger: "bg-critical-strong text-white hover:bg-critical-hover",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-body font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
