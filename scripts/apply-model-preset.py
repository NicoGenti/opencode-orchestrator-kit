#!/usr/bin/env python3
"""
apply-model-preset.py — Phase 1 model portability tool for opencode-orchestrator-kit.

Resolves logical model tiers ({{TIER_REASONING}}, {{TIER_CODE}}, {{TIER_FAST}})
in agent frontmatter to concrete provider/model IDs, based on a preset defined
in .opencode/models.config.json.

Usage:
  python3 scripts/apply-model-preset.py --preset opencode-go
  python3 scripts/apply-model-preset.py --preset local-ollama --agents-dir agents
  python3 scripts/apply-model-preset.py --list
  python3 scripts/apply-model-preset.py --preset commercial-api-anthropic --dry-run

Notes:
  - Idempotent: running twice with the same preset is a no-op on the second run.
  - Only rewrites the `model:` line inside the YAML frontmatter (between the
    first pair of `---` markers) of each agents/*.md (or extras/*.md) file.
  - To switch presets later, first restore tokens with --restore, or re-run
    with a different preset (it replaces whatever the current model value is,
    not just tokens, provided the same token map applies).
"""
import argparse
import json
import re
import sys
from pathlib import Path

TOKENS = ("TIER_REASONING", "TIER_CODE", "TIER_FAST")
MODEL_LINE_RE = re.compile(r"^model:\s*(\S+)\s*$", re.MULTILINE)


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        sys.exit(f"error: config file not found: {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def frontmatter_bounds(text: str):
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    return 0, end + len("\n---")


def resolve_value(current_value: str, tier_map: dict):
    for token in TOKENS:
        placeholder = "{{" + token + "}}"
        if current_value == placeholder:
            return tier_map[token]
    return None


def process_file(path: Path, tier_map: dict, dry_run: bool, force: bool) -> str:
    text = path.read_text(encoding="utf-8")
    bounds = frontmatter_bounds(text)
    if not bounds:
        return "skip (no frontmatter)"
    start, end = bounds
    fm = text[start:end]

    match = MODEL_LINE_RE.search(fm)
    if not match:
        return "skip (no model: line)"

    current_value = match.group(1)
    new_value = resolve_value(current_value, tier_map)

    if new_value is None:
        if force:
            return "skip (force not implemented for concrete->concrete; use --restore first)"
        return f"skip (model already concrete: {current_value})"

    if current_value == new_value:
        return "unchanged (already resolved)"

    new_fm = MODEL_LINE_RE.sub(f"model: {new_value}", fm, count=1)
    new_text = text[:start] + new_fm + text[end:]

    if not dry_run:
        path.write_text(new_text, encoding="utf-8")
    return f"{current_value} -> {new_value}"


def restore_tokens(path: Path, reverse_map: dict, dry_run: bool) -> str:
    text = path.read_text(encoding="utf-8")
    bounds = frontmatter_bounds(text)
    if not bounds:
        return "skip (no frontmatter)"
    start, end = bounds
    fm = text[start:end]
    match = MODEL_LINE_RE.search(fm)
    if not match:
        return "skip (no model: line)"
    current_value = match.group(1)
    token = reverse_map.get(current_value)
    if not token:
        return f"skip (no known tier for: {current_value})"
    placeholder = "{{" + token + "}}"
    if current_value == placeholder:
        return "unchanged (already a token)"
    new_fm = MODEL_LINE_RE.sub(f"model: {placeholder}", fm, count=1)
    new_text = text[:start] + new_fm + text[end:]
    if not dry_run:
        path.write_text(new_text, encoding="utf-8")
    return f"{current_value} -> {placeholder}"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--preset", help="Preset name from models.config.json")
    parser.add_argument("--config", default=".opencode/models.config.json", help="Path to models.config.json")
    parser.add_argument("--agents-dir", default="agents", help="Directory containing agent .md files")
    parser.add_argument("--list", action="store_true", help="List available presets and exit")
    parser.add_argument("--dry-run", action="store_true", help="Show planned changes without writing files")
    parser.add_argument("--restore", action="store_true", help="Rewrite concrete model IDs back to {{TIER_*}} tokens")
    parser.add_argument("--force", action="store_true", help="Reserved for future use")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    presets = config.get("presets", {})

    if args.list:
        for name, preset in presets.items():
            print(f"{name}: {preset.get('label', '')}")
            for tier, model in preset.get("models", {}).items():
                print(f"    {tier} -> {model}")
        return

    agents_dir = Path(args.agents_dir)
    if not agents_dir.is_dir():
        sys.exit(f"error: agents dir not found: {agents_dir}")

    if args.restore:
        reverse_map = {}
        for preset in presets.values():
            for tier, model in preset.get("models", {}).items():
                reverse_map[model] = tier
        for path in sorted(agents_dir.glob("*.md")):
            result = restore_tokens(path, reverse_map, args.dry_run)
            print(f"{path.name}: {result}")
        return

    if not args.preset:
        sys.exit("error: --preset is required (use --list to see options)")
    if args.preset not in presets:
        sys.exit(f"error: unknown preset '{args.preset}'. Available: {', '.join(presets)}")

    tier_map = presets[args.preset]["models"]
    missing = [t for t in TOKENS if t not in tier_map]
    if missing:
        sys.exit(f"error: preset '{args.preset}' is missing tiers: {missing}")

    print(f"Applying preset '{args.preset}' to {agents_dir}/*.md" + (" [dry-run]" if dry_run else "") if False else f"Applying preset '{args.preset}' to {agents_dir}/*.md" + (" [dry-run]" if args.dry_run else ""))
    for path in sorted(agents_dir.glob("*.md")):
        result = process_file(path, tier_map, args.dry_run, args.force)
        print(f"  {path.name}: {result}")


if __name__ == "__main__":
    main()
