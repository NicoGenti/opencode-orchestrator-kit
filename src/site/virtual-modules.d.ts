declare module "virtual:latest-release" {
  import type { ChangelogRelease } from "./changelog-model";

  const release: ChangelogRelease;
  export default release;
}
