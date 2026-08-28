---
name: github-actions-cicd
description: >-
  GitHub Actions workflow structure and security conventions. Load before writing, reviewing, or debugging any
  .github/workflows/*.yml pipeline.
---

# GitHub Actions CI/CD Conventions

## Workflow Structure

- Split logically distinct phases into separate jobs (build, test, lint, security scan, deploy) rather than one monolithic job [web:66][web:64].
- Split deployment targets into separate workflows or jobs per environment (dev/staging/prod) with explicit GitHub Environments and required approvals for prod [web:65].
- Keep workflows simple; add complexity incrementally rather than front-loading a complex pipeline [web:65].
- Parallelize independent jobs to reduce total pipeline time [web:65].

## Caching and Performance

- Cache dependencies (npm/NuGet/pip) and build artifacts between runs using `actions/cache` [web:65].
- Reuse composite actions or reusable workflows for logic repeated across pipelines instead of copy-pasting steps.

## Security

- Store all credentials and API keys in GitHub Secrets, never in workflow YAML or committed files [web:65].
- Restrict third-party actions to pinned versions (commit SHA or exact tag), not floating `@main`/`@latest`.
- Avoid self-hosted runners on shared/production infrastructure; isolate them in a dedicated environment [web:60].
- Scope `GITHUB_TOKEN` permissions to the minimum required (`permissions:` block) rather than defaulting to full write access.

## Deployment

- Use GitHub Environments with protection rules for staging/production deploys, requiring manual approval for prod [web:65].
- Fail fast: run lint/test/security jobs before the deploy job, and make deploy depend on their success (`needs:`).

## When Reviewing or Debugging

Check for: unpinned action versions, secrets exposed in logs or `run:` commands, missing `needs:` dependencies that let deploy run before tests pass, and overly broad token permissions — these are higher priority than formatting nits.
