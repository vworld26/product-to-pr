import { describe, expect, it } from "vitest";

import { buildReasoningPrompt } from "./reason.js";

describe("buildReasoningPrompt", () => {
  it("gives the AI the feature request and repository evidence", () => {
    const prompt = buildReasoningPrompt(
      "Let users save a product plan to a file",
      {
        purpose: "Turn ideas into product plans.",
        technologies: ["TypeScript"],
        structure: ["src/"],
        entryPoints: ["src/cli.ts"],
        testApproach: ["Vitest"],
        instructionContext: {
          instructions: [],
          fallbackFiles: ["README.md", "package.json"],
          warnings: ["No AGENTS.md instructions were found."],
          authoringState: "missing",
        },
        relevantFiles: [
          {
            path: "src/format.ts",
            reason: "Formats the plan.",
          },
        ],
        inspectionNotes: ["Searched readable source files."],
      },
    );

    expect(prompt).toContain("Let users save a product plan to a file");
    expect(prompt).toContain("src/format.ts");
    expect(prompt).toContain("Do not edit files or run commands.");
    expect(prompt).toContain("Start with product discovery");
    expect(prompt).toContain("what the feature does, who it helps");
    expect(prompt).toContain("Confirmed by user:");
    expect(prompt).toContain("recommended default");
  });

  it("includes user answers for a revised specification", () => {
    const prompt = buildReasoningPrompt(
      "Let users save a product plan to a file",
      {
        purpose: "Turn ideas into product plans.",
        technologies: ["TypeScript"],
        structure: ["src/"],
        entryPoints: ["src/cli.ts"],
        testApproach: ["Vitest"],
        instructionContext: {
          instructions: [],
          fallbackFiles: ["README.md", "package.json"],
          warnings: ["No AGENTS.md instructions were found."],
          authoringState: "missing",
        },
        relevantFiles: [],
        inspectionNotes: ["Searched readable source files."],
      },
      ["Should existing files be overwritten? — No, fail safely."],
    );

    expect(prompt).toContain("Should existing files be overwritten?");
    expect(prompt).toContain("Convert these answers into explicit productDecisions.");
    expect(prompt).toContain("Label decisions based on direct user answers");
  });
});
