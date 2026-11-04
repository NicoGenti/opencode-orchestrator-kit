/**
 * `AGENTS.md` è caricato come istruzioni di progetto a ogni richiesta, per ogni
 * agente: è la voce più cara del kit. Il contratto dell'assembler (prefisso
 * stabile, baseline di confine, ordine delle chiavi del frontmatter) è una
 * regola per chi mantiene il repository, non un'istruzione per il modello, e
 * vive in `CONTRIBUTING.md`; qui resta solo il puntatore.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const read = (rel: string): string =>
  readFileSync(join(REPO_ROOT, rel), "utf-8")
    .split(String.fromCharCode(13))
    .join("");

const AGENTS = read("AGENTS.md");
const CONTRIBUTING = read("CONTRIBUTING.md");

describe("agents instructions budget", () => {
  test("AGENTS.md stays within the 12,000-char always-on budget", () => {
    expect(AGENTS.length).toBeLessThanOrEqual(12_000);
  });

  test("the assembler contract is not shipped in the always-on prompt", () => {
    expect(AGENTS).not.toContain("### Deterministic Enumeration Order");
    expect(AGENTS).not.toContain("### Boundary Baseline");
    expect(CONTRIBUTING).toContain("## Prompt-Assembly Stable-Prefix Contract");
    expect(CONTRIBUTING).toContain("### Deterministic Enumeration Order");
  });

  test("AGENTS.md still points contributors at the contract", () => {
    expect(AGENTS).toContain("## Repository contracts");
    expect(AGENTS).toContain("CONTRIBUTING.md");
  });
});
