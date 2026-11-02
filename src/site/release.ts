import pluginPackage from "../../plugin/package.json";

/** npm package version. The landing page and the release link both read this. */
export const KIT_VERSION: string = pluginPackage.version;

export const SITE_URL =
  "https://nicogenti.github.io/opencode-orchestrator-kit/";
export const REPO_URL =
  "https://github.com/NicoGenti/opencode-orchestrator-kit";
export const NPM_URL =
  "https://www.npmjs.com/package/opencode-orchestrator-kit";
export const RELEASE_URL = `${REPO_URL}/releases/tag/v${KIT_VERSION}`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
export const INSTALL_DOCS_URL = `${REPO_URL}#install-on-opencode-2-plugin--recommended`;
export const MIGRATION_URL = `${REPO_URL}/blob/main/docs/MIGRATION-V1-V2.md`;
export const STUDIO_DOCS_URL = `${REPO_URL}/blob/main/docs/SETUP-OPENCODE-STUDIO.md`;
