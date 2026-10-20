---
id: 14-comprehension-gate-operational-wiring
title: Comprehension Gate Operational Wiring
status: in-progress
created: 2026-10-20
updated: 2026-10-20
owner: issue-bridge
executor: orchestrator
gh_body_sha: aa13bcd38d1b5f47f8dab51ea0decd7b34bddb6e2316063b354dda770eb167dc
gh_issue: 14
gh_state: OPEN
gh_synced_at: 2026-10-20T11:25:33Z
---

## Goal
Comprehension Gate Operational Wiring

## Inputs Available
<!-- issue-bridge: specchio generato da plan/in-progress/0010-comprehension-gate-wiring.md. NON modificare a mano: la fonte di verita' e' il file di piano nel repository. -->
> **Specchio.** Fonte di verita': `plan/in-progress/0010-comprehension-gate-wiring.md` (ramo di default). Colonna: `in-progress`.

# Comprehension Gate Operational Wiring

## Phase Checklist

- [ ] Phase A: Wire classify → announce → gate into the orchestrator close cycle (`agents/orchestrator.md`, `docs/ARCHITECTURE.md` gate paragraphs, new `tests/comprehension-gate-wiring.test.ts`)
- [ ] Phase B: Board-level enforcement of the recorded comprehension outcome (`scripts/plan-board.py`, `agents/plan-writer.md`, `plan/README.md`, new `tests/plan-board-comprehension.test.ts`)
- [ ] Phase C: Session-close audit + stable-prefix + remaining docs surfaces (`command/close-session.md`, `AGENTS.md`, `QUICKSTART.md`, `CHANGELOG.md`, `docs/CONFIGURATION.md`)
- [ ] Phase D: `install.sh` seeding of `comprehension.config.json` (+ deliberate doc/test flips)

Execution order: A ∥ D parallel-safe (independent surfaces); B after A (consumes the outcome enum); C after A+B (documents final wording).

## Goal

The comprehension gate fires on every task close — classified and announced to the user (including NONE), enforced by the plan-board tool at `qa → complete`, and pinned by a regression suite — instead of existing as a detached prose section.

## Success Criteria

- Closing any completed task mandates classification + one-line user announcement (NONE included) in `agents/orchestrator.md` step 6, independent of whether code-reviewer/security was routed.
- HUMAN_OWNED outcome set is `NONE (announced) | PASS | SKIPPED | DISABLED` and matches `docs/ARCHITECTURE.md`.
- `plan-board.py move --to complete` exits 1 with code `comprehension-unrecorded` unless `--comprehension <none|pass|skipped|fail|disabled|n/a>` is supplied; the value is written to frontmatter `comprehension:` atomically with the move.
- `install.sh` seeds `.opencode/comprehension.config.json` with leave-if-exists semantics; docs and tests no longer claim manual copy is the only path.
- New tests green AND full suite green (`bun test`); `agents/orchestrator.md` stays ≤ 24,000 chars with ≥ 800 chars headroom.

## Scope

- In: `agents/orchestrator.md`, `agents/plan-writer.md`, `scripts/plan-board.py`, `plan/README.md`, `command/close-session.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `QUICKSTART.md`, `CHANGELOG.md`, `skills/comprehension-workflow/SKILL.md`, `install.sh`, `tests/comprehension-gate-wiring.test.ts` (new), `tests/plan-board-comprehension.test.ts` (new), `tests/installer-comprehension-seed.test.ts` (new), `tests/comprehension-config.test.ts` (one flipped test).
- Out (explicit): any deployment/sync of the consumer workspace `.opencode/` copy (e.g. `E:\MyProjects\op-orchestrator-kit\.opencode\`) — `install.sh` gains seeding capability but this plan executes no install; `agents/comprehension-coach.md`, `command/research-mode.md`, `command/recall.md`, research Slot A/B semantics, `.opencode/models.config.json` handling.

## Safety

- No git commands (read-only repo ops only); no secrets touched; all edits inside the In-scope paths above.
- `plan/README.md` and `scripts/plan-board.py` are "user-only decision" surfaces per `AGENTS.md` — this user-approved plan IS that authorization for exactly the changes listed in Phase B.
- Pinned verbatim strings that MUST survive Phase A edits: `### Classification (performed by the orchestrator — no coach call)`, `### Delegation format (LIGHT / DEEP only)`, `### Escalation routing`, `### Configuration and precedence`, the tier-token prohibition sentence (`comprehension-config.test.ts:227-234`), `load it when running a LIGHT/DEEP gate or /recall` (`workflow-hardening.test.ts:57-58`), the four W5 recall sentences (`workflow-hardening.test.ts:119-134`), `record-id.ts` mention + flat-path negatives (`:328-339`), NONE/LIGHT/DEEP table rows (`:138-144`).
- Research mode Slot A stays zero-overhead: no classification, `gate_type=n/a` (`command/research-mode.md:27`); config `enabled: false` records `disabled` (`SKILL.md:45`). Both exemptions are cited inline in the step-6 clause, never changed in behavior.
- No new tier token (`TIER_COMPREHENSION` forbidden — `comprehension-config.test.ts:268-289` sweep).

