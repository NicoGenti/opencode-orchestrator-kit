#!/usr/bin/env node
// Prepare the generated `site/` directory for GitHub Pages.
//
// 1. Rename `site/index.docs.html` (Vite's output for `index.docs.html`) to
//    `site/index.html` so GitHub Pages serves the landing page.
// 2. Write a distinct `site/404.html` (noindex, link home). This site has no
//    client-side router, so the 404 page is not a second copy of the homepage.
// 3. Write `site/sitemap.xml` with today's lastmod so the published date is
//    not a hand-edited constant.
//
// This script intentionally uses only Node's built-in modules so it works
// identically on Windows, macOS, and Linux. Destination `docs/` (Markdown
// documentation) is never written here.

import { rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const siteDir = path.join(repoRoot, "site");
const builtHtml = path.join(siteDir, "index.docs.html");
const indexHtml = path.join(siteDir, "index.html");
const notFoundHtml = path.join(siteDir, "404.html");
const sitemapXml = path.join(siteDir, "sitemap.xml");
const siteUrl = "https://nicogenti.github.io/opencode-orchestrator-kit/";

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Page not found — OpenCode Orchestrator Kit</title>
    <meta name="robots" content="noindex" />
    <meta
      name="description"
      content="This URL is not part of the OpenCode Orchestrator Kit site."
    />
    <link rel="canonical" href="${siteUrl}" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0a0a0f;
        color: #fff;
        font-family: Inter, system-ui, sans-serif;
      }
      main {
        max-width: 36rem;
        padding: 2rem;
      }
      a {
        color: #67e8f9;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Page not found</h1>
      <p>That URL is not part of the OpenCode Orchestrator Kit site.</p>
      <p><a href="${siteUrl}">Back to the landing page</a></p>
    </main>
  </body>
</html>
`;

function sitemap(lastmod) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

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
  await writeFile(notFoundHtml, NOT_FOUND_HTML);
  const lastmod = new Date().toISOString().slice(0, 10);
  await writeFile(sitemapXml, sitemap(lastmod));

  console.log(
    `prepare-pages: wrote ${path.relative(repoRoot, indexHtml)}, ${path.relative(
      repoRoot,
      notFoundHtml,
    )} (noindex), and ${path.relative(repoRoot, sitemapXml)}`,
  );
}

main().catch((err) => {
  console.error("prepare-pages: failed:", err);
  process.exit(1);
});
