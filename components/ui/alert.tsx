import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

type AlertTone = "critical" | "advisory";

const TONES: Readonly<Record<AlertTone, { box: string; icon: string }>> = {
  critical: { box: "border-critical-strong/60 bg-red-950/40", icon: "text-critical" },
  advisory: { box: "border-advisory-strong/60 bg-amber-950/40", icon: "text-advisory" },
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
  return (
    <div ref={ref} role="alert" tabIndex={-1} className={cn("rounded-lg border p-4", TONES[tone].box)}>
      <p className="flex items-start gap-2 font-medium">
        <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", TONES[tone].icon)} />
        {title}
      </p>
      <div className="mt-1 text-secondary">{children}</div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * A one-line advisory that needs no action, such as PRD §6.3's "small persistent warning tag".
 * role="status" because it informs without interrupting.
 */
export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-800/60 bg-amber-950/50 px-3 py-2 text-small text-amber-400",
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
