import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js must load from node_modules at runtime; it is not in Next.js's built-in external list.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
