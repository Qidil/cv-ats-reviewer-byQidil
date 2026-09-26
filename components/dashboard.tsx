"use client";

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from "react";
import {
  ErrorNotice,
  canRetryNow,
  isFileError,
  isKeyError,
  type DashboardError,
} from "@/components/analysis/error-notice";
import { AnalysisProgress } from "@/components/analysis/progress";
import { Header } from "@/components/header";
import { HistoryDrawer, type HistoryActions } from "@/components/history/history-drawer";
import { useI18n } from "@/components/i18n-provider";
import { ByokModal } from "@/components/settings/byok-modal";
import { Notice } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dropzone, checkPdf, type DropzoneHandle } from "@/components/upload/dropzone";
import { ModeSelector } from "@/components/upload/mode-selector";
import { cn } from "@/lib/cn";
import { sendAnalysis, type AnalyzeOutcome } from "@/lib/client/analyze";
import {
  isStorageFull,
  loadStoredAnalysis,
  openBrowserStorage,
  pagesFromResponse,
  readActiveCvId,
  saveAnalysisResult,
  viewFromResponse,
  writeActiveCvId,
  type AnalysisSource,
  type AnalysisView,
} from "@/lib/client/history";
import { clearPersonalKey, usePersonalKey } from "@/lib/client/settings";
import { StorageIntegrityError, type CvAtsStorage } from "@/lib/db/storage";
import type { ApiErrorCode } from "@/types/api";
import type { AnalysisMode } from "@/types/ats";

/** G-16: the result view brings Motion, so it loads with the first result instead of with the page. */
const loadResultView = () => import("@/components/results/result-view");
const ResultView = lazy(() => loadResultView().then((module) => ({ default: module.ResultView })));

/** What the next analysis sends: a file from the device, a stored CV, or both once a result is saved. */
interface ChosenCv {
  file: Blob | null;
  name: string;
  size: number;
  cvId: number | null;
}

type ResultNotice = "notSaved" | "storageFull";

type PendingPhase =
  | { kind: "restoring" }
  | { kind: "analyzing"; stage: "uploading" | "processing"; fraction: number; startedAt: number };

type Phase = { kind: "start" } | PendingPhase | { kind: "result"; view: AnalysisView; notice: ResultNotice | null };

type FocusTarget = "heading" | "dropzone" | "description" | "alert" | "submit" | "result" | "progress";

const HOUR_MS = 60 * 60 * 1000;
/** Only the clock time is shown, and the daily quota always resets at midnight GMT+8 (DELTA-50). */
const MIDNIGHT_GMT8 = "2000-01-01T00:00:00+08:00";

/** api.md sends resetsAt with both limit codes; this keeps the notices right if it is ever missing. */
function fallbackReset(code: ApiErrorCode, now: number): string | undefined {
  if (code === "DAILY_QUOTA_EXCEEDED") {
    return MIDNIGHT_GMT8;
  }
  if (code === "TOO_MANY_REQUESTS") {
    // GMT+8 is a whole-hour offset without daylight saving, so the next UTC hour is the next GMT+8 hour.
    return new Date((Math.floor(now / HOUR_MS) + 1) * HOUR_MS).toISOString();
  }
  return undefined;
}

function toDashboardError(outcome: Extract<AnalyzeOutcome, { kind: "api-error" | "client-error" }>): DashboardError {
  if (outcome.kind === "client-error") {
    return { kind: "client", failure: outcome.failure };
  }
  const resetsAt = outcome.resetsAt ?? fallbackReset(outcome.code, Date.now());
  return {
    kind: "api",
    code: outcome.code,
    message: outcome.message,
    retryable: outcome.retryable,
    ...(resetsAt ? { resetsAt } : {}),
  };
}

async function persistResult(
  storage: CvAtsStorage,
  input: Parameters<typeof saveAnalysisResult>[1],
): Promise<{ ids: { cvId: number; reviewId: number } | null; notice: ResultNotice | null }> {
  try {
    return { ids: await saveAnalysisResult(storage, input), notice: null };
  } catch (error) {
    // Another tab may have deleted the stored CV meanwhile: keep the result as a new CV instead.
    if (error instanceof StorageIntegrityError && input.existingCvId !== null) {
      return persistResult(storage, { ...input, existingCvId: null });
    }
    return { ids: null, notice: isStorageFull(error) ? "storageFull" : "notSaved" };
  }
}

