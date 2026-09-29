"use client";

import { DrawablyHighlight, DrawablyUnderline } from "@/lib/drawably";

/**
 * Splits a headline on its dictionary accent and decorates just that part
 * (StyleGuide §8.2): underline for section titles, highlight for promises.
 */
export function Accent({
  text,
  accent,
  mode = "underline",
}: {
  text: string;
  accent: string;
  mode?: "underline" | "highlight";
}) {
  const index = accent ? text.indexOf(accent) : -1;
  if (index < 0) {
    return <>{text}</>;
  }
  const before = text.slice(0, index);
  const after = text.slice(index + accent.length);
  const Decoration = mode === "highlight" ? DrawablyHighlight : DrawablyUnderline;
  return (
    <>
      {before}
      <Decoration>{accent}</Decoration>
      {after}
    </>
  );
}
