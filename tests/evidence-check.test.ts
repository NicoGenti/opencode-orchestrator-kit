import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  checkEvidenceClaims,
  extractCitations,
  parseClaimsManifest,
  splitEvidence,
} from "../scripts/evidence-check.ts";
import type { ContentReader } from "../scripts/evidence-check.ts";
import {
  CLAIM_FIELDS,
  CLAIM_OPTIONAL_FIELDS,
  EVIDENCE_REPORT_FIELDS,
  validateEvidenceReport,
} from "../scripts/lib/check-common.ts";
import type {
  EvidenceClaim,
  EvidenceReport,
} from "../scripts/lib/check-common.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const CLI = join(REPO_ROOT, "scripts", "evidence-check.ts");

const TOKEN_PATH = "src/auth/token.ts";
const TOKEN_SOURCE = [
  "// Token helpers: deterministic and side-effect free.",
  "export function issueToken(): string {",
  '  return "ISSUED";',
  "}",
  "",
  "export function verifyToken(token: string): boolean {",
  '  return token === "VERIFIED";',
  "}",
].join("\n");

function literalReader(files: Record<string, string>): ContentReader {
  return (relPath: string) => {
    const text = files[relPath];
    return text === undefined
      ? { exists: false, text: null }
      : { exists: true, text };
  };
}

const READER = literalReader({ [TOKEN_PATH]: TOKEN_SOURCE });

function classify(claim: EvidenceClaim): EvidenceReport {
  return checkEvidenceClaims([claim], READER);
}

function tempWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "evidence-check-"));
  mkdirSync(join(root, "src", "auth"), { recursive: true });
  writeFileSync(join(root, "src", "auth", "token.ts"), `${TOKEN_SOURCE}\n`);
  return root;
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("splitEvidence", () => {
  test("splits at the last colon and rejects a non-numeric line", () => {
    expect(splitEvidence("src/a.ts:12")).toEqual({
      path: "src/a.ts",
      line: 12,
    });
    expect(splitEvidence("src/a.ts")).toBeNull();
    expect(splitEvidence("src/a.ts:twelve")).toBeNull();
    expect(splitEvidence(":5")).toBeNull();
  });
});

describe("verified claims", () => {
  test("a marker on the cited line verifies the claim and passes", () => {
    const report = classify({
      claim: "issueToken exists",
      evidence: `${TOKEN_PATH}:2`,
      marker: "issueToken",
    });

    expect(report.verdict).toBe("pass");
    expect(report.blocking_issues).toEqual([]);
    expect(report.claims).toEqual([
      {
        claim: "issueToken exists",
        status: "verified",
        evidence: `${TOKEN_PATH}:2`,
      },
    ]);
    expect(Object.keys(report)).toEqual([...EVIDENCE_REPORT_FIELDS]);
    expect(Object.keys(report.claims[0])).toEqual([...CLAIM_FIELDS]);

    const allowed = new Set<string>([
      ...CLAIM_FIELDS,
      ...CLAIM_OPTIONAL_FIELDS,
    ]);
    for (const key of Object.keys(report.claims[0])) {
      expect(allowed.has(key)).toBe(true);
    }
    expect(validateEvidenceReport(report).valid).toBe(true);
  });
});

describe("unverified claims", () => {
  const CASES: Array<[string, EvidenceClaim]> = [
    ["missing-evidence", { claim: "a claim without evidence" }],
    ["missing-evidence", { claim: "a null evidence claim", evidence: null }],
    [
      "file-not-found",
      { claim: "a missing file claim", evidence: "src/auth/missing.ts:1" },
    ],
    [
      "line-out-of-range",
      { claim: "a far line claim", evidence: `${TOKEN_PATH}:999` },
    ],
    [
      "marker-not-found",
      {
        claim: "an absent marker claim",
        evidence: `${TOKEN_PATH}:2`,
        marker: "NOT_A_MARKER",
      },
    ],
    [
      "path-traversal",
      { claim: "a traversing claim", evidence: "../outside.ts:1" },
    ],
    [
      "absolute-path",
      { claim: "a POSIX absolute claim", evidence: "/usr/local/lib/a.ts:1" },
    ],
    [
      "absolute-path",
      { claim: "a Windows absolute claim", evidence: "C:\\Windows\\win.ini:1" },
    ],
  ];

  test("every unverified case is blocking and carries its code", () => {
    for (const [code, claim] of CASES) {
      const report = classify(claim);

      expect(report.verdict).toBe("fail");
      expect(report.claims).toHaveLength(1);
      expect(report.claims[0].status).toBe("unverified");
      expect(report.claims[0].note).toBe(code);
      expect(report.blocking_issues).toHaveLength(1);
      expect(report.blocking_issues[0]).toContain(code);
      expect(report.blocking_issues[0]).toContain(claim.claim);
      expect(validateEvidenceReport(report).valid).toBe(true);
    }
  });

  test("a missing file reports the cited path", () => {
    const report = classify({
      claim: "a missing file claim",
      evidence: "src/auth/missing.ts:1",
    });
    expect(report.blocking_issues[0]).toContain("src/auth/missing.ts");
    expect(report.blocking_issues[0]).toContain(
      "route the task back to explorer",
    );
  });
});

