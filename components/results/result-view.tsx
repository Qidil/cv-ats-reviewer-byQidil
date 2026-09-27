"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { InspectorMark } from "@/components/inspector/highlight-overlay";
import { PageViewer, type PageViewerHandle } from "@/components/inspector/page-viewer";
import { JobList } from "@/components/jobs/job-card";
import { Button } from "@/components/ui/button";
import type { AnalysisView } from "@/lib/client/history";
import { fillTemplate } from "@/lib/i18n/format";
import { SuggestionList, WeaknessList, suggestionCardId, suggestionTitleId, type SuggestionLink } from "./lists";
import { CheckList, ScoreSummary } from "./score";
import { EASE_OUT } from "./status";

/** StyleGuide §5.2: how long a card keeps the ring after a highlight pointed at it. */
const CARD_FLASH_MS = 1500;

/** StyleGuide §4: page images on the left from 1024 px (sticky), on top below that. */
export function ResultView({
  view,
  notice,
  headingRef,
  onAnalyzeAgain,
  onNewCv,
  onMount,
}: {
  view: AnalysisView;
  notice: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  onAnalyzeAgain: () => void;
  onNewCv: () => void;
  /** The dashboard loads this view on demand and moves focus to its heading once it exists. */
  onMount?: () => void;
}) {
  const { t, language } = useI18n();
  const reduceMotion = useReducedMotion() === true;
  useLayoutEffect(() => {
    onMount?.();
  }, [onMount]);
  const idPrefix = useId();
  const viewer = useRef<PageViewerHandle>(null);
  const [emphasizedId, setEmphasizedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const marks = useMemo<InspectorMark[]>(
    () =>
      view.suggestions.flatMap((suggestion) => {
        const highlight = view.highlights[suggestion.id];
        return highlight && suggestion.targetTextSnippet
          ? [{ id: suggestion.id, priority: suggestion.priority, title: suggestion.title, pageNumber: highlight.pageNumber, rects: highlight.rects }]
          : [];
      }),
    [view],
  );

  /** P5-T7 (StyleGuide §5.2). */
  const showCard = (id: string) => {
    document.getElementById(suggestionCardId(idPrefix, id))?.scrollIntoView?.({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    document.getElementById(suggestionTitleId(idPrefix, id))?.focus({ preventScroll: true });
    setFlashId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), CARD_FLASH_MS);
  };

  const link: SuggestionLink = {
    idPrefix,
    placed: new Set(marks.map((mark) => mark.id)),
    flashId,
    onShowInCv: (id) => viewer.current?.showHighlight(id),
    onEmphasize: setEmphasizedId,
  };
  const modeLabel =
    view.mode === "mode-a"
      ? view.targetJobTitle
        ? fillTemplate(t.results.modeA, { title: view.targetJobTitle })
        : t.results.modeAUntitled
      : t.results.modeB;

  return (
    // Opacity only: the lists inside already stagger, and a second movement would compete with them.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
      className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <PageViewer
        ref={viewer}
        pages={view.pages}
        marks={marks}
        idPrefix={idPrefix}
        emphasizedId={emphasizedId}
        reduceMotion={reduceMotion}
        onSelectHighlight={showCard}
        // Sticky needs the column to keep its own height instead of stretching to the grid row.
        className="lg:sticky lg:top-20 lg:self-start"
      />
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 ref={headingRef} tabIndex={-1} className="text-h2">
              {t.results.heading}
            </h2>
            <p className="mt-1 break-words text-secondary">
              {view.fileName} · {modeLabel}
            </p>
            {view.language !== language ? (
              <p className="mt-1 text-small text-muted">
                {fillTemplate(t.results.otherLanguage, { language: t.languageInSentence[view.language] })}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onAnalyzeAgain}>
              {t.actions.analyzeAgain}
            </Button>
            <Button variant="secondary" onClick={onNewCv}>
              {t.actions.newCv}
            </Button>
          </div>
        </div>
        {notice}
        <ScoreSummary score={view.overallScore} />
        <CheckList checks={view.atsChecks} />
        <WeaknessList weaknesses={view.weaknesses} />
        <SuggestionList suggestions={view.suggestions} link={link} />
        {view.mode === "mode-b" ? <JobList jobs={view.jobs} /> : null}
        {/* A custom model ID can be one long unbroken string, so it may wrap anywhere (G-13). */}
        <div className="space-y-1 text-small text-muted">
          <p className="break-words">{fillTemplate(t.results.model, { model: view.modelUsed })}</p>
          {view.failoverOccurred ? <p>{t.results.failoverNote}</p> : null}
          {view.continuationOccurred ? <p>{t.results.continuationNote}</p> : null}
        </div>
      </div>
    </motion.div>
  );
}
