import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadOperatingMode,
  parseModeChoice,
  parseOperatingMode,
  pausesBeforeRoutineWork,
  saveOperatingMode,
  usesConciseRoutineUpdates,
} from "./mode.js";

describe("operating modes", () => {
  it("parses beginner-friendly names and rejects unrelated approvals", () => {
    expect(parseOperatingMode("guide me")).toBe("guide");
    expect(parseOperatingMode("guide")).toBe("guide");
    expect(parseOperatingMode("build-with-me")).toBe("build-with-me");
    expect(parseOperatingMode("T")).toBe("take-the-lead");
    expect(parseOperatingMode("take the lead")).toBe("take-the-lead");
    expect(parseModeChoice("stop")).toBe("stop");
    expect(parseModeChoice("commit")).toBeUndefined();
  });

  it("changes routine pauses without weakening publication boundaries", () => {
    expect(pausesBeforeRoutineWork("guide")).toBe(true);
    expect(pausesBeforeRoutineWork("build-with-me")).toBe(false);
    expect(pausesBeforeRoutineWork("take-the-lead")).toBe(false);
    expect(usesConciseRoutineUpdates("guide")).toBe(false);
    expect(usesConciseRoutineUpdates("build-with-me")).toBe(false);
    expect(usesConciseRoutineUpdates("take-the-lead")).toBe(true);
  });

  it("persists a repository preference without changing product files", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-mode-"));
    try {
      expect(await loadOperatingMode(repositoryPath)).toBeUndefined();
      await saveOperatingMode(repositoryPath, "build-with-me");
      expect(await loadOperatingMode(repositoryPath)).toBe("build-with-me");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });
});
