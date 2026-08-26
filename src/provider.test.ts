import { describe, expect, it, vi } from "vitest";

import {
  assertImplementationProviderReady,
  parseImplementationProvider,
} from "./provider.js";

describe("implementation providers", () => {
  it("parses Codex, Claude Code, and manual handoff choices", () => {
    expect(parseImplementationProvider("codex")).toBe("codex");
    expect(parseImplementationProvider("L")).toBe("claude");
    expect(parseImplementationProvider("claude code")).toBe("claude");
    expect(parseImplementationProvider("another ai")).toBe("manual");
    expect(parseImplementationProvider("unknown")).toBeUndefined();
  });

  it("checks an automated provider before implementation", async () => {
    const probe = vi.fn(async () => undefined);

    await assertImplementationProviderReady("codex", { probe });

    expect(probe).toHaveBeenCalledWith("codex");
  });

  it("does not require a local command for manual handoff", async () => {
    const probe = vi.fn(async () => undefined);

    await assertImplementationProviderReady("manual", { probe });

    expect(probe).not.toHaveBeenCalled();
  });

  it("directs nested Claude Code sessions to manual handoff", async () => {
    const probe = vi.fn(async () => undefined);

    await expect(
      assertImplementationProviderReady("claude", {
        environment: { CLAUDECODE: "1" },
        probe,
      }),
    ).rejects.toThrow("inside an existing Claude Code session");
    expect(probe).not.toHaveBeenCalled();
  });

  it("explains how to recover when a provider is unavailable", async () => {
    const missingProvider = Object.assign(new Error("missing"), {
      code: "ENOENT",
    });

    await expect(
      assertImplementationProviderReady("claude", {
        environment: {},
        probe: async () => {
          throw missingProvider;
        },
      }),
    ).rejects.toThrow("Install and authenticate it, or choose manual handoff");
  });
});
