"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * T9: the native dialog element gives focus containment, Escape, and the inert page behind it.
 * `side="end"` turns it into a drawer on the inline end of the screen.
 */
export function Dialog({
  open,
  onClose,
  title,
  side = "center",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "center" | "end";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={cn(
        "border-subtle bg-surface-elevated p-0 text-primary backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        side === "center"
          ? "m-auto w-[min(34rem,calc(100vw-2rem))] rounded-lg border"
          : // The browser's own dialog max-width would leave a phone drawer too narrow for its rows (G-13).
            "my-0 mr-0 ml-auto h-dvh max-h-dvh w-[min(28rem,100vw)] max-w-none border-l",
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-subtle px-5 py-3">
        <h2 id={titleId} className="text-h3">
          {title}
        </h2>
        <Button variant="icon" aria-label={t.actions.close} onClick={onClose}>
          <X aria-hidden className="size-5" />
        </Button>
      </div>
      <div className="px-5 py-4">{open ? children : null}</div>
    </dialog>
  );
}
