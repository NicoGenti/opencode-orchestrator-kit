import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contratto di `agents/plan-writer.md` e del suo aggancio al flusso dell'orchestratore.
 *
 * Perche' esiste: il board dei piani ha un solo owner (`plan-writer`) e il tool deterministico
 * e' l'unico modo autorizzato di muoverlo. Questi test legano tre cose che possono divergere in
 * silenzio: la definizione dell'agente, le due tabelle di routing (AGENTS.md e
 * agents/orchestrator.md) e la documentazione del board (plan/README.md).
 *
 * Non duplica `tests/routing-consistency.test.ts` (che verifica l'insieme dei runtime id) ne'
 * `tests/agent-schema.test.ts` (frontmatter): qui si verifica il *contenuto* del contratto.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const AGENT_PATH = join(REPO_ROOT, "agents", "plan-writer.md");
const ORCHESTRATOR_PATH = join(REPO_ROOT, "agents", "orchestrator.md");
const AGENTS_MD_PATH = join(REPO_ROOT, "AGENTS.md");
const PLAN_README_PATH = join(REPO_ROOT, "plan", "README.md");

const COLUMNS = ["draft", "in-progress", "qa", "complete"];
const STATES = ["create", "move", "check", "adopt"];

function read(path: string): string {
  if (!existsSync(path)) throw new Error(`file mancante: ${path}`);
  return readFileSync(path, "utf-8");
}

/** Ritorna il corpo del file agente (tutto cio' che segue il blocco frontmatter). */
function body(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!m) throw new Error("frontmatter mancante o non delimitato");
  return raw.slice(m[0].length);
}

/** Sezione `## <titolo>` di un markdown, fino al successivo `## `. */
function section(markdown: string, heading: string): string {
  const idx = markdown.indexOf(`## ${heading}`);
  if (idx === -1) return "";
  const rest = markdown.slice(idx + heading.length + 3);
  const next = rest.search(/\r?\n##\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("plan-writer — definizione dell'agente", () => {
  test("agents/plan-writer.md esiste ed e' un subagent con tier risolvibile", () => {
    const raw = read(AGENT_PATH);
    expect(raw.startsWith("---")).toBe(true);
    expect(raw).toMatch(/^mode:\s*subagent\s*$/m);
    expect(raw).toMatch(/^model:\s*\{\{TIER_[A-Z]+\}\}\s*$/m);
    expect(raw).toMatch(/^description:/m);
    expect(raw).toMatch(/^permission:/m);
  });

  test("dichiara i permessi di scrittura limitati alla board e l'esecuzione del tool", () => {
    const raw = read(AGENT_PATH);
    expect(raw).toMatch(/^ {2}write:\s*$/m);
    expect(raw).toContain("plan/**/*.md: allow");
    expect(raw).toMatch(/^\s+"\*": deny$/m);
  });

  test("il corpo nomina il tool, le quattro colonne e i quattro stati", () => {
    const b = body(read(AGENT_PATH));
    expect(b).toContain("scripts/plan-board.py");
    expect(b).toContain(".opencode/scripts/plan-board.py");
    for (const col of COLUMNS) expect(b).toContain(`${col}/`);
    for (const state of STATES) expect(b).toContain(`**${state}**`);
  });

  test("dichiara l'unicita' dell'owner e il divieto di spostamenti a mano", () => {
    const b = body(read(AGENT_PATH));
    expect(b).toContain("only agent authorized to create, move or normalise a plan file");
    expect(b).toContain("Never hand-craft a move");
    expect(b).toContain("plan-board-standing-v1");
  });

  test("elenca i codici di rifiuto che il tool puo' restituire", () => {
    const b = body(read(AGENT_PATH));
    for (const code of [
      "legacy-requires-adopt",
      "already-has-frontmatter",
      "status-folder-mismatch",
      "plan-ambiguous",
      "body-incomplete",
      "already-in-column",
    ]) {
      expect(b).toContain(code);
    }
  });

  test("fissa il contratto di flusso: quattro momenti e blocco su board rossa", () => {
    const b = body(read(AGENT_PATH));
    expect(b).toContain("## Flow contract with the orchestrator");
    expect(b).toMatch(/do NOT move anything/);
    expect(b).toContain("`complete`");
    expect(b).toMatch(/never on your own initiative/);
  });
});

describe("plan-writer — aggancio alle due tabelle di routing", () => {
  test("agents/orchestrator.md ha una riga di routing per plan-writer", () => {
    const orch = read(ORCHESTRATOR_PATH);
    expect(orch).toMatch(/^\|\s*`plan-writer`\s*\|/m);
  });

  test("agents/orchestrator.md dichiara l'unicita' dell'owner del board", () => {
    const orch = read(ORCHESTRATOR_PATH);
    expect(orch).toContain("### Plan Board Ownership (single writer)");
    expect(orch).toContain("`plan-writer`");
  });

  test("AGENTS.md elenca plan-writer nel roster", () => {
    const agentsMd = read(AGENTS_MD_PATH);
    const roster = section(agentsMd, "Runtime Subagent Roster");
    expect(roster).toMatch(/^\|\s*`plan-writer`\s*\|/m);
  });

  test("AGENTS.md porta la sezione di contratto del board", () => {
    const agentsMd = read(AGENTS_MD_PATH);
    expect(agentsMd).toContain("## Plan Board Lifecycle & Owner Contract");
    expect(agentsMd).toContain("plan-board-standing-v1");
  });
});

describe("plan-writer — documentazione del board", () => {
  test("plan/README.md documenta tool, quattro colonne e regola dell'id", () => {
    const readme = read(PLAN_README_PATH);
    expect(readme).toContain("plan-board.py");
    for (const col of COLUMNS) expect(readme).toContain(col);
    expect(readme).toContain("plan/complete/");
    expect(readme).toMatch(/leading segment/i);
  });
});

describe("plan-writer — negativo (la verifica ha denti)", () => {
  test("un corpo senza il tool e senza gli stati non soddisfa le asserzioni", () => {
    const fake = "# Agent: altro\n\n## Purpose\n\nSposta i piani a mano con `mv`.\n";
    expect(fake).not.toContain("scripts/plan-board.py");
    for (const state of STATES) expect(fake.includes(`**${state}**`)).toBe(false);
  });

  test("un orchestrator senza la riga di routing non soddisfa l'asserzione", () => {
    const fake = "| `librarian` | Remote documentation lookups. |\n";
    expect(/^\|\s*`plan-writer`\s*\|/m.test(fake)).toBe(false);
  });
});
