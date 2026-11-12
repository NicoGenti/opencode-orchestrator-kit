# Flow verification — plan board (plan-writer)

## 1. What was verified

The plan board has a single owner, the `plan-writer` agent, and every plan mutation goes through the deterministic tool `scripts/plan-board.py`. This document records the execution evidence gathered on 2026-10-14: the four dispatch moments and the `check` of status exercised on a throwaway board in the profile's temp directory (logs `pbwork/logs/b3-*.log`), the tool's verified rejections, the effect on the filesystem, the (read-only) state of the kit's real board, and a (read-only) census of the O4A counterpart. No file under `plan/**` of this repo was written; the only artifact in the repo is this document.

## 2. The four dispatch moments (flow contract)

| Moment | Tool state | Command executed | Exit | Outcome |
| --- | --- | --- | --- | --- |
| Approved plan -> `new` | `"ok": true`, `"verified": true`, `"column": "draft"` | `python scripts/plan-board.py new --root "$BOARD" --id 9001-flow-probe --title "Flow probe" --owner orchestrator --executor developer-fixer --body "$BODY" --json` (step 4, `b3-2.log`) | 0 | conforming plan created in `draft/9001-flow-probe.md` |
| Approved with existing file -> move `draft` -> `in-progress` | `"ok": true`, `"from": "draft"`, `"to": "in-progress"` | `python scripts/plan-board.py move --root "$BOARD" --id 9001-flow-probe --to in-progress --json` (step 5, `b3-3.log`) | 0 | file moved, frontmatter updated (see section 4) |
| Implementer completion -> move `in-progress` -> `qa` | — | `plan-board.py move --to qa` | not exercised | not exercised: requires a real board |
| User acceptance -> move `qa` -> `complete` | — | `plan-board.py move --to complete` | not exercised | not exercised: the user decides |
| Session status/resume -> `check` | `"ok": true` (two runs) | `python scripts/plan-board.py check --root "$BOARD" --json` (steps 3 and 6, `b3-1.log` / `b3-4.log`) | 0 / 0 | conforming board: 0 plans at the first `check`, 1 `in-progress` plan at the second |

## 3. Verified rejections (the tool does not guess)

| Expected code | Command | Actual exit | Verbatim message (1 line) |
| --- | --- | --- | --- |
| `already-in-column` | `move --id 9001-flow-probe --to in-progress` repeated (step 7, `b3-5.log`) | 1 | `'9001-flow-probe.md' is already in 'in-progress'` |
| `duplicate-id` | `new --id 9001 --title Dup --owner orchestrator --executor developer-fixer --body "$BODY"` (step 8, `b3-6.log`) | 1 | `'9001' already exists in in-progress` |
| `plan-ambiguous` | `move --id 9002 --to qa` after the ad-hoc creation of `draft/9002-alpha.md` and `complete/9002-beta.md` (step 9, `b3-7.log`) | 1 | `'9002' present in multiple columns: draft/9002-alpha.md, complete/9002-beta.md` |

The `plan-ambiguous` rejection cites both candidate files: `9002-alpha.md` and `9002-beta.md`.

## 4. Filesystem effect (proof, not a declaration)

`cat "$BOARD/in-progress/9001-flow-probe.md"` (from `b3-plan.txt`, exit 0) — frontmatter block, 7 lines between the two `---` (id, title, status, created, updated, owner, executor):

```
---
id: 9001-flow-probe
title: Flow probe
status: in-progress
created: 2026-10-14
updated: 2026-10-14
owner: orchestrator
executor: developer-fixer
---
```

Proof of the filesystem effect (commands and verbatim output from `b3-ls.txt`, exit 0):

```
$ ls "$BOARD/draft"
9002-alpha.md
draft_files=1
$ ls "$BOARD/in-progress"
9001-flow-probe.md
inprogress_files=1
$ grep -c 'status: in-progress' in-progress/9001-flow-probe.md
1
```

The plan lives in `in-progress/` and NOT in `draft/`: `draft/` contains only `9002-alpha.md` (created ad hoc at step 9), `in-progress/` contains `9001-flow-probe.md` (1 file), and the frontmatter carries `status: in-progress` and `updated: 2026-10-14` (updated by the move).

## 5. The kit's real board: state as of 2026-10-14

`python scripts/plan-board.py check --root plan` — actual exit `1` (`b3-kit-board.exit`). Actual counts: `  ERROR ` = **1** (`b3-kit-errors.txt`), `  WARN  ` = **10** (`b3-kit-warns.txt`). Verbatim list (from `b3-kit-board.log`):

