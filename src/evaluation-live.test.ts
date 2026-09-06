import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { runLiveSpecificationEvaluation } from "./evaluation-live.js";

describe("opt-in live evaluation harness", () => {
  it("uses synthetic fixtures in an isolated temporary folder", async () => {
    const directories: string[] = [];
    const requests: string[] = [];
    const results = await runLiveSpecificationEvaluation(
      async (repositoryPath, featureRequest, repositoryOverview) => {
        directories.push(repositoryPath);
        requests.push(featureRequest);
        expect(repositoryPath).not.toBe(process.cwd());
        expect(repositoryOverview.relevantFiles[0].path).toBe("src/plan.ts");
        return {
          title: "Evaluate a fixture",
          summary: "Help a product contributor understand the requested outcome and the decisions still needed.",
          recommendedDefaults: [],
          clarifyingQuestions: [],
          productDecisions: ["Repository evidence: The existing plan builder is the likely change point."],
          dependencies: [],
          acceptanceCriteria: ["A user can complete the requested outcome."],
          implementationSteps: ["Update src/plan.ts for the requested outcome."],
          risks: [],
          testPlan: [
            "Test the main user outcome.",
            "Test missing and invalid information.",
            "Run all existing tests for regressions.",
          ],
        };
      },
    );

    expect(results).toHaveLength(2);
    expect(requests).toContain("Automatically publish completed work.");
    expect(results.every((result) => result.report.passed)).toBe(true);
    await expect(access(directories[0])).rejects.toThrow();
    expect(new Set(directories)).toHaveLength(1);
  });
});
