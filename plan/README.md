# Plan

Kanban board for phased work in this repository. Plans move left to right through four columns;
each plan is a single Markdown file.

## Columns

| Column | Folder | Meaning |
| --- | --- | --- |
| Draft | `plan/draft/` | Written but not yet approved or started. |
| In progress | `plan/in-progress/` | Approved and actively being executed. |
| QA | `plan/qa/` | Implementation complete, awaiting verification/review. |
| Complete | `plan/complete/` | Verified, accepted, and closed. |

Each folder keeps a `.gitkeep` file so the empty column is retained in version control.

A plan whose verification still records unresolved items belongs in `qa/`, **never** in
`complete/`. Only the user moves a plan into `complete/`.

## Owner

The board is owned by **exactly one** agent: **`plan-writer`** (subagent). It is the only agent
authorized to create, move, or normalise plan files here. Every other agent — including the
orchestrator, `planner`, `profiler`, the implementers and the reviewers — hands its request to
`plan-writer` and never writes or moves a plan file itself. The full contract is in the root
`AGENTS.md` section "Plan Board Lifecycle & Owner Contract".

`planner` authors plan *content* under `.context/` and hands it to `plan-writer`; it never writes
a file under this folder.

## Tooling

All board operations go through the deterministic tool (standard-library-only Python, JSON output,
exit `0` on success and `1` on a blocking error):

```
python scripts/plan-board.py check  [--root <board root>] [--json]
python scripts/plan-board.py move   --id <id> --to <column> [--comprehension <none|pass|skipped|fail|disabled|n/a>] [--root <board root>] [--dry-run] [--json]
python scripts/plan-board.py new    --id <id> --title <t> --owner <o> --executor <e> --body <file> [--column draft] [--root <board root>] [--json]
python scripts/plan-board.py adopt  --file <name> --owner <o> --executor <e> [--root <board root>] [--json]
```

The board root defaults to `plan/` relative to the process working directory; a repository that
installs the tool elsewhere invokes its copy with an explicit `--root`.

Hand-crafted moves (`mv`, `cp`, direct file writes) are forbidden: the tool is what enforces the
invariants below. Its regression suite is `tests/plan-board.test.ts`.

`check` classifies findings as follows:

- **ERROR** (exit 1): `status` does not match the containing folder; missing `id`; an `id` that is
  not the leading segment of the filename; the same `id` in more than one column; an `id` that is
  not slug-safe; a board root that does not exist.
- **WARN** (exit 0): legacy file without YAML frontmatter; a missing body section; a missing
  frontmatter key; a non-`.md` file sitting in a column; a missing column folder; a missing
  `comprehension:` key on qa/complete files.

## File naming

`<id>-<slug>.md`

- `<id>` — stable identifier (ticket number, ticket slug, or date-based id, e.g. `2026-10-14`).
- `<slug>` — short kebab-case summary, e.g. `hci-pagination-failure-fix`.

Example: `in-progress/93153-query-builder-improvements.md`

The frontmatter `id` MUST be the **leading segment** of the filename stem: the file above carries
`id: 93153-query-builder-improvements`, while `0002-v0.3.0-human-comprehension-gate.md` legitimately
carries `id: 0002`. A bare `<id>.md` file (`id: 0002` in `0002.md`) is equally valid. This is what
`plan-board.py` verifies, and it is what lets `move --id 0002` resolve the file.

A plan moves between columns by being moved to the corresponding folder. Do not duplicate a plan
across folders; keep exactly one canonical file per plan. Moving a plan — and the `status` /
`updated` frontmatter refresh that goes with it — is a single `plan-board.py move` call:

```
python scripts/plan-board.py move --id 93153-query-builder-improvements --to qa --json
```

If the same leading segment matches two files, the tool reports `plan-ambiguous` and performs
nothing: the caller must pass the full id.

## Frontmatter

Every plan file starts with YAML frontmatter:

```yaml
---
id: 93153-query-builder-improvements
title: Query builder improvements
status: draft            # draft | in-progress | qa | complete
created: 2026-10-14
updated: 2026-10-14
owner: <human or agent that owns the plan>
executor: <agent or human that will execute it>
# comprehension: pass  # recorded outcome for qa→complete moves
---
```

Frontmatter `status` MUST match the folder the file lives in.

## Plan body

The body uses the following nine sections, in order:

1. **Goal** — one sentence stating the deliverable, not the activity.
2. **Success Criteria** — observable, verifiable conditions that prove the goal is met.
3. **Scope** — what is in, what is out, and paths/surfaces that must not be touched.
4. **Safety** — applicable rules (no Git writes, secrets protection, absolute paths, destructive-command limits).
5. **Inputs Available** — context handed to the executor: prior reports, approved summaries, known file paths.
6. **Outputs Required** — the deliverables: report shape, files produced, tests run, open decisions.
7. **Test Plan** — how the output is verified (tests/checks to run and expected results).
8. **Verification** — the concrete post-work checks and pass/fail thresholds.
9. **Notes / Edge Cases** — known ambiguities, assumptions, rollback and follow-up steps.

`plan-board.py new` refuses a body that is missing any of these nine headings.

## Legacy files and `adopt`

Some plans predate this contract: they carry no YAML frontmatter and use an older naming scheme.
`check` reports them as `legacy-no-frontmatter` **warnings**, and they are exempt from the structural
checks (so an un-normalised legacy file never turns the board red). Normalising one — without
renaming it — is an explicit, separately authorised operation:

```
python scripts/plan-board.py adopt --file <name> --owner <o> --executor <e> --json
```

`adopt` derives `title` from the first `# ` heading and reports that the value must be reviewed. It
refuses a file that already carries a frontmatter (`already-has-frontmatter`): a *partial*
frontmatter is a human decision, not something the tool rewrites. Legacy files MUST NOT be adopted,
moved, or renamed without the user's explicit approval.

## Standing authorization

The user grants `plan-writer` a narrow standing authorization, limited to the board root: `check`
runs, and `move` of an already-conforming plan file between columns (including the `status` /
`updated` refresh), are covered without a fresh per-file approval, cited as
`## Approved Mutation Summary — plan-board-standing-v1`. The outcome-carrying `qa` → `complete` move
— including the `comprehension:` frontmatter refresh written atomically with it — is covered by the
same standing authorization. `new`, `adopt`, plan-body edits, and any deletion or rename are
**not** covered and require their own approved Mutation Summary.

## Minimal template

```markdown
---
id: <id>-<slug>
title: <title>
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: <owner>
executor: <executor>
---

## Goal

## Success Criteria
- 

## Scope
- In:
- Out:

## Safety
- 

## Inputs Available
- 

## Outputs Required
- 

## Test Plan
- 

## Verification
- 

## Notes / Edge Cases
- 
```
