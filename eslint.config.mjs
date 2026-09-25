import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // globalIgnores replaces eslint-config-next's default ignores, so they are repeated here.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    ".agents/**",
    ".codebase-memory/**",
    ".codex/**",
    ".impeccable/**",
    ".opencode/**",
  ]),
]);

export default eslintConfig;
