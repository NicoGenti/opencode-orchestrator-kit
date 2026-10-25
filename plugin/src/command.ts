import { readAsset } from "./assets";

/** A kit command packaged from plugin/assets/commands/. */
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

function loadPackagedCommand(assetName: string, name: string): PackagedCommand {
  const raw = readAsset(`commands/${assetName}.md`);
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`packaged ${assetName}.md has no frontmatter block`);
  }
  const description = frontmatterValue(match[1], "description");
  const agent = frontmatterValue(match[1], "agent");
  if (!description || !agent) {
    throw new Error(
      `packaged ${assetName}.md frontmatter needs description and agent`,
    );
  }
  return {
    name,
    description,
    agent,
    body: raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(),
  };
}

/** Load the packaged /start-session command (mirrors command/start-session.md). */
export function loadPackagedStartSession(): PackagedCommand {
  return loadPackagedCommand("start-session", "start-session");
}

/** Load the packaged /recall command (mirrors command/recall.md). */
export function loadPackagedRecall(): PackagedCommand {
  return loadPackagedCommand("recall", "recall");
}

/** Load the packaged /research-mode command (mirrors command/research-mode.md). */
export function loadPackagedResearchMode(): PackagedCommand {
  return loadPackagedCommand("research-mode", "research-mode");
}