describe("absolute evidence paths", () => {
  test("an absolute path is classified without ever calling the reader", () => {
    const seen: string[] = [];
    const reader: ContentReader = (relPath: string) => {
      seen.push(relPath);
      return { exists: true, text: TOKEN_SOURCE };
    };

    const report = checkEvidenceClaims(
      [
        {
          claim: "a marker that would match outside the root",
          evidence: `${join(tmpdir(), "outside-token.ts")}:2`,
          marker: "issueToken",
        },
      ],
      reader,
    );

    expect(seen).toEqual([]);
    expect(report.verdict).toBe("fail");
    expect(report.claims[0].status).toBe("unverified");
    expect(report.claims[0].note).toBe("absolute-path");
    expect(report.blocking_issues[0]).toContain("absolute-path");
    expect(validateEvidenceReport(report).valid).toBe(true);
  });
});

describe("contradicted claims", () => {
  test("a counterMarker found in the cited file contradicts the claim", () => {
    const report = classify({
      claim: "tokens are never logged",
      evidence: `${TOKEN_PATH}:2`,
      marker: "issueToken",
      counterMarker: "VERIFIED",
    });

    expect(report.verdict).toBe("fail");
    expect(report.claims).toEqual([
      {
        claim: "tokens are never logged",
        status: "contradicted",
        evidence: `${TOKEN_PATH}:2`,
        note: "counter-marker-present",
      },
    ]);
    expect(report.blocking_issues[0]).toContain("counter-marker-present");
    expect(validateEvidenceReport(report).valid).toBe(true);
  });
});

describe("citation resolution", () => {
  test("a marker later in the file resolves with citation-imprecise", () => {
    const report = classify({
      claim: "verifyToken exists",
      evidence: `${TOKEN_PATH}:3`,
      marker: "verifyToken",
    });

    expect(report.verdict).toBe("pass");
    expect(report.claims).toEqual([
      {
        claim: "verifyToken exists",
        status: "verified",
        evidence: `${TOKEN_PATH}:3`,
        resolved_evidence: `${TOKEN_PATH}:6`,
        note: "citation-imprecise",
      },
    ]);
    expect(report.blocking_issues).toEqual([]);
  });

  test("no marker and a resolvable line is location-only", () => {
    const report = classify({
      claim: "the cited line resolves",
      evidence: `${TOKEN_PATH}:3`,
    });

    expect(report.verdict).toBe("pass");
    expect(report.claims).toEqual([
      {
        claim: "the cited line resolves",
        status: "verified",
        evidence: `${TOKEN_PATH}:3`,
        note: "location-only",
      },
    ]);
  });
});

describe("strict security claims", () => {
  test("a marker one line off fails with strict-evidence-required", () => {
    const report = classify({
      claim: "tokens are verified",
      evidence: `${TOKEN_PATH}:3`,
      marker: "verifyToken",
      securitySensitive: true,
    });

    expect(report.verdict).toBe("fail");
    expect(report.claims[0].status).toBe("unverified");
    expect(report.claims[0].note).toBe("strict-evidence-required");
    expect(report.claims[0].resolved_evidence).toBe(`${TOKEN_PATH}:6`);
    expect(report.blocking_issues[0]).toContain("strict-evidence-required");
  });

  test("the exact cited line still verifies a security claim", () => {
    const report = classify({
      claim: "verifyToken exists",
      evidence: `${TOKEN_PATH}:6`,
      marker: "verifyToken",
      securitySensitive: true,
    });

    expect(report.verdict).toBe("pass");
    expect(report.claims[0].status).toBe("verified");
    expect(report.blocking_issues).toEqual([]);
  });

  test("a security claim without a marker is never location-only", () => {
    const report = classify({
      claim: "tokens are hashed",
      evidence: `${TOKEN_PATH}:7`,
      securitySensitive: true,
    });

    expect(report.verdict).toBe("fail");
    expect(report.claims[0].note).toBe("strict-evidence-required");
  });
});

