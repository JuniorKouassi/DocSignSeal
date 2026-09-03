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
    // Cloudflare/OpenNext build output and the separate containers/ projects
    // (render-service, and the worker/ hosting both containers) -- each has
    // its own lint/type setup, not part of the Next.js app.
    ".open-next/**",
    "containers/**",
  ]),
]);

export default eslintConfig;
