import type { NextConfig } from "next";

/**
 * DELTA-58: no other site may frame the app (its "Clear all" and Settings are one or two clicks), and
 * browsers must not guess content types. A full CSP stays a separate decision: the statically built
 * pages cannot carry nonces, and the Settings key test reaches endpoints the user types in.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // pdf.js and its canvas must load from node_modules at runtime; neither is in Next.js's built-in external list.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // pdf.js reads the standard font files and loads the canvas binary at runtime, which file tracing cannot see.
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/@napi-rs/**/*"],
  },
  headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
