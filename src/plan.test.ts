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
  relevantFiles: [
    {
      path: "src/plan.ts",
      reason: "Defines the product plan.",
    },
    {
      path: "src/plan.test.ts",
      reason: "Tests product plan behavior.",
    },
  ],
  inspectionNotes: ["Searched readable source files."],
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
    expect(plan.acceptanceCriteria).toContain(
      "The completed product supports this outcome: Export a project plan as Markdown.",
    );
    expect(plan.implementationSteps).toContain(
      "Update src/plan.ts: Defines the product plan.",
    );
    expect(plan.testPlan).toContain("Update and run src/plan.test.ts.");
    expect(plan.implementationSteps.length).toBeGreaterThan(0);
    expect(plan.testPlan.length).toBeGreaterThan(0);
  });

  it("rejects an empty feature request", () => {
    expect(() => createProductPlan("   ", repositoryOverview)).toThrow(
      "A feature request is required.",
    );
  });

  it("asks feature-specific product questions", () => {
    const plan = createProductPlan(
      "Add a confidence level to every product plan",
      {
        ...repositoryOverview,
        relevantFiles: [
          ...repositoryOverview.relevantFiles,
          {
            path: "src/format.ts",
            reason: "Formats the product plan.",
          },
        ],
      },
    );

    expect(plan.clarifyingQuestions).toEqual(
      expect.arrayContaining([
        "What confidence values or scale should be supported, and what does each value mean?",
        "Should confidence be chosen by the user, calculated automatically, or both?",
        "How should the new behavior appear in the output produced by src/format.ts?",
      ]),
    );
    expect(plan.clarifyingQuestions).not.toContain(
      "Who is the primary user for this feature?",
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
    expect(output).toContain("## Relevant files");
    expect(output).toContain("src/plan.ts — Defines the product plan.");
    expect(output).toContain("## Inspection notes");
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
    const overview = await inspectRepository(
      process.cwd(),
      "Add a confidence level to every product plan",
    );

    expect(overview.purpose).toContain("Product-to-PR helps");
    expect(overview.technologies).toContain("typescript");
    expect(overview.structure).toContain("src/");
    expect(overview.entryPoints).toContain("src/cli.ts");
    expect(overview.entryPoints).not.toContain("vitest.config.ts");
    expect(overview.testApproach.some((value) => value.startsWith("test:"))).toBe(
      true,
    );
    expect(overview.relevantFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "src/format.ts",
        "src/plan.test.ts",
        "src/plan.ts",
      ]),
    );
    expect(overview.relevantFiles.every((file) => file.reason.length > 0)).toBe(
      true,
    );
    expect(overview.inspectionNotes[0]).toMatch(/^Searched \d+ readable/);
  });
});
