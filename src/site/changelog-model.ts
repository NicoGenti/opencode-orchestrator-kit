/** Pure changelog parsing. No Vite imports, so `bun test` can load it. */
export interface ChangelogItem {
  title: string;
  body: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  items: ChangelogItem[];
}

const RELEASE_HEADING = /^##\s+\[([^\]]+)\]\s*(.*)$/;
const RELEASE_DATE = /^(?:[—–-]\s*)?(\d{4}-\d{2}-\d{2})\b/;
const TOP_LEVEL_BULLET = /^- \*\*(.+?)\*\*:?\s*(.*)$/;

interface RawSection {
  version: string;
  date: string;
  lines: string[];
}

function splitSections(changelog: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | undefined;

  for (const line of changelog.split(/\r?\n/)) {
    const heading = RELEASE_HEADING.exec(line);
    if (heading) {
      const dateMatch = RELEASE_DATE.exec(heading[2]);
      current = {
        version: heading[1].trim(),
        date: dateMatch ? dateMatch[1] : "",
        lines: [],
      };
      sections.push(current);
      continue;
    }
    // Any other top-level heading ends the current release section, so a
    // bullet under a later `### Added` header still belongs to its release.
    if (/^##\s/.test(line)) {
      current = undefined;
      continue;
    }
    current?.lines.push(line);
  }

  return sections;
}

function sectionItems(lines: string[]): ChangelogItem[] {
  const items: ChangelogItem[] = [];
  for (const line of lines) {
    // Only top-level `- **Title**: body` bullets. `###` subheaders and
    // nested bullets are ignored.
    const match = TOP_LEVEL_BULLET.exec(line);
    if (!match) continue;
    const title = match[1].trim();
    if (!title) continue;
    items.push({ title, body: match[2].trim() });
  }
  return items;
}

export function parseChangelog(changelog: string): ChangelogRelease[] {
  return splitSections(changelog).map((section) => ({
    version: section.version,
    date: section.date,
    items: sectionItems(section.lines),
  }));
}

/**
 * The release for `version`, else the newest released (non-Unreleased)
 * section. The Unreleased heading is never returned.
 */
export function parseLatestRelease(
  changelog: string,
  version: string,
): ChangelogRelease {
  const released = parseChangelog(changelog).filter(
    (release) => release.version.toLowerCase() !== "unreleased",
  );
  const wanted = version.trim().replace(/^v/, "");
  const chosen =
    released.find((release) => release.version === wanted) ?? released[0];
  if (!chosen) {
    throw new Error(`CHANGELOG.md has no released section for ${version}`);
  }
  return chosen;
}

/**
 * Presentation-only shortening for the What's new cards: drop inline code
 * backticks, flatten Markdown links to their text, collapse whitespace, and
 * cut at a word boundary with one trailing ellipsis. The parser stays intact.
 */
export function shortenBody(body: string, max = 280): string {
  const plain = body
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, Math.max(max - 1, 0));
  const boundary = cut.lastIndexOf(" ");
  const head = (boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd();
  return `${head}…`;
}
