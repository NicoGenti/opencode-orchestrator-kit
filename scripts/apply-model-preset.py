#!/usr/bin/env python3
"""
apply-model-preset.py — Phase 1 model portability tool for opencode-orchestrator-kit.

Resolves logical model tiers ({{TIER_ROUTER}}, {{TIER_REASONING}}, {{TIER_CODE}},
{{TIER_FAST}}, {{TIER_REVIEW}}) in agent frontmatter to concrete provider/model
IDs, based on a preset defined in .opencode/models.config.json (or the
committed template at templates/models.config.json).

Tier roles (canonical):
  TIER_ROUTER    — orchestrator / routing agent
  TIER_REASONING — deep reasoning, architecture, security, planning
  TIER_CODE      — implementation, tests, code authoring
  TIER_FAST      — lightweight utility / high-throughput tasks
  TIER_REVIEW    — general correctness / quality review

Required tiers: TIER_REASONING, TIER_CODE, TIER_FAST (the original three).
Optional tiers: TIER_ROUTER, TIER_REVIEW (fall back to TIER_REASONING and
TIER_CODE respectively when omitted from a preset).

Usage:
  python3 scripts/apply-model-preset.py --preset default
  python3 scripts/apply-model-preset.py --preset default --agents-dir agents
  python3 scripts/apply-model-preset.py --list
  python3 scripts/apply-model-preset.py --preset default --dry-run

Notes:
  - Idempotent: running twice with the same preset is a no-op on the second run.
  - Only rewrites the `model:` line inside the YAML frontmatter (between the
    first pair of `---` markers) of each agents/*.md (or extras/*.md) file.
  - To switch presets later, first restore tokens with --restore, or re-run
    with a different preset (it replaces whatever the current model value is,
    not just tokens, provided the same token map applies).
  - --restore uses canonical-order tie-breaking when the same model ID maps to
    multiple tiers across presets (first tier in canonical TOKENS order wins)
    and emits a stderr warning when ambiguous.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Canonical five-token list, in canonical order.
TOKENS = (
    "TIER_ROUTER",
    "TIER_REASONING",
    "TIER_CODE",
    "TIER_FAST",
    "TIER_REVIEW",
)

# Required subset. Only these three must be present in every valid preset.
REQUIRED_TOKENS = ("TIER_REASONING", "TIER_CODE", "TIER_FAST")

# Optional tiers that fall back to a required tier when omitted.
TIER_FALLBACKS = {
    "TIER_ROUTER": "TIER_REASONING",
    "TIER_REVIEW": "TIER_CODE",
}

MODEL_LINE_RE = re.compile(r"^model:\s*(\S+)\s*$", re.MULTILINE)
PLACEHOLDER_PREFIX = "placeholder/"


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
            return tier_map.get(token)
    return None


def apply_fallbacks(preset_models: dict) -> dict:
    """One-hop fallback: TIER_ROUTER -> TIER_REASONING, TIER_REVIEW -> TIER_CODE."""
    out = dict(preset_models)
    for token in TOKENS:
        if token in out and out[token]:
            continue
        fallback = TIER_FALLBACKS.get(token)
        if fallback and out.get(fallback):
            out[token] = out[fallback]
    return out


def has_placeholder(value: str) -> bool:
    return isinstance(value, str) and value.startswith(PLACEHOLDER_PREFIX)


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


def build_reverse_map(presets: dict) -> tuple:
    """
    Build a reverse model->tier map from all presets combined.

    Determinism rule: when the same concrete model ID maps to multiple
    tiers across presets, the first tier encountered in canonical TOKENS
    order wins. The losing tiers are returned in `ambiguous` so the caller
    can warn rather than silently pick one.
    """
    reverse_map: dict = {}
    ambiguous: list = []
    # Iterate presets in stable sorted order, then each preset's tiers in
    # canonical TOKENS order, so the first assignment is deterministic.
    for preset_name in sorted(presets.keys()):
        preset = presets[preset_name]
        for tier in TOKENS:
            model = preset.get("models", {}).get(tier)
            if not model:
                continue
            if not isinstance(model, str) or not model:
                continue
            if model in reverse_map:
                existing = reverse_map[model]
                if existing != tier:
                    ambiguous.append(
                        f"{model}: already mapped to {existing}, "
                        f"ignored mapping to {tier} (preset {preset_name})"
                    )
                continue
            if has_placeholder(model):
                # Skip placeholder values for the reverse map — they cannot
                # round-trip back to a tier without leaking the placeholder.
                continue
            reverse_map[model] = tier
    return reverse_map, ambiguous


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
            for tier in TOKENS:
                model = preset.get("models", {}).get(tier)
                if model:
                    marker = " [placeholder]" if has_placeholder(model) else ""
                    print(f"    {tier} -> {model}{marker}")
        return

    agents_dir = Path(args.agents_dir)
    if not agents_dir.is_dir():
        sys.exit(f"error: agents dir not found: {agents_dir}")

    if args.restore:
        reverse_map, ambiguous = build_reverse_map(presets)
        if ambiguous:
            print(
                f"warning: {len(ambiguous)} ambiguous model-to-tier mapping(s); "
                "using canonical-order tie-breaking.",
                file=sys.stderr,
            )
            for entry in ambiguous:
                print(f"  - {entry}", file=sys.stderr)
        for path in sorted(agents_dir.glob("*.md")):
            result = restore_tokens(path, reverse_map, args.dry_run)
            print(f"{path.name}: {result}")
        return

    if not args.preset:
        sys.exit("error: --preset is required (use --list to see options)")
    if args.preset not in presets:
        sys.exit(f"error: unknown preset '{args.preset}'. Available: {', '.join(presets)}")

    raw_tier_map = presets[args.preset]["models"]
    missing = [t for t in REQUIRED_TOKENS if t not in raw_tier_map]
    if missing:
        sys.exit(f"error: preset '{args.preset}' is missing required tier(s): {', '.join(missing)}")

    tier_map = apply_fallbacks(raw_tier_map)

    placeholders = [t for t in TOKENS if t in tier_map and has_placeholder(tier_map[t])]
    if placeholders:
        sys.exit(
            f"error: preset '{args.preset}' has unresolved placeholder(s) for tier(s): "
            f"{', '.join(placeholders)}. Run scripts/validate-models.sh and edit the "
            "preset before applying."
        )

    suffix = " [dry-run]" if args.dry_run else ""
    print(f"Applying preset '{args.preset}' to {agents_dir}/*.md{suffix}")
    for path in sorted(agents_dir.glob("*.md")):
        result = process_file(path, tier_map, args.dry_run, args.force)
        print(f"  {path.name}: {result}")


if __name__ == "__main__":
    main()