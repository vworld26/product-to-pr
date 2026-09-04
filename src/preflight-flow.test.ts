import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runGuidedPreflight, type PreflightConversation } from "./preflight-flow.js";
import type { ProbeRequest, ReadinessProbeRunner } from "./preflight.js";
import {
  loadReadinessHistory,
  recordCompletedSession,
  recordPreflightCompleted,
} from "./readiness-history.js";

const directories: string[] = [];

async function historyFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "product-to-pr-flow-"));
  directories.push(directory);
  return join(directory, "readiness.json");
}

function scriptedConversation(answers: string[]) {
  const messages: string[] = [];
  const prompts: string[] = [];
  const conversation: PreflightConversation = {
    write(message) { messages.push(message); },
    async ask(prompt) {
      prompts.push(prompt);
      const answer = answers.shift();
      if (answer === undefined) throw new Error(`No answer for: ${prompt}`);
      return answer;
    },
  };
  return { conversation, messages, prompts };
}

function successfulRunner(overrides: Partial<Record<string, string>> = {}) {
  const calls: ProbeRequest[] = [];
  const runner: ReadinessProbeRunner = async (request) => {
    calls.push(request);
    const key = `${request.command} ${request.args.join(" ")}`;
    const values: Record<string, string> = {
      "git --version": "git version 2.50.0",
      "gh --version": "gh version 2.76.0",
      "gh auth status": "Logged in",
      "git -C /repo rev-parse --is-inside-work-tree": "true",
      "git -C /repo branch --show-current": "main",
      "git -C /repo status --porcelain": "",
      "git -C /repo rev-parse HEAD": "abc123",
      "gh api rate_limit": "{}",
      "gh api repos/{owner}/{repo}": JSON.stringify({
        full_name: "owner/repo", visibility: "private", default_branch: "main",
        permissions: { pull: true, push: true },
        security_and_analysis: { secret_scanning: { status: "enabled" } },
      }),
      "gh api repos/{owner}/{repo}/commits/main": JSON.stringify({ sha: "abc123" }),
      "gh api repos/{owner}/{repo}/branches/main": JSON.stringify({ protected: true }),
      "gh api user": JSON.stringify({ two_factor_authentication: true }),
      "codex --version": "codex 1.0",
      "codex login status": "Logged in",
      "claude --version": "claude 1.0",
      "claude auth status": JSON.stringify({ loggedIn: true }),
      ...overrides,
    };
    const value = values[key];
    if (value === undefined) throw new Error(`Unexpected probe: ${key}`);
    return { stdout: value, stderr: "" };
  };
  return { runner, calls };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("guided preflight conversation", () => {
  it("offers every provider and checks only the user's selection", async () => {
    const path = await historyFile();
    const interaction = scriptedConversation(["claude"]);
    const probes = successfulRunner();
    const outcome = await runGuidedPreflight({
      repositoryPath: "/repo", conversation: interaction.conversation,
      historyPath: path, runner: probes.runner, environment: {},
    });
    expect(outcome.provider).toBe("claude");
    expect(interaction.messages.join("\n")).toContain("Codex");
    expect(interaction.messages.join("\n")).toContain("Claude Code");
    expect(interaction.messages.join("\n")).toContain("Another AI");
    expect(probes.calls).toContainEqual({ command: "claude", args: ["auth", "status"] });
    expect(probes.calls.some((call) => call.command === "codex")).toBe(false);
  });

  it("runs before a new repository and reuses current history", async () => {
    const path = await historyFile();
    const firstConversation = scriptedConversation([]);
    const probes = successfulRunner();
    const first = await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "codex",
      conversation: firstConversation.conversation, historyPath: path, runner: probes.runner,
    });
    expect(first).toEqual({ proceed: true, provider: "codex" });
    expect(probes.calls).toContainEqual({ command: "codex", args: ["login", "status"] });

    const secondConversation = scriptedConversation([]);
    const secondProbes = successfulRunner();
    await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "codex",
      conversation: secondConversation.conversation, historyPath: path, runner: secondProbes.runner,
    });
    expect(secondProbes.calls).toEqual([]);
    expect(secondConversation.messages.join("\n")).toContain("readiness check is current");
  });

  it("uses one confirmation for non-blocking risks", async () => {
    const path = await historyFile();
    const interaction = scriptedConversation(["accept"]);
    const probes = successfulRunner({ "git -C /repo status --porcelain": " M src/file.ts" });
    const outcome = await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "codex",
      conversation: interaction.conversation, historyPath: path, runner: probes.runner,
    });
    expect(outcome.proceed).toBe(true);
    expect(interaction.prompts.filter((prompt) => prompt.includes("listed risks"))).toHaveLength(1);
  });

  it("allows blockers to be fixed and rerun", async () => {
    const path = await historyFile();
    let authAttempts = 0;
    const base = successfulRunner();
    const runner: ReadinessProbeRunner = async (request) => {
      if (request.command === "codex" && request.args.join(" ") === "login status" && authAttempts++ === 0) {
        throw new Error("Not logged in");
      }
      return base.runner(request);
    };
    const interaction = scriptedConversation(["rerun"]);
    const outcome = await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "codex",
      conversation: interaction.conversation, historyPath: path, runner,
    });
    expect(outcome.proceed).toBe(true);
    expect(authAttempts).toBe(2);
    expect(interaction.messages.join("\n")).toContain("BLOCKS WORKFLOW");
  });

  it("never executes another AI's user-supplied method", async () => {
    const path = await historyFile();
    const hostileMethod = "browser; delete everything";
    const interaction = scriptedConversation(["Example AI", hostileMethod, "confirm all"]);
    const probes = successfulRunner();
    const outcome = await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "manual",
      conversation: interaction.conversation, historyPath: path, runner: probes.runner,
    });
    expect(outcome.proceed).toBe(true);
    expect(probes.calls.every((call) => call.command === "git" || call.command === "gh")).toBe(true);
    expect(probes.calls.flatMap((call) => call.args)).not.toContain(hostileMethod);
    expect(interaction.messages.join("\n")).toContain("User confirmed");
  });

  it("offers another check after five sessions and respects not now", async () => {
    const path = await historyFile();
    await recordPreflightCompleted("/repo", "codex", path);
    for (let index = 0; index < 5; index += 1) {
      await recordCompletedSession(`session-${index}`, path);
    }
    const interaction = scriptedConversation(["not now"]);
    const probes = successfulRunner();
    const outcome = await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "codex",
      conversation: interaction.conversation, historyPath: path, runner: probes.runner,
    });
    expect(outcome.proceed).toBe(true);
    expect(probes.calls).toEqual([]);
    expect(interaction.messages.join("\n")).toContain("five more");
    expect((await loadReadinessHistory(path)).lastOfferedSessionCount).toBe(5);
  });

  it("can clear current history and run a fresh check", async () => {
    const path = await historyFile();
    await recordPreflightCompleted("/repo", "codex", path);
    const interaction = scriptedConversation([]);
    const probes = successfulRunner();
    await runGuidedPreflight({
      repositoryPath: "/repo", providerOverride: "codex", clearHistory: true,
      conversation: interaction.conversation, historyPath: path, runner: probes.runner,
    });
    expect(probes.calls.length).toBeGreaterThan(0);
    expect(interaction.messages.join("\n")).toContain("history was cleared");
  });
});
