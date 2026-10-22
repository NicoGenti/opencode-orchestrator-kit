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

/** Load the packaged /start-session command (mirrors command/start-session.md). */
export function loadPackagedStartSession(): PackagedCommand {
  const raw = readAsset("commands/start-session.md");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("packaged start-session.md has no frontmatter block");
  }
  const description = frontmatterValue(match[1], "description");
  const agent = frontmatterValue(match[1], "agent");
  if (!description || !agent) {
    throw new Error(
      "packaged start-session.md frontmatter needs description and agent",
    );
  }
  return {
    name: "start-session",
    description,
    agent,
    body: raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(),
  };
}
