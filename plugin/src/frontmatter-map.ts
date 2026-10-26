/**
 * Minimal reader for the two nested frontmatter keys the kit uses (`tools`,
 * `permission`). Supported: inline JSON maps (`{"read":true}`) and block maps
 * with space indentation, quoted keys, scalar leaves and one nesting level.
 * It is deliberately NOT a YAML parser: arrays, anchors, comments and
 * multi-line scalars are rejected loudly instead of guessed.
 *
 * Why: OpenCode 2 has no `tools` field and expects `permissions` as an ordered
 * rule list, so the V1 frontmatter has to be translated (see permissions.ts).
 */

export type FrontmatterScalar = string | boolean;
export interface FrontmatterMap {
  [key: string]: FrontmatterScalar | FrontmatterMap;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** `true`/`false` text becomes a boolean; everything else is an unquoted string. */
function coerceScalar(value: string): FrontmatterScalar {
  if (value === "true") return true;
  if (value === "false") return false;
  return unquote(value);
}

/** Ensure an inline-JSON map only carries string/boolean leaves. */
function assertMap(node: unknown, source: string): asserts node is FrontmatterMap {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new Error(`${source}: expected a map`);
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "boolean") continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      assertMap(value, `${source}.${key}`);
      continue;
    }
    throw new Error(`${source}.${key}: unsupported value (expected string, boolean or map)`);
  }
}

/** Parse an indented block map (`key: value` / `key:` + nested block). */
function parseBlockMap(text: string, source: string): FrontmatterMap {
  const rows: Array<{ indent: number; key: string; value?: FrontmatterScalar }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim() === "") continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const body = rawLine.trim();
    if (body.endsWith(":")) {
      rows.push({ indent, key: unquote(body.slice(0, -1)) });
      continue;
    }
    // The value separator is ':' followed by whitespace, so keys that contain
    // ':' themselves ('pnpm test:*: allow') stay intact.
    const match = /^(.+?):\s+(.+)$/.exec(body);
    if (!match) {
      throw new Error(`${source}: cannot parse '${body}' (expected 'key: value')`);
    }
    rows.push({ indent, key: unquote(match[1]), value: coerceScalar(match[2]) });
  }

  const root: FrontmatterMap = {};
  const stack: Array<{ indent: number; node: FrontmatterMap }> = [{ indent: -1, node: root }];
  for (const row of rows) {
    while (stack.length > 0 && row.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = (stack[stack.length - 1] ?? { indent: -1, node: root }).node;
    if (row.value === undefined) {
      const child: FrontmatterMap = {};
      parent[row.key] = child;
      stack.push({ indent: row.indent, node: child });
    } else {
      parent[row.key] = row.value;
    }
  }
  return root;
}

/**
 * Read one top-level key of a frontmatter block (the text between the `---`
 * markers) as a map. Returns undefined when the key is absent.
 */
export function parseFrontmatterMap(
  frontmatter: string,
  key: string,
): FrontmatterMap | undefined {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (start === -1) return undefined;

  const inline = lines[start].slice(key.length + 1).trim();
  if (inline !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(inline);
    } catch (error) {
      throw new Error(`${key}: inline value is not JSON (${(error as Error).message})`);
    }
    assertMap(parsed, key);
    return parsed;
  }

  const blockLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    if (!line.startsWith(" ")) break;
    blockLines.push(line);
  }
  return parseBlockMap(blockLines.join("\n"), key);
}
