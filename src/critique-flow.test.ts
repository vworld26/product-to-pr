import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseCritiqueChoice,
  runCritiqueFlow,
} from "./critique-flow.js";
import type { CritiqueReport } from "./critique.js";

const report: CritiqueReport = {
  artifact: "specification", reviewer: "claude", independent: true,
  summary: "The evidence is consistent.", findings: [],
};

describe("critique flow", () => {
  it("requires an explicit informed choice before invoking a provider", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-critique-flow-"));
    const messages: string[] = [];
    let calls = 0;
    try {
      const result = await runCritiqueFlow({
        repositoryPath,
        artifact: "specification",
        producer: "codex",
        prompt: "private plan evidence",
        conversation: {
          ask: async () => "skip",
          write: (message) => messages.push(message),
        },
        runner: async () => {
          calls += 1;
          return report;
        },
      });
      expect(result).toEqual({ status: "skipped" });
      expect(calls).toBe(0);
      expect(messages.join("\n")).toContain("sends the displayed specification");
      expect(messages.join("\n")).toContain("cannot edit, approve, publish, or merge");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("runs the other provider only after consent and displays its report", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-critique-flow-"));
    const messages: string[] = [];
    try {
      const result = await runCritiqueFlow({
        repositoryPath,
        artifact: "specification",
        producer: "codex",
        prompt: "evidence",
        conversation: {
          ask: async () => "run",
          write: (message) => messages.push(message),
        },
        runner: async (provider, artifact, prompt) => {
          expect([provider, artifact, prompt]).toEqual(["claude", "specification", "evidence"]);
          return report;
        },
      });
      expect(result.status).toBe("completed");
      expect(messages.join("\n")).toContain("Independent specification critique");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("saves a provider-neutral fallback without invoking a model", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-critique-flow-"));
    let calls = 0;
    try {
      const result = await runCritiqueFlow({
        repositoryPath,
        artifact: "implementation",
        producer: "manual",
        prompt: "review this exact evidence",
        createdAt: new Date("2026-09-06T12:00:00.000Z"),
        conversation: {
          ask: async () => "manual",
          write: () => undefined,
        },
        runner: async () => {
          calls += 1;
          return { ...report, artifact: "implementation" };
        },
      });
      expect(result.status).toBe("manual-handoff");
      expect(calls).toBe(0);
      if (result.status === "manual-handoff") {
        expect(await readFile(result.promptPath, "utf8")).toBe("review this exact evidence");
      }
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("falls back safely when the independent provider cannot finish", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-critique-flow-"));
    try {
      const result = await runCritiqueFlow({
        repositoryPath,
        artifact: "specification",
        producer: "codex",
        prompt: "evidence",
        createdAt: new Date("2026-09-06T12:00:00.000Z"),
        conversation: { ask: async () => "run", write: () => undefined },
        runner: async () => { throw new Error("provider unavailable"); },
      });
      expect(result.status).toBe("manual-handoff");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("parses only the three documented choices", () => {
    expect(parseCritiqueChoice("R")).toBe("run");
    expect(parseCritiqueChoice("manual")).toBe("manual");
    expect(parseCritiqueChoice("skip")).toBe("skip");
    expect(parseCritiqueChoice("approve")).toBeUndefined();
  });
});
