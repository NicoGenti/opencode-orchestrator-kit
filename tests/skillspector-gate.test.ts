/**
 * Regression guard for the #201 supply-chain gate: both workflows run the
 * pinned SkillSpector scanner against the committed baseline, one scan per
 * prompt directory, and the release publish job cannot start when a scan
 * fails. The baseline itself is checked here too, so a regenerated file that
 * reintroduces the generator's placeholder reason fails before review.
 *
 * Scanner flags that would turn the documented coverage gap into a permanent
 * red gate (`--min-coverage`, `--fail-on-incomplete`) or silently swap the
 * reviewed baseline for the one shipped inside the package
 * (`--use-shipped-baseline`) must never appear.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const SCANNER_COMMIT = "e2674da339b0bddc6e565d059c0577c6d9cd25da";
const BASELINE_PATH = join(REPO_ROOT, ".skillspector-baseline.yaml");
const SCAN_DIRS = ["skills", "agents", "extras", "command"] as const;

function read(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf-8");
}

const WORKFLOWS = {
  "test.yml": read(".github", "workflows", "test.yml"),
  "release.yml": read(".github", "workflows", "release.yml"),
} as const;

/** Join shell `\` continuations: one scanner invocation becomes one line. */
function logicalText(text: string): string {
  return text.replace(/\\\r?\n\s*/g, " ");
}

function scanCommands(text: string): string[] {
  return logicalText(text)
    .split(/\r?\n/)
    .filter((line) => /\bskillspector scan\b/.test(line));
}

/** The `steps:` entries that invoke the scanner, each with its shell body. */
function scanSteps(text: string): string[] {
  return text
    .split(/\n(?= {6}- name: )/)
    .filter((block) => /\bskillspector scan\b/.test(block));
}

const gatedCommands = (text: string): string[] =>
  scanCommands(text).filter((line) => line.includes("--fail-on-findings"));

/** A top-level job key inside `jobs:` (two-space indentation). */
const JOB_KEY = /^ {2}[a-z][a-z0-9-]*:\r?$/m;

/** One job block, from its key line to the next job key or EOF. */
function jobBlock(text: string, job: string): string {
  const key = new RegExp(`^ {2}${job}:\\r?$`, "m").exec(text);
  if (!key) {
    return "";
  }
  const rest = text.slice(key.index);
  const body = rest.slice(key[0].length);
  const next = body.search(JOB_KEY);
  return next === -1 ? rest : rest.slice(0, key[0].length + next);
}

describe("SkillSpector gate in test.yml and release.yml", () => {
  for (const [file, text] of Object.entries(WORKFLOWS)) {
    test(`${file}: each prompt directory is scanned against the baseline`, () => {
      const gated = gatedCommands(text);
      expect(gated.length).toBe(SCAN_DIRS.length);
      for (const dir of SCAN_DIRS) {
        expect(logicalText(text)).toContain(
          `skillspector scan ${dir}/ --no-llm --baseline .skillspector-baseline.yaml`,
        );
        expect(
          gated.some((command) => command.includes(`scan ${dir}/ `)),
          `${file} must gate ${dir}/`,
        ).toBe(true);
      }
    });

    test(`${file}: every scan step exits with the captured scanner status`, () => {
      const steps = scanSteps(text);
      expect(steps.length).toBe(SCAN_DIRS.length);
      for (const block of steps) {
        expect(block).toContain("status=0");
        expect(block).toMatch(/\|\| status=\$\?/);
        expect(block).toContain('exit "$status"');
      }
    });

    test(`${file}: no coverage bypass and no ungated scan owns the step`, () => {
      expect(text).not.toContain("--use-shipped-baseline");
      expect(text).not.toContain("--min-coverage");
      expect(text).not.toContain("--fail-on-incomplete");

      // A baseline scan without `--fail-on-findings` is permitted only as the
      // deliberate JSON diagnostic pass that runs after the gated SARIF pass:
      // it must write a report and its exit must be swallowed.
      const ungated = scanCommands(text).filter(
        (line) =>
          line.includes("--baseline") && !line.includes("--fail-on-findings"),
      );
      expect(ungated.length).toBe(SCAN_DIRS.length);
      for (const command of ungated) {
        expect(command).toContain("-f json");
        expect(command).toContain("-o ");
      }
      for (const block of scanSteps(text)) {
        if (block.includes("-f json")) {
          expect(block).toContain(
            '|| echo "json report exited $?; the file is the diagnostic"',
          );
        }
      }
    });
  }
});

describe("release workflow job graph", () => {
  test("publish needs the scanner job and the scanner has no needs edge", () => {
    const release = WORKFLOWS["release.yml"];
    const publish = release.slice(
      release.indexOf("\n  publish:\n"),
      release.indexOf("\n  release:\n"),
    );
    const scanner = jobBlock(release, "skillspector");
    expect(publish).toContain("needs: skillspector");
    expect(scanner).toMatch(/^ {2}skillspector:$/m);
    expect(scanner).not.toMatch(/^ {4}needs:/m);
  });

  test("test.yml runs the scanner as a sibling job, not a dependency cycle", () => {
    const text = WORKFLOWS["test.yml"];
    const scanner = jobBlock(text, "skillspector");
    expect(scanner).toMatch(/^ {2}skillspector:$/m);
    expect(scanner).not.toMatch(/^ {4}needs:/m);
  });
});

describe("committed SkillSpector baseline", () => {
  test("sits at the repository root with the pinned scanner and authored reasons", () => {
    expect(existsSync(BASELINE_PATH)).toBe(true);
    const baseline = JSON.parse(read(".skillspector-baseline.yaml")) as {
      version: number;
      scanner_version: string;
      tool_commit: string;
      rules: string[];
      fingerprints: Array<{
        hash: string;
        rule_id: string;
        file: string;
        reason: string;
      }>;
    };
    expect(baseline.version).toBe(2);
    expect(baseline.scanner_version).toBe("2.13.6");
    expect(baseline.tool_commit).toBe(SCANNER_COMMIT);
    // The blanket-suppression channel must stay empty.
    expect(baseline.rules).toEqual([]);
    expect(baseline.fingerprints.length).toBeGreaterThan(0);
    for (const fingerprint of baseline.fingerprints) {
      expect(fingerprint.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(fingerprint.reason.trim().length).toBeGreaterThan(20);
      expect(fingerprint.reason).not.toContain(
        "Accepted finding (auto-generated baseline)",
      );
    }
  });

  test("the scanner is pinned by commit, not by mutable tag", () => {
    for (const [file, text] of Object.entries(WORKFLOWS)) {
      expect(text, `${file} must pin the scanner commit`).toContain(
        `git+https://github.com/NVIDIA/skillspector.git@${SCANNER_COMMIT}`,
      );
      expect(text, `${file} must not pin the scanner by tag`).not.toContain(
        "skillspector.git@v2.13.6",
      );
    }
  });
});