```
FAIL
  ERROR missing-id  plan\complete\0002-roster-and-schema-fixes.md  frontmatter without `id`
  WARN  missing-section  plan\draft\0002-v0.3.0-human-comprehension-gate.md  missing section: ## Notes / Edge Cases
  WARN  legacy-no-frontmatter  plan\draft\0003-prompt-assembly-optimization.md  legacy file without YAML frontmatter: normalize it with `adopt`
  WARN  missing-section  plan\draft\0003-v0.3.1-token-aware-comprehension.md  missing section: ## Notes / Edge Cases
  WARN  missing-section  plan\draft\001-installer-prereq-checkpoints.md  missing section: ## Notes / Edge Cases
  WARN  unexpected-file  plan\draft\test_write.txt  non-.md file present in a column
  WARN  legacy-no-frontmatter  plan\in-progress\0001-kit-evolution-toolkit.md  legacy file without YAML frontmatter: normalize it with `adopt`
  WARN  missing-frontmatter-key  plan\in-progress\0006-branching-strategy.md  missing frontmatter key: executor
  WARN  missing-frontmatter-key  plan\complete\0002-roster-and-schema-fixes.md  missing frontmatter key: updated
  WARN  missing-frontmatter-key  plan\complete\0002-roster-and-schema-fixes.md  missing frontmatter key: owner
  WARN  missing-frontmatter-key  plan\complete\0002-roster-and-schema-fixes.md  missing frontmatter key: executor
```

Explicit decision: no automatic intervention from this verification. `adopt` rejects a file that already has a frontmatter, and in any case the board stays read-only here; deleting `plan/draft/test_write.txt` (seen in the `unexpected-file` warn) is a user decision. The proposed fix is one line, on the user: add `id: 0002-roster-and-schema-fixes` as the first line of the frontmatter of `plan/complete/0002-roster-and-schema-fixes.md`.

## 6. Note on the flaky suites

The 3 installer/oc2 suite names that appear and disappear (`install.sh global`, `install-freellmapi.sh` x2) are contention-flaky: under full load they time out at 5 s, in isolation they pass (note at the top of the fixture). The full baseline is in `tests/fixtures/baseline-failures.txt` (6 comment lines + 20 names; counts re-read on the file) and a regression is only a NEW name; a shorter list is not a regression (rule declared in the fixture itself).

## 7. O4A census (read-only, no writes)

| Command | Actual exit | Verbatim output (1-3 lines) |
| --- | --- | --- |
| `python "D:/Work/O4A/.opencode/scripts/plan-board.py" check --json` | 0 | `"ok": true,` / `"action": "check",` / `"root": "D:\\Work\\O4A\\plan",` — from the same JSON: `errors: []`, 2 `legacy-no-frontmatter` warnings, 1 `in-progress` plan, 2 legacy plans in `complete` |
| `node "D:/Work/O4A/.opencode/scripts/check-agent-frontmatter.mjs"` | 0 | `PASS — 17 file agente: tools booleani, mode coerenti` |
| `node "D:/Work/O4A/.opencode/scripts/verify-agent-models.mjs"` | 1 | `ok    opencode.jsonc parsed` / `ok    agent map covers all 17 project agents` / `FAIL  debug agents returned 0 agents — cannot verify resolution (opencode2 service start)` |
| `python "D:/Work/O4A/.opencode/scripts/verify-instructions.py"` | 0 | `PASS  istruzioni di D:/Work/O4A presenti (AGENTS.md)` |

Note: `verify-agent-models.mjs` exits 1 because it cannot resolve the models without starting the opencode2 service (debug agents = 0); it is a measured fact, no intervention was performed.

## 8. Mapping kit <-> O4A

| Aspect | Kit (E:/MyProjects/opencode-orchestrator-kit) | O4A (D:/Work/O4A) |
| --- | --- | --- |
| Owner agent | `agents/plan-writer.md` | `D:\Work\O4A\.opencode\agents\o4a-plan-writer.md` (there is no `agents/` folder in the O4A root) |
| Tool | `scripts/plan-board.py` (kit repo) | `D:\Work\O4A\.opencode\scripts\plan-board.py` |
| Board root | `plan/` relative to the repo, git-local (here: temporary root for the run, steps 1-10; `--root plan` for the real board, step 11) | `D:\Work\O4A\plan\` — the tool's absolute default (from the JSON at step 12) |
| Permission gate | `edit: ask`; `write: plan/**/*.md allow` (everything else `deny`); `bash: deny` except `python */plan-board.py *`, `ls *`, `cat *` (from `agents/plan-writer.md`) | `edit: ask`, `write: ask`, `bash: ask` (from `o4a-plan-writer.md`) |
| Frontmatter guard | `bun test`: `tests/plan-board.test.ts`, `tests/plan-writer-contract.test.ts`, `tests/assembly-order.test.ts`, `tests/frontmatter-order.test.ts`, `tests/stable-prefix-boundary.test.ts` | `check-agent-frontmatter.mjs`: 17 files (exit 0, section 7) |

The agent contract is the same: single owner of the plans, four columns, `id` = the file's stem, nine sections in the body, mutations only via `plan-board.py`. What changes: the root, the tool path, and the permission gates.