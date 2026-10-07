/**
 * tests/workflow-hardening.test.ts — v0.6.1 Cognitive Workflow Hardening
 *
 * Contract/behavioral guards for the hardening release:
 *   W1  prompt budget: agents/orchestrator.md <= 27,000 chars
 *   W2  on-demand loading: skill/command pointers + orchestrator skill permission
 *   W3  coach contract: 4 outcomes, DCI separated, max 1 retry, structured output
 *   W4  DCI contract: 0-2 per dimension, even denominators 2-8, no bad examples
 *   W5  recall budget: caps + retrieval-before-explanation
 *   W6  token efficiency: NONE=0, LIGHT<=2, DEEP<=4, TIER_FAST default,
 *       escalation only for ambiguity/security/architecture, max one
 *   W7  telemetry privacy: no user answers / source code, research isolation
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXAMPLES, TUPLE_FIELDS, validateTuple } from "./contract-fields.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const ORCH = readFileSync(join(REPO_ROOT, "agents/orchestrator.md"), "utf-8");
const COACH = readFileSync(join(REPO_ROOT, "agents/comprehension-coach.md"), "utf-8");
const SKILL = readFileSync(join(REPO_ROOT, "skills/comprehension-workflow/SKILL.md"), "utf-8");
const RECALL = readFileSync(join(REPO_ROOT, "command/recall.md"), "utf-8");
const RESEARCH = readFileSync(join(REPO_ROOT, "command/research-mode.md"), "utf-8");
const START = readFileSync(join(REPO_ROOT, "command/start-session.md"), "utf-8");

describe("workflow-hardening — W1 prompt budget (v0.6.1)", () => {
  test("agents/orchestrator.md stays within the 27,000-char prompt budget", () => {
    expect(ORCH.length).toBeLessThanOrEqual(27_000);
  });

  test("orchestrator keeps routing + classification, delegates operational details", () => {
    // Routing/classification core stays (philosophy unchanged)
    expect(ORCH).toContain("### Classification (performed by the orchestrator — no coach call)");
    expect(ORCH).toContain("### Delegation format (LIGHT / DEEP only)");
    expect(ORCH).toContain("### Escalation routing");
    // Operational details live in the on-demand skill
    expect(ORCH).toMatch(/comprehension-workflow/);
    expect(SKILL).toContain("## Configuration and precedence");
  });
});

describe("workflow-hardening — W2 on-demand loading", () => {
  test("orchestrator skill permission allows exactly conductor + comprehension-workflow", () => {
    const fm = ORCH.slice(0, ORCH.indexOf("\n---", 4));
    expect(fm).toContain('"skill":{"*":"deny","conductor":"allow"');
    expect(fm).toContain('"comprehension-workflow":"allow"}}');
  });

  test("orchestrator points LIGHT/DEEP + /recall to the skill, /recall details to the command file", () => {
    expect(ORCH).toMatch(/load it when running a LIGHT\/DEEP gate or `\/recall`/);
    expect(ORCH).toMatch(/canonical in `command\/recall\.md`/);
    expect(SKILL).toContain("## Manual /recall");
  });
});

describe("workflow-hardening — W3 coach contract (v0.6.1)", () => {
  test("allowed outcomes are exactly PASS | RETRY | FAIL | SKIPPED", () => {
    expect(COACH).toContain("Comprehension: <PASS | RETRY | FAIL | SKIPPED>");
    // FAIL is a documented terminal outcome, not an alias
    expect(COACH).toMatch(/\*\*FAIL\*\*[^\n]*terminal negative outcome/);
    // RETRY still carries the frozen hint invariant
    expect(COACH).toContain("exactly one focused hint");
  });

  test("retry budget: maximum 1, final verdict is FINAL (no second evaluation)", () => {
    expect(COACH).toContain("Maximum 1 retry");
    expect(COACH).toMatch(/never a second evaluation pass/);
  });

  test("DCI verdict separation: rubric states the verdict set without DCI influence", () => {
    const idxDci = COACH.indexOf("### DCI scoring");
    const idxRetry = COACH.indexOf("## Retry Protocol");
    const rubric = COACH.slice(idxDci, idxRetry);
    expect(rubric).toContain("does NOT influence the verdict");
    expect(rubric).toMatch(/PASS\/RETRY\/FAIL\/SKIPPED/);
  });

  test("structured minimal output with normalised evaluator confidence", () => {
    expect(COACH).toContain("evaluator_confidence: <1-5>");
    expect(COACH).toMatch(/No additional commentary required/);
    // user_confidence never rated by the coach
    expect(COACH).toMatch(/Not the coach to rate|not the coach's to rate|is the orchestrator's to record/i);
  });
});

describe("workflow-hardening — W4 DCI contract (v0.6.1)", () => {
  test("each dimension scores 0-2 and denominators derive from scored dimensions", () => {
    const idxDci = COACH.indexOf("### DCI scoring");
    const idxRetry = COACH.indexOf("## Retry Protocol");
    const rubric = COACH.slice(idxDci, idxRetry);
    expect(rubric).toContain("Score each dimension 0-2");
    expect(rubric).toMatch(/available_score/);
    expect(SKILL).toMatch(/valid denominators are the even values 2-8/);
  });

  test("no incoherent DCI examples remain in shipped files", () => {
    for (const [name, doc] of [
      ["orchestrator", ORCH],
      ["coach", COACH],
      ["skill", SKILL],
      ["recall", RECALL],
      ["research", RESEARCH],
    ] as const) {
      expect(doc, `${name} must not contain DCI=<x>/5-style examples`).not.toMatch(/DCI=\d\/5/);
    }
  });
});

describe("workflow-hardening — W5 recall budget (v0.6.1)", () => {
  test("pre-answer: plan + saved questions only; post-answer: capped plan-scoped reads", () => {
    expect(ORCH).toMatch(/before the user answers, only the plan document \+ the per-plan record are consulted/i);
    expect(ORCH).toContain("maxDiffLines=300");
    expect(ORCH).toContain("maxRelatedSymbols=3");
    expect(RECALL).toMatch(/maxDiffLines=300/);
    expect(RECALL).toContain("maxRelatedSymbols=3");
  });

  test("no whole-repo scans, no unnecessary whole-file reads", () => {
    expect(ORCH).toContain("never whole-repo scans");
    expect(RECALL).toContain("NEVER repo-wide scans");
    expect(RECALL).toMatch(/never a whole-file read when a bounded slice suffices/);
  });

  test("retrieval-before-explanation invariant intact", () => {
    expect(RECALL).toContain("ALL questions are shown BEFORE any code or explanation");
  });
});

describe("workflow-hardening — W6 token efficiency (v0.6.1)", () => {
  test("NONE = 0 coach calls (orchestrator classification table)", () => {
    expect(ORCH).toMatch(/\|\s*\*\*NONE\*\*\s*\|[^\n]*\|\s*0 — skip coach entirely\s*\|/);
  });

  test("LIGHT <= 2 questions, DEEP <= 4 questions", () => {
    expect(ORCH).toMatch(/\|\s*\*\*LIGHT\*\*\s*\|[^\n]*\|\s*max 2 questions\s*\|/);
    expect(ORCH).toMatch(/\|\s*\*\*DEEP\*\*\s*\|[^\n]*\|\s*max 4 questions\s*\|/);
  });

  test("default tier TIER_FAST for gate work; TIER_REVIEW only for escalation", () => {
    expect(ORCH).toContain("TIER_FAST");
    expect(SKILL).toMatch(/deep\.escalationTier.*TIER_REVIEW/);
    expect(ORCH).toMatch(/only when the evaluation result is ambiguous|ONLY when one of these three conditions holds/);
    expect(ORCH).toMatch(/the reasoning involves security-critical/);
    expect(ORCH).toMatch(/architectural decision cannot be confidently judged/);
  });

  test("max one escalation/retry: never chained, never on PASS, FINAL verdict", () => {
    expect(ORCH).toContain("exactly ONE escalation per task evaluation");
    expect(ORCH).toMatch(/never \w+ on a verdict of PASS/);
    expect(ORCH).toMatch(/is never chained/);
    expect(ORCH).toMatch(/verdict is FINAL/);
  });

  test("research slot A costs zero comprehension overhead (0 coach calls)", () => {
    expect(RESEARCH).toMatch(/Slot A \(control\)[\s\S]{0,400}0 coach calls/);
    expect(EXAMPLES[0].gate_type).toBe("n/a");
  });
});

describe("workflow-hardening — W7 privacy & isolation (regression)", () => {
  test("telemetry rows carry no user answers and no source-code content", () => {
    expect(SKILL).toMatch(/MUST NOT include any user answer text|no user answers|privacy/i);
    expect(ORCH).toMatch(/No user answers, no source code/);
  });

  test("start-session stays isolated from telemetry, recall and research dataset", () => {
    expect(START).toContain("research-dataset.jsonl");
    expect(START).toContain("NOT part of bootstrap");
    expect(START).toMatch(/may read the log/);
    expect(START).toMatch(/only under explicit user invocation/);
  });

  test("research dataset privacy invariant verbatim", () => {
    const INVARIANT = "No source code and no personal answers are ever written to the dataset.";
    expect(RESEARCH).toContain(INVARIANT);
    expect(ORCH).toContain(INVARIANT);
  });
});
/**
 * v0.6.2 — Safety & Measurement Corrections:
 *   W8  P0: frontend permissions cover both metric sinks
 *   W9  hard boundary: append-only sinks, single tuple, research-scoped reads
 *   W10 coach atomic block carries DCI (SKIPPED stays numeric-free)
 *   W11 /recall whitelist: plan + record + bounded inspection only
 *   W12 DCI0 telemetry row carries user_conf (parity with DCI1)
 *   W13 research tuple stores user_conf on dci_immediate (DCI0 baseline)
 *   W14 behavioral A/B: research command drives a TDD gate flow, not prose
 *
 * v0.6.3 — Research Schema Fixes (rewrite):
 *   W8b edit-map pin: edit permission covers BOTH metric sinks (not just write)
 *   W14 rewritten deterministic: parsed example tuples + typed contract
 *      (contract-fields.ts); prose-token pins (gate_type=light,
 *      alternation=abab, user_conf=N) retired with the v0.6.0 flow fields.
 */
