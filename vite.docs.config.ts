import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Standalone Vite config for the imported static landing page.
// Output `site/` is the GitHub Pages artifact; destination `docs/` (Markdown)
// is never written here.
export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
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
