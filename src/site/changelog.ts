import changelog from "../../CHANGELOG.md?raw";

import { parseLatestRelease } from "./changelog-model";
import type { ChangelogRelease } from "./changelog-model";
import { KIT_VERSION } from "./release";

export { parseChangelog, parseLatestRelease } from "./changelog-model";
export type { ChangelogItem, ChangelogRelease } from "./changelog-model";

/** Latest released section, read from CHANGELOG.md at build time. */
export const latestRelease: ChangelogRelease = parseLatestRelease(
  changelog,
  KIT_VERSION,
);
