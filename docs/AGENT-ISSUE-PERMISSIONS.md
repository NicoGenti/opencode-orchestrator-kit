# agent-issue runner — tool usage audit & minimal permissions (issue #27)

Documentation-only hand-off artifact. The workflow change described here must be applied by a human-authored PR: the runner token cannot push changes under `.github/workflows/`.

## 1. Scope & method

Two successful `agent:run` workflow runs for issue #19 were audited from the Actions logs:

- Run A — run 39568623813 (2026-10-21, PR #28)
- Run B — run 39438069017 (2026-10-20, PR #20)

Tool-call lines (`→ Read`, `← Edit`, `✱ Glob`, `✱ Grep`, `$ <cmd>`, `✓ <Agent>`, `! permission requested: … auto-rejecting`) were extracted per run. This is a manual, report-only task: this document is the deliverable.

## 2. Tool inventory

| Tool | Run A | Run B | Total | Notes |
| --- | --- | --- | --- | --- |
| read | 4 | 6 | 10 | plan files, `.context/progress.md`, `package.json` |
| edit | 1 | 1 | 2 | only `.context/progress.md` |
| glob | 2 | 0 | 2 | |
| grep | 0 | 1 | 1 | |
| shell (executed) | 2 | 12 | 14 | git status/log/diff, ls, `sed -i .gitignore`, `python scripts/plan-board.py move`, `bun test`, `bun run bun:audit` |
| subagent | 4 | 3 | 7 | explorer, plan-writer, test-engineer, developer-fixer delegations |
| shell (attempted, auto-rejected) | 9 | 1 | 10 | refusals originate from subagent frontmatter `bash: {"*":"ask"}` (e.g. `agents/test-engineer.md`); `ask` auto-rejects headless — NOT caused by the top-level `OPENCODE_PERMISSION` |
| write | 0 | 0 | 0 | tool does not exist in opencode 2.0.x (per `command/start-session.md`) |
| skill / webfetch / question / patch / todowrite / todoread | 0 | 0 | 0 | never invoked |

Conclusion: **6 distinct tools executed**. `question` was never invoked (forbidden by `.github/agent/agent-issue.md` anyway). The agent never pushed, opened PRs, or commented — the workflow itself does that in later steps via its own `git`/`gh` calls.

## 3. Current configuration

In `.github/workflows/agent-issue.yml`:

- Line 56 sets `OPENCODE_PERMISSION: '{"*":"allow"}'` in the job-level `env:` (lines 49–56).
- Job-level env also carries `GH_TOKEN` (line 51) and `OPENCODE_API_KEY` (line 50); both are inherited by every step, including "Run the agent" (line 143).
- The workflow declares `permissions: contents: write, issues: write, pull-requests: write` (lines 8–11).
- The guard job (lines 18–42) already restricts triggers to owner/members with the `agent:run` label or a `/agent` comment, non-PR only.

## 4. Proposed minimal `OPENCODE_PERMISSION`

Recommended value for line 56, verbatim:

```json
{
  "read": "allow",
  "glob": "allow",
  "grep": "allow",
  "subagent": "allow",
  "edit": {
    ".context/**": "allow",
    "plan/**": "allow",
    "*": "deny"
  },
  "webfetch": "deny",
  "question": "deny",
  "skill": "deny",
  "todowrite": "deny",
  "todoread": "deny",
  "patch": "deny",
  "bash": {
    "git status *": "allow",
    "git diff *": "allow",
    "git log *": "allow",
    "git show *": "allow",
    "git branch *": "allow",
    "git rev-parse *": "allow",
    "git ls-files *": "allow",
    "ls *": "allow",
    "cat *": "allow",
    "sed *": "allow",
    "/tmp/*": "allow",
    "python scripts/plan-board.py *": "allow",
    "python3 scripts/plan-board.py *": "allow",
    "python scripts/issue_bridge.py *": "allow",
    "bun *": "allow",
    "node *": "allow",
    "npm *": "allow",
    "*": "deny"
  }
}
```

Flat fallback variant (one-line diff, ~80% of the benefit):

```json
{"read":"allow","glob":"allow","grep":"allow","subagent":"allow","bash":"allow","edit":"allow","webfetch":"deny","question":"deny","skill":"deny","todowrite":"deny","todoread":"deny","patch":"deny"}
```

Design rationale:

- `edit` scoped to `.context/**` + `plan/**` — the only observed edits were `.context/progress.md`; plan moves go through `python scripts/plan-board.py`, covered by the bash allowlist.
- `.gitignore` intentionally becomes agent-uneditable: the observed `sed -i .gitignore` must not be repeatable (lesson from issue #23).
- The bash list is the union of subagent needs, so the map is correct whether the env is ANDed with or overrides agent frontmatter.
- No top-level `"*"` key (precedence vs frontmatter is unproven); no `write` key (tool does not exist in 2.0.x); the key must be `subagent`, not `task`.

## 5. Does narrowing reduce prompt-injection impact?

Partially. The guard limits who triggers; subagent frontmatter already gates children; the narrowed permission blocks webfetch exfiltration, accidental push / `sed -i`, and `question` stalls.

BUT the real exposure is `GH_TOKEN` + `OPENCODE_API_KEY` in job-level `env:` (lines 50–51), inherited by the agent step: any bash allowlist that permits an interpreter (`bun`/`node`/`python` — required here) is equivalent to unrestricted shell. Command globs are hygiene, not a boundary.

**Highest-value control: move `GH_TOKEN`/`OPENCODE_API_KEY` from job-level `env:` to step-level `env:` on exactly the steps that need them, so the agent step runs without a GitHub token.** (Larger alternative: split the agent job — `contents: read`, no token — from a publish job that applies the artifact with the write token.)

Note: `agents/developer-fixer.md` allows `git commit *` / `git push *`, so push prevention today is prompt-instruction only. `main` is protected by a ruleset; residual impact = junk branches.

## 6. Non-owner issues

Keep owner/member-only triggering. Two small hardening suggestions for the guard:

- `ASSOC` currently only considers `github.event.comment.author_association` (empty on label events, so the label path depends on a single hard-coded login) — fall back to `github.event.issue.author_association`.
- Also require the issue author (not only the commenter) to pass the owner/member check: an OWNER/MEMBER commenting `/agent` on someone else's issue would otherwise process attacker-controlled body text.

## 7. Caveats / limitations

- `ask` auto-rejects headless — avoid introducing `ask` anywhere.
- Env-vs-frontmatter precedence is unverified (stricter frontmatter can veto a global allow; the reverse is unproven) — hence the union allowlist plus the flat fallback.
- The change cannot be validated by the agent itself: merge via human-authored PR, then run a fresh smoke issue with `agent:run` (do **not** label issue #27 with `agent:run`).
- Bash globs are evadable (`sh -c`, `python -c`) — accident prevention, not a security boundary.
- The first post-merge run log is the validation: unknown keys could fail config validation.
- `agents/plan-writer.md` uses `task: deny`, likely inert — flag it, don't copy it.

## 8. Human follow-ups (out of scope for this PR)

1. Human-authored PR replacing the line 56 `OPENCODE_PERMISSION` value (recommended JSON above; flat fallback ready).
2. Move `GH_TOKEN`/`OPENCODE_API_KEY` to step-level env.
3. Smoke-test on a fresh issue.
4. Optional guard ASSOC/author hardening.
5. Tracked separately: PR-creation token (unchanged here).
