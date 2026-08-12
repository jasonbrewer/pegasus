#!/usr/bin/env node
/**
 * Builds the static scoping bundle: one HTML page, one stylesheet, one script,
 * no server.
 *
 *   npm run build:scope
 *   npm run build:scope -- --theme=default --no-ga --out=dist/scope
 *
 * ===========================================================================
 * WHAT THIS IS FOR.
 *
 * The tool needs to run on a site that is not this app — a plain static host,
 * no Node, no Next, no session. It cannot be a Next static export: this app
 * uses server actions, a proxy, cookie auth and dynamic routes, so
 * `output: 'export'` fails app-wide and would still emit a framework runtime
 * around one page. It also must not be a hand-port, because a hand-port is a
 * second copy of the arithmetic that starts drifting the day a rate changes.
 *
 * So: esbuild wraps the SAME component the hosted route renders, reading the
 * SAME engine and the SAME rate sheet, and Tailwind emits the utilities that
 * component asks for. Change src/lib/scoping/baseline.ts, rebuild, upload —
 * both tools moved together.
 * ===========================================================================
 *
 * The output is deliberately dumb: three relative-linked files (plus whatever
 * the <head> loads) that can be dropped in a folder called /scope on any web
 * host and opened. Nothing here is deployed automatically; the last line of
 * this script tells you where the files are, and a human uploads them.
 */

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const BUNDLE = path.join(SRC, "scope-bundle");

/* ========================= WHAT THE BUILD TAKES ========================= */

/**
 * The Supabase project the captured sessions land in.
 *
 * The anon key is public by design — it is in the page's JavaScript on every
 * build of every Supabase site, and it is not a secret. What protects the lead
 * table is not the key: `anon` holds no privilege on scope_sessions at all,
 * and the only thing this key can do there is call record_scope_session(),
 * which returns void. See supabase/migrations/20260801000015.
 *
 * The service-role key must never come near this file.
 */
const SUPABASE_URL =
  process.env.SCOPE_SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "";

const SUPABASE_ANON_KEY =
  process.env.SCOPE_SUPABASE_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";

/**
 * The `source` this build stamps on every session it captures, so the leads
 * are filterable apart from the hosted tool's in admin.
 *
 * record_scope_session() clamps this to a known build and falls back to the
 * default if it does not recognise it — see migration 20260801000016. Changing
 * the string here without changing the allow-list there means the rows quietly
 * land in the other bucket.
 */
const SOURCE = process.env.SCOPE_SOURCE?.trim() || "8posts";

/** Google Analytics for the host site. Off for the untouched-look build. */
const GA_ID = process.env.SCOPE_GA_ID?.trim() || "G-NEMNJ919KG";

const THEMES = {
  /**
   * The host site's palette and type. The default, because a tool that arrives
   * in another site's colours reads as a bolt-on.
   */
  site: {
    css: "bundle-site.css",
    fonts:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,900" +
      "&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap",
    ga: true,
  },
  /** The tool exactly as the hosted route renders it. */
  default: {
    css: "bundle-default.css",
    fonts:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600" +
      "&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap",
    ga: false,
  },
};

/* ============================== ARGUMENTS ============================== */

