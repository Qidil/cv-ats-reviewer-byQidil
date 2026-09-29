import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "icon" | "danger";

/**
 * StyleGuide §7.1 / §8: Tactile editorial button styles in light mode.
 * min-h-11 keeps every button at the 44 px tap target (NFR-06).
 */
const VARIANTS: Readonly<Record<Variant, string>> = {
  primary: "bg-ink text-white hover:bg-black active:scale-[0.98]",
  secondary: "border border-ink/40 text-ink hover:bg-paper active:scale-[0.98]",
  icon: "min-w-11 px-2.5 text-secondary hover:text-ink active:scale-[0.95]",
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
