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
    // Reference material, not application code: docs/client-scope.jsx is the
    // scope tool's source prototype, kept verbatim so the port can be diffed
    // against it. It is never built or imported.
    "docs/**",
  ]),
]);

export default eslintConfig;
