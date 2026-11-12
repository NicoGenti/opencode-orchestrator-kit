# External Feedback Window — Run Guide

## Purpose

This guide runs the Phase 4 external feedback window for the opencode-orchestrator-kit.
It exists to validate the v0.2.0 release with real users on their own machines before
v0.3.0 ships.

**What this window tests:** whether external users can install the kit and complete the
first guided workflow without live assistance, and where they hesitate.

**What this window does NOT do:** it does not recruit testers, run the survey, or
compile results. Those are maintainer activities. This document is the checklist the
maintainer follows.

## Timing

- **Opens:** after v0.2.0 ships.
- **Closes:** before v0.3.0 starts.
- **Blocked downstream:** Phases 5, 6, and 7 remain blocked until
  `docs/FEEDBACK-WINDOW-RESULTS.md` is filled in by the maintainer.

## Recruitment

The maintainer recruits testers. Minimum targets:

| Metric | Minimum | Notes |
| --- | --- | --- |
| External users who attempt installation | 5 | Must be outside the core team; no shared screen or live assistance. |
| Users who complete the first guided workflow without live help | 3 | See `docs/FEEDBACK-WINDOW-WALKTHROUGH.md` for the workflow definition. |

Recruiting is a maintainer task. Do not delegate it to a subagent.

## Instruments

Four documents form the feedback window:

| File | Purpose |
| --- | --- |
| `docs/FEEDBACK-WINDOW-RUN-GUIDE.md` | This checklist. |
| `docs/FEEDBACK-WINDOW-SURVEY.md` | The survey instrument, administered after the workflow. |
| `docs/FEEDBACK-WINDOW-WALKTHROUGH.md` | The first guided workflow testers attempt. |
| `docs/FEEDBACK-WINDOW-RESULTS.md` | Scaffold for compiled observations. Maintainer fills this in. |

## Run Checklist

For each tester, the maintainer:

1. **Send the setup doc.** Point the tester at `docs/SETUP-NATIVE.md` (or
   `docs/SETUP-OPENCODE-STUDIO.md` if they use OpenCode Studio). No live pairing.
2. **Send the walkthrough.** Point the tester at
   `docs/FEEDBACK-WINDOW-WALKTHROUGH.md`. They attempt it solo.
3. **Capture hesitation points.** As the tester works, note where they stall, ask
   questions, or misinterpret instructions. The known friction points to watch:
   - Provider choice
   - Agent count
   - Confirmation gate
   - Configuration file
   - Terminology
4. **Administer the survey.** After the walkthrough, send
   `docs/FEEDBACK-WINDOW-SURVEY.md`. The required question must be asked verbatim:
   > "Would you use one model for every role if multi-model setup required too much effort?"
5. **Record responses.** Enter each tester's responses and observations into
   `docs/FEEDBACK-WINDOW-RESULTS.md`. Use the scaffold tables; do not invent data.

## Data Handling

- **No real user data is committed in this repository.** The results file ships as a
  scaffold with placeholder rows and `<!-- TODO -->` markers.
- **Anonymity.** Do not record tester names, email addresses, or employer
  identifiers in the results file. Use tester IDs like `T-01`, `T-02`, etc.
- **No secrets.** Never record API keys, tokens, or provider credentials in any
  feedback document. If a tester pastes one in by accident, redact it before saving.

## Closing the Window

When the window closes, the maintainer:

1. Fills in `docs/FEEDBACK-WINDOW-RESULTS.md` with real observations.
2. Reviews the results for actionable changes.
3. Updates the relevant docs and agent definitions based on findings.
4. Unblocks Phases 5, 6, and 7.

Until step 1 is done, Phase 4 is incomplete and downstream phases remain blocked.