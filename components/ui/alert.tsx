import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { DrawablyCard } from "@/lib/drawably";
import { INK } from "@/lib/drawably/inks";
import { cn } from "@/lib/cn";

type AlertTone = "critical" | "advisory";

/** StyleGuide §8.1b: the alert frame is sketched in the tone ink over a soft wash. */
const TONES: Readonly<Record<AlertTone, { ink: string; wash: string; icon: string }>> = {
  critical: { ink: INK.coral, wash: "bg-red-50/70 text-red-950", icon: "text-red-700" },
  advisory: { ink: INK.amber, wash: "bg-amber-50/70 text-amber-950", icon: "text-amber-700" },
};

/**
 * Focusable (tabIndex -1) so the dashboard can move focus here after a failed analysis;
 * role="alert" still announces it when focus stays elsewhere.
 */
export function Alert({
  tone,
  icon: Icon,
  title,
  children,
  actions,
  ref,
}: {
  tone: AlertTone;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const style = TONES[tone];
  return (
    <div ref={ref} role="alert" tabIndex={-1}>
      <DrawablyCard stroke={style.ink} className={cn("p-4", style.wash)}>
        <p className="flex items-start gap-2 font-medium">
          <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", style.icon)} />
          {title}
        </p>
        <div className="mt-1 text-secondary">{children}</div>
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </DrawablyCard>
    </div>
  );
}

/**
 * A one-line advisory that needs no action, such as PRD §6.3's "small persistent warning tag".
 * role="status" because it informs without interrupting.
 */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("inline-block max-w-full", className)}>
      <DrawablyCard stroke={INK.amber} className="flex items-start gap-2 px-3 py-2 text-small text-amber-900">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-700" />
        <span>{children}</span>
      </DrawablyCard>
    </div>
  );
}
