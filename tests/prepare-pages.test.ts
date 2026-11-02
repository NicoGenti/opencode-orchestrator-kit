import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Integration tests for scripts/prepare-pages.mjs.
 *
 * Per its own header comment, this script:
 *   1. Renames `site/index.docs.html` (Vite's build output for `index.docs.html`,
 *      see vite.docs.config.ts's `outDir: "site"` / `rollupOptions.input`) to
 *      `site/index.html` so GitHub Pages serves the landing page.
 *   2. Writes a distinct noindex `site/404.html` that links home. The site has
 *      no client-side router, so the 404 page is not a second copy of home.
 *   3. Writes `site/sitemap.xml` with today's UTC lastmod.
 *   4. Exits non-zero with a clear error if `site/index.docs.html` is missing
 *      (i.e. the Vite build hasn't run yet).
 *
 * Rather than re-deriving these internals, this suite copies the real script
 * into an isolated temp "repo" sandbox and runs it as a subprocess against a
 * fabricated site/ directory, asserting on the resulting filesystem state and
 * process output — a black-box contract test, not a reimplementation.
 */

const REAL_SCRIPT = join(import.meta.dir, "..", "scripts", "prepare-pages.mjs");
const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepare-pages-"));
  sandboxes.push(dir);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(REAL_SCRIPT, join(dir, "scripts", "prepare-pages.mjs"));
  return dir;
}

function runScript(sandbox: string) {
  return spawnSync("node", [join(sandbox, "scripts", "prepare-pages.mjs")], {
    cwd: sandbox,
    encoding: "utf-8",
  });
}

afterEach(() => {
  while (sandboxes.length) {
    rmSync(sandboxes.pop()!, { recursive: true, force: true });
  }
});

describe("scripts/prepare-pages.mjs — happy path", () => {
  test("renames site/index.docs.html to site/index.html and writes a distinct noindex 404 plus sitemap", () => {
    const sandbox = makeSandbox();
    mkdirSync(join(sandbox, "site"), { recursive: true });
    writeFileSync(
      join(sandbox, "site", "index.docs.html"),
      "<html>built docs</html>",
    );

    const result = runScript(sandbox);

    expect(result.status).toBe(0);
    expect(existsSync(join(sandbox, "site", "index.docs.html"))).toBe(false);
    expect(existsSync(join(sandbox, "site", "index.html"))).toBe(true);
    expect(existsSync(join(sandbox, "site", "404.html"))).toBe(true);
    expect(existsSync(join(sandbox, "site", "sitemap.xml"))).toBe(true);

    const indexContent = readFileSync(
      join(sandbox, "site", "index.html"),
      "utf-8",
    );
    const notFoundContent = readFileSync(
      join(sandbox, "site", "404.html"),
      "utf-8",
    );
    const sitemap = readFileSync(join(sandbox, "site", "sitemap.xml"), "utf-8");
    const today = new Date().toISOString().slice(0, 10);
    expect(indexContent).toBe("<html>built docs</html>");
    expect(notFoundContent).not.toBe(indexContent);
    expect(notFoundContent).toContain('name="robots" content="noindex"');
    expect(notFoundContent).toContain(
      "https://nicogenti.github.io/opencode-orchestrator-kit/",
    );
    expect(sitemap).toContain(`<lastmod>${today}</lastmod>`);
    expect(sitemap).toContain(
      "<loc>https://nicogenti.github.io/opencode-orchestrator-kit/</loc>",
    );
  });

  test("prints the written file paths on success", () => {
    const sandbox = makeSandbox();
    mkdirSync(join(sandbox, "site"), { recursive: true });
    writeFileSync(join(sandbox, "site", "index.docs.html"), "<html>ok</html>");

    const result = runScript(sandbox);

    expect(result.stdout).toContain("prepare-pages:");
    expect(result.stdout).toContain("index.html");
    expect(result.stdout).toContain("404.html");
    expect(result.stdout).toContain("sitemap.xml");
  });
});

describe("scripts/prepare-pages.mjs — error path", () => {
  test("exits non-zero with a clear error when site/index.docs.html is missing", () => {
    const sandbox = makeSandbox();
    mkdirSync(join(sandbox, "site"), { recursive: true });

    const result = runScript(sandbox);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected");
    expect(result.stderr.toLowerCase()).toContain("vite build");
    expect(existsSync(join(sandbox, "site", "index.html"))).toBe(false);
    expect(existsSync(join(sandbox, "site", "404.html"))).toBe(false);
  });

  test("exits non-zero when the site/ directory itself does not exist", () => {
    const sandbox = makeSandbox();

    const result = runScript(sandbox);

    expect(result.status).not.toBe(0);
  });
});
