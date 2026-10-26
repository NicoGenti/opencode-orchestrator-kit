/**
 * V1 frontmatter (`permission` map + `tools` map) → OpenCode 2 `permissions`
 * ordered rule list. Contract source: https://opencode.ai/v2/docs/permissions
 * (read 2026-10-26) — `{action, resource, effect}`, LAST MATCHING RULE WINS,
 * no match → `ask`, host base policy is `allow *`. V2 renames `bash`→`shell`
 * and `task`→`subagent`, and folds `edit`/`write`/`patch` into `edit`.
 */
import type { FrontmatterMap } from "./frontmatter-map";

export type PermissionEffect = "allow" | "ask" | "deny";

/** One entry of the V2 ordered permission rule list. */
export interface PermissionRule {
  action: string;
  resource: string;
  effect: PermissionEffect;
}

const EFFECTS: readonly PermissionEffect[] = ["allow", "ask", "deny"];

/** V1 action → V2 action, for the names that are NOT identity-mapped. */
export const V1_TO_V2_ACTION: Readonly<Record<string, string>> = {
  bash: "shell",
  task: "subagent",
  patch: "edit",
  write: "edit",
};

/** MCP (`<server>_<tool>`) and plugin-defined actions pass through unchanged. */
export function mapAction(v1Action: string): string {
  return V1_TO_V2_ACTION[v1Action] ?? v1Action;
}

/**
 * V2 wildcards are whole-value and `*` matches zero or more characters
 * INCLUDING `/`, so V1 globstar segments are redundant: `plan/**` and `plan/*`
 * are the same pattern, and leaving `plan/**` + `/` + `*.md` would wrongly
 * require a second slash before the file name.
 */
