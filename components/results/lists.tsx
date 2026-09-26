"use client";

import { motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
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

/** High priority first, so the red items lead (BR-08, StyleGuide §1.4). */
export function SuggestionList({ suggestions }: { suggestions: readonly Suggestion[] }) {
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
              variants={item}
              className="rounded-lg border border-subtle bg-surface p-4"
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <Badge tone={PRIORITY_TONE[suggestion.priority]}>{t.results.priority[suggestion.priority]}</Badge>
                <h4 className="min-w-0 flex-1 basis-48 font-semibold">{suggestion.title}</h4>
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
                </figure>
              ) : null}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
