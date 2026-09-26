import { describe, expect, it } from "vitest";
import { en } from "./dictionaries/en";
import { fillTemplate, formatDateTime, formatFileSize, formatQuotaTime } from "./format";

describe("fillTemplate", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    expect(fillTemplate("{count} pages, {missing}", { count: 3 })).toBe("3 pages, {missing}");
  });
});

describe("formatQuotaTime (StyleGuide §7.4/§7.5, DELTA-50)", () => {
  it("writes the GMT+8 time on the 24-hour clock the way each language writes it", () => {
    expect(formatQuotaTime("2026-09-26T15:00:00+08:00", "en", en.quotaTime)).toBe("15:00 GMT+8");
    expect(formatQuotaTime("2026-09-26T15:00:00+08:00", "id", en.quotaTime)).toBe("15.00 GMT+8");
    expect(formatQuotaTime("2026-09-27T00:00:00+08:00", "en", en.quotaTime)).toBe("00:00 GMT+8");
    expect(formatQuotaTime("2026-09-27T00:00:00+08:00", "id", en.quotaTime)).toBe("00.00 GMT+8");
  });

  it("converts a time sent in another offset to GMT+8", () => {
    expect(formatQuotaTime("2026-09-26T16:00:00Z", "en", en.quotaTime)).toBe("00:00 GMT+8");
  });
});

describe("formatFileSize", () => {
  it("uses MB with one decimal and KB below that", () => {
    expect(formatFileSize(1.5 * 1024 * 1024, "en")).toBe("1.5 MB");
    expect(formatFileSize(1.5 * 1024 * 1024, "id")).toBe("1,5 MB");
    expect(formatFileSize(2048, "en")).toBe("2 KB");
    expect(formatFileSize(10, "id")).toBe("1 KB");
  });
});

describe("formatDateTime", () => {
  it("produces a date and time in each language", () => {
    expect(formatDateTime("2026-09-26T08:00:00Z", "en")).toMatch(/2026/);
    expect(formatDateTime("2026-09-26T08:00:00Z", "id")).toMatch(/2026/);
  });
});
