import { readFileSync } from "node:fs";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { parseLatestRelease } from "./src/site/changelog-model";
import { landingHtmlPlugin } from "./scripts/landing-html";

const isPrerenderChild = process.env.LANDING_SSR === "1";

const VIRTUAL_ID = "virtual:latest-release";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

// Standalone Vite config for the imported static landing page.
// Output `site/` is the GitHub Pages artifact; destination `docs/` (Markdown)
// is never written here.
export default defineConfig({
  plugins: [
    // Resolve the released changelog section at build time so the client
    // bundle carries only the parsed release, never the whole CHANGELOG.md.
    {
      name: "latest-release",
      resolveId(id) {
        return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
      },
      load(id) {
        if (id !== RESOLVED_ID) return undefined;
        const changelog = readFileSync(
          new URL("./CHANGELOG.md", import.meta.url),
          "utf8",
        );
        const version = JSON.parse(
          readFileSync(
            new URL("./plugin/package.json", import.meta.url),
            "utf8",
          ),
        ).version;
        const release = parseLatestRelease(changelog, version);
        return `export default ${JSON.stringify(release)};`;
      },
    },
    react(),
    tailwindcss(),
    tsconfigPaths(),
    ...(isPrerenderChild ? [] : [landingHtmlPlugin()]),
  ],
  base: "/opencode-orchestrator-kit/",
  build: {
    outDir: "site",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.docs.html",
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
