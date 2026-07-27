import { describe, expect, it } from "vitest";

import { formatPlan } from "./format.js";
import { createProductPlan } from "./plan.js";

describe("createProductPlan", () => {
  it("creates a complete plan from a feature request", () => {
    const plan = createProductPlan("Export a project plan as Markdown");

    expect(plan.title).toBe("Export a project plan as Markdown");
    expect(plan.dependencies.length).toBeGreaterThan(0);
    expect(plan.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(plan.implementationSteps.length).toBeGreaterThan(0);
    expect(plan.testPlan.length).toBeGreaterThan(0);
  });

  it("rejects an empty feature request", () => {
    expect(() => createProductPlan("   ")).toThrow(
      "A feature request is required.",
    );
  });
});

describe("formatPlan", () => {
  it("renders the important plan sections as Markdown", () => {
    const output = formatPlan(
      createProductPlan("Export a project plan as Markdown"),
    );

    expect(output).toContain("## Clarifying questions");
    expect(output).toContain("## Dependencies");
    expect(output).toContain("## Acceptance criteria");
    expect(output).toContain("## Implementation steps");
    expect(output).toContain("## Risks");
    expect(output).toContain("## Test plan");
  });
});
