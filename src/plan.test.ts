import { describe, expect, it } from "vitest";

import { formatPlan } from "./format.js";
import { inspectRepository } from "./inspect.js";
import { createProductPlan } from "./plan.js";

const repositoryOverview = {
  purpose: "Turn feature requests into repository-aware product plans.",
  technologies: ["TypeScript", "Vitest"],
  structure: ["src contains the planning and formatting logic."],
  entryPoints: ["src/cli.ts receives feature requests."],
  testApproach: ["Vitest verifies plan creation and Markdown formatting."],
};

describe("createProductPlan", () => {
  it("creates a complete plan from a feature request", () => {
    const plan = createProductPlan(
      "Export a project plan as Markdown",
      repositoryOverview,
    );

    expect(plan.title).toBe("Export a project plan as Markdown");
    expect(plan.repositoryOverview).toEqual(repositoryOverview);
    expect(plan.dependencies.length).toBeGreaterThan(0);
    expect(plan.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(plan.implementationSteps.length).toBeGreaterThan(0);
    expect(plan.testPlan.length).toBeGreaterThan(0);
  });

  it("rejects an empty feature request", () => {
    expect(() => createProductPlan("   ", repositoryOverview)).toThrow(
      "A feature request is required.",
    );
  });
});

describe("formatPlan", () => {
  it("renders the important plan sections as Markdown", () => {
    const output = formatPlan(
      createProductPlan(
        "Export a project plan as Markdown",
        repositoryOverview,
      ),
    );

    expect(output).toContain("## Repository overview");
    expect(output).toContain("## Clarifying questions");
    expect(output).toContain("## Dependencies");
    expect(output).toContain("## Acceptance criteria");
    expect(output).toContain("## Implementation steps");
    expect(output).toContain("## Risks");
    expect(output).toContain("## Test plan");
  });
});

describe("inspectRepository", () => {
  it("creates an overview from this repository", async () => {
    const overview = await inspectRepository(process.cwd());

    expect(overview.purpose).toContain("Product-to-PR helps");
    expect(overview.technologies).toContain("typescript");
    expect(overview.structure).toContain("src/");
    expect(overview.entryPoints).toContain("src/cli.ts");
    expect(overview.entryPoints).not.toContain("vitest.config.ts");
    expect(overview.testApproach.some((value) => value.startsWith("test:"))).toBe(
      true,
    );
  });
});
