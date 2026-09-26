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
        { authorization: "Bearer user-test-key", "x-forwarded-for": "203.0.113.21" },
      ),
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as AnalyzeResponse).meta.quota).toBeNull();
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer user-test-key" });
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

  it("answers a file that is not a PDF with the PDF message", async () => {
    const response = await POST(
      formRequest(
        { file: new TextEncoder().encode("bukan pdf"), mode: "mode-b" },
        { "x-forwarded-for": "203.0.113.23" },
      ),
    );

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({
      code: "PDF_INVALID",
      message: expect.stringContaining("bukan PDF yang bisa dibuka"),
    });
  });

  it("refuses a declared body over 4.5 MB before reading it", async () => {
    const request = formRequest({ mode: "mode-b" });
    const oversized = new Request(request, { headers: { "content-length": "4500001" } });
    const response = await POST(oversized);

    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PDF_TOO_LARGE");
  });

  it("answers a request over the hourly limit with 429 TOO_MANY_REQUESTS, personal key included", async () => {
    vi.stubEnv("HOURLY_REQUEST_LIMIT", "1");
    const send = () =>
      POST(
        formRequest(
          { file: CV_BYTES, mode: "mode-a", targetJobDescription: "Membutuhkan TypeScript." },
          { authorization: "Bearer user-test-key", "x-forwarded-for": "203.0.113.24" },
        ),
      );

    expect((await send()).status).toBe(200);
    const response = await send();

    expect(response.status).toBe(429);
    expect(await errorOf(response)).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryable: true,
      resetsAt: expect.stringMatching(/T\d{2}:00:00\+07:00$/),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
