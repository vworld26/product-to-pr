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
});
