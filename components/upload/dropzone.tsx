"use client";

import { FileText, Upload } from "lucide-react";
import { useId, useImperativeHandle, useRef, useState, type DragEvent, type Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatFileSize } from "@/lib/i18n/format";
import { MAX_PDF_BYTES } from "@/lib/pdf/types";

export interface ChosenFileInfo {
  name: string;
  size: number;
  /** Picked from history rather than from the device. */
  stored: boolean;
}

export type FileProblem = "notPdf" | "tooLarge";

export interface DropzoneHandle {
  /** Focuses the control that picks a file, whichever of the two states is showing. */
  focus: () => void;
}

/** BR-01, checked before the upload so a wrong file never costs a request. */
export function checkPdf(file: File): FileProblem | null {
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return "notPdf";
  }
  return file.size > MAX_PDF_BYTES ? "tooLarge" : null;
}

export function Dropzone({
  file,
  problem,
  disabled,
  onPick,
  onRemove,
  ref,
}: {
  file: ChosenFileInfo | null;
  /** Already in the interface language: a local check or the server's PDF message. */
  problem: string | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  ref?: Ref<DropzoneHandle>;
}) {
  const { t, language } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const pickButton = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const problemId = useId();
  const browse = () => input.current?.click();

  useImperativeHandle(ref, () => ({ focus: () => pickButton.current?.focus() }), []);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(!disabled);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving across a child fires dragleave on the parent; only leaving the area counts.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (!disabled && dropped) {
      onPick(dropped);
    }
  };
  const describedBy = [hintId, problem ? problemId : null].filter(Boolean).join(" ");

  return (
    <section aria-labelledby={`${hintId}-label`}>
      <h2 id={`${hintId}-label`} className="mb-2 text-small font-medium text-secondary">
        {t.upload.label}
      </h2>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) {
            onPick(picked);
          }
          event.target.value = "";
        }}
      />
      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {file ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-4 transition-colors",
              dragging ? "border-action bg-action/10" : "border-subtle",
            )}
          >
            <FileText aria-hidden className="size-6 shrink-0 text-secondary" />
            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-small text-secondary">
                {formatFileSize(file.size, language)}
                {file.stored ? ` · ${t.upload.storedCv}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button ref={pickButton} variant="secondary" disabled={disabled} onClick={browse}>
                {t.upload.replace}
              </Button>
              <Button variant="secondary" disabled={disabled} onClick={onRemove}>
                {t.upload.remove}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center transition-colors",
              dragging ? "border-action bg-action/10" : problem ? "border-critical bg-surface" : "border-strong bg-surface",
            )}
          >
            <Upload aria-hidden className="size-6 text-secondary" />
            <p className="font-medium">{t.upload.drop}</p>
            <Button
              ref={pickButton}
              variant="secondary"
              disabled={disabled}
              onClick={browse}
              aria-describedby={describedBy}
            >
              {t.upload.browse}
            </Button>
            <p id={hintId} className="text-small text-secondary">
              {t.upload.hint}
            </p>
          </div>
        )}
      </div>
      {problem ? (
        <p id={problemId} role="alert" className="mt-2 text-small text-critical">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
