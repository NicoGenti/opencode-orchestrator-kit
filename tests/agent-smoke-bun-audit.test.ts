import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

/**
 * Contratto CI per l'issue #19: lo script `bun:audit` deve eseguire l'intera
 * suite di test seguito dal lint, in modo che CI e workflow agent eseguano
 * `bun run bun:audit` come controllo di fumo singolo.
 */
describe("bun:audit script", () => {
  test("package.json dichiara bun:audit = bun test && bun run lint", () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    );
    expect(pkg.scripts["bun:audit"]).toBe("bun test && bun run lint");
  });
});

/**
 * Contratto CI per l'issue #19: `.opencode/ci-check.md` è la checklist minima
 * che lo sviluppatore (agente o umano) percorre prima di aprire una PR.
 * Deve esistere, avere un titolo H1 e voci di checklist non vuote.
 */
describe(".opencode/ci-check.md", () => {
  test("esiste con almeno 3 righe non vuote", () => {
    const path = join(REPO_ROOT, ".opencode/ci-check.md");
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  test("contiene un titolo H1 e voci di checklist `- [ ]`", () => {
    const raw = readFileSync(join(REPO_ROOT, ".opencode/ci-check.md"), "utf8");
    expect(raw).toMatch(/^#\s+\S/);
    expect(raw).toContain("- [ ]");
  });
});
