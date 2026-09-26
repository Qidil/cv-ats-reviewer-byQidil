"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import {
  clearPersonalKey,
  isSendableKey,
  personalKeyProvider,
  readPersonalKey,
  savePersonalKey,
  testPersonalKey,
  usePersonalKey,
  type KeyTestResult,
} from "@/lib/client/settings";
import { fillTemplate } from "@/lib/i18n/format";
import { MAX_BASE_URL_CHARS, parseCustomBaseUrl } from "@/types/api";

/** api.md: the server refuses a model name over 200 characters. */
const MODEL_MAX = 200;

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-md border border-strong bg-app px-3 text-body text-primary placeholder:text-muted";

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "done"; result: KeyTestResult };
type SaveState = "idle" | "saved" | "failed" | "removed";
type Problem = "key" | "model" | "baseUrl" | "unrecognized" | null;

/** FEAT-05 / StyleGuide §7.3. */
export function ByokModal({
  open,
  onClose,
  onKeyChanged,
}: {
  open: boolean;
  onClose: () => void;
  onKeyChanged: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={t.settings.title}>
      <ByokForm onKeyChanged={onKeyChanged} />
    </Dialog>
  );
}

/** Dialog mounts this only while open, so every opening starts from what is stored. */
function ByokForm({ onKeyChanged }: { onKeyChanged: () => void }) {
  const { t } = useI18n();
  const stored = usePersonalKey();
  const [apiKey, setApiKey] = useState(() => readPersonalKey().apiKey);
  const [model, setModel] = useState(() => readPersonalKey().model);
  const [baseUrl, setBaseUrl] = useState(() => readPersonalKey().baseUrl);
  const [revealed, setRevealed] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<Problem>(null);
  const mounted = useRef(true);
  const keyField = useRef<HTMLInputElement>(null);
  const modelField = useRef<HTMLInputElement>(null);
  const baseUrlField = useRef<HTMLInputElement>(null);
  const ids = {
    key: useId(),
    recognized: useId(),
    model: useId(),
    modelHint: useId(),
    models: useId(),
    baseUrl: useId(),
    baseUrlHint: useId(),
    problem: useId(),
  };
  const typedKey = apiKey.trim();
  const provider = personalKeyProvider({ apiKey, model, baseUrl });
  const storedProvider = personalKeyProvider(stored);
  const usingOwnKey = stored.apiKey !== "";
  // G-09: only a typed key that is not OpenRouter's needs a model; an empty form asks for nothing.
  const needsModel = typedKey !== "" && provider !== "openrouter";
  const suggestions = test.kind === "done" && test.result.ok ? test.result.models : [];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resetFeedback = () => {
    setTest({ kind: "idle" });
    setSaveState("idle");
    setProblem(null);
  };

  /** The first thing that stops the key from being usable, in the order the fields appear. */
  const findProblem = (): Problem => {
    if (!isSendableKey(typedKey)) return "key";
    if (baseUrl.trim() !== "" && parseCustomBaseUrl(baseUrl) === null) return "baseUrl";
    if (provider === null) return model.trim() === "" ? "model" : "unrecognized";
    if (needsModel && model.trim() === "") return "model";
    return null;
  };

  const show = (found: Exclude<Problem, null>) => {
    setProblem(found);
    (found === "key" ? keyField : found === "model" ? modelField : baseUrlField).current?.focus();
  };

  const runTest = async () => {
    const found = findProblem();
    // A missing model does not stop the test; an unsendable or unknown key, or a broken address, does.
    if (found === "key" || found === "baseUrl" || found === "unrecognized" || (found === "model" && provider === null)) {
      show(found);
      return;
    }
    setTest({ kind: "testing" });
    const result = await testPersonalKey({ apiKey: typedKey, model, baseUrl });
    // The dialog may have closed while the provider answered.
    if (mounted.current) {
      setTest({ kind: "done", result });
    }
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typedKey === "") {
      return;
    }
    const found = findProblem();
    if (found !== null) {
      show(found);
      return;
    }
    const saved = savePersonalKey({ apiKey: typedKey, model, baseUrl });
    setSaveState(saved ? "saved" : "failed");
    if (saved) {
      onKeyChanged();
    }
  };

  const remove = () => {
    clearPersonalKey();
    setApiKey("");
    setModel("");
    setBaseUrl("");
    setProblem(null);
    setTest({ kind: "idle" });
    setSaveState("removed");
    onKeyChanged();
  };

  const status = !usingOwnKey
    ? t.settings.statusFree
    : storedProvider === "custom"
      ? t.settings.statusCustom
      : fillTemplate(t.settings.statusOwn, { provider: storedProvider ? t.settings.providers[storedProvider] : "" });
  const recognizedText = provider ? fillTemplate(t.settings.recognized, { provider: t.settings.providers[provider] }) : t.settings.notRecognized;
  const problemText =
    problem === "key"
      ? t.settings.keyUnsendable
      : problem === "model"
        ? t.settings.modelMissing
        : problem === "baseUrl"
          ? t.settings.baseUrlInvalid
          : problem === "unrecognized"
            ? t.settings.notRecognized
            : "";
  const testMessage =
    test.kind === "testing"
      ? t.settings.testing
      : test.kind === "done"
        ? test.result.ok
          ? test.result.freeTier
            ? t.settings.validFree
            : t.settings.valid
          : test.result.reason === "rejected"
            ? t.settings.rejected
            : t.settings.unavailable
        : "";
  const testFailed = test.kind === "done" && !test.result.ok;
  const saveMessage = { idle: "", saved: t.settings.saved, failed: t.settings.saveFailed, removed: t.settings.removed }[saveState];
  const describedBy = (...parts: Array<string | false>) => parts.filter(Boolean).join(" ");

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <p className={cn("flex items-start gap-2 font-medium", usingOwnKey ? "text-primary" : "text-secondary")}>
        <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0" />
        {status}
      </p>
      <p className="text-secondary">{t.settings.intro}</p>

      <div>
        <label htmlFor={ids.key} className="mb-1.5 block text-small font-medium">
          {t.settings.keyLabel}
        </label>
        <div className="flex gap-2">
          <input
            ref={keyField}
            id={ids.key}
            type={revealed ? "text" : "password"}
            value={apiKey}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={problem === "key"}
            aria-describedby={describedBy(typedKey !== "" && ids.recognized, problem === "key" && ids.problem) || undefined}
            onChange={(event) => {
              setApiKey(event.target.value);
              resetFeedback();
            }}
            className={cn(fieldClass, "font-mono")}
          />
          <Button variant="secondary" aria-controls={ids.key} onClick={() => setRevealed((value) => !value)}>
            {revealed ? t.settings.hide : t.settings.show}
          </Button>
        </div>
        <p
          id={ids.recognized}
          role="status"
          className={cn("mt-1.5 text-small", provider ? "text-secondary" : "text-muted")}
        >
          {typedKey !== "" ? recognizedText : ""}
        </p>
      </div>

      <div>
        <label htmlFor={ids.model} className="mb-1.5 block text-small font-medium">
          {needsModel ? t.settings.modelLabelRequired : t.settings.modelLabel}
        </label>
        <input
          ref={modelField}
          id={ids.model}
          value={model}
          list={suggestions.length > 0 ? ids.models : undefined}
          maxLength={MODEL_MAX}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-required={needsModel}
          aria-invalid={problem === "model"}
          aria-describedby={describedBy(ids.modelHint, problem === "model" && ids.problem)}
          onChange={(event) => {
            setModel(event.target.value);
            setProblem(null);
            setSaveState("idle");
          }}
          className={cn(fieldClass, "font-mono")}
        />
        {suggestions.length > 0 ? (
          <datalist id={ids.models}>
            {suggestions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        ) : null}
        <p id={ids.modelHint} className="mt-1.5 text-small text-secondary">
          {needsModel ? t.settings.modelHintRequired : t.settings.modelHint}
        </p>
      </div>

      <div>
        <label htmlFor={ids.baseUrl} className="mb-1.5 block text-small font-medium">
          {t.settings.baseUrlLabel}
        </label>
        <input
          ref={baseUrlField}
          id={ids.baseUrl}
          type="url"
          inputMode="url"
          value={baseUrl}
          maxLength={MAX_BASE_URL_CHARS}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={problem === "baseUrl" || problem === "unrecognized"}
          aria-describedby={describedBy(
            ids.baseUrlHint,
            (problem === "baseUrl" || problem === "unrecognized") && ids.problem,
          )}
          onChange={(event) => {
            setBaseUrl(event.target.value);
            resetFeedback();
          }}
          className={cn(fieldClass, "font-mono")}
        />
        <p id={ids.baseUrlHint} className="mt-1.5 text-small text-secondary">
          {t.settings.baseUrlHint}
        </p>
      </div>

      {problem !== null ? (
        // Error text uses red-400: text-critical is under 4.5:1 on the dialog's elevated surface.
        <p id={ids.problem} role="alert" className="text-small text-red-400">
          {problemText}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="secondary" disabled={typedKey === "" || test.kind === "testing"} onClick={() => void runTest()}>
          {t.settings.test}
        </Button>
        <p role="status" className={cn("text-small", testFailed ? "text-red-400" : "text-secondary")}>
          {testMessage}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-4">
        <Button type="submit" disabled={typedKey === ""}>
          {t.settings.save}
        </Button>
        {usingOwnKey ? (
          <Button variant="secondary" onClick={remove}>
            {t.settings.remove}
          </Button>
        ) : null}
        <p role="status" className={cn("text-small", saveState === "failed" ? "text-red-400" : "text-secondary")}>
          {saveMessage}
        </p>
      </div>
    </form>
  );
}
