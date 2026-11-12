# Prompt body counts — after (Plan 0003, Phase 10)

Final "after" metrics for issue #121 (prompt shrink). Captured on branch
`feat/issue-121-shorten-prompts-docs` at `8122c8e` (merge-base with `main`:
`c3d652a`), i.e. after Phases 0-9 and before Phase 10's commit.

## Counting method

Identical to `.context/prompt-word-counts.before.md`, so the two tables are
directly comparable:

- **Body** = the file text after the closing frontmatter delimiter. The file is split with
  `maxsplit=2` on lines that are exactly `---` (trailing spaces/tabs allowed), and the third
  segment is taken with one leading newline removed. YAML frontmatter is excluded, so permission
  blocks, `model:`/tier tokens and `description:` never inflate the count.
- **Body words** = `len(body.split())`, i.e. whitespace-separated tokens (markdown syntax,
  punctuation and backticks count as part of their token).
- **Body chars** = `len(body)` in UTF-8 text with `CRLF` normalised to `LF`.
- **Total chars (CR-stripped)** = every `\r` removed from the whole file, frontmatter
  included. This is exactly the quantity `tests/workflow-hardening.test.ts:33-36`
  (`readPrompt`) measures, so it is the number the char caps constrain.
- Files covered: `agents/*.md` (16) + `extras/*.md` (2) = 18. Sorted, `agents/` before `extras/`.

Re-derivable from the repository root:

- "Before" side (the `main` merge-base `c3d652a`):

  ```bash
  python -c "import re,glob,subprocess;D=re.compile(r'(?m)^---[ \t]*\r?$');B='c3d652a';[print(p,len((lambda b:b.split())(re.sub(r'^\r?\n','',D.split(subprocess.run(['git','show',B+':'+p.replace(chr(92),'/')],capture_output=True).stdout.decode(),2)[2].replace('\r\n','\n')))),len(subprocess.run(['git','show',B+':'+p.replace(chr(92),'/')],capture_output=True).stdout.decode().replace('\r','')),sep='\t') for p in sorted(glob.glob('agents/*.md'))+sorted(glob.glob('extras/*.md'))]"
  ```

- "After" side (working tree, same expression as the before file):

  ```bash
  python -c "import re,glob;D=re.compile(r'(?m)^---[ \t]*\r?$');[print(p,len((lambda b:b.split())(re.sub(r'^\r?\n','',D.split(open(p,encoding='utf-8',newline='').read(),2)[2].replace('\r\n','\n')))),len(open(p,encoding='utf-8',newline='').read().replace('\r','')),sep='\t') for p in sorted(glob.glob('agents/*.md'))+sorted(glob.glob('extras/*.md'))]"
  ```

## Before -> after

| File | Words before | Words after | d words | Total chars before | Total chars after | d chars | Cap | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `agents/build-helper.md` | 235 | 231 | -4 | 2,703 | 2,659 | -44 | 2,800 | 141 |
| `agents/code-reviewer.md` | 324 | 314 | -10 | 3,519 | 3,469 | -50 | 3,600 | 131 |
| `agents/comprehension-coach.md` | 839 | 693 | -146 | 6,090 | 5,105 | -985 | 6,500 | 1,395 |
| `agents/deploy-helper.md` | 298 | 291 | -7 | 3,152 | 3,088 | -64 | 3,300 | 212 |
| `agents/developer-fixer.md` | 366 | 343 | -23 | 4,115 | 4,043 | -72 | 4,300 | 257 |
| `agents/explorer.md` | 516 | 470 | -46 | 4,724 | 4,424 | -300 | 5,000 | 576 |
| `agents/librarian.md` | 188 | 181 | -7 | 2,411 | 2,327 | -84 | 2,500 | 173 |
| `agents/npm-helper.md` | 231 | 230 | -1 | 2,570 | 2,502 | -68 | 2,700 | 198 |
| `agents/oracle.md` | 369 | 349 | -20 | 3,357 | 3,219 | -138 | 3,500 | 281 |
| `agents/orchestrator-quick.md` | 488 | 447 | -41 | 3,962 | 3,752 | -210 | 4,200 | 448 |
| `agents/orchestrator.md` | 3,221 | 2,973 | -248 | 23,852 | 22,306 | -1,546 | 24,000 | 1,694 |
| `agents/plan-writer.md` | 1,883 | 1,517 | -366 | 13,234 | 10,696 | -2,538 | 14,100 | 3,404 |
| `agents/planner.md` | 424 | 376 | -48 | 3,600 | 3,274 | -326 | 3,800 | 526 |
| `agents/profiler.md` | 804 | 778 | -26 | 7,205 | 6,969 | -236 | 8,100 | 1,131 |
| `agents/security.md` | 482 | 476 | -6 | 4,221 | 4,170 | -51 | 4,400 | 230 |
| `agents/test-engineer.md` | 240 | 221 | -19 | 2,320 | 2,199 | -121 | 2,400 | 201 |
| `extras/pc-doctor.md` | 326 | 239 | -87 | 2,805 | 2,372 | -433 | 2,900 | 528 |
| `extras/writer.md` | 655 | 293 | -362 | 4,743 | 2,301 | -2,442 | 5,000 | 2,699 |
| **Total (18 files)** | **11,889** | **10,422** | **-1,467** | **98,583** | **88,875** | **-9,708** | | |

