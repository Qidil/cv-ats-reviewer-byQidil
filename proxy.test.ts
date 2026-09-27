import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function visit(path: string, cookie?: string) {
  const headers = cookie === undefined ? undefined : { cookie };
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

const target = (response: Response) => response.headers.get("location")?.replace("http://localhost:3000", "");

describe("proxy language redirect (ADR-008, AC-11.1, AC-11.2)", () => {
  it("sends a first visit to English", () => {
    const response = visit("/");
    expect(response.status).toBe(307);
    expect(target(response)).toBe("/en");
  });

  it("sends a returning Indonesian visitor to /id, and keeps the rest of the path", () => {
    expect(target(visit("/", "lang=id"))).toBe("/id");
    expect(target(visit("/about", "lang=id"))).toBe("/id/about");
  });

  it("ignores a cookie that names no supported language", () => {
    expect(target(visit("/", "lang=fr"))).toBe("/en");
  });

  it("lets a path that already has a language through", () => {
    for (const path of ["/en", "/id", "/id/anything"]) {
      const response = visit(path, "lang=en");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
});
