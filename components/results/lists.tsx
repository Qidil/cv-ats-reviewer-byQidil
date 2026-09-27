"use client";

import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fillTemplate } from "@/lib/i18n/format";
import type { Suggestion } from "@/types/ats";
import { PRIORITY_ORDER, PRIORITY_TONE, staggerVariants } from "./status";

export function WeaknessList({ weaknesses }: { weaknesses: readonly string[] }) {
  const { t } = useI18n();
  if (weaknesses.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="weaknesses-heading">
      <h3 id="weaknesses-heading" className="mb-3 text-h3">
        {t.results.weaknesses}
      </h3>
      <ul className="list-disc space-y-2 pl-5 text-secondary marker:text-muted">
        {weaknesses.map((weakness, index) => (
          // AI text can repeat; the list never reorders, so the index is a stable key.
          <li key={index}>{weakness}</li>
        ))}
      </ul>
    </section>
  );
}

/** The two-way link with the page viewer (StyleGuide §5.2); without it the cards are plain. */
export interface SuggestionLink {
  idPrefix: string;
  /** Suggestions whose snippet has a highlight on a page image. */
  placed: ReadonlySet<string>;
  /** The card a highlight just pointed at, drawn with a temporary ring. */
  flashId: string | null;
  onShowInCv: (id: string) => void;
  onEmphasize: (id: string | null) => void;
}

export const suggestionCardId = (prefix: string, id: string) => `${prefix}-card-${id}`;
export const suggestionTitleId = (prefix: string, id: string) => `${prefix}-title-${id}`;

/** High priority first, so the red items lead (BR-08, StyleGuide §1.4). */
export function SuggestionList({ suggestions, link }: { suggestions: readonly Suggestion[]; link?: SuggestionLink }) {
  const { t } = useI18n();
  const { list, item } = staggerVariants(useReducedMotion() === true);
  const ordered = [...suggestions].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return (
    <section aria-labelledby="suggestions-heading">
      <h3 id="suggestions-heading" className="mb-3 text-h3">
        {t.results.suggestions}
      </h3>
      {ordered.length === 0 ? (
        <p className="text-secondary">{t.results.noSuggestions}</p>
      ) : (
        <motion.ul variants={list} initial="hidden" animate="shown" className="space-y-3">
          {ordered.map((suggestion) => (
            <motion.li
              key={suggestion.id}
              id={link ? suggestionCardId(link.idPrefix, suggestion.id) : undefined}
              variants={item}
              className={cn(
                "rounded-lg border border-subtle bg-surface p-4 transition-shadow motion-reduce:transition-none",
                link?.flashId === suggestion.id && "ring-2 ring-action",
              )}
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <Badge tone={PRIORITY_TONE[suggestion.priority]}>{t.results.priority[suggestion.priority]}</Badge>
                <h4
                  id={link ? suggestionTitleId(link.idPrefix, suggestion.id) : undefined}
                  // A highlight moves focus here, so a keyboard user continues from the card it named.
                  tabIndex={link ? -1 : undefined}
                  className="min-w-0 flex-1 basis-48 font-semibold"
                >
                  {suggestion.title}
                </h4>
              </div>
              <p className="mt-2 text-secondary">{suggestion.description}</p>
              {suggestion.targetTextSnippet ? (
                <figure className="mt-3 rounded-md border-l-2 border-strong bg-surface-elevated px-3 py-2">
                  <figcaption className="text-small text-muted">
                    {t.results.quote}
                    {suggestion.pageNumber ? ` · ${fillTemplate(t.results.page, { page: suggestion.pageNumber })}` : ""}
                  </figcaption>
                  {/* Verbatim from the CV (BR-13): never translated or tidied. */}
                  <blockquote className="mt-1 font-mono text-code break-words whitespace-pre-wrap text-primary">
                    {suggestion.targetTextSnippet}
                  </blockquote>
                  {link?.placed.has(suggestion.id) ? (
                    <Button
                      variant="secondary"
                      className="mt-2"
                      onClick={() => link.onShowInCv(suggestion.id)}
                      onMouseEnter={() => link.onEmphasize(suggestion.id)}
                      onMouseLeave={() => link.onEmphasize(null)}
                      onFocus={() => link.onEmphasize(suggestion.id)}
                      onBlur={() => link.onEmphasize(null)}
                    >
                      {t.inspector.showInCv}
                    </Button>
                  ) : null}
                </figure>
              ) : null}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