## Inputs Available

- Verified diagnosis with path:line anchors (spot-verified; shifts listed in Notes).
- Test runner: `bun test` (bun@1.2.21, `package.json` has NO `test` script — invoke `bun test` / `bun test tests/<file>` from kit root).
- `tests/plan-board.test.ts:1-60` fixture style to mirror: `PB_PYTHON` interpreter detection, per-test `mkdtempSync` board, `BODY_OK` nine-section fixture, `spawnSync` with `--json`.
- `tests/phase3-documentation.test.ts:41-44` doc-read style (`readFileSync` into consts at module top).
- `tests/installer-os-detection.test.ts` grep/spawn-level style that never runs the installer against a real target.
- `install.sh` seeding pattern: `install_model_profile()` at `:227-244`, invoked at `:482` (project), `:492` (global), `:510` (studio); header comment block `:13-22`.

## Outputs Required

- Per-phase file edits exactly as listed; three new test files; one flipped assertion in `tests/comprehension-config.test.ts`; all existing tests still green; `agents/orchestrator.md` char count under budget.

## Test Plan

- After each phase: `bun test tests/<phase-test-file>` then full `bun test` — expect exit 0, no skipped-by-accident blocks (plan-board tests self-skip only when no python interpreter exists).
- Phase A additionally: char-count check `bun test tests/workflow-hardening.test.ts` (W1 budget) with headroom ≥ 800.
- Phase B additionally: manual smoke `python scripts/plan-board.py move --id <fixture> --to complete --root <tmp>` without/with `--comprehension`.
- Phase D additionally: `grep -n "does not copy\|does not install" skills/comprehension-workflow/SKILL.md docs/CONFIGURATION.md` → no comprehension-config hits.

## Verification

- `bun test` exit 0 after each phase and at the end.
- `bun test tests/workflow-hardening.test.ts` green ⇒ orchestrator.md ≤ 24,000 chars; verify recorded headroom ≥ 800 by reading `ORCH.length` in a scratch assertion during Phase A.
- `python scripts/plan-board.py check --root plan --json` still exit 0 (WARNs allowed) on the repo board.
- Grep for `27,000` in `CHANGELOG.md` → no hits after Phase C; `QUICKSTART.md` contains a comprehension-gate mention after Phase C.

## Notes / Edge Cases

- `docs/ARCHITECTURE.md` gate paragraphs move from Phase C into Phase A so test A6(c) lands green in the same change (dependency fix; see Phase A).
- Verified anchor shifts vs diagnosis: install.sh seeding block `:215-244` (call sites `:482/:492/:510`); comprehension-config manual-copy pin at `:376-379` (not `:376-377`); plan-writer refusal table `:114-124`; config-precedence body `:152-156`; retention-records prose `:178-180`.
- Enum values are lowercase (`none|pass|skipped|fail|disabled`) plus `n/a`; argparse `choices=` enforces; frontmatter value written verbatim.
- `check` WARN `missing-comprehension` scoped to `qa`+`complete` columns only; legacy no-frontmatter files stay exempt (existing `legacy-no-frontmatter` path).
- Existing board files in the repo's `plan/` may start WARNing after Phase B — WARN only, never ERROR; do not retro-fit old plans without user approval.

### Phase A — Cycle wiring (size S; independent of B/C/D)

Edits (all in `agents/orchestrator.md` unless noted):