describe("workflow-hardening — W8 P0 frontend permissions (v0.6.2)", () => {
  test("orchestrator write permission includes both metric sinks", () => {
    const fm = ORCH.slice(0, ORCH.indexOf("\n---", 4));
    expect(fm).toContain('".context/comprehension-log.md":"allow"');
    expect(fm).toContain('".context/research-dataset.jsonl":"allow"');
  });

  test("W8b: orchestrator edit permission covers BOTH metric sinks (v0.6.3)", () => {
    const fm = ORCH.slice(0, ORCH.indexOf("\n---", 4));
    const em = fm.match(/"edit":\s*\{([\s\S]*?)\}/);
    expect(em).not.toBeNull();
    expect(em[1]).toContain('".context/comprehension-log.md":"allow"');
    expect(em[1]).toContain('".context/research-dataset.jsonl":"allow"');
  });
});

describe("workflow-hardening — W9 hard boundary (v0.6.2)", () => {
  test("both sinks are append-only; reads are lifecycle-scoped", () => {
    expect(ORCH).toMatch(/\*\*Hard boundary\*\* \(v0\.6\.3\): both sinks \(this log, `\.context\/research-dataset\.jsonl`\) are append-only/);
    expect(ORCH).toMatch(/Sanctioned edits: log-row normalisation; dataset `dci_delayed` backfill \(via `\/recall`, between tasks\)/);
    expect(RESEARCH).toMatch(/no intermediate or diagnostic rows/);
    expect(RESEARCH).toMatch(/exactly one JSON object as one line/);
  });

  test("research command keeps the zero-overhead inactive rule", () => {
    expect(RESEARCH).toMatch(/zero overhead/);
    expect(RESEARCH).toMatch(/never read, never written/);
  });
});

