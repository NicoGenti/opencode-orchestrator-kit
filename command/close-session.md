---
description: Close the session by having the orchestrator flush pending session-memory updates and shut down cleanly without starting new work.
agent: orchestrator
---

Session is ending. Run your close-out cycle and then stop — do not start any new work.

1. **Finalize `progress.md`**: using the `write` tool (full overwrite — this file is a snapshot, not a log), record the final session state: stack, current `Current state`, what was completed (`Done`), and pending `Next steps` with one pointer line per active/recent plan. For multi-phase plans, the pointer line MUST carry the current phase (e.g. `- Plan #0012 (worker pipeline): in-progress — Phase 3b of 14 — see plan/in-progress/0012-worker-pipeline.md`). If a plan reached `plan/complete/` this session, remove its pointer line from `progress.md` — the plan file itself is the permanent record.

2. **Audit comprehension announcements**: for every task/plan closed this session, confirm a classification (NONE/LIGHT/DEEP) was announced to the user and, for LIGHT/DEEP, a final outcome was recorded; if missing, classify and announce now — before finalizing `progress.md`.

3. **Flush pending appends**: using the `edit` tool (append-only), add any pending decisions to `.context/decisions.md` and any pending issues to `.context/issues.md`. Format: `- YYYY-MM-DD: <content> — <why/status>`. Keep every entry to bullet points only, maximum 5-10 lines. Skip if there is nothing to add — do not invent entries.

4. **Archive oversized files**: if any `.context/*.md` file exceeds roughly 3,000 tokens, move its content to `.context/archive/<name>-<date>.md` and restart the live file empty (a fresh header is enough; the next session will repopulate it). Do this for each file independently — only archive what actually crossed the threshold.

5. **Close out cleanly**: report in 2-3 lines, in the user's language (the language the user is speaking — this project is language-agnostic at the user-facing interface), what was finalized (which files were updated/archived) and confirm no new work was started. The command file itself stays in English; only the user-facing report is dynamic. Then stop and wait for the next session.

Do not delegate new tasks, do not edit plan bodies, and do not modify `PROJECT-PROFILE.md` — that is `profiler`'s scope. If a write/edit to `.context/` is denied by the permission layer, report the exact path and error verbatim instead of silently skipping the update.