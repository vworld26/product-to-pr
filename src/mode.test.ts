import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildWithMeOfferExplanation,
  loadOperatingMode,
  operatingModes,
  parseBuildWithMeOfferChoice,
  parseModeChoice,
  parseOperatingMode,
  pausesBeforeRoutineWork,
  requestsBuildWithMe,
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

  it("keeps canonical labels and descriptions in one product contract", () => {
    expect(operatingModes).toEqual({
      guide: {
        label: "Guide me",
        description:
          "Explain each stage and ask before implementation and verification.",
      },
      "build-with-me": {
        label: "Build with me",
        description:
          "Handle routine implementation and verification, then bring back the review.",
      },
      "take-the-lead": {
        label: "Take the lead",
        description:
          "Move through routine work with less explanation while preserving safety stops.",
      },
    });
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

  it("recognizes explicit requests for fewer routine pauses without inferring from feature wording", () => {
    expect(requestsBuildWithMe("Can we go faster?")).toBe(true);
    expect(requestsBuildWithMe("There are too many questions")).toBe(true);
    expect(requestsBuildWithMe("I want fewer explanations")).toBe(true);
    expect(requestsBuildWithMe("Make the website faster")).toBe(false);
    expect(requestsBuildWithMe("The feature automates reports")).toBe(false);
    expect(parseBuildWithMeOfferChoice("yes")).toBe("accept");
    expect(parseBuildWithMeOfferChoice("no")).toBe("decline");
    expect(buildWithMeOfferExplanation).toContain("will not remove approvals");
  });
});
