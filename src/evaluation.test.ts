import { describe, expect, it } from "vitest";

import {
  evaluateImplementation,
  evaluateSpecification,
  formatEvaluationReport,
  implementationRubric,
  specificationRubric,
} from "./evaluation.js";
import { runEvaluationFixtures } from "./evaluation-fixtures.js";
import type { ProductPlan } from "./plan.js";
import type { LocalReview } from "./review.js";

const plan: ProductPlan = {
  title: "Explain plan confidence",
  summary: "Help a product contributor see what is well supported and what still needs a decision.",
  repositoryOverview: {
    purpose: "Create reviewable plans.", technologies: ["TypeScript"],
    structure: ["src/"], entryPoints: ["src/cli.ts"], testApproach: ["npm test"],
    instructionContext: { instructions: [], fallbackFiles: [], warnings: [], authoringState: "missing" },
    relevantFiles: [{ path: "src/plan.ts", reason: "Builds plans." }],
    inspectionNotes: ["Searched source files."],
  },
  clarifyingQuestions: [],
  productDecisions: ["Confirmed by user: Show evidence for every result."],
  dependencies: [],
  acceptanceCriteria: ["A user can see evidence for every result."],
  implementationSteps: ["Update src/plan.ts to add evidence-backed results."],
  risks: [],
  testPlan: [
    "Test the main user outcome.",
    "Test missing and invalid evidence.",
    "Run all existing tests for regressions.",
  ],
};

const review: LocalReview = {
  changedFiles: ["src/plan.ts"],
  changeDigest: "digest",
  diffSummary: "1 file changed",
  verification: [{
    name: "test", command: "npm test", executable: "npm", args: ["test"],
    passed: true, output: "passed",
  }],
  acceptance: [{
    criterion: plan.acceptanceCriteria[0], status: "passed", evidence: "Covered by the passing test.",
  }],
  recoveryGuidance: ["Review manual evidence before committing."],
};

describe("canonical evaluation rubrics", () => {
  it("keeps stable, explicit standards for specifications and implementations", () => {
    expect(specificationRubric.map((item) => item.id)).toEqual([
      "plain-language-summary", "repository-grounding", "requirement-sources",
      "observable-acceptance", "verification-plan",
    ]);
    expect(implementationRubric.map((item) => item.id)).toEqual([
      "scope-control", "verification-evidence", "acceptance-evidence",
      "reviewability", "recovery-guidance",
    ]);
    expect([...specificationRubric, ...implementationRubric]
      .every((item) => item.standard.length > 20)).toBe(true);
  });

  it("passes a grounded specification and explains every score", () => {
    const result = evaluateSpecification(plan);
    expect(result).toMatchObject({ artifact: "specification", passed: true, score: 10, maximumScore: 10 });
    expect(result.findings.every((item) => item.evidence.length > 0)).toBe(true);
    expect(formatEvaluationReport(result)).toContain("not a substitute for their evidence");
  });

  it("fails unsupported requirements instead of hiding them in a total score", () => {
    const result = evaluateSpecification({
      ...plan,
      productDecisions: ["Assumption to confirm: Save every result forever."],
      acceptanceCriteria: ["Every result is saved forever."],
    });
    const discipline = result.findings.find((item) => item.criterion.id === "requirement-sources");
    expect(result.passed).toBe(false);
    expect(discipline).toMatchObject({ score: 0, status: "does-not-meet" });
    expect(discipline?.evidence).toContain("Unresolved assumption");
  });

  it("evaluates implementation evidence separately from the plan", () => {
    expect(evaluateImplementation(plan, review)).toMatchObject({
      artifact: "implementation", passed: true, score: 10,
    });
    const unsafe = evaluateImplementation(plan, {
      ...review,
      changedFiles: [".product-to-pr/specifications/approved.md"],
      verification: [], acceptance: [], recoveryGuidance: [], diffSummary: "",
    });
    expect(unsafe.passed).toBe(false);
    expect(unsafe.findings.find((item) => item.criterion.id === "scope-control")?.evidence)
      .toContain("Protected artifact");
  });

  it("keeps every deterministic fixture aligned with its expected outcome", () => {
    const results = runEvaluationFixtures();
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.every((fixture) => fixture.matched)).toBe(true);
  });
});