export function normalizeResource(resource: string): string {
  let out = resource.replace(/\/\*\*\//g, "/");
  while (out.startsWith("**/")) out = out.slice(3);
  return out;
}

function isEffect(value: unknown): value is PermissionEffect {
  return typeof value === "string" && (EFFECTS as readonly string[]).includes(value);
}

/** deny > ask > allow — merged catch-alls fold to the most restrictive one. */
function strongest(effects: PermissionEffect[]): PermissionEffect {
  if (effects.includes("deny")) return "deny";
  if (effects.includes("ask")) return "ask";
  return "allow";
}

interface Bucket {
  catchAlls: PermissionEffect[];
  exceptions: PermissionRule[];
}

/**
 * Translate one agent's V1 frontmatter into the V2 ordered rule list.
 *
 * Ordering rules (all verified by tests/plugin-permissions.test.ts):
 *  1. `tools: {x: false}` denies are emitted first, so `permission` refines them.
 *  2. A top-level `"*"` key becomes the global fallback, emitted before anything.
 *  3. Within an action, the `*` catch-all comes BEFORE the exceptions, because
 *     V2 resolves last-match-wins while V1 resolved by specificity.
 *  4. Groups folding onto the same V2 action are concatenated in declaration
 *     order, catch-alls folded with deny > ask > allow.
 */
export function toV2Permissions(
  permission: FrontmatterMap | undefined,
  tools: FrontmatterMap | undefined,
): PermissionRule[] {
  const rules: PermissionRule[] = [];
  const buckets = new Map<string, Bucket>();
  const actionOrder: string[] = [];
  let globalFallback: PermissionEffect | undefined;

  for (const [tool, value] of Object.entries(tools ?? {})) {
    if (value === false) {
      rules.push({ action: mapAction(tool), resource: "*", effect: "deny" });
    }
  }

  const bucketFor = (action: string): Bucket => {
    const existing = buckets.get(action);
    if (existing) return existing;
    const created: Bucket = { catchAlls: [], exceptions: [] };
    buckets.set(action, created);
    actionOrder.push(action);
    return created;
  };

  for (const [key, value] of Object.entries(permission ?? {})) {
    const action = mapAction(key);
    if (action === "*") {
      if (!isEffect(value)) {
        throw new Error(`permission."*" must be allow|ask|deny (got ${JSON.stringify(value)})`);
      }
      globalFallback = value;
      continue;
    }
    const bucket = bucketFor(action);
    if (typeof value !== "object") {
      if (!isEffect(value)) {
        throw new Error(`permission.${key} must be allow|ask|deny (got ${JSON.stringify(value)})`);
      }
      bucket.catchAlls.push(value);
      continue;
    }
    for (const [rawResource, effect] of Object.entries(value)) {
      if (!isEffect(effect)) {
        throw new Error(
          `permission.${key}.${rawResource} must be allow|ask|deny (got ${JSON.stringify(effect)})`,
        );
      }
      if (rawResource === "*") {
        bucket.catchAlls.push(effect);
      } else {
        bucket.exceptions.push({ action, resource: normalizeResource(rawResource), effect });
      }
    }
  }

  if (globalFallback !== undefined) {
    rules.unshift({ action: "*", resource: "*", effect: globalFallback });
  }
  for (const action of actionOrder) {
    const bucket = buckets.get(action);
    if (!bucket) continue;
    if (bucket.catchAlls.length > 0) {
      rules.push({ action, resource: "*", effect: strongest(bucket.catchAlls) });
    }
    rules.push(...bucket.exceptions);
  }

  const seen = new Set<string>();
  return rules.filter((rule) => {
    const signature = `${rule.action}\u0000${rule.resource}\u0000${rule.effect}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/** Agent that owns the plan-board lifecycle (AGENTS.md, "Standing authorization"). */
export const BOARD_ROOT_OWNER = "plan-writer";

/** Pattern covering every plan file of the resolved board root, in V2 syntax. */
export const BOARD_ROOT_PATTERN = "plan/*.md";

/**
 * Kit-level rules appended AFTER the frontmatter translation. Appended last, so
 * no agent-declared `allow` can weaken them (last match wins). V1 frontmatter
 * was looser than the AGENTS.md contract: it let every agent write `plan/**`
 * and even gave the orchestrator `plan/**` write access — Phase 5 closes that.
 */
export function kitInvariantRules(agentId: string): PermissionRule[] {
  if (agentId === BOARD_ROOT_OWNER) return [];
  return [{ action: "edit", resource: BOARD_ROOT_PATTERN, effect: "deny" }];
}

/**
 * V2 whole-value wildcard match: `*` = zero or more characters (including `/`),
 * `?` = exactly one, everything else literal. Case-insensitive, mirroring the
 * runtime behaviour on Windows (both sides are lower-cased).
 *
 * Divergence, intentional: the runtime also lets a shell pattern ending in
 * ` *` match the bare command; this matcher does not. No kit invariant depends
 * on it, and adding the special case would hide real ordering bugs.
 */
export function matchesPattern(pattern: string, value: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(value.toLowerCase());
}

/**
 * Effective effect of `action` on `resource`: last matching rule wins; with no
 * match the host base policy (`allow *`) applies, hence the `allow` default.
 */
export function resolveEffect(
  rules: PermissionRule[],
  action: string,
  resource: string,
): PermissionEffect {
  let effect: PermissionEffect = "allow";
  for (const rule of rules) {
    if (matchesPattern(rule.action, action) && matchesPattern(rule.resource, resource)) {
      effect = rule.effect;
    }
  }
  return effect;
}

/** Sample path used to probe the board-root invariant. */
const BOARD_SAMPLE = "plan/qa/13-example.md";
/** Sample application path used to probe the orchestrator invariant. */
const APP_SAMPLE = "src/app.ts";

/**
 * Fail-fast guard run once per agent before registration: the kit must never
 * ship an agent that can edit application code (orchestrator) or plan files
 * (everyone but the board owner).
 */
export function assertKitPermissionInvariants(agentId: string, rules: PermissionRule[]): void {
  const expectations: Array<{ action: string; resource: string; effect: PermissionEffect }> = [
    {
      action: "edit",
      resource: BOARD_SAMPLE,
      effect: agentId === BOARD_ROOT_OWNER ? "allow" : "deny",
    },
  ];
  if (agentId === "orchestrator") {
    expectations.push({ action: "edit", resource: APP_SAMPLE, effect: "deny" });
  }
  for (const expectation of expectations) {
    const actual = resolveEffect(rules, expectation.action, expectation.resource);
    if (actual !== expectation.effect) {
      throw new Error(
        `[opencode-orchestrator-kit] permission invariant violated for '${agentId}': ` +
          `${expectation.action} on '${expectation.resource}' resolved to '${actual}', expected '${expectation.effect}'`,
      );
    }
  }
}
