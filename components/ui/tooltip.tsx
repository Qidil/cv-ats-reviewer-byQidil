"use client";

import { useRef, useState, type ReactNode } from "react";
import { DrawablyCard, DrawablyTooltip } from "@/lib/drawably";
import { cn } from "@/lib/cn";

/**
 * A sketched hint for icon-only controls (StyleGuide §8.2): shown on pointer hover and on
 * keyboard focus; the target keeps its own accessible name, so the hint is visual only.
 * `arrow={false}` drops the body-level arrow, which paints under a modal dialog's top layer.
 */
export function Tooltip({
  label,
  children,
  className,
  arrow = true,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  arrow?: boolean;
}) {
  const target = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const tipClass = "absolute -top-1 left-1/2 z-30 -translate-x-1/2 -translate-y-full bg-white text-small whitespace-nowrap";
  return (
    <span
      ref={target}
      className={cn("relative inline-flex", className)}
      onPointerEnter={() => setShown(true)}
      onPointerLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {children}
      {shown ? (
        arrow ? (
          <DrawablyTooltip to={target} className={tipClass}>
            {label}
          </DrawablyTooltip>
        ) : (
          <DrawablyCard className={cn(tipClass, "px-3 py-1.5")}>{label}</DrawablyCard>
        )
      ) : null}
    </span>
  );
}