/** Null phase: the placeholder shown while the result view itself loads. */
function PendingLayout({
  phase,
  onCancel,
  progressRef,
}: {
  phase: PendingPhase | null;
  onCancel?: () => void;
  progressRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Progress comes first in the DOM so phones show it above the page placeholder. */}
      <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
        {phase?.kind === "analyzing" ? (
          <AnalysisProgress
            ref={progressRef}
            stage={phase.stage}
            fraction={phase.fraction}
            startedAt={phase.startedAt}
            onCancel={onCancel ?? (() => undefined)}
          />
        ) : phase?.kind === "restoring" ? (
          <p role="status" className="sr-only">
            {t.results.restoring}
          </p>
        ) : null}
        <Skeleton className="h-36 rounded-lg" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Skeleton key={row} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
      <Skeleton className="aspect-[1/1.414] w-full rounded-lg lg:col-start-1 lg:row-start-1" />
    </div>
  );
}

export function Dashboard() {
  const { t, language } = useI18n();
  const personalKey = usePersonalKey();
  const usingOwnKey = personalKey.apiKey !== "";

  /** undefined while the browser is being checked; null when IndexedDB is blocked (P4-D3). */
  const [storage, setStorage] = useState<CvAtsStorage | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: "start" });
  const [chosen, setChosen] = useState<ChosenCv | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  // The type that needs nothing but the file, so a first visit goes from upload to result in one click.
  const [mode, setMode] = useState<AnalysisMode>("mode-b");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [missingDescription, setMissingDescription] = useState(false);
  const [error, setError] = useState<DashboardError | null>(null);
  const [keyRemoved, setKeyRemoved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const storageReady = useRef<Promise<CvAtsStorage | null> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dropzone = useRef<DropzoneHandle>(null);
  const description = useRef<HTMLTextAreaElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  /** G-14: once the user acts, the stored result that was still opening must not replace their screen. */
  const userActed = useRef(false);

  /** One shared open: an analysis that finishes before the first check still finds the storage. */
  const getStorage = () => {
    storageReady.current ??= openBrowserStorage();
    return storageReady.current;
  };

  /** Focus moves once the next screen has rendered, because the element is not there yet. */
  const focusAfterRender = (target: FocusTarget) => {
    pendingFocus.current = target;
    setFocusRequest((count) => count + 1);
  };

  /** The result view loads on demand; when it mounts after the focus request, the request runs again. */
  const retryFocus = useCallback(() => setFocusRequest((count) => count + 1), []);

  // G-15: a layout effect moves focus in the same commit as the new screen, before anything else can run.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    switch (target) {
      case "dropzone":
        dropzone.current?.focus();
        break;
      case "description":
        description.current?.focus();
        break;
      case "alert":
        alert.current?.focus();
        break;
      case "submit":
        submit.current?.focus();
        break;
      case "progress":
        progress.current?.focus();
        break;
      case "heading":
      case "result": {
        const element = (target === "heading" ? heading : resultHeading).current;
        if (element === null) {
          pendingFocus.current = target;
          break;
        }
        // Scrolled to the top instead: below 1024 px the page images sit above the report (StyleGuide §4).
        element.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
        break;
      }
      default:
        break;
    }
  }, [focusRequest]);

  // AC-08.1: the last active CV reopens from IndexedDB, without the network.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      storageReady.current ??= openBrowserStorage();
      const opened = await storageReady.current;
      if (cancelled) {
        return;
      }
      setStorage(opened);
      const activeCvId = opened ? readActiveCvId() : null;
      if (opened === null || activeCvId === null || userActed.current) {
        return;
      }
      setPhase({ kind: "restoring" });
      void loadResultView();
      const view = await loadStoredAnalysis(opened, activeCvId).catch(() => null);
      if (cancelled || userActed.current) {
        return;
      }
      if (view === null) {
        writeActiveCvId(null);
        setPhase({ kind: "start" });
        return;
      }
      setChosen({ file: null, name: view.fileName, size: view.fileSize, cvId: view.cvId });
      setPhase({ kind: "result", view, notice: null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const settle = async (outcome: AnalyzeOutcome, source: AnalysisSource, cv: ChosenCv) => {
    if (outcome.kind === "cancelled") {
      setPhase({ kind: "start" });
      focusAfterRender("submit");
      return;
    }
    if (outcome.kind !== "success") {
      const failure = toDashboardError(outcome);
      setPhase({ kind: "start" });
      if (isFileError(failure)) {
        // PRD §6.3: this file cannot be analyzed, so it is cleared and the upload area asks for another.
        setChosen(null);
        setFileProblem(failure.kind === "api" ? failure.message : t.upload.tooLarge);
        focusAfterRender("dropzone");
      } else {
        setError(failure);
        focusAfterRender("alert");
      }
      return;
    }
    const { response } = outcome;
    const pages = pagesFromResponse(response);
    const now = new Date().toISOString();
    const db = await getStorage();
    const saved = db
      ? await persistResult(db, { response, source, pages, existingCvId: cv.cvId, now })
      : { ids: null, notice: null };
    if (saved.ids) {
      writeActiveCvId(saved.ids.cvId);
    }
    setChosen({ file: source.file, name: cv.name, size: source.file.size, cvId: saved.ids?.cvId ?? cv.cvId });
    setPhase({ kind: "result", view: viewFromResponse(response, source, pages, saved.ids, now), notice: saved.notice });
    focusAfterRender("result");
  };

  const analyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase.kind === "analyzing") {
      return;
    }
    if (chosen === null) {
      setFileProblem(t.upload.missing);
      focusAfterRender("dropzone");
      return;
    }
    if (mode === "mode-a" && jobDescription.trim() === "") {
      setMissingDescription(true);
      focusAfterRender("description");
      return;
    }
    const cv = chosen;
    const controller = new AbortController();
    abort.current = controller;
    userActed.current = true;
    setError(null);
    setKeyRemoved(false);
    setFileProblem(null);
    setPhase({ kind: "analyzing", stage: "uploading", fraction: 0, startedAt: Date.now() });
    window.scrollTo({ top: 0 });
    // G-12: the submit button leaves the screen, so focus goes to the progress card with its Cancel button.
    focusAfterRender("progress");
    void loadResultView();

    let file = cv.file;
    if (file === null && cv.cvId !== null) {
      const db = await getStorage();
      const bytes = db ? await db.getCvFile(cv.cvId).catch(() => undefined) : undefined;
      file = bytes ? new Blob([bytes], { type: "application/pdf" }) : null;
    }
    if (file === null) {
      abort.current = null;
      setChosen(null);
      setFileProblem(t.upload.storedMissing);
      setPhase({ kind: "start" });
      focusAfterRender("dropzone");
      return;
    }

    const source: AnalysisSource = { file, fileName: cv.name, mode, jobTitle, jobDescription, language };
    let outcome: AnalyzeOutcome;
    try {
      outcome = await sendAnalysis(
        { ...source, personalKey: usingOwnKey ? personalKey : null },
        {
          signal: controller.signal,
          onUploadProgress: (fraction) =>
            setPhase((current) => (current.kind === "analyzing" ? { ...current, fraction } : current)),
          onUploaded: () =>
            setPhase((current) =>
              current.kind === "analyzing" ? { ...current, stage: "processing", fraction: 1 } : current,
            ),
        },
      );
    } catch {
      // G-03: every known failure already resolves; anything else must still leave the analyzing screen.
      outcome = { kind: "client-error", failure: "UNREADABLE" };
    } finally {
      abort.current = null;
    }
    await settle(outcome, source, cv);
  };

  const pickFile = (file: File) => {
    userActed.current = true;
    const problem = checkPdf(file);
    setError(null);
    setKeyRemoved(false);
    if (problem) {
      setChosen(null);
      setFileProblem(problem === "notPdf" ? t.upload.notPdf : t.upload.tooLarge);
    } else {
      setChosen({ file, name: file.name, size: file.size, cvId: null });
      setFileProblem(null);
    }
    // The control that opened the picker is replaced by the other state of the upload area.
    focusAfterRender("dropzone");
  };

  const removeFile = () => {
    userActed.current = true;
    setChosen(null);
    setFileProblem(null);
    setError(null);
    focusAfterRender("dropzone");
  };

  const changeMode = (next: AnalysisMode) => {
    setMode(next);
    setMissingDescription(false);
    setError(null);
  };

  const changeDescription = (value: string) => {
    setJobDescription(value);
    if (value.trim() !== "") {
      setMissingDescription(false);
    }
  };

  const analyzeAgain = () => {
    setPhase({ kind: "start" });
    focusAfterRender("heading");
  };

  const newCv = () => {
    userActed.current = true;
    writeActiveCvId(null);
    setChosen(null);
    setFileProblem(null);
    setError(null);
    setPhase({ kind: "start" });
    window.scrollTo({ top: 0 });
    focusAfterRender("dropzone");
  };

  /** A saved or removed key is the remedy for some errors, which would otherwise stay on screen. */
  const keyChanged = () => {
    setKeyRemoved(false);
    setError((current) => (current && isKeyError(current) ? null : current));
  };

  const removeKey = () => {
    clearPersonalKey();
    setError(null);
    setKeyRemoved(true);
    focusAfterRender("submit");
  };

  /** Drops what the screen still holds of deleted CVs; null stands for every stored CV. */
  const forgetStored = (cvId: number | null) => {
    const gone = (id: number | null) => id !== null && (cvId === null || id === cvId);
    if (gone(readActiveCvId())) {
      writeActiveCvId(null);
    }
    setChosen((current) => (current && gone(current.cvId) ? null : current));
    setPhase((current) => (current.kind === "result" && gone(current.view.cvId) ? { kind: "start" } : current));
  };

  const historyActions: HistoryActions = {
    onOpenCv: async (cvId) => {
      userActed.current = true;
      const db = await getStorage();
      const view = db ? await loadStoredAnalysis(db, cvId).catch(() => null) : null;
      if (view === null) {
        return false;
      }
      writeActiveCvId(cvId);
      setError(null);
      setFileProblem(null);
      setKeyRemoved(false);
      setChosen({ file: null, name: view.fileName, size: view.fileSize, cvId });
      setPhase({ kind: "result", view, notice: null });
      setHistoryOpen(false);
      focusAfterRender("result");
      return true;
    },
    onDeleteCv: async (cvId) => {
      const db = await getStorage();
      if (db) {
        await db.deleteCv(cvId);
        forgetStored(cvId);
      }
    },
    onClearAll: async () => {
      const db = await getStorage();
      if (db) {
        await db.clearAll();
        forgetStored(null);
      }
    },
  };

  const analyzing = phase.kind === "analyzing";
  const resultNotice =
    phase.kind === "result" && phase.notice
      ? phase.notice === "storageFull"
        ? t.errors.storageFull
        : t.errors.notSaved
      : null;

  return (
    <>
      <Header
        languageLocked={analyzing}
        usingOwnKey={usingOwnKey}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main
        className={cn(
          "mx-auto px-4 pt-6 pb-16 sm:px-6 sm:pt-10",
          phase.kind === "start" ? "max-w-3xl" : "max-w-7xl",
        )}
      >
        {storage === null ? <Notice className="mb-6">{t.errors.storageBlocked}</Notice> : null}
        {phase.kind === "start" ? (
          <>
            <h1 ref={heading} tabIndex={-1} className="text-display">
              {t.hero.title}
            </h1>
            <p className="mt-2 text-secondary">{t.hero.lead}</p>
            <form noValidate onSubmit={(event) => void analyze(event)} className="mt-8 space-y-8">
              <Dropzone
                ref={dropzone}
                file={chosen && { name: chosen.name, size: chosen.size, stored: chosen.file === null }}
                problem={fileProblem}
                disabled={false}
                onPick={pickFile}
                onRemove={removeFile}
              />
              <ModeSelector
                mode={mode}
                onModeChange={changeMode}
                jobTitle={jobTitle}
                onJobTitleChange={setJobTitle}
                jobDescription={jobDescription}
                onJobDescriptionChange={changeDescription}
                disabled={false}
                missingDescription={missingDescription}
                descriptionRef={description}
              />
              <div className="space-y-4">
                {error ? (
                  <ErrorNotice
                    ref={alert}
                    error={error}
                    usingOwnKey={usingOwnKey}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onRemoveKey={removeKey}
                  />
                ) : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button ref={submit} type="submit" className="w-full sm:w-auto">
                    {error && canRetryNow(error) ? t.actions.tryAgain : t.actions.analyze}
                  </Button>
                  <p role="status" className="text-small text-secondary">
                    {keyRemoved ? t.settings.removed : ""}
                  </p>
                </div>
                <p className="text-small text-secondary">{t.privacy}</p>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 className="sr-only">{t.header.appName}</h1>
            {phase.kind === "result" ? (
              <Suspense fallback={<PendingLayout phase={null} />}>
                <ResultView
                  view={phase.view}
                  headingRef={resultHeading}
                  notice={resultNotice ? <Notice>{resultNotice}</Notice> : null}
                  onAnalyzeAgain={analyzeAgain}
                  onNewCv={newCv}
                  onMount={retryFocus}
                />
              </Suspense>
            ) : (
              <PendingLayout phase={phase} progressRef={progress} onCancel={() => abort.current?.abort()} />
            )}
          </>
        )}
      </main>
      <ByokModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onKeyChanged={keyChanged} />
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        storage={storage}
        busy={analyzing}
        activeCvId={phase.kind === "result" ? phase.view.cvId : null}
        actions={historyActions}
      />
    </>
  );
}
