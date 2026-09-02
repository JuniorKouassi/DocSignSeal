import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare/OpenNext build output and the separate render-service project.
    ".open-next/**",
    "containers/**",
    // Compiled by wrangler's esbuild pipeline, not part of the Next.js app;
    // see the ts-nocheck comment in the file itself for why.
    "custom-worker.ts",
  ]),
]);

export default eslintConfig;
