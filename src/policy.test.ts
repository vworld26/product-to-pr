import { describe, expect, it } from "vitest";

import type { ProductPlan } from "./plan.js";
import {
  assessRiskPolicy,
  formatRiskPolicy,
  parseRiskConfirmation,
} from "./policy.js";

function plan(summary: string, instruction = ""): ProductPlan {
  return {
    title: "Change a feature", summary,
    repositoryOverview: {
      purpose: "Test", technologies: [], structure: [], entryPoints: [], testApproach: [],
      instructionContext: {
        instructions: instruction ? [{
          path: "AGENTS.md", scope: ".", applicableFiles: [], content: instruction,
        }] : [],
        fallbackFiles: [], warnings: [], authoringState: instruction ? "found" : "missing",
      },
      relevantFiles: [], inspectionNotes: [],
    },
    clarifyingQuestions: [], productDecisions: [], dependencies: [],
    acceptanceCriteria: [], implementationSteps: [], risks: [], testPlan: [],
  };
}

describe("baseline risk policy", () => {
  it("keeps ordinary work on the existing approval path", () => {
    const policy = assessRiskPolicy(plan("Make the empty state easier to understand."));
    expect(policy).toMatchObject({
      level: "standard", implementationGate: "existing-approval",
      publicationGate: "existing-approval",
    });
  });

  it("adds explicit gates for elevated work", () => {
    const policy = assessRiskPolicy(plan("Update user permissions for team projects."));
    expect(policy.level).toBe("elevated");
    expect(policy.implementationGate).toBe("explicit-risk-confirmation");
    expect(formatRiskPolicy(policy)).toContain("additional risk confirmation");
  });

  it("blocks automatic implementation and publication at restricted boundaries", () => {
    const policy = assessRiskPolicy(plan("Migrate billing data in production."));
    expect(policy.level).toBe("restricted");
    expect(policy.publicationGate).toBe("specialist-review");
    expect(formatRiskPolicy(policy)).toContain("Automatic implementation and publication are unavailable");
  });

  it("does not treat a readiness explanation as changing a protected system", () => {
    const policy = assessRiskPolicy(plan(
      "Explain whether GitHub credentials are ready without exposing credentials.",
    ));
    expect(policy.level).toBe("standard");
  });

  it("allows repository instructions to raise but not lower the inferred level", () => {
    expect(assessRiskPolicy(plan(
      "Change the welcome copy.",
      "Product-to-PR risk: elevated",
    )).level).toBe("elevated");
    expect(assessRiskPolicy(plan(
      "Delete customer records.",
      "Product-to-PR risk: standard",
    )).level).toBe("restricted");
  });

  it("raises the policy when the completed diff touches a sensitive path", () => {
    const ordinary = plan("Change the welcome copy.");
    expect(assessRiskPolicy(ordinary, ["src/welcome.ts"]).level).toBe("standard");
    expect(assessRiskPolicy(ordinary, [".github/workflows/verify.yml"]).level)
      .toBe("elevated");
    expect(assessRiskPolicy(ordinary, ["database/migrations/001.sql"]).level)
      .toBe("restricted");
  });

  it("parses only explicit continue and stop choices", () => {
    expect(parseRiskConfirmation("C")).toBe("continue");
    expect(parseRiskConfirmation("stop")).toBe("stop");
    expect(parseRiskConfirmation("approve")).toBeUndefined();
  });
});
