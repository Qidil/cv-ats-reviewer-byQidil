"use client";

import { motion } from "motion/react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";
import { fillTemplate } from "@/lib/i18n/format";
import type { ImageRect } from "@/lib/pdf/highlighter";
import type { SuggestionPriority } from "@/types/ats";

/** One suggestion's highlight as the viewer draws it; built from the view, never from CV text. */
export interface InspectorMark {
  id: string;
  priority: SuggestionPriority;
  title: string;
  pageNumber: number;
  rects: ImageRect[];
}

/** BR-08 and StyleGuide §2: red for high, yellow for medium and low. */
const TONE: Readonly<Record<SuggestionPriority, string>> = {
  high: "border-critical-strong bg-critical/25",
  medium: "border-advisory-strong bg-advisory/25",
  low: "border-advisory-strong bg-advisory/25",
};

const position = (rect: ImageRect) => ({
  left: `${rect.left}%`,
  top: `${rect.top}%`,
  width: `${rect.width}%`,
  height: `${rect.height}%`,
});

/**
 * P5-D1: one CV line is often under 15 px tall here, so each box gets a 44 x 44 px target around it.
 * The targets sit in a layer beneath every visible box (G5-01): a click on a box always belongs to
 * that box, and only a click beside the boxes falls through to the nearest target.
 */
const HIT_AREA = "absolute min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer";

export function highlightDomId(prefix: string, id: string): string {
  return `${prefix}-highlight-${id}`;
}

/** StyleGuide §5.1 and §6: absolute boxes over one page image, in page order for keyboards. */
export function HighlightOverlay({
  marks,
  idPrefix,
  emphasizedId,
  pulse,
  reduceMotion,
  onSelect,
}: {
  marks: readonly InspectorMark[];
  idPrefix: string;
  /** Hovered or focused from its card, or just pointed at by the card: drawn with a thicker border. */
  emphasizedId: string | null;
  pulse: { id: string; nonce: number } | null;
  reduceMotion: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const ordered = [...marks].sort((a, b) => (a.rects[0]?.top ?? 0) - (b.rects[0]?.top ?? 0) || (a.rects[0]?.left ?? 0) - (b.rects[0]?.left ?? 0));
  return (
    <div className="pointer-events-none absolute inset-0">
      <div aria-hidden>
        {ordered.flatMap((mark) =>
          mark.rects.map((rect, index) => (
            <span
              key={`${mark.id}-${index}`}
              onClick={() => onSelect(mark.id)}
              style={{
                left: `${rect.left + rect.width / 2}%`,
                top: `${rect.top + rect.height / 2}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
              }}
              className={cn("pointer-events-auto", HIT_AREA)}
            />
          )),
        )}
      </div>
      {ordered.map((mark) => {
        const emphasized = mark.id === emphasizedId;
        const pulsing = pulse?.id === mark.id;
        const box = cn(
          "pointer-events-auto absolute cursor-pointer rounded-[2px] transition-[border-width] motion-reduce:transition-none",
          TONE[mark.priority],
          emphasized ? "border-[2.5px]" : "border-[1.5px]",
        );
        const [first, ...rest] = mark.rects;
        if (first === undefined) {
          return null;
        }
        return (
          <div key={mark.id}>
            <motion.button
              // A new key restarts the pulse each time the card asks for it again.
              key={pulsing ? `pulse-${pulse.nonce}` : "rest"}
              type="button"
              id={highlightDomId(idPrefix, mark.id)}
              aria-label={fillTemplate(t.inspector.highlight, { priority: t.results.priority[mark.priority], title: mark.title })}
              onClick={() => onSelect(mark.id)}
              style={position(first)}
              className={box}
              initial={{ scale: 1 }}
              animate={pulsing && !reduceMotion ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            />
            {/* The lines after the first belong to the same button; a pointer on them does the same thing. */}
            {rest.map((rect, index) => (
              <span key={index} aria-hidden onClick={() => onSelect(mark.id)} style={position(rect)} className={box} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
