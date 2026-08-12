/**
 * Build-time constants, substituted by esbuild's `define` in
 * scripts/build-scope.mjs. Nothing here exists at runtime as a variable — each
 * one is replaced with a literal before the bundle is written, which is why
 * they are `declare const` and not an import.
 */
declare const __SCOPE_CONFIG__: {
  /** Supabase project origin, e.g. https://<project-ref>.supabase.co */
  readonly supabaseUrl: string;
  /** The anon key. Public by design — it is in the page's JS on every build. */
  readonly supabaseAnonKey: string;
  /** The `source` value this build stamps on every session it captures. */
  readonly source: string;
};
