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
  instructionContext: {
    instructions: [],
    fallbackFiles: ["README.md", "package.json"],
    warnings: ["No AGENTS.md instructions were found."],
    authoringState: "missing" as const,
  },
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
      "A user can successfully: Export a project plan as Markdown.",
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

  it("uses AI-generated product reasoning when provided", () => {
    const plan = createProductPlan(
      "Let users save a product plan to a file",
      repositoryOverview,
      {
        title: "Save product plans",
        summary: "Allow users to preserve a generated plan.",
        recommendedDefaults: [],
        clarifyingQuestions: ["Which file format should be supported first?"],
        productDecisions: [
          "Confirmed by user: Saving is explicitly requested.",
        ],
        dependencies: ["Use the existing formatter output."],
        acceptanceCriteria: ["A user can save the generated plan."],
        implementationSteps: ["Add an explicit output option."],
        risks: ["An existing file could be overwritten."],
        testPlan: ["Verify the saved content matches the displayed plan."],
      },
    );

    expect(plan.summary).toBe("Allow users to preserve a generated plan.");
    expect(plan.title).toBe("Save product plans");
    expect(plan.clarifyingQuestions).toEqual([
      "Which file format should be supported first?",
    ]);
    expect(plan.productDecisions).toEqual([
      "Confirmed by user: Saving is explicitly requested.",
    ]);
    expect(plan.acceptanceCriteria).toEqual([
      "A user can save the generated plan.",
    ]);
    expect(plan).not.toHaveProperty("recommendedDefaults");
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
    expect(output).toContain("## Repository instructions");
    expect(output).toContain("No `AGENTS.md` instructions were found.");
    expect(output).toContain("## Instruction fallback files");
    expect(output).toContain("README.md");
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

  it("renders discovered instructions with their scope and content", () => {
    const output = formatPlan(
      createProductPlan(
        "Inspect repository instructions",
        {
          ...repositoryOverview,
          instructionContext: {
            instructions: [
              {
                path: "AGENTS.md",
                scope: ".",
                applicableFiles: ["src/plan.ts"],
                content: "# Repository rules\n\nUse Conventional Commits.\n",
              },
            ],
            fallbackFiles: [],
            warnings: [],
            authoringState: "found",
          },
        },
      ),
    );

    expect(output).toContain("### AGENTS.md");
    expect(output).toContain("Scope: .");
    expect(output).toContain("Applicable relevant files: src/plan.ts");
    expect(output).toContain("Use Conventional Commits.");
  });

  it("renders a clear relevant-files state when no likely files are found", () => {
    const output = formatPlan(
      createProductPlan("Inspect an empty repository", {
        ...repositoryOverview,
        relevantFiles: [],
      }),
    );

    expect(output).toContain("## Relevant files");
    expect(output).toContain("- No likely relevant files identified.");
  });
});

describe("inspectRepository", () => {
  it("creates an overview from this repository", async () => {
    const overview = await inspectRepository(
      process.cwd(),
      "Add a confidence level to every product plan",
    );

    expect(overview.purpose).toContain("Product-to-PR");
    expect(overview.technologies).toContain("typescript");
    expect(overview.structure).toContain("src/");
    expect(overview.entryPoints).toContain("src/cli.ts");
    expect(overview.entryPoints).not.toContain("vitest.config.ts");
    expect(overview.testApproach.some((value) => value.startsWith("test:"))).toBe(
      true,
    );
    expect(overview.instructionContext.authoringState).toBe("found");
    expect(
      overview.instructionContext.instructions.map((instruction) => instruction.path),
    ).toContain("AGENTS.md");
    expect(overview.relevantFiles.length).toBeGreaterThan(0);
    expect(overview.relevantFiles.some((file) => file.path.startsWith("src/")))
      .toBe(true);
    expect(overview.relevantFiles.some((file) => file.path.includes(".test.")))
      .toBe(true);
    expect(overview.relevantFiles.every((file) => file.reason.length > 0)).toBe(
      true,
    );
    expect(
      overview.relevantFiles.every((file) =>
        !file.reason.includes("matching:") &&
        !file.reason.includes("related to:")
      ),
    ).toBe(true);
    expect(overview.inspectionNotes[0]).toMatch(/^Searched \d+ readable/);
  });
});
