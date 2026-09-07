import { describe, expect, it } from "vitest";

import {
  assertIndependentReviewer,
  buildCritiqueCommand,
  buildImplementationCritiquePrompt,
  buildSpecificationCritiquePrompt,
  independentCritiqueProvider,
  parseCritiqueResponse,
  runIndependentCritique,
  type CritiqueReport,
} from "./critique.js";
import { evaluateImplementation, evaluateSpecification } from "./evaluation.js";
import type { ProductPlan } from "./plan.js";
import type { LocalChangeEvidence, LocalReview } from "./review.js";

const plan: ProductPlan = {
  title: "Explain quality",
  summary: "Help a contributor understand what evidence supports a proposed change.",
  repositoryOverview: {
    purpose: "Create plans.", technologies: ["TypeScript"], structure: ["src/"],
    entryPoints: ["src/cli.ts"], testApproach: ["npm test"],
    instructionContext: { instructions: [], fallbackFiles: [], warnings: [], authoringState: "missing" },
    relevantFiles: [{ path: "src/plan.ts", reason: "Creates plans." }],
    inspectionNotes: ["Inspected source files."],
  },
  clarifyingQuestions: [],
  productDecisions: ["Confirmed by user: Show evidence."],
  dependencies: [],
  acceptanceCriteria: ["A user can see supporting evidence."],
  implementationSteps: ["Update src/plan.ts with supporting evidence."],
  risks: [],
  testPlan: ["Test the main outcome.", "Test invalid evidence.", "Run all existing tests."],
};

const review: LocalReview = {
  changedFiles: ["src/plan.ts"], changeDigest: "digest", diffSummary: "1 file changed",
  verification: [{
    name: "test", command: "npm test", executable: "npm", args: ["test"],
    passed: true, output: "passed",
  }],
  acceptance: [{
    criterion: plan.acceptanceCriteria[0], status: "passed", evidence: "A test passed.",
  }],
  recoveryGuidance: ["Review the evidence before committing."],
};

const evidence: LocalChangeEvidence = {
  changedFiles: ["src/plan.ts"], diffSummary: "1 file changed",
  diff: "diff --git a/src/plan.ts b/src/plan.ts", changeDigest: "digest",
};

const report: CritiqueReport = {
  artifact: "specification", reviewer: "claude", independent: true,
  summary: "One omission needs review.",
  findings: [{
    category: "omission", severity: "important", summary: "Missing empty state",
    evidence: "No empty-state criterion is listed.",
    recommendation: "Add an observable empty-state criterion.",
  }],
};

describe("independent critique", () => {
  it("grounds prompts in the canonical evaluation and forbids consequential actions", () => {
    const specificationPrompt = buildSpecificationCritiquePrompt(
      plan,
      evaluateSpecification(plan),
    );
    const implementationPrompt = buildImplementationCritiquePrompt(
      plan,
      review,
      evidence,
      evaluateImplementation(plan, review),
    );

    expect(specificationPrompt).toContain("Canonical evaluation and rubric evidence");
    expect(specificationPrompt).toContain("unsupported claims");
    expect(implementationPrompt).toContain(evidence.diff);
    expect(implementationPrompt).toContain("Do not edit files, run commands, approve work");
  });

  it("selects the other supported provider and rejects an unproven reviewer", async () => {
    expect(independentCritiqueProvider("codex")).toBe("claude");
    expect(independentCritiqueProvider("claude")).toBe("codex");
    expect(independentCritiqueProvider("manual")).toBeUndefined();
    expect(() => assertIndependentReviewer("codex", "codex")).toThrow(
      "not demonstrably independent",
    );

    let selected = "";
    const result = await runIndependentCritique(
      "codex",
      "specification",
      "prompt",
      async (provider) => {
        selected = provider;
        return report;
      },
    );
    expect(selected).toBe("claude");
    expect(result.independent).toBe(true);
    await expect(runIndependentCritique(
      "codex",
      "specification",
      "prompt",
      async () => ({ ...report, reviewer: "codex" }),
    )).rejects.toThrow("does not match");
    await expect(runIndependentCritique("manual", "implementation", "prompt"))
      .rejects.toThrow("cannot prove");
  });

  it("uses non-editing commands for both automated reviewers", () => {
    const codex = buildCritiqueCommand("codex", "/temporary/review");
    const claude = buildCritiqueCommand("claude", "/temporary/review");
    expect(codex.args).toContain("read-only");
    expect(codex.args).not.toContain("workspace-write");
    expect(claude.args).toContain("plan");
    expect(claude.args.at(-1)).toBe("");
    expect(claude.args.join(" ")).not.toMatch(/acceptEdits|\bEdit\b|\bWrite\b/);
  });

  it("rejects malformed or unsupported reviewer output safely", () => {
    expect(() => parseCritiqueResponse("claude", "specification", "not json"))
      .toThrow("unreadable response");
    expect(() => parseCritiqueResponse(
      "codex",
      "implementation",
      JSON.stringify({ summary: "Review", findings: [{ category: "invented" }] }),
    )).toThrow("incomplete response");
  });
});
