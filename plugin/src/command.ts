import { readAsset } from "./assets";

/** The /start-session command packaged from plugin/assets/commands/. */
export interface PackagedCommand {
  name: string;
  description: string;
  agent: string;
  /** Markdown body of the command file (frontmatter stripped, trimmed). */
  body: string;
}

function frontmatterValue(
  frontmatter: string,
  key: string,
): string | undefined {
  const value = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter)?.[1];
  return value?.trim();
}

/**
 * Loads one packaged command by asset stem (e.g. "start-session") from
 * `plugin/assets/commands/<stem>.md`, mirroring the repo-root source
 * command/<stem>.md exactly: same frontmatter parse, same trimmed body.
 * The name IS the asset stem. Throws when the asset is missing (packaging
 * parity decides what is packaged) or lacks description/agent frontmatter.
 */
export function loadPackagedCommand(assetStem: string): PackagedCommand {
  const raw = readAsset(`commands/${assetStem}.md`);
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`packaged ${assetStem}.md has no frontmatter block`);
  }
  const description = frontmatterValue(match[1], "description");
  const agent = frontmatterValue(match[1], "agent");
  if (!description || !agent) {
    throw new Error(
      `packaged ${assetStem}.md frontmatter needs description and agent`,
    );
  }
  return {
    name: assetStem,
    description,
    agent,
    body: raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(),
  };
}

/** Load the packaged /start-session command (thin wrapper, Phase 1 parity). */
export function loadPackagedStartSession(): PackagedCommand {
  return loadPackagedCommand("start-session");
}