describe("workflow-hardening — W10 coach atomic output includes DCI (v0.6.2)", () => {
  test("Output Format block contains all four lines including DCI", () => {
    const out = COACH.slice(COACH.indexOf("After EVALUATE, emit exactly this block"));
    const closing = out.indexOf("```", out.indexOf("```") + 3);
    const block = out.slice(0, closing);
    expect(block).toContain("Comprehension: <PASS | RETRY | FAIL | SKIPPED>");
    expect(block).toContain("evaluator_confidence: <1-5>");
    expect(block).toContain("DCI: <score>/<available_score>");
  });

  test("SKIPPED still carries no numeric DCI (n/a placeholder)", () => {
    expect(COACH).toMatch(/On SKIPPED the block carries `DCI: n\/a`/);
  });

  test("coach file keeps a single Output block (no second DCI-bearing block elsewhere)", () => {
    const fenceCount = COACH.split("```")
      .filter((b) => b.includes("Comprehension: <PASS | RETRY | FAIL | SKIPPED>")).length;
    expect(fenceCount).toBe(1);
  });
});

describe("workflow-hardening — W11 /recall whitelist (v0.6.2)", () => {
  test("whitelist covers plan + per-plan record + bounded inspection", () => {
    expect(RECALL).toMatch(/ONLY the plan document in `plan\/complete\/`, the per-plan record in `\.context\/comprehension\/`, and the bounded post-answer inspection/);
    expect(RECALL).toMatch(/maxDiffLines=300/);
    expect(RECALL).toContain("maxRelatedSymbols=3");
  });

  test("recall steps state the whitelist and the record update", () => {
    expect(RECALL).toMatch(/only through step 5's whitelist/);
    expect(RECALL).toMatch(/update the per-plan record's `outcome`, `dci` and `user_conf` fields/);
  });
});

describe("workflow-hardening — W12 DCI0 telemetry user_conf (v0.6.2)", () => {
  test("telemetry template carries user_conf on the immediate row", () => {
    expect(ORCH).toMatch(/user_conf=<1-5>\|n\/a/);
    expect(SKILL).toMatch(/user_conf=<1-5>\|n\/a/);
  });

  test("user_conf semantics: calibration answer, n/a when not asked", () => {
    expect(ORCH).toMatch(/calibration answer accompanies/);
    expect(ORCH).toMatch(/On SKIPPED: `user_conf=n\/a`/);
  });
});

describe("workflow-hardening — W13 research tuple DCI0 baseline (v0.6.2)", () => {
  test("tuple contract anchors user_conf to the immediate (DCI0) reading", () => {
    expect(RESEARCH).toMatch(/dci_immediate[\s\S]{0,400}user_conf/);
    expect(RESEARCH).toMatch(/DCI0 baseline/);
  });

  test("per-plan record stores user_conf canonically (skill contract)", () => {
    expect(SKILL).toMatch(/the per-plan record is the canonical store/);
  });
});

describe("workflow-hardening — W14 behavioral A/B flow (v0.6.2)", () => {
  test("research command carries a TDD behavioral flow with a simulated turn transcript", () => {
      const flow = RESEARCH.slice(RESEARCH.indexOf("Behavioral A/B flow (normative example)"));
      const simUser = (flow.match(/SIM-U:/g) || []).length;
      const simCoach = (flow.match(/SIM-C:/g) || []).length;
      expect(RESEARCH).toContain("Behavioral A/B flow (normative example)");
      expect(simUser).toBe(2);   // one recorded turn per slot
      expect(simCoach).toBe(2);  // coach verdict blocks for both slots
    });


  test("flow shows a real pass and a real fail of the comprehension gate", () => {
    // gate outcomes read from parsed example tuples and normalized coach verdicts
    expect(EXAMPLES[0].gate_type).toBe("n/a");
    expect(EXAMPLES[1].gate_type).toBe("LIGHT");
    expect(EXAMPLES[1].retries).toBe(1);
    expect((RESEARCH.match(/Comprehension: PASS/g) || []).length).toBe(1);
    expect((RESEARCH.match(/Comprehension: RETRY/g) || []).length).toBe(1);
    expect((RESEARCH.match(/Comprehension: FAIL/g) || []).length).toBe(1);
  });

  test("the tuple emitted in the flow matches the 17-field contract exactly", () => {
    // parsed from the markdown flow, then validated against the typed contract
    for (const tuple of EXAMPLES) {
      expect(Object.keys(tuple).sort()).toEqual([...TUPLE_FIELDS].sort());
      expect(validateTuple(tuple)).toEqual([]);
    }
  });
});
