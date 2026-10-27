/**
 * Regressione: OpenCode 2.2 restituisce `{ location, data }` da `ctx.model.list()`
 * (2.1 restituiva un array nudo). `setup()` deve accettare entrambe le forme:
 * sulla forma a oggetto lanciava `TypeError: registry.some is not a function`
 * prima di qualunque registrazione.
 */
import { describe, expect, test } from "bun:test";

import plugin from "../plugin/src/index.ts";

const REGISTRY = [
  { providerID: "opencode-go", id: "beam-free" },
  { providerID: "opencode-go", id: "minimax-m3.1-flash-free" },
];

function harness(registry: unknown) {
  const agents = new Map<string, Record<string, unknown>>();
  const commands: unknown[] = [];
  const skills: unknown[] = [];
  const tools: unknown[] = [];
  const recording = (slot: unknown[]) => ({
    transform: (cb: (e: { add(a: unknown): void }) => void) => {
      cb({ add: (a) => void slot.push(a) });
    },
  });
  const ctx = {
    options: { preset: "opencode-go-free", withExtras: false },
    model: { list: async () => registry },
    agent: {
      transform: async (cb: (e: unknown) => void) => {
        cb({
          get: (id: string) => agents.get(id),
          update: (id: string, fn: (agent: Record<string, unknown>) => void) => {
            const agent = agents.get(id) ?? { id, name: id, mode: "primary" };
            fn(agent);
            agents.set(id, agent);
          },
          default: () => {},
          remove: (id: string) => void agents.delete(id),
          list: () => [...agents.values()],
        });
      },
    },
    command: recording(commands),
    skill: recording(skills),
    tool: recording(tools),
  };
  return { ctx, agents, commands, skills, tools };
}

describe("ctx.model.list(): forma 2.1 (array) e 2.2 ({location,data})", () => {
  test("(2.2) forma a oggetto: setup completa e registra il roster", async () => {
    const { ctx, agents, commands, skills, tools } = harness({
      location: { directory: "C:/tmp/project" },
      data: REGISTRY,
    });

    await plugin.setup(ctx as never);

    expect(agents.size).toBe(15);
    expect((agents.get("orchestrator")?.permissions as unknown[]).length).toBe(25);
    expect(agents.get("plan-writer")?.mode).toBe("subagent");
    expect(commands).toHaveLength(3);
    expect(skills).toHaveLength(9);
    expect(tools).toHaveLength(1);
  });

  test("(2.1) forma ad array: comportamento invariato", async () => {
    const { ctx, agents } = harness(REGISTRY);

    await plugin.setup(ctx as never);

    expect(agents.size).toBe(15);
    expect((agents.get("orchestrator")?.permissions as unknown[]).length).toBe(25);
  });
});
