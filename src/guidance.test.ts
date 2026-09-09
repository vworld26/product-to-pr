import { describe, expect, it } from "vitest";

import {
  formatJourneyIntroduction,
  formatPublicationAction,
  formatSessionOpening,
  formatStageCompletion,
  formatStageIntroduction,
  journeyStages,
  type JourneyStage,
} from "./guidance.js";

const stages = Object.keys(journeyStages) as JourneyStage[];

describe("journey guidance", () => {
  it("welcomes the user before repository setup begins", () => {
    const opening = formatSessionOpening();

    expect(opening).toContain("Welcome to Product-to-PR");
    expect(opening).toContain("review-ready pull request");
    expect(opening).not.toContain("reviewed pull request");
    expect(opening).toContain("A local folder is used in place");
    expect(opening).toContain("GitHub URL requires your approval");
    expect(opening).toContain("Nothing will be merged automatically");
  });

  it("lays out the complete beginner journey before work begins", () => {
    const introduction = formatJourneyIntroduction("guide");

    expect(introduction).toContain("Here is your Product-to-PR journey");
    expect(introduction).toContain("You do not need to know the technical steps");
    expect(introduction).toContain("1. Check");
    expect(introduction).toContain("10. Separately approve");
    expect(introduction).toContain("Nothing will be merged automatically");
  });

  it("introduces and recaps every stage using one predictable rhythm", () => {
    expect(stages).toHaveLength(10);
    stages.forEach((stage, index) => {
      const introduction = formatStageIntroduction(stage, "guide");
      const completion = formatStageCompletion(stage, "guide");

      expect(introduction).toContain(`Step ${index + 1} of 10`);
      expect(introduction).toContain("Next, we’re going to");
      expect(introduction).toContain("Why this matters:");
      expect(introduction).toContain("Safety boundary:");
      expect(completion).toContain("What happened:");
      if (stage !== "publish") {
        expect(completion).toContain("Next:");
        expect(completion).not.toContain("Next: Next,");
      }
    });
  });

  it("keeps Build with me concise and Take the lead quiet", () => {
    expect(formatJourneyIntroduction("build-with-me")).toContain(
      "I’ll mark each stage",
    );
    expect(formatStageIntroduction("verify", "build-with-me")).toBe(
      "# Step 8 of 10 — Check that the project still works\n" +
        "Next: We’ll run the project’s trusted verification commands, such as its existing automated tests.",
    );
    expect(formatStageCompletion("verify", "build-with-me")).toContain(
      "Step 8 complete",
    );
    expect(formatJourneyIntroduction("take-the-lead")).toBeUndefined();
    expect(formatStageIntroduction("verify", "take-the-lead")).toBeUndefined();
    expect(formatStageCompletion("verify", "take-the-lead")).toBeUndefined();
  });

  it("explains each publication boundary before asking", () => {
    expect(formatPublicationAction("commit", "guide")).toContain(
      "remains local",
    );
    expect(formatPublicationAction("push", "guide")).toContain(
      "does not change the main branch",
    );
    expect(formatPublicationAction("pull-request", "guide")).toContain(
      "stop before merge",
    );
    expect(formatPublicationAction("commit", "take-the-lead")).toBeUndefined();
  });
});