- A1 — replace the trigger sentence at `orchestrator.md:108` with: "Before closing any completed task — whether or not code-reviewer/security was routed — the orchestrator MUST classify the change's cognitive relevance (NONE/LIGHT/DEEP), announce the classification to the user in one line (mandatory even for NONE), and run the gate for LIGHT/DEEP."
- A2 — extend step 6 Close (`orchestrator.md:27`) with three sub-clauses, in this order, BEFORE the existing progress.md-overwrite text: (i) "classify the completed task NONE/LIGHT/DEEP and announce the classification in one line to the user — MANDATORY, including NONE"; (ii) "for LIGHT/DEEP load the `comprehension-workflow` skill and run the gate"; (iii) "unless research mode Slot A applies (record `gate_type=n/a`, no classification) or config `enabled: false` (record `disabled`) — exemptions per `command/research-mode.md` and `skills/comprehension-workflow/SKILL.md`". The `## Comprehension Gate` section (`:106-116`) stays as reference detail.
- A3 — closing rule (`orchestrator.md:148-150`): change the HUMAN_OWNED bullet to: "**HUMAN_OWNED**: comprehension outcome announced and recorded as `NONE (announced)` | `PASS` | `SKIPPED` | `DISABLED`." (NONE is currently unsatisfiable; docs show NONE→DONE.)
- A4 — the Slot A / `enabled: false` exemptions live inline in the A2 step-6 clause (iii), worded to match `command/research-mode.md:27` and `SKILL.md:45`; do not alter either source file.
- A5 — prompt-budget trims in the same change (see accounting below): cut config-precedence body `:152-156` (KEEP the `### Configuration and precedence` heading + the tier-token sentence pinned at `comprehension-config.test.ts:185-188,227-234`); cut retention-records field prose `:180` (KEEP `scripts/record-id.ts` mention + the flat-path invariant, pinned at `workflow-hardening.test.ts:328-339`); trim connective prose around the four W5 verbatim recall sentences `:182-192` (KEEP all strings pinned at `:119-134`).
- A6 — new `tests/comprehension-gate-wiring.test.ts`, three tests:
  - "step 6 Close classifies and announces before the progress.md overwrite": slice `ORCH.slice(ORCH.indexOf("6. **Close**"), ORCH.indexOf("## Core Rules"))`; assert `/classify/i`, `/announce/`, `indexOf("classify") < indexOf("progress.md")`, `/Slot A/`, `/enabled: false/`.
  - "classification trigger no longer depends on reviewer routing": `expect(ORCH).toContain("Before closing any completed task — whether or not code-reviewer/security was routed")`; `expect(ORCH).not.toContain("After technical validation (code-reviewer and/or security pass) is complete")`.
  - "closing rule and ARCHITECTURE.md agree on the HUMAN_OWNED outcome set": slice `ORCH.slice(ORCH.indexOf("### Closing rule"), ORCH.indexOf("### Configuration"))`; assert `TECHNICALLY_DONE`, `HUMAN_OWNED`, and regex `NONE \(announced\)[\s\S]*PASS[\s\S]*SKIPPED[\s\S]*DISABLED`; read `docs/ARCHITECTURE.md` via the `phase3-documentation.test.ts:41-44` style and assert it contains `NONE (announced)` and the same outcome set.
