import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js and its canvas must load from node_modules at runtime; neither is in Next.js's built-in external list.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // pdf.js reads the standard font files and loads the canvas binary at runtime, which file tracing cannot see.
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/pdfjs-dist/standard_fonts/**/*", "./node_modules/@napi-rs/**/*"],
  },
};

export default nextConfig;
