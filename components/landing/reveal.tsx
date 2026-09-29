import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * StyleGuide §8.3: landing sections rise in on load. A pure CSS animation keeps the content
 * visible for screenshots, crawlers, and no-JS visits; reduced motion shows it at once.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("reveal", className)}>{children}</div>;
}
