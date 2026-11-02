import { buildCommands, buildRoster } from "./roster-model";
import type { AgentSource } from "./roster-model";

function readGlob(modules: Record<string, string>): AgentSource[] {
  return Object.entries(modules)
    .map(([file, markdown]) => ({
      name: file.split("/").pop()?.replace(/\.md$/, "") ?? file,
      markdown,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Counts and badges come from these files. Do not hardcode the roster in the page.
const coreModules = import.meta.glob("../../agents/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const extraModules = import.meta.glob("../../extras/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const commandModules = import.meta.glob("../../command/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const roster = buildRoster(readGlob(coreModules), readGlob(extraModules));
export const commands = buildCommands(readGlob(commandModules));
