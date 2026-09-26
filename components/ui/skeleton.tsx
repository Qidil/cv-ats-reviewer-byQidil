import { cn } from "@/lib/cn";

/**
 * StyleGuide §6: a calm linear pulse between 0.4 and 0.8 opacity; reduced motion holds it still.
 * A CSS animation, so the loading state does not pull Motion into the first page load (G-16).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-skeleton rounded-md bg-surface-elevated motion-reduce:animate-none motion-reduce:opacity-60", className)}
    />
  );
}
