#!/usr/bin/env node
// Prepare the generated `site/` directory for GitHub Pages.
//
// 1. Rename `site/index.docs.html` (Vite's output for `index.docs.html`) to
//    `site/index.html` so GitHub Pages serves the SPA entry.
// 2. Copy the same file to `site/404.html` so client-side routes resolve
//    through GitHub Pages' SPA fallback.
//
// This script intentionally uses only Node's built-in `fs`/`path` modules so
// it works identically on Windows, macOS, and Linux. Destination `docs/`
// (Markdown documentation) is never written here.

import { copyFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const siteDir = path.join(repoRoot, "site");
const builtHtml = path.join(siteDir, "index.docs.html");
const indexHtml = path.join(siteDir, "index.html");
const notFoundHtml = path.join(siteDir, "404.html");

async function exists(target) {
  try {
    const { stat } = await import("node:fs/promises");
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(builtHtml))) {
    console.error(
      `prepare-pages: expected ${path.relative(repoRoot, builtHtml)} to exist after the Vite build. ` +
        `Run the build (e.g. \`bun run build:docs\`) before this script.`,
    );
    process.exit(1);
  }

  await rename(builtHtml, indexHtml);
  await copyFile(indexHtml, notFoundHtml);

  console.log(
    `prepare-pages: wrote ${path.relative(repoRoot, indexHtml)} and ${path.relative(
      repoRoot,
      notFoundHtml,
    )}`,
  );
}

main().catch((err) => {
  console.error("prepare-pages: failed:", err);
  process.exit(1);
});