- A7 — update `docs/ARCHITECTURE.md:64` to the A1 trigger wording and `:74` to: "The task closes as **HUMAN_OWNED** only after a recorded and announced comprehension outcome — `NONE (announced)`, `PASS`, `SKIPPED`, or `DISABLED` — not merely TECHNICALLY_DONE. Both states must hold before moving to `plan/complete/`." (Moved from Phase C so A6's third test is green at phase end.)

Phase A — prompt-budget accounting:
- Current `agents/orchestrator.md` = 23,057 chars; cap 24,000 (`workflow-hardening.test.ts:35-37`); headroom 943.
- Additions ≈ +650: A1 trigger ≈ +120, A2 step-6 clauses ≈ +330, A3 closing-rule ≈ +120, A4 inline exemptions ≈ +80.
- Cuts ≈ −900: config-precedence body −400, retention-records field prose −300, W5-adjacent connective prose −200.
- Net ≈ −250 → projected ≈ 22,807 chars, headroom ≈ 1,193 (≥ 800 required). Acceptance: W1 test green; implementer re-measures after edits and, if over budget, trims MORE connective prose — never a pinned string.

Phase A — Test Plan: `bun test tests/comprehension-gate-wiring.test.ts tests/workflow-hardening.test.ts tests/comprehension-config.test.ts`, then full `bun test`.
Phase A — Verification: all green; ORCH headroom ≥ 800; no pinned string removed (grep each from the Safety list).
Phase A — Notes/Edge Cases: independent of B/C/D, parallel-safe with D; A7 (ARCHITECTURE.md) is part of A, NOT C.

### Phase B — Board enforcement (size S; depends on Phase A's outcome enum)

Edits:

- B1 — `scripts/plan-board.py`:
  - after `FM_KEYS` (`:34`): `COMPREHENSION_VALUES = ("none", "pass", "skipped", "fail", "disabled", "n/a")`.
  - move parser (`:282-286`): `p.add_argument("--comprehension", choices=COMPREHENSION_VALUES, default=None)`.
  - `cmd_move` (`:179-209`): signature gains `comprehension`; after the `already-in-column` check (`:189-190`) insert: `to == "complete"` and `comprehension is None` → `fail("comprehension-unrecorded", "move to complete requires --comprehension <none|pass|skipped|fail|disabled|n/a>: record the announced comprehension outcome", as_json)` (exit 1, before any filesystem change); pass the value to `update_status`.
  - `update_status` (`:169-176`): when provided, set `fm["comprehension"]`; `render_frontmatter` (`:69-71`) already appends unknown keys sorted after `FM_KEYS` — no change there; single `write_text` at `:205` keeps the frontmatter write atomic with the move.
  - `inspect_file` (`:106-108` loop): add WARN `("WARN", "missing-comprehension", ...)` when `column in ("qa", "complete")` and `"comprehension" not in fm`.
  - check payload (`:145-147`): add `"comprehension": (fm or {}).get("comprehension", "")`.
  - module docstring usage line (`:6`): `[--comprehension V]` on `move`.
- B2 — `agents/plan-writer.md`: move row (`:100`) gains "For `qa` → `complete` the dispatch MUST carry the recorded comprehension outcome, passed as `--comprehension <value>`"; dispatch moment 3 (`:150`) becomes "User accepted the verification → `move` `qa` → `complete`, carrying the recorded comprehension outcome; if none was announced this session, relay `comprehension-unrecorded` back to the dispatcher instead of guessing"; refusal table (`:116-124`) gains row `comprehension-unrecorded | qa → complete lacks a recorded comprehension outcome | Stop. Report the tool's message verbatim and request the outcome — never invent one.` (tool exit code relayed per existing rules).
- B3 — `plan/README.md`: Tooling move line (`:38`) gains `[--comprehension <none|pass|skipped|fail|disabled|n/a>]`; frontmatter example (`:86-96`) gains optional `comprehension:` key with one-line comment; WARN list (`:54-55`) gains "a missing `comprehension:` key on qa/complete files"; one sentence under "Standing authorization" (`:132-138`) that the outcome-carrying `qa → complete` move is covered by the standing authorization.
- B4 — new `tests/plan-board-comprehension.test.ts`, mirroring `tests/plan-board.test.ts:1-60` (PB_PYTHON detection, `describe.skip` without python, per-test `mkdtempSync` board, `BODY_OK` fixture, `spawnSync --json`):
  - "move --to complete without --comprehension exits 1 with comprehension-unrecorded and moves nothing" — assert exit 1, `code === "comprehension-unrecorded"`, file still in `qa/`.
  - "each enum value is accepted, writes the comprehension frontmatter key, and moves the file" — loop over the 6 values; assert exit 0, `verified: true`, target file exists in `complete/`, frontmatter contains `comprehension: <value>`.
  - "check reports WARN missing-comprehension for a qa file lacking the key (exit 0)".
  - "draft → in-progress requires no --comprehension argument".
  - "an invalid --comprehension value is rejected (non-zero exit, no move)".

Phase B — Test Plan: `bun test tests/plan-board-comprehension.test.ts tests/plan-board.test.ts tests/plan-writer-contract.test.ts`, then full `bun test`.
Phase B — Verification: all green; manual smoke of both refusal and success paths prints the expected JSON; repo board `check` exits 0 (WARNs tolerated).
Phase B — Notes/Edge Cases: depends on Phase A only for the enum wording (values fixed in this spec regardless); `plan-writer` must NOT be granted write scope over `plan/README.md`/`plan-board.py` — `developer-fixer` makes those edits; old repo-board plans may WARN — no retro-fits.

### Phase C — Session/docs surfaces (size XS; after A+B)

Edits:

- C1 — `command/close-session.md`: insert as new step 2 (renumber the rest): "**Audit comprehension announcements**: for every task/plan closed this session, confirm a classification (NONE/LIGHT/DEEP) was announced to the user and, for LIGHT/DEEP, a final outcome was recorded; if missing, classify and announce now — before finalizing `progress.md`." File stays English.
- C2 — `AGENTS.md` Workflow Examples: one bullet each, before the existing progress.md/issues.md step — Example 1: "- Classify the completed change (NONE/LIGHT/DEEP), announce the outcome in one line, run the gate if LIGHT/DEEP — then update `.context/progress.md`." Example 2: same wording ending "— then update session memory (progress.md / issues.md)." (AGENTS.md is stable prefix — exactly one line per example, no more.)
- C3 — `QUICKSTART.md`: one gate mention (zero today, verified) in the workflow narrative: "At close, the orchestrator classifies the change (NONE/LIGHT/DEEP) and announces the comprehension outcome before updating `progress.md`." `CHANGELOG.md:103`: "27,000 characters" → "24,000 characters". `docs/CONFIGURATION.md` Comprehension section (`:250-263`): define `mode: "adaptive"` — the only supported value; limits scale with the classification bucket (`light.*` for LIGHT, `deep.*` for DEEP). (ARCHITECTURE.md is done in Phase A — do not touch here.)
- C4 — extend `tests/comprehension-gate-wiring.test.ts` with describe "session/docs surfaces (Phase C)": test "AGENTS.md workflow examples classify before updating session memory" — for each `### Example` slice, `/classify/i` index < `/progress\.md/` index; test "CHANGELOG budget claim matches the live cap" — `CHANGELOG.md` has no `27,000` and contains `24,000`; test "QUICKSTART.md mentions the comprehension gate".

Phase C — Test Plan: `bun test tests/comprehension-gate-wiring.test.ts tests/stable-prefix-boundary.test.ts tests/frontmatter-order.test.ts tests/assembly-order.test.ts`, then full `bun test`.
Phase C — Verification: all green; AGENTS.md net growth ≤ 2 lines; no stable-prefix baseline change (no files added/removed under `agents/`/`extras/`).
Phase C — Notes/Edge Cases: depends on A (wording) and B (README/tool wording); C2 is per-session prompt cost — keep to the two single-line bullets.

### Phase D — Config seeding (size XS; independent, parallel-safe with A)

Edits:

- D1 — `install.sh`: new `seed_comprehension_config()` mirroring `install_model_profile()` (`:227-244`): leave-if-exists guard `[[ ! -e "${base}/comprehension.config.json" ]]`, copy `${KIT_DIR}/templates/comprehension.config.json`, "seeded"/missing-template-warning echo lines, `return 0` on missing template; call it right after each `install_model_profile` call at `:482`, `:492`, `:510` (`seed_comprehension_config "$(pwd)/.opencode" || exit 1` / `$HOME/.config/opencode` / `$PROFILE_DIR`); extend header comment (`:13-22`) with a "Comprehension gate config: seeded leave-if-exists" note.
- D2 — `skills/comprehension-workflow/SKILL.md:21`: replace the manual-copy claim with "seeded by `install.sh` from `templates/comprehension.config.json` (leave-if-exists); copy manually only when running the kit without the installer". `docs/CONFIGURATION.md:246-248` intro and the "Manual copy" section (`:288-295`): retitle to "Manual copy (without the installer)", state that `install.sh` seeds the file, keep the `cp templates/comprehension.config.json ...` command as the fallback path. FLIP `tests/comprehension-config.test.ts:376-379`: rename the test to "docs/CONFIGURATION.md states install.sh seeds the config", assert `/install\.sh.*seed/i` (match the exact new sentence) and KEEP the `/cp templates\/comprehension\.config\.json/` fallback pin.
- D3 — new `tests/installer-comprehension-seed.test.ts` (grep-level, `installer-os-detection.test.ts` style — never runs the installer against a real target): assert `install.sh` contains the `seed_comprehension_config` function, the `! -e` leave-if-exists guard, the `templates/comprehension.config.json` source path, and the three call sites adjacent to `install_model_profile`; assert `SKILL.md` and `docs/CONFIGURATION.md` no longer match `/does not (copy|install)/` for comprehension config; assert `templates/comprehension.config.json` parses as JSON with `comprehension.mode === "adaptive"`.

Phase D — Test Plan: `bun test tests/installer-comprehension-seed.test.ts tests/comprehension-config.test.ts`, then full `bun test`.
Phase D — Verification: all green; `bash -n install.sh` passes; no shipped file claims "install.sh does not copy/install" for comprehension config.
Phase D — Notes/Edge Cases: independent of A/B/C; NO install is executed against any target (consumer workspace `.opencode/` untouched — out of scope); missing-template path must warn and continue, never abort the install (models validation abort behavior is NOT mirrored).

## Success Criteria
- 

## Scope
- 

## Safety
- 

## Outputs Required
- 

## Test Plan
- 

## Verification
- 

## Notes / Edge Cases
- 

