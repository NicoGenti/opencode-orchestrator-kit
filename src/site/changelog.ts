import release from "virtual:latest-release";

import type { ChangelogRelease } from "./changelog-model";

/** Latest released section, resolved at build time from CHANGELOG.md. */
export const latestRelease: ChangelogRelease = release;
