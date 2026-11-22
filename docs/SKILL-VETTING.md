# Verifying skills with SkillSpector

A skill, or a companion prompt pack, runs with the permissions of the agent that loads it. SkillSpector is NVIDIA's open-source scanner built for exactly that input: point it at a skill directory and it reports what an agent would be trusting. This page is the kit's guidance for scanning a companion `web-*` pack, a project's own `project-*` skill, or any skill before you enable it. It assumes no prior use of the scanner.

The scanner, its pattern tables and its guides are upstream documents; this page links to them rather than restating their detail. Every command below was exercised against a real directory in this repository before it was written, except the Docker commands (the clone, build and run lines), which are quoted from the upstream README.

## What SkillSpector is

- Apache-2.0, maintained by NVIDIA at [github.com/NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector). It scans agent skills (Claude Code, Codex CLI, Gemini CLI, OpenCode and similar) for vulnerabilities, malicious patterns and security risks before installation.
- The pattern set is catalogued in the upstream README as **71 vulnerability patterns across 17 categories**: prompt injection, data exfiltration, privilege escalation, supply chain, excessive agency, output handling, system prompt leakage, memory poisoning, tool misuse, rogue agent, anti-refusal, trigger abuse, dangerous code (AST), taint tracking, YARA signatures, MCP least privilege, and MCP tool poisoning. The [hosted NVIDIA guide](https://docs.nvidia.com/skills/scanning-agent-skills) has quoted 68; the upstream README is the canonical count, and this page follows it.
- A report carries a `risk_score` from 0 to 100, a severity, and a recommendation. Upstream maps the score to bands: 0–20 LOW / `SAFE`, 21–50 MEDIUM / `CAUTION`, 51–80 HIGH / `DO_NOT_INSTALL`, 81–100 CRITICAL / `DO_NOT_INSTALL`.
- Two stages: fast static analysis by default, plus optional LLM semantic analysis. This kit uses the static stage only (`--no-llm`), which needs no provider, key or model.

## Install

```bash
uv tool install --python 3.13 git+https://github.com/NVIDIA/skillspector.git@v2.13.6
```

- Python 3.12 or 3.13 keeps the YARA dependency a prebuilt wheel; `--python 3.13` makes uv fetch and use its own interpreter, so no system Python is touched.
- Keep the tag. A bare `git+https://github.com/NVIDIA/skillspector.git` installs the default branch head, which changes under you; this kit pins and gates on **v2.13.6** (tag commit `e2674da`), and a scanner upgrade is a deliberate, reviewed change.
- `uv tool install` exposes the `skillspector` executable in uv's tool bin directory (often `~/.local/bin`). If the command is not found, add that directory to `PATH`; `skillspector --version` should print the pinned version.

**Docker, no Python required.** Upstream publishes no container image; the
upstream repository ships a Dockerfile, so build it once and mount the working
directory:

```bash
git clone https://github.com/NVIDIA/skillspector.git && cd skillspector
docker build -t skillspector .
docker run --rm -v "$PWD:/scan" skillspector scan ./my-skill/ --no-llm
```

**Not on PyPI.** There is no `pip install skillspector`; the supported installs are the git URL above, the source checkout, or the local Docker build.

## Scan a skill or a companion pack

```bash
skillspector scan .opencode/skills/<name>/ --no-llm
skillspector scan .opencode/skills/<name>/ --no-llm -f json
```

- **One directory per run.** `scan` takes exactly one input path; `skillspector scan skills/ agents/ extras/` is rejected with exit 2 (`Got unexpected extra arguments`). To cover several directories, run the scanner once per directory and treat the results as a union.
- `--no-llm` keeps the run static and needs no provider, key or model. `-f` selects `terminal` (default), `json`, `markdown` or `sarif`; `-o PATH` writes the report to a file. File output is unavailable on Windows (exit 2), where `-o -` prints the report to stdout instead.
- **Reading the verdict.** Start with `risk_score` and `recommendation`, then read `findings`: each entry carries a `rule_id` (for example `PE3` credential access, `EA2` autonomous decision making, `TM1` tool parameter abuse), a file and a severity. The rule ids are the upstream pattern ids, so a finding maps to a documented pattern and can be triaged without re-running the scanner.
- **Prompt packs scan the same way.** Agent and command prompts have no `SKILL.md`, and the scanner still parses them file by file: on this repository, `agents/` (16 prompts) is analysed at 100% coverage with real findings, and `extras/` and `command/` are fully analysed and clean. The target is reported as one anonymous skill named `unknown` when no `SKILL.md` anchors the directory; that affects the report identity, not the files scanned or the findings.

## Baseline workflow: gate on new findings only

A **baseline** is a committed list of finding fingerprints that a reviewer has judged and accepted. Scanning with `--baseline` drops those fingerprints *before* scoring, so the score describes only the findings that are not yet accepted. **`--fail-on-findings`** is what makes that a gate: it exits non-zero when any active finding remains.

```bash
# once, from a trusted environment: generate, then review and author every reason
skillspector baseline .opencode/skills/<name>/ --no-llm -o .skillspector-baseline.yaml

# thereafter, and in CI: only NEW findings fail
skillspector scan .opencode/skills/<name>/ --no-llm \
  --baseline .skillspector-baseline.yaml --fail-on-findings
```

- `baseline` writes `.skillspector-baseline.yaml` by default; pass `-o -` to print it to stdout (the portable option on Windows, where file output is unavailable).
- **Author the `reason` on every entry.** The generator fills each fingerprint with a placeholder ("Accepted finding (auto-generated baseline)"); leaving it is a blanket acceptance that tells a later reviewer nothing. One reason per rule-and-file pair, naming why the pattern fires and why that site is safe.
- **Fingerprints are version-bound.** An entry matches only the source and scanner version that produced it. Upgrading SkillSpector, or changing the scanned source, makes those findings active again. An upgrade therefore requires regenerating the baseline, re-triaging every delta, and recording the new version and commit in the same change. **Never regenerate a baseline in CI unattended** — the diff is the review.
- **Keep the granularity.** A directory scan and a single-skill scan produce different fingerprints (on this repository, `skills/` aggregates 19 findings while `skills/security-audit/` alone yields 12 with two extra rule ids). The baseline and the gate must use the same command over the same directory.

**How this repository does it:**

- `.skillspector-baseline.yaml` sits at the repository root, not inside `skills/` (where the asset mirror would ship it in the npm tarball). It holds 32 fingerprints, each with an authored reason, plus `tool_commit: e2674da…` and `baseline_generated`.
- The scanner is pinned to commit `e2674da…` (tag `v2.13.6`); the uv action reference is a moving major tag managed by Dependabot and cannot change the scanner version.
- `.github/workflows/test.yml` runs the four directory scans (one per path) against the baseline with `--fail-on-findings` on every pull request and every push to `main`.
- `.github/workflows/release.yml` re-runs the same gate before publishing, so a new finding stops the release before npm is invoked.

## If the scan cannot run

If there is no Python or uv, no network, or no way to execute the scanner, treat the skill or pack as **UNVETTED**. The kit recommends — but does not enforce on consumers — that you do not install or enable it until a scan succeeds. That fail-closed posture turns "the scanner was unavailable" into "not yet approved" instead of "assume it is fine".

## Residual limits

- **`--no-llm` is static analysis.** It matches patterns, AST shapes, taint flows and signatures; it does not judge intent. LLM-assisted semantic analysis exists upstream, but it needs a provider, and upstream itself warns that a low static-only score must not be read as a clean full scan. This kit does not require it.
- **SC4/OSV lookups need network when manifests exist.** The dependency check queries `api.osv.dev` for known vulnerable packages. It runs even with `--no-llm`, falls back to a bundled static list when the network is unavailable instead of failing the scan, and upstream documents no flag to disable it. The four directories this kit scans contain no dependency manifests, so the lookup has nothing to query here.
- **Static parsing has ceilings.** A parser that cannot read a file records an exception and coverage drops below 100%. The vendored `skills/security-audit/*.cjs` files hit that ceiling on this repository: `skills/` caps at 87.1% coverage (81.0% in single-skill mode). The kit therefore does **not** pass `--fail-on-incomplete` or `--min-coverage`, which would be permanently red; the gap is documented instead of hidden.
- **A passing scan is evidence, not proof.** It means no catalogued pattern matched at the analysed coverage — not that the skill is harmless.

## Exit codes and why the score alone is not a gate

- `0` — the scan completed and no gate fired.
- `1` — a gate fired: an active finding under `--fail-on-findings`, incomplete coverage under `--fail-on-incomplete`, coverage below `--min-coverage`, or a score above 50.
- `2` — usage error, unreadable input, or a malformed baseline.

The default policy only exits `1` when `risk_score > 50`. One CRITICAL finding in non-executable content is worth exactly 50 points, so a skill whose only problem is that finding scores 50 — the MEDIUM/`CAUTION` band — and exits `0`. That is why the deterministic gate is `--fail-on-findings` with a reviewed baseline, and why the score is read as triage context rather than as the pass/fail signal.
