import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePdf, textLine } from "@/lib/pdf/test-utils/make-pdf";
import type { AnalyzeResponse, ApiErrorResponse } from "@/types/api";
import { POST } from "./route";

const CV_BYTES = makePdf([
  [
    "Budi Santoso",
    "budi.santoso@email.com",
    "+6281234567890",
    "Ringkasan",
    "Backend developer dengan 5 tahun pengalaman membangun layanan pembayaran.",
    "Keahlian",
    "- TypeScript",
    "Pengalaman",
    "- Memangkas waktu respons API sebesar 40% untuk 2 juta pengguna.",
    "Pendidikan",
    "S1 Teknik Informatika",
  ]
    .map((line, index) => textLine(line, 72, 740 - index * 16))
    .join("\n"),
]);
const AI_CONTENT = JSON.stringify({
  atsChecks: [
    { id: "keyword", score: 70, detail: "TypeScript ada." },
    { id: "skills", score: 60, detail: "Sebagian ada." },
  ],
  weaknesses: [],
  suggestions: [],
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "server-test-key");
  vi.stubEnv("QUOTA_HASH_SECRET", "route-test-secret");
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
    vi.stubEnv(name, "");
  }
  fetchMock = vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: AI_CONTENT } }] }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function formRequest(fields: Record<string, string | Uint8Array<ArrayBuffer>>, headers: Record<string, string> = {}): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, typeof value === "string" ? value : new File([value], "cv.pdf", { type: "application/pdf" }));
  }
  return new Request("http://localhost/api/analyze", { method: "POST", body: form, headers });
}

async function errorOf(response: Response): Promise<ApiErrorResponse["error"]> {
  return ((await response.json()) as ApiErrorResponse).error;
}

describe("POST /api/analyze", () => {
  it("returns the report for a multipart Mode A request", async () => {
    const response = await POST(
      formRequest(
        { file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." },
        { "x-forwarded-for": "203.0.113.20" },
      ),
    );
    const body = (await response.json()) as AnalyzeResponse;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ mode: "mode-a", meta: { modelUsed: "openrouter/free", quota: { used: 1 } } });
    expect(body.atsChecks).toHaveLength(6);
    expect(body.document.pageCount).toBe(1);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer server-test-key" });
  });

  it("forwards a personal key and skips the quota", async () => {
    const response = await POST(
      formRequest(
        { file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." },
        { authorization: "Bearer sk-or-v1-user-test-key", "x-forwarded-for": "203.0.113.21" },
      ),
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as AnalyzeResponse).meta.quota).toBeNull();
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk-or-v1-user-test-key" });
  });

  it("recognizes a personal key's provider, so the key reaches that provider (ADR-009)", async () => {
    const response = await POST(
      formRequest(
        { file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript.", customModel: "groq-test-model" },
        { authorization: "Bearer gsk_user-test-key", "x-forwarded-for": "203.0.113.25" },
      ),
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as AnalyzeResponse).meta.modelUsed).toBe("groq-test-model");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("answers a missing file with 400 INVALID_INPUT in the catalog body", async () => {
    const response = await POST(formRequest({ mode: "mode-b" }, { "x-forwarded-for": "203.0.113.22" }));

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: "INVALID_INPUT", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a body that is not multipart with 400 INVALID_INPUT", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cvText: "Budi" }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("INVALID_INPUT");
  });

  it("answers a request without a body with 400 INVALID_INPUT", async () => {
    const response = await POST(new Request("http://localhost/api/analyze", { method: "POST" }));

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("INVALID_INPUT");
  });

  it("answers a file that is not a PDF with the PDF message in the requested language (BR-13)", async () => {
    const response = await POST(
      formRequest(
        { file: new TextEncoder().encode("bukan pdf"), mode: "mode-b" },
        { "x-forwarded-for": "203.0.113.23", "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-language")).toBe("id");
    expect(await errorOf(response)).toMatchObject({
      code: "PDF_INVALID",
      message: expect.stringContaining("bukan PDF yang bisa dibuka"),
    });
  });

  it("answers in English without an Accept-Language header", async () => {
    const response = await POST(formRequest({ file: new TextEncoder().encode("bukan pdf"), mode: "mode-b" }));

    expect(response.headers.get("content-language")).toBe("en");
    expect((await errorOf(response)).message).toContain("not a PDF that can be opened");
  });

  it("refuses a declared body over 4.5 MB before reading it", async () => {
    const request = formRequest({ mode: "mode-b" });
    const oversized = new Request(request, { headers: { "content-length": "4500001" } });
    const response = await POST(oversized);

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PDF_TOO_LARGE");
  });

  it("refuses a body over 4.5 MB sent without Content-Length while reading it", async () => {
    let cancelled = false;
    let chunksSent = 0;
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        if (chunksSent === 6) {
          controller.close();
          return;
        }
        chunksSent += 1;
        controller.enqueue(new Uint8Array(1_000_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=cv-boundary" },
      body,
      duplex: "half",
    };
    const request = new Request("http://localhost/api/analyze", init);
    const response = await POST(request);

    expect(request.headers.get("content-length")).toBeNull();
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PDF_TOO_LARGE");
    expect(cancelled).toBe(true);
  });

  it.each<[string, Record<string, string>]>([
    ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site same-site", { "sec-fetch-site": "same-site" }],
    ["an Origin on another host", { origin: "https://evil.example", host: "localhost:3000" }],
    ["Origin null", { origin: "null", host: "localhost:3000" }],
  ])("refuses a request from another site (%s) with 400 INVALID_INPUT before reading the body", async (_label, headers) => {
    const request = formRequest({ file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." }, headers);
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: "INVALID_INPUT", retryable: false });
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a request from another site in the requested language (BR-13)", async () => {
    const response = await POST(
      formRequest(
        { file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." },
        { "sec-fetch-site": "cross-site", "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
      ),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-language")).toBe("id");
    expect(await errorOf(response)).toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringContaining("analisis tidak valid"),
    });
  });

  it.each<[string, Record<string, string>]>([
    ["Sec-Fetch-Site same-origin", { "sec-fetch-site": "same-origin", "x-forwarded-for": "203.0.113.26" }],
    ["an Origin on the request host", { origin: "http://localhost:3000", host: "localhost:3000", "x-forwarded-for": "203.0.113.27" }],
    [
      "an Origin on the first forwarded host",
      {
        origin: "https://cv.example",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "CV.Example , proxy.internal",
        "x-forwarded-for": "203.0.113.28",
      },
    ],
  ])("accepts a same-origin browser request (%s)", async (_label, headers) => {
    const response = await POST(
      formRequest({ file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." }, headers),
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as AnalyzeResponse).mode).toBe("mode-a");
  });

  it("answers a request over the hourly limit with 429 TOO_MANY_REQUESTS, personal key included", async () => {
    vi.stubEnv("HOURLY_REQUEST_LIMIT", "1");
    const send = () =>
      POST(
        formRequest(
          { file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." },
          { authorization: "Bearer sk-or-v1-user-test-key", "x-forwarded-for": "203.0.113.24" },
        ),
      );

    expect((await send()).status).toBe(200);
    const response = await send();

    expect(response.status).toBe(429);
    expect(await errorOf(response)).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryable: true,
      resetsAt: expect.stringMatching(/T\d{2}:00:00\+08:00$/),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
