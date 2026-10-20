# Measurement and research

These sections were moved from the root README. Content is unchanged.

## Measurement (v0.4.0, /recall since v0.5.0)

The gate measures, not just gates. Each evaluation gets a **DCI score**
(`DCI=<score>/<available_score>`, 0-2 per dimension), compared against a
self-estimate (1-5) asked at session opening. Results land in an append-only
telemetry log (`.context/comprehension-log.md`, metrics-only, untracked by
design) that `/start-session` never loads. Calibrate the prompt tiers in
`docs/CONFIGURATION.md`.

Since v0.5.0, the manual `/recall` command re-tests comprehension from memory
(questions first, code after) and appends delayed `type=dci1` rows to the same
log. Since v0.6.7 each `/recall` targets **one evaluation**: pick it from the
numbered candidate list and the flow loads its stored questions from the flat
per-evaluation record `.context/comprehension/<evaluation-id>.md` (falling back
to reconstructing them from the plan document). The immediate baseline is
immutable: every recall is a NEW row, never a rewrite. **Retention =
DCI1/DCI0**: an operational engineering metric, not a scientifically validated
one.

## Research (since v0.6.0)

An opt-in experiment layer answering the framing question of the whole
measurement effort: how much human comprehension is preserved per unit of
additional inference.

`/research-mode on` (explicit confirmation required, or `research.enabled` in
the configuration as the same explicit opt-in) starts an A/B crossover whose
slots are **behavioral, not labels**: slot A (control) runs the normal
workflow with no comprehension gate (no questions, 0 coach calls), slot B
(treatment) runs the same task with the full comprehension gate; the slot
alternates deterministically in activation order. Each completed task appends
exactly one JSON object (a 19-field metric tuple, `ResearchTupleV1`, tagged
with a stable `research_id` that links the baseline and any later `/recall`
rows) with normalised `user_confidence` and `evaluator_confidence` to
`.context/research-dataset.jsonl` (metrics only, untracked by design, never
loaded by `/start-session`; full contract in `command/research-mode.md`).
Since v0.6.4 the dataset sits behind a **hard boundary**: it is truly
append-only (a `/recall` row is a NEW event linked by `research_id`, with no
backfill and no rewrite of existing rows), read only inside an active research
lifecycle, never at bootstrap; a user-facing **Behavioral A/B flow** example
shows the simulated turn transcript: gate pass and gate fail with their
19-field tuples.

The headline metric is the **Cognitive Overhead Ratio (COR)**: comprehension
tokens over total task tokens, compared across A/B pairs (e.g. `bugfix_ref`
traces a later bugfix plan back to the plan under test). COR is an
operational engineering metric, not a scientifically validated one: ad-hoc
analysis only. When the mode is off, the dataset is never read and never
written: zero overhead. Privacy invariant: No source code and no personal
answers are ever written to the dataset.