function parseArgs(argv) {
  const options = {
    theme: "site",
    out: "dist/scope",
    canonical: "https://8posts.com/scope/",
    ga: null, // null = whatever the theme says
  };

  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    switch (key) {
      case "theme":
        if (!(value in THEMES)) {
          throw new Error(`--theme must be one of: ${Object.keys(THEMES).join(", ")}`);
        }
        options.theme = value;
        break;
      case "out":
        options.out = value;
        break;
      case "canonical":
        options.canonical = value;
        break;
      case "ga":
        options.ga = true;
        break;
      case "no-ga":
        options.ga = false;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

/* ================================ STEPS ================================ */

/**
 * The tool itself, bundled.
 *
 * `local-css` is what lets esbuild read scope.module.css the way Next does —
 * hashed class names, and the `styles` object the component imports. Without
 * it the shared component could not be consumed here unmodified, which is the
 * whole premise.
 */
async function bundleScript({ outDir }) {
  await build({
    entryPoints: [path.join(BUNDLE, "entry.tsx")],
    outdir: outDir,
    entryNames: "scope",
    bundle: true,
    minify: true,
    // No source map. It would carry every comment in this repo — including the
    // ones naming the product this page must not mention — onto a public host.
    sourcemap: false,
    legalComments: "none",
    format: "iife",
    platform: "browser",
    // safari14.1 rather than safari14: esbuild will not compile destructuring
    // down for 14.0, which has a destructuring bug of its own, and the shared
    // component destructures its props everywhere. 14.1 shipped in April 2021.
    target: ["es2020", "chrome90", "safari14.1", "firefox88", "edge90"],
    jsx: "automatic",
    loader: { ".module.css": "local-css" },
    // The same alias tsconfig.json gives the editor, so the bundle imports the
    // shared files by the same specifier the app does.
    alias: { "@": SRC },
    define: {
      "process.env.NODE_ENV": '"production"',
      __SCOPE_CONFIG__: JSON.stringify({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
        source: SOURCE,
      }),
    },
  });
}

/**
 * The stylesheet: Tailwind's utilities and the tokens, then the CSS module
 * esbuild extracted, concatenated into the one file the page links.
 *
 * Order matters only for the tokens — the theme overrides sit after
 * tokens.css inside the Tailwind half — because the module's own rules are
 * outranked on specificity rather than on position. See theme-site.css.
 */
async function bundleStyles({ outDir, theme }) {
  // Resolved through the package's own manifest rather than by guessing at a
  // path inside it: the CLI's entry point is not in its `exports` map, so the
  // only supported way to find it is the `bin` field.
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("@tailwindcss/cli/package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.tailwindcss);
  const generated = path.join(outDir, ".tailwind.css");

  const run = spawnSync(
    process.execPath,
    [
      cli,
      "--input",
      path.join(BUNDLE, "styles", THEMES[theme].css),
      "--output",
      generated,
      "--minify",
    ],
    { cwd: ROOT, encoding: "utf8" }
  );

  if (run.status !== 0) {
    throw new Error(`tailwind failed:\n${run.stderr || run.stdout}`);
  }

  const moduleCss = path.join(outDir, "scope.css");
  const utilities = await readFile(generated, "utf8");
  const components = await readFile(moduleCss, "utf8");

  await writeFile(moduleCss, `${utilities}\n${components}`, "utf8");
  await rm(generated);
}

function analyticsSnippet(gaId) {
  // Matches the host site's own guard: append ?notrack=1 to any URL on the
  // site and that visit is not counted, which is what keeps our own clicking
  // around out of the numbers.
  return `    <script>
      (function () {
        if (/[?&]notrack=1(&|$)/.test(location.search)) return;
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=${gaId}';
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());
        gtag('config', '${gaId}');
      })();
    </script>`;
}

function fontsSnippet(href) {
  return `    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${href}" />`;
}

async function writeHtml({ outDir, theme, ga, canonical, stamp }) {
  const template = await readFile(path.join(BUNDLE, "index.html"), "utf8");

  const html = template
    // The template's comments are notes to whoever edits the template. They
    // are not notes to the internet, and this page is dropped onto a site that
    // has nothing to do with this repo — so none of them ship. Everything the
    // JS and CSS carry is stripped by the minifier for the same reason.
    .replace(/\n?[ \t]*<!--[\s\S]*?-->/g, "")
    .replace(/%%FONTS%%/g, fontsSnippet(THEMES[theme].fonts))
    .replace(/%%ANALYTICS%%/g, ga ? analyticsSnippet(GA_ID) : "")
    .replace(/%%CANONICAL%%/g, canonical)
    .replace(/%%STAMP%%/g, stamp);

  await writeFile(path.join(outDir, "index.html"), html, "utf8");
}

/**
 * The guard that makes "reveals nothing about the other product" a property of
 * the build rather than a thing somebody remembered to check.
 *
 * It reads the files that are actually shipped — minified JS included, where a
 * stray string constant would otherwise be invisible in review — and refuses
 * to finish if any of them names the other build. The most likely way one gets
 * in is not a hand-typed name: it is a comment or a support address riding
 * along inside a shared file that someone imported here for the first time.
 */
const FORBIDDEN = [/production\s*circles/i, /productioncircles/i, /pc_scope_session/i];

async function assertClean(outDir, files) {
  const offences = [];

  for (const file of files) {
    const text = await readFile(path.join(outDir, file), "utf8");
    for (const pattern of FORBIDDEN) {
      const hit = text.match(pattern);
      if (hit) offences.push(`${file}: ${JSON.stringify(hit[0])}`);
    }
  }

  if (offences.length > 0) {
    throw new Error(
      "the bundle names the other product — it must not ship:\n  " + offences.join("\n  ")
    );
  }
}

/* ================================ BUILD ================================ */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, options.out);
  const ga = options.ga ?? THEMES[options.theme].ga;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "the Supabase project URL and anon key are required — the page captures\n" +
        "sessions and cannot be built without somewhere to put them.\n\n" +
        "  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local\n" +
        "  (or SCOPE_SUPABASE_URL / SCOPE_SUPABASE_ANON_KEY to point this build\n" +
        "  somewhere else). Project Settings > API in the Supabase dashboard.\n\n" +
        "  The anon key, never the service-role key."
    );
  }

  // A stamp, not a content hash: the filenames stay scope.css and scope.js so
  // the upload is the same three files every time, and the query string is
  // what changes. One fewer thing for a hand-upload to get wrong.
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

  /** Everything that ships. Both the guard and the size report read this. */
  const files = ["index.html", "scope.css", "scope.js"];

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await bundleScript({ outDir });
  await bundleStyles({ outDir, theme: options.theme });
  await writeHtml({ outDir, theme: options.theme, ga, canonical: options.canonical, stamp });
  await assertClean(outDir, files);

  // Measured on disk, after the stylesheet halves are concatenated — esbuild's
  // own report is of the file it wrote, not of the file that ships.
  const sizes = (
    await Promise.all(
      files.map(async (file) => {
        const { size } = await stat(path.join(outDir, file));
        return `${file} ${(size / 1024).toFixed(1)}kb`;
      })
    )
  ).join(", ");

  console.log(
    [
      "",
      `  Built  ${path.relative(ROOT, outDir)}/  (${options.theme} theme, GA ${ga ? "on" : "off"})`,
      `  Files  ${sizes}`,
      `  Leads  ${SUPABASE_URL} as source='${SOURCE}'`,
      "",
      "  Upload all three files together, keeping them in the same folder —",
      "  the page links its stylesheet and script by relative path.",
      "",
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(`\n  build:scope failed — ${error.message}\n`);
  process.exitCode = 1;
});
