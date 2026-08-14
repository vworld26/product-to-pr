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
        relevantFiles: [],
        inspectionNotes: ["Searched readable source files."],
      },
      ["Should existing files be overwritten? — No, fail safely."],
    );

    expect(prompt).toContain("Should existing files be overwritten?");
    expect(prompt).toContain("Convert these answers into explicit productDecisions.");
  });
});
