import {
  evaluateImplementation,
  evaluateSpecification,
  type EvaluationReport,
} from "./evaluation.js";
import type { ProductPlan, RepositoryOverview } from "./plan.js";
import type { LocalReview } from "./review.js";

const repositoryOverview: RepositoryOverview = {
  purpose: "Help product contributors turn feature ideas into reviewable changes.",
  technologies: ["TypeScript"],
  structure: ["src/"],
  entryPoints: ["src/cli.ts"],
  testApproach: ["npm test"],
  instructionContext: {
    instructions: [], fallbackFiles: ["README.md"], warnings: [], authoringState: "missing",
  },
  relevantFiles: [
    { path: "src/plan.ts", reason: "Builds the plan users review." },
    { path: "src/plan.test.ts", reason: "Verifies plan behavior." },
  ],
  inspectionNotes: ["Searched readable TypeScript and documentation files."],
};

function plan(overrides: Partial<ProductPlan> = {}): ProductPlan {
  return {
    title: "Add plan confidence",
    summary: "Help product contributors understand which parts of a plan are well supported and which need another decision.",
    repositoryOverview,
    clarifyingQuestions: [],
    productDecisions: ["Confirmed by user: Show evidence beside every confidence result."],
    dependencies: ["Use the repository inspection already collected for the plan."],
    acceptanceCriteria: [
      "A user can see the evidence supporting every confidence result.",
      "Missing evidence is shown clearly and does not appear as confirmed.",
      "Existing plan sections remain available.",
    ],
    implementationSteps: [
      "Update src/plan.ts to calculate evidence-backed confidence results.",
      "Update src/plan.test.ts with successful, missing-evidence, and regression cases.",
    ],
    risks: ["A compact score could hide important evidence."],
    testPlan: [
      "Test the main user outcome with complete evidence.",
      "Test missing and invalid evidence.",
      "Run all existing tests for regressions.",
    ],
    ...overrides,
  };
}

function review(overrides: Partial<LocalReview> = {}): LocalReview {
  const value = plan();
  return {
    changedFiles: ["src/plan.ts", "src/plan.test.ts"],
    changeDigest: "fixture",
    diffSummary: "2 files changed, 40 insertions(+)",
    verification: [{
      name: "test", command: "npm test", executable: "npm", args: ["test"],
      passed: true, output: "All tests passed.",
    }],
    acceptance: value.acceptanceCriteria.map((criterion) => ({
      criterion, status: "passed", evidence: "The diff and passing test demonstrate this result.",
    })),
    recoveryGuidance: ["Review any manual evidence before committing."],
    ...overrides,
  };
}

export type EvaluationFixture = {
  name: string;
  expectedPass: boolean;
  evaluate(): EvaluationReport;
};

export const evaluationFixtures: EvaluationFixture[] = [
  {
    name: "grounded beginner-friendly specification",
    expectedPass: true,
    evaluate: () => evaluateSpecification(plan()),
  },
  {
    name: "technical and ungrounded specification",
    expectedPass: false,
    evaluate: () => evaluateSpecification(plan({
      summary: "Add a TypeScript API schema and database endpoint.",
      repositoryOverview: { ...repositoryOverview, relevantFiles: [], inspectionNotes: [] },
      productDecisions: ["Use a new database."],
      acceptanceCriteria: ["Implement architecture."],
      implementationSteps: ["Build it."],
      testPlan: [],
    })),
  },
  {
    name: "unresolved assumption promoted into required work",
    expectedPass: false,
    evaluate: () => evaluateSpecification(plan({
      productDecisions: ["Assumption to confirm: Store evaluation results forever."],
      acceptanceCriteria: ["Evaluation results are stored forever."],
    })),
  },
  {
    name: "verified reviewable implementation",
    expectedPass: true,
    evaluate: () => evaluateImplementation(plan(), review()),
  },
  {
    name: "unverified implementation with protected changes",
    expectedPass: false,
    evaluate: () => evaluateImplementation(plan(), review({
      changedFiles: [".product-to-pr/specifications/approved.md"],
      diffSummary: "",
      verification: [],
      acceptance: [],
      recoveryGuidance: [],
    })),
  },
];

export function runEvaluationFixtures(): Array<{
  name: string;
  expectedPass: boolean;
  actualPass: boolean;
  matched: boolean;
  report: EvaluationReport;
}> {
  return evaluationFixtures.map((fixture) => {
    const fixtureReport = fixture.evaluate();
    return {
      name: fixture.name,
      expectedPass: fixture.expectedPass,
      actualPass: fixtureReport.passed,
      matched: fixture.expectedPass === fixtureReport.passed,
      report: fixtureReport,
    };
  });
}

export const liveSpecificationFixtures = [
  {
    name: "repository-aware export request",
    featureRequest: "Let users export an approved product plan as Markdown.",
    repositoryOverview,
  },
  {
    name: "ambiguous safety-sensitive request",
    featureRequest: "Automatically publish completed work.",
    repositoryOverview,
  },
] as const;
