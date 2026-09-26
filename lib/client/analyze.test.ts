import { describe, expect, it } from "vitest";
import { sendAnalysis, type AnalyzeRequest } from "./analyze";

type Handler = (() => void) | null;

/** Only the XMLHttpRequest members sendAnalysis uses. */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  timeout = 0;
  status = 0;
  responseText = "";
  headers: Record<string, string> = {};
  body: FormData | null = null;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: Handler } = {
    onprogress: null,
    onload: null,
  };
  onload: Handler = null;
  onerror: Handler = null;
  ontimeout: Handler = null;
  onabort: Handler = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  respond(status: number, text: string) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    this.upload.onload?.();
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

const create = () => new FakeXhr() as unknown as XMLHttpRequest;
const REQUEST: AnalyzeRequest = {
  file: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  fileName: "cv.pdf",
  mode: "mode-a",
  jobTitle: "Backend Engineer",
  jobDescription: "TypeScript dan PostgreSQL.",
  language: "id",
  personalKey: null,
};
const REPORT = JSON.stringify({ mode: "mode-a", overallScore: 70, atsChecks: [], document: { pages: [] }, meta: {} });

describe("sendAnalysis", () => {
  it("resolves with a key failure instead of throwing when the browser refuses the key header (G-03)", async () => {
    const refusing = () => {
      const xhr = new FakeXhr();
      xhr.setRequestHeader = (name: string) => {
        if (name === "Authorization") {
          throw new DOMException("Invalid header value", "SyntaxError");
        }
      };
      return xhr as unknown as XMLHttpRequest;
    };
    const outcome = await sendAnalysis({ ...REQUEST, personalKey: { apiKey: "sk-or-v1-\u200bkey", model: "", baseUrl: "" } }, {}, refusing);

    expect(outcome).toEqual({ kind: "client-error", failure: "KEY_UNSENDABLE" });
  });

  it("posts the form with the interface language and reports upload progress", async () => {
    const progress: number[] = [];
    let uploaded = false;
    const promise = sendAnalysis(
      REQUEST,
      { onUploadProgress: (fraction) => progress.push(fraction), onUploaded: () => (uploaded = true) },
      create,
    );
    const xhr = FakeXhr.last;
    xhr.respond(200, REPORT);

    expect(await promise).toMatchObject({ kind: "success", response: { overallScore: 70 } });
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/analyze");
    expect(xhr.headers).toEqual({ "Accept-Language": "id" });
    expect(xhr.body?.get("targetJobDescription")).toBe("TypeScript dan PostgreSQL.");
    expect(xhr.body?.get("targetJobTitle")).toBe("Backend Engineer");
    expect(xhr.body?.get("customModel")).toBeNull();
    expect(progress).toEqual([0.5, 1]);
    expect(uploaded).toBe(true);
  });

  it("sends a personal key as Bearer with its model, and no job fields in Mode B", async () => {
    const promise = sendAnalysis(
      {
        ...REQUEST,
        mode: "mode-b",
        personalKey: { apiKey: "sk-or-v1-test", model: "vendor/model", baseUrl: "" },
      },
      {},
      create,
    );
    const xhr = FakeXhr.last;
    xhr.respond(200, REPORT);
    await promise;

    expect(xhr.headers.Authorization).toBe("Bearer sk-or-v1-test");
    expect(xhr.body?.get("provider")).toBeNull();
    expect(xhr.body?.get("customModel")).toBe("vendor/model");
    expect(xhr.body?.get("customBaseUrl")).toBeNull();
    expect(xhr.body?.get("targetJobDescription")).toBeNull();
  });

  it("sends an endpoint address with its key for a local or private server (ADR-009)", async () => {
    const promise = sendAnalysis(
      {
        ...REQUEST,
        personalKey: { apiKey: "local-key", model: "llama3", baseUrl: " http://localhost:11434/v1 " },
      },
      {},
      create,
    );
    const xhr = FakeXhr.last;
    xhr.respond(200, REPORT);
    await promise;

    expect(xhr.body?.get("customBaseUrl")).toBe("http://localhost:11434/v1");
  });

  it("returns catalog errors with their reset time", async () => {
    const promise = sendAnalysis(REQUEST, {}, create);
    FakeXhr.last.respond(
      429,
      JSON.stringify({ error: { code: "TOO_MANY_REQUESTS", message: "Batas per jam.", retryable: true, resetsAt: "2026-09-26T15:00:00+07:00" } }),
    );

    expect(await promise).toEqual({
      kind: "api-error",
      code: "TOO_MANY_REQUESTS",
      message: "Batas per jam.",
      retryable: true,
      resetsAt: "2026-09-26T15:00:00+07:00",
    });
  });

  it.each([
    [413, "Request Entity Too Large", "PAYLOAD_TOO_LARGE"],
    [504, "<html>Gateway Timeout</html>", "SERVER_UNREACHABLE"],
    [200, "not json", "UNREADABLE"],
    [500, JSON.stringify({ error: { code: "NOT_A_CODE", message: "x" } }), "UNREADABLE"],
  ])("maps status %i without a catalog body to %s", async (status, text, failure) => {
    const promise = sendAnalysis(REQUEST, {}, create);
    FakeXhr.last.respond(status, text);

    expect(await promise).toEqual({ kind: "client-error", failure });
  });

  it("reports a lost connection, a timeout, and a cancel", async () => {
    const offline = sendAnalysis(REQUEST, {}, create);
    FakeXhr.last.onerror?.();
    expect(await offline).toEqual({ kind: "client-error", failure: "NO_CONNECTION" });

    const slow = sendAnalysis(REQUEST, {}, create);
    FakeXhr.last.ontimeout?.();
    expect(await slow).toEqual({ kind: "client-error", failure: "SERVER_UNREACHABLE" });

    const controller = new AbortController();
    const cancelled = sendAnalysis(REQUEST, { signal: controller.signal }, create);
    controller.abort();
    expect(await cancelled).toEqual({ kind: "cancelled" });
    expect(await sendAnalysis(REQUEST, { signal: controller.signal }, create)).toEqual({ kind: "cancelled" });
  });
});
