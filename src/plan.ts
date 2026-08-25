import type { InstructionContext } from "./instructions.js";

export type RelevantFile = {
  path: string;
  reason: string;
};

export type RepositoryOverview = {
  purpose: string;
  technologies: string[];
  structure: string[];
  entryPoints: string[];
  testApproach: string[];
  instructionContext: InstructionContext;
  relevantFiles: RelevantFile[];
  inspectionNotes: string[];
};

export type ProductPlan = {
  title: string;
  summary: string;
  repositoryOverview: RepositoryOverview;
  clarifyingQuestions: string[];
  productDecisions: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  implementationSteps: string[];
  risks: string[];
  testPlan: string[];
};

export type ProductReasoning = Pick<
  ProductPlan,
  | "title"
  | "summary"
  | "clarifyingQuestions"
  | "productDecisions"
  | "dependencies"
  | "acceptanceCriteria"
  | "implementationSteps"
  | "risks"
  | "testPlan"
>;

function toTitle(featureRequest: string): string {
  const trimmed = featureRequest.trim().replace(/[.!?]+$/, "");
  return trimmed.length <= 72 ? trimmed : `${trimmed.slice(0, 69)}...`;
}

export function createProductPlan(
  featureRequest: string,
  repositoryOverview: RepositoryOverview,
  reasoning?: ProductReasoning,
): ProductPlan {
  const request = featureRequest.trim();

  if (!request) {
    throw new Error("A feature request is required.");
  }

  const strongestMatches = repositoryOverview.relevantFiles.slice(0, 3);
  const implementationSteps = strongestMatches
    .filter(
      (file) =>
        !file.path.includes(".test.") && !file.path.includes(".spec."),
    )
    .map((file) => `Update ${file.path}: ${file.reason}`);
  const testFiles = repositoryOverview.relevantFiles
    .filter((file) => file.path.includes(".test.") || file.path.includes(".spec."))
    .map((file) => file.path);

  const fallbackReasoning: ProductReasoning = {
    title: toTitle(request),
    summary: `Make this request possible: ${request}`,
    clarifyingQuestions: [
      `What should someone see or be able to do when "${request}" is finished?`,
      "What choices or rules should guide how this works?",
    ],
    productDecisions: [],
    dependencies: [
      "Find out which existing screens, tools, and information this change needs.",
      "Check whether any outside tools or permissions are needed.",
      "Answer the important product questions before starting the work.",
    ],
    acceptanceCriteria: [
      `A user can successfully: ${request}.`,
      "The product clearly explains invalid or missing information.",
      "Everything that worked before still works.",
    ],
    implementationSteps: [
      "Answer the remaining product and technical questions.",
      ...implementationSteps,
      "Build the simplest complete version of the user experience.",
      "Add automated tests for the new behavior and key problems.",
      "Check the finished work against every acceptance criterion.",
    ],
    risks: [
      "Some important product choices may still be unclear.",
      "The change may affect other parts of the product.",
      "It may be hard to confirm success without a clear result to measure.",
    ],
    testPlan: [
      "Test the main way a user completes the task successfully.",
      "Test invalid, missing, and unusual information.",
      ...testFiles.map((path) => `Update and run ${path}.`),
      "Run all existing automated tests.",
      "Check each acceptance criterion by hand.",
    ],
  };
  const productReasoning = reasoning ?? fallbackReasoning;

  return {
    repositoryOverview,
    ...productReasoning,
    title: reasoning?.title.trim() || toTitle(request),
  };
}