describe("doc mode", () => {
  const FENCED_MARKDOWN = [
    "# Plan",
    "",
    "The helper lives in `src/auth/token.ts:2`.",
    "",
    "```text",
    "src/auth/missing.ts:1",
    "```",
  ].join("\n");

  test("citations inside fenced blocks are not scanned", () => {
    const citations = extractCitations(FENCED_MARKDOWN);
    expect(citations).toEqual([
      {
        claim: "The helper lives in `src/auth/token.ts:2`.",
        evidence: `${TOKEN_PATH}:2`,
      },
    ]);

    const report = checkEvidenceClaims(citations, READER);
    expect(report.verdict).toBe("pass");
    expect(report.claims[0].note).toBe("location-only");
  });

  test("one unresolvable citation fails the document", () => {
    const markdown = [
      "# Plan",
      "",
      "- Verified: `src/auth/token.ts:2`",
      "- Missing: `src/auth/missing.ts:1`",
    ].join("\n");
    const report = checkEvidenceClaims(extractCitations(markdown), READER);

    expect(report.verdict).toBe("fail");
    expect(report.claims).toHaveLength(2);
    expect(report.claims[0].status).toBe("verified");
    expect(report.claims[1].status).toBe("unverified");
    expect(report.claims[1].note).toBe("file-not-found");
    expect(report.blocking_issues).toHaveLength(1);
    expect(report.blocking_issues[0]).toContain("file-not-found");
    expect(report.blocking_issues[0]).toContain("src/auth/missing.ts");
  });

  test("a bare version number is not a citation", () => {
    expect(extractCitations("See 20.11.1:2 for details.")).toEqual([]);
  });

  test("URLs and absolute paths are not citations", () => {
    expect(
      extractCitations("See https://example.com/src/a.ts:12 for details."),
    ).toEqual([]);
    expect(extractCitations("See /usr/local/lib/a.ts:12 for details.")).toEqual(
      [],
    );
  });
});

describe("determinism", () => {
  test("two runs over the same claims serialise byte-identically", () => {
    const claims: EvidenceClaim[] = [
      {
        claim: "issueToken exists",
        evidence: `${TOKEN_PATH}:2`,
        marker: "issueToken",
      },
      {
        claim: "verifyToken exists",
        evidence: `${TOKEN_PATH}:3`,
        marker: "verifyToken",
      },
      {
        claim: "tokens are never logged",
        evidence: `${TOKEN_PATH}:2`,
        counterMarker: "VERIFIED",
      },
      { claim: "unresolvable", evidence: "src/nope.ts:4" },
    ];

    const first = checkEvidenceClaims(claims, READER);
    const second = checkEvidenceClaims(claims, READER);

    expect(JSON.stringify(first, null, 2)).toBe(
      JSON.stringify(second, null, 2),
    );
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
  });
});

