import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import { applySiteTokens } from "../src/site/html-tokens";

/**
 * Fill the static HTML during `vite build`:
 * - softwareVersion and dateModified come from plugin/package.json and the
 *   build clock, so the head stays aligned with the next release.
 * - The landing page is rendered with react-dom/server so crawlers see the
 *   content. The client hydrates that markup.
 *
 * The child Vite server is a dev SSR loader only. LANDING_SSR keeps it from
 * loading this plugin again.
 */
export function landingHtmlPlugin() {
  return {
    name: "landing-html",
    apply: "build" as const,
    transformIndexHtml: {
      order: "post" as const,
      async handler(html: string) {
        const pkg = JSON.parse(
          readFileSync(
            fileURLToPath(new URL("../plugin/package.json", import.meta.url)),
            "utf8",
          ),
        ) as { version: string };
        const dateModified = new Date().toISOString().slice(0, 10);
        const withTokens = applySiteTokens(html, pkg.version, dateModified);
        if (
          withTokens.includes("__KIT_VERSION__") ||
          withTokens.includes("__DATE_MODIFIED__")
        ) {
          throw new Error("site HTML tokens were not replaced");
        }
        const rendered = await prerenderRoot(withTokens);
        console.log(
          `landing-html: prerendered landing page for v${pkg.version} (${dateModified})`,
        );
        return rendered;
      },
    },
  };
}

async function prerenderRoot(html: string): Promise<string> {
  process.env.LANDING_SSR = "1";
  const server = await createServer({
    configFile: fileURLToPath(
      new URL("../vite.docs.config.ts", import.meta.url),
    ),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
  });
  try {
    const entry = fileURLToPath(
      new URL("../docs-src/entry-server.tsx", import.meta.url),
    );
    const mod = (await server.ssrLoadModule(entry)) as {
      render: () => string;
    };
    const rendered = mod.render();
    if (!rendered.includes("plan-writer") || !rendered.includes("Quickstart")) {
      throw new Error("landing prerender did not include the page content");
    }
    const marker = '<div id="root"></div>';
    if (!html.includes(marker)) {
      throw new Error('landing HTML is missing <div id="root"></div>');
    }
    return html.replace(marker, `<div id="root">${rendered}</div>`);
  } finally {
    await server.close();
    delete process.env.LANDING_SSR;
  }
}
