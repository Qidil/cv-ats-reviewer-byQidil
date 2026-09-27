"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ComponentProps, type Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fillTemplate } from "@/lib/i18n/format";
import type { CvPageImage } from "@/types/db";
import { HighlightOverlay, highlightDomId, type InspectorMark } from "./highlight-overlay";
import { HighlightLegend } from "./legend";

/** P5-D3: fit width, 150 %, and 200 %; a zoomed page pans inside the viewer, never the document. */
const ZOOM_STEPS = [1, 1.5, 2] as const;
type Zoom = (typeof ZOOM_STEPS)[number];
/** Long enough for a smooth scroll to begin; each scroll event then extends it by the quiet time. */
const STEER_START_MS = 400;
const STEER_QUIET_MS = 150;
/** StyleGuide §5.2: how long the box a card pointed at keeps its thicker border. */
const POINTED_MS = 1500;

export interface PageViewerHandle {
  /** Turns to the highlight's page, centers it in the viewer, and pulses it once (AC-07.2). */
  showHighlight: (id: string) => void;
}

/**
 * Stored WebP blobs shown through object URLs. The ref callback creates the URL when the image
 * mounts and its cleanup revokes it, so no URL outlives its image and no state is involved.
 */
function BlobImage({ blob, alt, ...props }: { blob: Blob; alt: string } & Omit<ComponentProps<"img">, "src" | "alt">) {
  const attach = useCallback(
    (node: HTMLImageElement | null) => {
      if (node === null) {
        return;
      }
      const url = URL.createObjectURL(blob);
      node.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [blob],
  );
  // eslint-disable-next-line @next/next/no-img-element -- blob: URLs cannot go through next/image
  return <img ref={attach} alt={alt} {...props} />;
}

/** FEAT-07: the page images with navigation, zoom, and the highlight layer (StyleGuide §5). */
export function PageViewer({
  pages,
  marks,
  idPrefix,
  emphasizedId,
  reduceMotion,
  onSelectHighlight,
  className,
  ref,
}: {
  pages: readonly CvPageImage[];
  marks: readonly InspectorMark[];
  idPrefix: string;
  /** The highlight whose card control is hovered or focused, drawn with a thicker border. */
  emphasizedId: string | null;
  reduceMotion: boolean;
  onSelectHighlight: (id: string) => void;
  className?: string;
  ref?: Ref<PageViewerHandle>;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const [zoom, setZoom] = useState<Zoom>(1);
  const [current, setCurrent] = useState(0);
  const [pulse, setPulse] = useState<{ id: string; nonce: number } | null>(null);
  const [pointedId, setPointedId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pageItems = useRef(new Map<number, HTMLLIElement>());
  /** True while a scroll started by the controls runs, so the counter keeps the page it was sent to (G5-02). */
  const steering = useRef(false);
  const steeringTimer = useRef<number | undefined>(undefined);
  const pointedTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(steeringTimer.current);
      window.clearTimeout(pointedTimer.current);
    },
    [],
  );
  const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

  /** The flag clears once no scroll event has come for a moment, or at once if the scroll never starts. */
  const steer = (quietMs: number) => {
    steering.current = true;
    window.clearTimeout(steeringTimer.current);
    steeringTimer.current = window.setTimeout(() => {
      steering.current = false;
    }, quietMs);
  };

  const goToPage = (index: number) => {
    const page = pages[index];
    const item = page ? pageItems.current.get(page.pageNumber) : undefined;
    setCurrent(index);
    steer(STEER_START_MS);
    // The list is positioned inside the scroller, so offsetTop is the page's place in it.
    scroller.current?.scrollTo?.({ top: item?.offsetTop ?? 0, behavior });
  };

  /** The page counter follows the page at the middle of the window, where a centered highlight sits. */
  const trackPage = () => {
    const container = scroller.current;
    if (container === null) {
      return;
    }
    if (steering.current) {
      steer(STEER_QUIET_MS);
      return;
    }
    const line = container.scrollTop + container.clientHeight / 2;
    let index = 0;
    pages.forEach((page, position) => {
      const item = pageItems.current.get(page.pageNumber);
      if (item !== undefined && item.offsetTop <= line) {
        index = position;
      }
    });
    setCurrent(index);
  };

  useImperativeHandle(
    ref,
    () => ({
      showHighlight: (id) => {
        const mark = marks.find((candidate) => candidate.id === id);
        const container = scroller.current;
        const target = document.getElementById(highlightDomId(idPrefix, id));
        if (mark === undefined || container === null || target === null) {
          return;
        }
        setCurrent(Math.max(0, pages.findIndex((page) => page.pageNumber === mark.pageNumber)));
        steer(STEER_START_MS);
        // Below 1024 px the viewer sits above the cards: the whole of it, toolbar included, comes into view first (G5-06).
        (root.current ?? container).scrollIntoView?.({ block: "nearest", behavior });
        const frame = container.getBoundingClientRect();
        const spot = target.getBoundingClientRect();
        container.scrollTo?.({
          top: container.scrollTop + spot.top - frame.top - (container.clientHeight - spot.height) / 2,
          left: container.scrollLeft + spot.left - frame.left - (container.clientWidth - spot.width) / 2,
          behavior,
        });
        setPulse((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
        // G5-05: the thicker border is the cue that survives reduced motion.
        setPointedId(id);
        window.clearTimeout(pointedTimer.current);
        pointedTimer.current = window.setTimeout(() => setPointedId(null), POINTED_MS);
      },
    }),
    [marks, pages, idPrefix, behavior],
  );

  const zoomLabel = (step: Zoom) => (step === 1 ? t.inspector.zoomFit : fillTemplate(t.inspector.zoomStep, { percent: step * 100 }));

  return (
    <div ref={root} className={cn("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={headingId} className="text-small font-medium text-secondary">
          {t.preview.heading}
        </h3>
        {marks.length > 0 ? <HighlightLegend /> : null}
      </div>
      {pages.length > 0 ? (
        <div role="group" aria-label={t.inspector.controls} className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="icon" aria-label={t.inspector.previousPage} disabled={current <= 0} onClick={() => goToPage(current - 1)}>
              <ChevronLeft aria-hidden className="size-5" />
            </Button>
            <span aria-live="polite" className="min-w-28 text-center text-small text-secondary tabular-nums">
              {fillTemplate(t.preview.pageLabel, { page: current + 1, count: pages.length })}
            </span>
            <Button
              variant="icon"
              aria-label={t.inspector.nextPage}
              disabled={current >= pages.length - 1}
              onClick={() => goToPage(current + 1)}
            >
              <ChevronRight aria-hidden className="size-5" />
            </Button>
          </div>
          <div role="group" aria-label={t.inspector.zoom} className="flex rounded-md border border-subtle p-0.5">
            {ZOOM_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                aria-pressed={zoom === step}
                onClick={() => setZoom(step)}
                className="min-h-11 min-w-11 rounded px-2.5 text-small font-medium text-secondary hover:bg-surface-elevated hover:text-primary aria-pressed:bg-surface-elevated aria-pressed:text-primary"
              >
                {zoomLabel(step)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {/* Focusable because it scrolls on its own: keyboards need a way to move through the pages. */}
      <div
        ref={scroller}
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        onScroll={trackPage}
        className="relative max-h-[45vh] overflow-auto rounded-lg lg:max-h-[calc(100dvh-14rem)]"
      >
        <ol style={{ width: `${zoom * 100}%` }} className="space-y-4">
          {pages.map((page) => {
            const width = page.image?.width ?? page.box.x1 - page.box.x0;
            const height = page.image?.height ?? page.box.y1 - page.box.y0;
            const pageMarks = marks.filter((mark) => mark.pageNumber === page.pageNumber);
            return (
              <li
                key={page.pageNumber}
                ref={(node) => {
                  if (node === null) {
                    pageItems.current.delete(page.pageNumber);
                  } else {
                    pageItems.current.set(page.pageNumber, node);
                  }
                }}
              >
                <figure>
                  <div className="relative">
                    {page.image ? (
                      <>
                        <BlobImage
                          blob={page.image.blob}
                          width={page.image.width}
                          height={page.image.height}
                          alt={fillTemplate(t.preview.alt, { page: page.pageNumber })}
                          className="h-auto w-full rounded-md bg-white"
                        />
                        {pageMarks.length > 0 ? (
                          <HighlightOverlay
                            marks={pageMarks}
                            idPrefix={idPrefix}
                            emphasizedId={emphasizedId ?? pointedId}
                            pulse={pulse}
                            reduceMotion={reduceMotion}
                            onSelect={onSelectHighlight}
                          />
                        ) : null}
                      </>
                    ) : (
                      <div
                        style={{ aspectRatio: `${width} / ${height}` }}
                        className="flex w-full items-center justify-center rounded-md border border-dashed border-strong bg-surface px-4 text-center text-small text-secondary"
                      >
                        {t.preview.missing}
                      </div>
                    )}
                  </div>
                  <figcaption className="mt-1.5 text-small text-muted">
                    {fillTemplate(t.preview.pageLabel, { page: page.pageNumber, count: pages.length })}
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