describe("parseClaimsManifest", () => {
  test("reconstructs the authored fields and allows absent evidence", () => {
    const parsed = parseClaimsManifest({
      claims: [
        {
          claim: "issueToken exists",
          evidence: `${TOKEN_PATH}:2`,
          marker: "issueToken",
        },
        { claim: "no evidence yet" },
        {
          claim: "tokens are verified",
          evidence: `${TOKEN_PATH}:7`,
          marker: "VERIFIED",
          counterMarker: "ISSUED",
          securitySensitive: true,
        },
      ],
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.claims).toEqual([
      {
        claim: "issueToken exists",
        evidence: `${TOKEN_PATH}:2`,
        marker: "issueToken",
      },
      { claim: "no evidence yet" },
      {
        claim: "tokens are verified",
        evidence: `${TOKEN_PATH}:7`,
        marker: "VERIFIED",
        counterMarker: "ISSUED",
        securitySensitive: true,
      },
    ]);
  });

  test("rejects a non-object, a missing field, and an unknown field", () => {
    expect(parseClaimsManifest("nope").claims).toBeNull();
    expect(parseClaimsManifest({}).errors).toContain("missing field: claims");
    expect(parseClaimsManifest({ claims: [], extra: true }).errors).toContain(
      "unknown field: extra",
    );
  });

  test("rejects malformed claim entries", () => {
    expect(parseClaimsManifest({ claims: ["nope"] }).errors).toContain(
      "claims[0] must be an object",
    );
    expect(parseClaimsManifest({ claims: [{ claim: 1 }] }).errors).toContain(
      "claims[0].claim must be a string",
    );
    expect(
      parseClaimsManifest({
        claims: [{ claim: "x", securitySensitive: "yes" }],
      }).errors,
    ).toContain("claims[0].securitySensitive must be a boolean");
    expect(
      parseClaimsManifest({ claims: [{ claim: "x", extra: 1 }] }).errors,
    ).toContain("claims[0] unknown field: extra");
  });
});

describe("CLI envelope", () => {
  test("a passing claims manifest exits 0 with one valid JSON report", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        join(root, "claims.json"),
        JSON.stringify({
          claims: [
            {
              claim: "issueToken exists",
              evidence: `${TOKEN_PATH}:2`,
              marker: "issueToken",
            },
            { claim: "the line resolves", evidence: `${TOKEN_PATH}:7` },
          ],
        }),
      );

      const result = runCli(["--root", root, "--claims", "claims.json"]);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout);
      expect(Object.keys(report)).toEqual([...EVIDENCE_REPORT_FIELDS]);
      expect(report.verdict).toBe("pass");
      expect(validateEvidenceReport(report).valid).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a failing claims manifest exits 1 and still prints the report", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        join(root, "claims.json"),
        JSON.stringify({
          claims: [
            {
              claim: "a missing file claim",
              evidence: "src/auth/missing.ts:1",
              marker: "x",
            },
          ],
        }),
      );

      const result = runCli(["--root", root, "--claims", "claims.json"]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("fail");
      expect(report.claims[0].status).toBe("unverified");
      expect(report.claims[0].note).toBe("file-not-found");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a traversing evidence path is rejected by the guard, exit 1", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        join(root, "claims.json"),
        JSON.stringify({
          claims: [
            { claim: "escapes the root", evidence: "../../etc/passwd:1" },
          ],
        }),
      );

      const result = runCli(["--root", root, "--claims", "claims.json"]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("fail");
      expect(report.claims[0].note).toBe("path-traversal");
      expect(report.blocking_issues[0]).toContain("path-traversal");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an absolute evidence path is rejected without reading it, exit 1", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        join(root, "claims.json"),
        JSON.stringify({
          claims: [
            { claim: "points outside the root", evidence: "/etc/passwd:1" },
          ],
        }),
      );

      const result = runCli(["--root", root, "--claims", "claims.json"]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("fail");
      expect(report.claims[0].status).toBe("unverified");
      expect(report.claims[0].note).toBe("absolute-path");
      expect(report.blocking_issues[0]).toContain("absolute-path");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("doc mode scans citations and exits 0 on a clean document", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        join(root, "plan.md"),
        "# Plan\n\nSee `src/auth/token.ts:2`.\n",
      );

      const result = runCli(["--root", root, "--doc", "plan.md"]);

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("pass");
      expect(report.claims[0].note).toBe("location-only");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("doc mode exits 1 when a citation does not resolve", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        join(root, "plan.md"),
        "# Plan\n\nSee `src/auth/token.ts:2` and `src/auth/missing.ts:1`.\n",
      );

      const result = runCli(["--root", root, "--doc", "plan.md"]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("fail");
      expect(report.blocking_issues[0]).toContain("file-not-found");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a traversing --root is rejected before any filesystem access", () => {
    const result = runCli([
      "--root",
      "x/../../evil",
      "--claims",
      "claims.json",
    ]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/traversal/i);
  });

  test("neither or both modes print Usage and exit 1", () => {
    const neither = runCli([]);
    expect(neither.status).toBe(1);
    expect(neither.stderr).toContain("Usage:");

    const both = runCli(["--claims", "a.json", "--doc", "b.md"]);
    expect(both.status).toBe(1);
    expect(both.stderr).toContain("Usage:");
  });

  test("an unreadable claims manifest exits 1 with a message", () => {
    const root = tempWorkspace();
    try {
      const result = runCli(["--root", root, "--claims", "missing.json"]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Cannot read");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * SC4: the evidence gate is offline and LLM-free, like the budget gate. Doc
 * comments are stripped first because the shared lib names the forbidden
 * modules in prose; the assertion is about imports and calls.
 */
describe("static no-network scan", () => {
  const GATE_SCRIPTS = [
    "scripts/lib/check-common.ts",
    "scripts/context-budget.ts",
    "scripts/evidence-check.ts",
  ];

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  test("no gate script imports or calls a network/process API", () => {
    for (const relative of GATE_SCRIPTS) {
      const source = stripComments(
        readFileSync(join(REPO_ROOT, relative), "utf-8"),
      );
      expect(source).not.toMatch(/fetch\(|node:http|node:https|child_process/);
    }
  });

  test("the evidence gate itself is part of the scan", () => {
    expect(GATE_SCRIPTS).toContain("scripts/evidence-check.ts");
    const source = readFileSync(
      join(REPO_ROOT, "scripts", "evidence-check.ts"),
      "utf-8",
    );
    expect(source).toContain('from "node:fs"');
  });
});
