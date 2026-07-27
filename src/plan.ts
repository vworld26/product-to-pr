export type ProductPlan = {
  title: string;
  summary: string;
  clarifyingQuestions: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  implementationSteps: string[];
  risks: string[];
  testPlan: string[];
};

function toTitle(featureRequest: string): string {
  const trimmed = featureRequest.trim().replace(/[.!?]+$/, "");
  return trimmed.length <= 72 ? trimmed : `${trimmed.slice(0, 69)}...`;
}

export function createProductPlan(featureRequest: string): ProductPlan {
  const request = featureRequest.trim();

  if (!request) {
    throw new Error("A feature request is required.");
  }

  return {
    title: toTitle(request),
    summary: `Enable the requested outcome: ${request}`,
    clarifyingQuestions: [
      "Who is the primary user for this feature?",
      "What user problem or measurable outcome should this address?",
      "What behavior is explicitly outside the first version?",
    ],
    dependencies: [
      "Confirm which existing interfaces, services, and data this feature relies on.",
      "Identify any external packages, APIs, or permissions required.",
      "Verify that prerequisite product decisions are resolved before implementation.",
    ],
    acceptanceCriteria: [
      "The primary user can complete the intended outcome.",
      "The feature handles invalid or incomplete input clearly.",
      "Existing behavior continues to work.",
    ],
    implementationSteps: [
      "Confirm the unanswered product and technical questions.",
      "Identify the affected interface, business logic, and data boundaries.",
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
      "Run the existing automated test suite.",
      "Manually confirm each acceptance criterion.",
    ],
  };
}
