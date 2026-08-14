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
    summary: `Enable the requested outcome: ${request}`,
    clarifyingQuestions: [
      `What should the user see or be able to do when "${request}" is complete?`,
      "What rules, defaults, or user choices should control this behavior?",
    ],
    productDecisions: [],
    dependencies: [
      "Confirm which existing interfaces, services, and data this feature relies on.",
      "Identify any external packages, APIs, or permissions required.",
      "Verify that prerequisite product decisions are resolved before implementation.",
    ],
    acceptanceCriteria: [
      `The completed product supports this outcome: ${request}.`,
      "The feature handles invalid or incomplete input clearly.",
      "Existing behavior continues to work.",
    ],
    implementationSteps: [
      "Confirm the unanswered product and technical questions.",
      ...implementationSteps,
      "Implement the smallest complete user journey.",
      "Add automated tests for the new behavior and important failure cases.",
      "Review the final change against every acceptance criterion.",
    ],
    risks: [
      "The request may hide unresolved product assumptions.",
      "The implementation may affect behavior outside the intended scope.",
      "Success may be difficult to verify without a measurable outcome.",
    ],
    testPlan: [
      "Test the primary successful user journey.",
      "Test invalid, empty, and boundary inputs.",
      ...testFiles.map((path) => `Update and run ${path}.`),
      "Run the existing automated test suite.",
      "Manually confirm each acceptance criterion.",
    ],
  };
  const productReasoning = reasoning ?? fallbackReasoning;

  return {
    title: toTitle(request),
    repositoryOverview,
    ...productReasoning,
  };
}
