import { describe, expect, test } from "bun:test";

import plugin from "../plugin/src/index.ts";
import {
  loadPackagedRecall,
  loadPackagedResearchMode,
  loadPackagedStartSession,
} from "../plugin/src/command.ts";

/**
 * Regressione OpenCode 2.2 — comandi.
 *
 * In 2.2 `CommandDefinition.execute(input: CommandInvocation): Promise<void>`
 * deve INVIARE il prompt da sé (`ctx.session.prompt`) e restituire una promise:
 * l'host fa `execute(input).then(...)`. Il plugin restituiva la stringa del body,
 * quindi la TUI falliva con
 *   `Failed to set up session — t(s).then is not a function`
 * al primo `/start-session`.
 */

function harness() {
  const agents = new Map<string, Record<string, unknown>>();
  const commands: Array<Record<string, unknown>> = [];
  const prompts: Array<Record<string, unknown>> = [];
  const switched: Array<Record<string, unknown>> = [];
  const recording = (slot: unknown[]) => ({
    transform: (cb: (e: { add(a: unknown): void }) => void) => {
      cb({ add: (a) => void slot.push(a) });
    },
  });
  const ctx = {
    options: { preset: "ollama", withExtras: false },
    model: {
      list: async () => ({
        location: { directory: "C:/tmp/project" },
        data: [
          { providerID: "ollama", id: "glm-5.3-flash:cloud" },
          { providerID: "ollama", id: "beam:cloud" },
          { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
          { providerID: "ollama", id: "glm-5.3:cloud" },
          { providerID: "ollama", id: "minimax-m3.1-flash:cloud" },
        ],
      }),
    },
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
    skill: recording([]),
    tool: recording([]),
    session: {
      prompt: async (input: Record<string, unknown>) => {
        prompts.push(input);
        return { ok: true };
      },
      switchAgent: async (input: Record<string, unknown>) => {
        switched.push(input);
      },
    },
  };
  return { ctx, commands, prompts, switched };
}

describe("CommandDefinition.execute (OpenCode 2.2)", () => {
  const cases = [
    ["start-session", loadPackagedStartSession()],
    ["recall", loadPackagedRecall()],
    ["research-mode", loadPackagedResearchMode()],
  ] as const;

  for (const [name, packaged] of cases) {
    test(`/${name}: execute ritorna una promise e invia il body al modello`, async () => {
      const { ctx, commands, prompts, switched } = harness();
      await plugin.setup(ctx as never);

      const command = commands.find((entry) => entry.name === name);
      expect(command).toBeDefined();
      const execute = command?.execute as (input: unknown) => unknown;
      expect(typeof execute).toBe("function");

      const returned = execute({
        sessionID: "ses_probe",
        prompt: { text: "argomenti ignorati" },
        delivery: "queue",
      });
      expect(typeof (returned as { then?: unknown } | undefined)?.then).toBe("function");
      await returned;

      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.sessionID).toBe("ses_probe");
      expect(prompts[0]?.delivery).toBe("queue");
      expect(prompts[0]?.text).toBe(packaged.body);
      expect(switched).toEqual([{ sessionID: "ses_probe", agent: "orchestrator" }]);
    });
  }

  test("un cambio agente fallito non impedisce l'invio del prompt", async () => {
    const { ctx, commands, prompts } = harness();
    (ctx.session as { switchAgent?: unknown }).switchAgent = async () => {
      throw new Error("Agent not found: orchestrator");
    };
    const warned: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args.map(String).join(" "));

    try {
      await plugin.setup(ctx as never);
      const command = commands.find((entry) => entry.name === "start-session");
      await (command?.execute as (input: unknown) => Promise<void>)({
        sessionID: "ses_probe",
        prompt: { text: "ignored" },
        delivery: "steer",
      });
    } finally {
      console.warn = original;
    }

    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.delivery).toBe("steer");
    expect(warned.some((line) => line.includes("/start-session"))).toBe(true);
  });
});
