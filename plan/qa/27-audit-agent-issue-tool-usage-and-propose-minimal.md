---
id: 27-audit-agent-issue-tool-usage-and-propose-minimal
title: Audit agent-issue tool usage and propose minimal permissions (manual)
status: qa
created: 2026-10-21
updated: 2026-10-21
owner: issue-bridge
executor: orchestrator
comprehension: skipped
gh_body_sha: 69e20416f68b7d3bf6e3c57545fec3e045b6d148b643b28d23efe0c6cb40ddff
gh_issue: 27
gh_state: OPEN
gh_synced_at: 2026-10-21T09:00:14Z
---

## Goal
Audit agent-issue tool usage and propose minimal permissions (manual)

## Inputs Available
## Goal

Produce a report of the OpenCode tools actually used by the headless `agent-issue` runner and propose a minimal `OPENCODE_PERMISSION` value. This is a **manual, report-only** task.

## Why manual

The previous attempt (#23, run 39494426808) was executed by the agent itself. It edited `.github/workflows/agent-issue.yml`, and the push was rejected because `GITHUB_TOKEN` cannot push workflow changes. The agent must not be the one to change its own permissions, so this audit is done by a human. Do **not** add the `agent:run` label to this issue.

## Context

`.github/workflows/agent-issue.yml` sets `OPENCODE_PERMISSION: '{"*":"allow"}'`, with `contents: write`, `issues: write` and `pull-requests: write` on `GITHUB_TOKEN`, and `OPENCODE_API_KEY` in the job environment. Issue bodies are used as plan input, so issues authored by others could influence the agent (prompt injection).

## Steps

- [ ] Take the logs of one successful `agent:run` execution (for example the run for #19) from the Actions UI.
- [ ] List every distinct tool call: `read`, `grep`, `glob`, `shell`, `edit`, `subagent`, `skill`, `webfetch`, `question`, others.
- [ ] For each tool, note whether the run would still succeed without it.
- [ ] Draft a minimal `OPENCODE_PERMISSION` value and test it on a smoke issue.
- [ ] Decide whether issues authored by non-owners may trigger `agent:run`.

## Deliverables

- [ ] A short report (comment on this issue or `docs/AGENT-ISSUE-PERMISSIONS.md` written by hand).
- [ ] A normal PR, authored by a human, that replaces `"*":"allow"` with the minimal set.

## Non-goals

- Do not run this through `agent:run`.
- Do not change the agent prompt or the plan flow here.
- Do not change the PR-creation token; that is tracked separately.

Supersedes #23.

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

