import { describe, expect, test } from "bun:test";

import { parseFrontmatterScalar } from "../plugin/src/frontmatter-map.ts";

const FM_FOLDED = [
  "description: >-",
  "  High-reasoning planning agent. Consumes the explorer's findings,",
  "  produces a phased development plan.",
  "mode: subagent",
  "model: {{TIER_REASONING}}",
].join("\n");

describe("parseFrontmatterScalar", () => {
  test("un blocco folded `>-` non viene restituito come marcatore", () => {
    expect(parseFrontmatterScalar(FM_FOLDED, "description")).toBe(
      "High-reasoning planning agent. Consumes the explorer's findings, produces a phased development plan.",
    );
  });

  test("uno scalare inline resta invariato", () => {
    expect(
      parseFrontmatterScalar("description: Fast explorer.", "description"),
    ).toBe("Fast explorer.");
  });

  test("una chiave assente ritorna undefined", () => {
    expect(parseFrontmatterScalar(FM_FOLDED, "owner")).toBeUndefined();
  });
});
