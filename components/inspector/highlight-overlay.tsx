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

const PRIORITY_RANK: Readonly<Record<SuggestionPriority, number>> = { high: 0, medium: 1, low: 2 };
/** Rects are in percent of the page; closer than this they are the same line drawn twice. */
const SAME_EDGE = 0.05;

const sameRects = (a: readonly ImageRect[], b: readonly ImageRect[]) =>
  a.length === b.length &&
  a.every(
    (rect, index) =>
      Math.abs(rect.left - b[index].left) < SAME_EDGE &&
      Math.abs(rect.top - b[index].top) < SAME_EDGE &&
      Math.abs(rect.width - b[index].width) < SAME_EDGE &&
      Math.abs(rect.height - b[index].height) < SAME_EDGE,
  );

export interface MarkGroup {
  /** The highest-priority card; the box takes its color, id, and click. */
  lead: InspectorMark;
  members: InspectorMark[];
}

/**
 * DELTA-63: cards that quote the same line would draw boxes on top of each other, and the lower one
 * could never be clicked. They share one box instead, named after every card it stands for.
 */
export function groupMarks(marks: readonly InspectorMark[]): MarkGroup[] {
  const groups: InspectorMark[][] = [];
  for (const mark of marks) {
    const group = groups.find(([first]) => first.pageNumber === mark.pageNumber && sameRects(first.rects, mark.rects));
    if (group) {
      group.push(mark);
    } else {
      groups.push([mark]);
    }
  }
  return groups.map((group) => {
    const members = [...group].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    return { lead: members[0], members };
  });
}

/** The id of the box that shows this card: its own, or the lead's when it shares a line. */
export function leadMarkId(marks: readonly InspectorMark[], id: string): string {
  return groupMarks(marks).find((group) => group.members.some((member) => member.id === id))?.lead.id ?? id;
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
  const ordered = groupMarks(marks).sort(
    ({ lead: a }, { lead: b }) => (a.rects[0]?.top ?? 0) - (b.rects[0]?.top ?? 0) || (a.rects[0]?.left ?? 0) - (b.rects[0]?.left ?? 0),
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      <div aria-hidden>
        {ordered.flatMap(({ lead }) =>
          lead.rects.map((rect, index) => (
            <span
              key={`${lead.id}-${index}`}
              onClick={() => onSelect(lead.id)}
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
      {ordered.map(({ lead, members }) => {
        const has = (id: string | null | undefined) => members.some((member) => member.id === id);
        const emphasized = has(emphasizedId);
        const pulsing = pulse !== null && has(pulse.id);
        const box = cn(
          "pointer-events-auto absolute cursor-pointer rounded-[2px] transition-[border-width] motion-reduce:transition-none",
          TONE[lead.priority],
          emphasized ? "border-[2.5px]" : "border-[1.5px]",
        );
        const [first, ...rest] = lead.rects;
        if (first === undefined) {
          return null;
        }
        const label = members
          .map((member) => fillTemplate(t.inspector.highlight, { priority: t.results.priority[member.priority], title: member.title }))
          .join("; ");
        return (
          <div key={lead.id}>
            <motion.button
              // A new key restarts the pulse each time the card asks for it again.
              key={pulsing ? `pulse-${pulse.nonce}` : "rest"}
              type="button"
              id={highlightDomId(idPrefix, lead.id)}
              aria-label={label}
              onClick={() => onSelect(lead.id)}
              style={position(first)}
              className={box}
              initial={{ scale: 1 }}
              animate={pulsing && !reduceMotion ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            />
            {/* The lines after the first belong to the same button; a pointer on them does the same thing. */}
            {rest.map((rect, index) => (
              <span key={index} aria-hidden onClick={() => onSelect(lead.id)} style={position(rect)} className={box} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
