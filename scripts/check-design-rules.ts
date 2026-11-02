/**
 * scripts/check-design-rules.ts — diff DR-UI rules against web-kit on GitHub.
 *
 *   bun run check-design-rules
 *
 * Fetches `docs/design-rules-ui.md` from `NicoGenti/web-kit` branch `main` and
 * compares its DR-UI rule blocks with the copy under "## UI & Delivery" in
 * `templates/design-rules.md`. Exit 0 when they match, exit 1 on drift or when
 * the fetch fails.
 *
 * The network call lives only in `main`. Unit tests import `extractDesignRules`
 * and `diffDesignRules` and never fetch. This script is not part of `bun test`
 * or `.github/workflows/test.yml`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Raw file on web-kit `main`. The blob URL is in templates/design-rules.md. */
export const UPSTREAM_RAW_URL =
  "https://raw.githubusercontent.com/NicoGenti/web-kit/main/docs/design-rules-ui.md";

const LOCAL_RELATIVE = "templates/design-rules.md";

export interface DesignRule {
  /** `DR-UI-1` … */
  id: string;
  number: number;
  /** Rule block, trimmed, HTML comments removed, trailing spaces stripped. */
  text: string;
}

export interface RuleDrift {
  message: string;
  local?: string;
  upstream?: string;
}

const RULE_ID = /DR-UI-(\d+)/;

/** Drop HTML comments so a header that names a rule id is not itself a rule. */
function visibleMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * The rules section: ordered blocks whose text contains `DR-UI-<digits>`.
 * A block runs until the next rule or until a heading that is not the rule
 * line. Surrounding template prose is not part of the section.
 */
export function extractDesignRules(markdown: string): DesignRule[] {
  const lines = visibleMarkdown(markdown).split("\n");
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (RULE_ID.test(lines[index] ?? "")) starts.push(index);
  }

  const rules: DesignRule[] = [];
  for (let slot = 0; slot < starts.length; slot++) {
    const start = starts[slot] ?? 0;
    let end =
      slot + 1 < starts.length
        ? (starts[slot + 1] ?? lines.length)
        : lines.length;
    for (let index = start + 1; index < end; index++) {
      const line = lines[index] ?? "";
      if (/^#{1,6}\s/.test(line) && !RULE_ID.test(line)) {
        end = index;
        break;
      }
    }
    const text = lines
      .slice(start, end)
      .join("\n")
      .replace(/[ \t]+$/gm, "")
      .trim();
    const match = RULE_ID.exec(text);
    if (!match?.[1]) continue;
    const number = Number(match[1]);
    rules.push({ id: `DR-UI-${number}`, number, text });
  }
  return rules;
}

/** Line-oriented problems. Empty means the two rules sections match. */
export function diffDesignRules(
  local: readonly DesignRule[],
  upstream: readonly DesignRule[],
): RuleDrift[] {
  const problems: RuleDrift[] = [];
  if (local.length === 0) {
    problems.push({ message: "local rules section has no DR-UI rules" });
  }
  if (upstream.length === 0) {
    problems.push({ message: "upstream rules section has no DR-UI rules" });
  }
  const count = Math.max(local.length, upstream.length);
  for (let index = 0; index < count; index++) {
    const left = local[index];
    const right = upstream[index];
    if (!left && right) {
      problems.push({
        message: `upstream has extra ${right.id}`,
        upstream: right.text,
      });
      continue;
    }
    if (left && !right) {
      problems.push({
        message: `local has extra ${left.id}`,
        local: left.text,
      });
      continue;
    }
    if (!left || !right) continue;
    if (left.id !== right.id || left.text !== right.text) {
      problems.push({
        message: `rule ${index + 1} differs (local ${left.id}, upstream ${right.id})`,
        local: left.text,
        upstream: right.text,
      });
    }
  }
  return problems;
}

export async function fetchUpstream(
  url: string = UPSTREAM_RAW_URL,
): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  }
  return response.text();
}

function printDrift(drift: RuleDrift): void {
  console.error(`- ${drift.message}`);
  if (drift.local !== undefined) {
    console.error("--- local");
    console.error(drift.local);
  }
  if (drift.upstream !== undefined) {
    console.error("--- upstream");
    console.error(drift.upstream);
  }
}

async function main(): Promise<void> {
  const root = join(import.meta.dir, "..");
  const localPath = join(root, LOCAL_RELATIVE);
  const local = readFileSync(localPath, "utf-8");
  let upstream: string;
  try {
    upstream = await fetchUpstream();
  } catch (error) {
    console.error(
      `Could not fetch web-kit design rules (${UPSTREAM_RAW_URL}): ${(error as Error).message}`,
    );
    process.exit(1);
  }
  const problems = diffDesignRules(
    extractDesignRules(local),
    extractDesignRules(upstream),
  );
  if (problems.length === 0) {
    const count = extractDesignRules(local).length;
    console.log(
      `DR-UI rules match ${UPSTREAM_RAW_URL} (${count} rule${count === 1 ? "" : "s"}).`,
    );
    return;
  }
  console.error(
    `DR-UI rules in ${LOCAL_RELATIVE} drifted from ${UPSTREAM_RAW_URL}:`,
  );
  for (const problem of problems) printDrift(problem);
  process.exit(1);
}

if (import.meta.main) {
  void main();
}
