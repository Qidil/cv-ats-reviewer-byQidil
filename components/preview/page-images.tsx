"use client";

import { useCallback, type ComponentProps } from "react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/cn";
import { fillTemplate } from "@/lib/i18n/format";
import type { CvPageImage } from "@/types/db";

/**
 * T11: stored WebP blobs shown through object URLs. The ref callback creates the URL when the image
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

export function PageImages({ pages, className }: { pages: readonly CvPageImage[]; className?: string }) {
  const { t } = useI18n();
  return (
    // Focusable because the parent makes it a scroll window: keyboards need a way to scroll it.
    <section tabIndex={0} aria-labelledby="pages-heading" className={cn("min-w-0", className)}>
      <h3 id="pages-heading" className="mb-3 text-small font-medium text-secondary">
        {t.preview.heading}
      </h3>
      <ol className="space-y-4">
        {pages.map((page) => {
          const width = page.image?.width ?? page.box.x1 - page.box.x0;
          const height = page.image?.height ?? page.box.y1 - page.box.y0;
          return (
            <li key={page.pageNumber}>
              <figure>
                {page.image ? (
                  <BlobImage
                    blob={page.image.blob}
                    width={page.image.width}
                    height={page.image.height}
                    alt={fillTemplate(t.preview.alt, { page: page.pageNumber })}
                    className="h-auto w-full rounded-md bg-white"
                  />
                ) : (
                  <div
                    style={{ aspectRatio: `${width} / ${height}` }}
                    className="flex w-full items-center justify-center rounded-md border border-dashed border-strong bg-surface px-4 text-center text-small text-secondary"
                  >
                    {t.preview.missing}
                  </div>
                )}
                <figcaption className="mt-1.5 text-small text-muted">
                  {fillTemplate(t.preview.pageLabel, { page: page.pageNumber, count: pages.length })}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
