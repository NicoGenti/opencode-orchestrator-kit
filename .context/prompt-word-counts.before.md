# Prompt body counts — before (Plan 0003, Phase 0)

Baseline for issue #121 (prompt shrink). Captured on branch
`feat/issue-121-shorten-prompts-docs` from `main@c3d652a`, **before** any prompt edit.

## Counting method

- **Body** = the file text after the closing frontmatter delimiter. The file is split with
  `maxsplit=2` on lines that are exactly `---` (trailing spaces/tabs allowed), and the third
  segment is taken with one leading newline removed. YAML frontmatter is excluded, so permission
  blocks, `model:`/tier tokens and `description:` never inflate the count.
- **Body words** = `len(body.split())`, i.e. whitespace-separated tokens (markdown syntax,
  punctuation and backticks count as part of their token).
- **Body chars** = `len(body)` in UTF-8 text with `CRLF` normalised to `LF`, so a Windows checkout
  and a Linux checkout produce the same number.
- Files covered: `agents/*.md` (16) + `extras/*.md` (2) = 18. Sorted, `agents/` before `extras/`.
- Sanity check: the totals reproduce the audit recorded in the plan card (18 files, 11,889 body
  words; `orchestrator.md` 3,221, `plan-writer.md` 1,883, `comprehension-coach.md` 839,
  `profiler.md` 804).

Re-derivable with a portable one-liner (Python 3, run from the repository root):

```bash
python -c "import re,glob;D=re.compile(r'(?m)^---[ \t]*\r?$');[print(p,len((lambda b:b.split())(re.sub(r'^\r?\n','',D.split(open(p,encoding='utf-8',newline='').read(),2)[2].replace('\r\n','\n')))),len(re.sub(r'^\r?\n','',D.split(open(p,encoding='utf-8',newline='').read(),2)[2].replace('\r\n','\n'))),sep='\t') for p in sorted(glob.glob('agents/*.md'))+sorted(glob.glob('extras/*.md'))]"
```

## Baseline

| File | Body words | Body chars |
| --- | ---: | ---: |
| `agents/build-helper.md` | 235 | 1,608 |
| `agents/code-reviewer.md` | 324 | 2,191 |
| `agents/comprehension-coach.md` | 839 | 5,426 |
| `agents/deploy-helper.md` | 298 | 2,113 |
| `agents/developer-fixer.md` | 366 | 2,403 |
| `agents/explorer.md` | 516 | 3,377 |
| `agents/librarian.md` | 188 | 1,323 |
| `agents/npm-helper.md` | 231 | 1,623 |
| `agents/oracle.md` | 369 | 2,517 |
| `agents/orchestrator-quick.md` | 488 | 3,018 |
| `agents/orchestrator.md` | 3,221 | 22,746 |
| `agents/plan-writer.md` | 1,883 | 12,488 |
| `agents/planner.md` | 424 | 2,885 |
| `agents/profiler.md` | 804 | 5,994 |
| `agents/security.md` | 482 | 3,518 |
| `agents/test-engineer.md` | 240 | 1,623 |
| `extras/pc-doctor.md` | 326 | 1,984 |
| `extras/writer.md` | 655 | 4,391 |
| **Total (18 files)** | **11,889** | **81,228** |

The "after" table for Phase 10 is computed with the same method (`agents/*.md` 16 +
`extras/*.md` 2), so the two are directly comparable.