- Body words: 11,889 -> 10,422, **-1,467 words (-12.34%)**.
- CR-stripped total chars: 98,583 -> 88,875, **-9,708 chars (-9.85%)**.
- Body chars (the before file's second column): 81,228 -> 71,520, **-9,708 chars (-11.95%)** —
  the same delta as the total, because every frontmatter block stayed byte-identical.
- Char caps (`tests/workflow-hardening.test.ts:60-79`): all 18 files are under their cap.
  Tightest headroom is `agents/code-reviewer.md` (131 chars), then `agents/build-helper.md`
  (141 chars); every other file has 173 chars or more of headroom.
- Extra budget: `AGENTS.md` is 9,832 chars against its 12,000-char cap
  (`tests/agents-instructions-budget.test.ts`).
- Docs word counts: README 4,046 -> 3,346; QUICKSTART 958 -> 876; CONTRIBUTING
  2,129 -> 2,476 (gained the prompt-length guideline section); docs/ARCHITECTURE.md
  1,050 -> 997; docs/CONFIGURATION.md 2,315 -> 2,324.

Every per-file char delta above matches the delta recorded in that phase's report,
which is a second, independent check of the same measurement.

## Per-phase commits

`git log --oneline main..HEAD` (oldest first):

| Commit | Phase |
| --- | --- |
| `45a9f95` | phase 0 — adopt plan card, design rules, repo map |
| `31579a4` | phase 0 — prompt metrics baseline |
| `cc306a2` | phase 1 — shrink agents/orchestrator.md |
| `ed09a87` | phase 2 — shrink agents/plan-writer.md |
| `f5f484e` | phase 3 — shrink profiler and comprehension-coach prompts |
| `66fe893` | phase 4 — shrink explorer and oracle prompts |
| `6657d0c` | phase 5 — shrink planner developer-fixer test-engineer prompts |
| `98f6e52` | phase 6 — shrink code-reviewer and security prompts |
| `7e62f5b` | phase 7 — shrink helper extras quick librarian prompts |
| `122753a` | phase 8 — docs ownership refresh and prompt-length guideline |
| `8122c8e` | phase 9 — archive one-off docs under docs/archive |

Phase 10 (this report) adds one commit containing only this file.

## Guarantee statement

No behavioural guarantee was removed, and no pin was retired, relaxed or rewritten.
The proof is structural: **no file under `tests/` changed anywhere in the branch.**

- `git diff --stat main...HEAD -- tests/` prints nothing, so no test file, fixture or
  snapshot differs from `main@c3d652a`. Pins therefore still assert the same strings
  as before the shrink; they pass because the text they pin is still present.
- Pins preserved verbatim (suites re-run on this tree, 536 pass / 0 fail):
  `workflow-hardening.test.ts` (W1 char budgets `:60-79`, quick contract, coach W3/W4,
  orchestrator sanctioned writes, comprehension gate, plan-board ownership, delegation
  rules, response economy), `plan-writer-contract.test.ts`, `comprehension-config.test.ts`,
  `comprehension-gate-wiring.test.ts`, `comprehension-coach.test.ts`,
  `routing-consistency.test.ts`, `agent-descriptions.test.ts`, `plugin-permissions.test.ts`,
  `v2-permission-snapshot.test.ts`, `permission-matrix.test.ts`, `skill-allowlist.test.ts`,
  `no-github-automation.test.ts`, `plugin-assets-parity.test.ts`,
  `agents-instructions-budget.test.ts`, `phase3-documentation.test.ts`,
  `site-landing.test.ts`, `version-sync.test.ts`, `frontmatter-order.test.ts`,
  `assembly-order.test.ts`, `stable-prefix-boundary.test.ts`.
- Pins retired: **none** (0 test edits, so nothing to justify).
- Stable-prefix boundary unchanged: `tests/fixtures/prompt-prefix-boundary.txt` is
  byte-identical to `main` (`git diff --stat main...HEAD -- tests/fixtures/prompt-prefix-boundary.txt`
  is empty); the boundary set is still the same 18 files — no add, remove or rename
  under `agents/` or `extras/`.
- `mode: primary` set unchanged: `agents/orchestrator.md` and `agents/orchestrator-quick.md`,
  parsed from frontmatter at `c3d652a` and at HEAD — identical; all other 16 files are
  `subagent` both sides.
- Frontmatter, permission blocks, `{TIER_*}` tokens, `description:` and `tools:` maps
  untouched: for all 18 files the frontmatter segment is **byte-identical** between
  `c3d652a` and HEAD (18/18), so no permission matrix, tier token or description pin
  could have moved.
- Mirror parity green: `bun run sync-assets --check` -> exit 0,
  `plugin/assets matches 32 source files.`

## Gate results (Phase 10, raw)

| Gate | Exit | Raw result |
| --- | ---: | --- |
| `bun run sync-assets --check` | 0 | `plugin/assets matches 32 source files.` |
| `bun test` | 1 | 1,099 pass / **13 fail** / 1,112 tests, 60 files, 5,419 expect() calls |
| `bun run typecheck` | 0 | `tsc --noEmit`, no diagnostics |
| `bun run lint` | 0 | `eslint .`, no findings |
| `bun run format:check` | 0 | `All matched files use Prettier code style!` |

The 13 `bun test` failures are the known environmental set, not regressions. They are
exactly the failures produced by the seven shell/symlink suites, verified in isolation
(22 pass / 13 fail across `assemble-prompt`, `freellmapi-preset`, `install-freellmapi`,
`installer-flags`, `installer-model-resolution`, `ollama-preset`,
`opencode-go-free-preset`), so the full-suite fail set is a subset of that set and
contains zero new failures. Causes: `bash`/`sh` is unavailable on this Windows host
(child processes exit 127) and `symlinkSync` raises `EPERM` without Developer Mode.
No file under `tests/` changed on this branch, so no test-side regression is possible.

## Out-of-scope observation

`git diff --stat main...HEAD` also shows `plugin/src/runtime/opencode-plugin.ts | 4 +-`;
both hunks are doc-link comments repointed at `docs/archive/PLUGIN-V2-FEASIBILITY.md`
by Phase 9. No runtime behaviour changed.
