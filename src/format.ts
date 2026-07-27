import type { ProductPlan } from "./plan.js";

function section(title: string, values: string[]): string {
  return `## ${title}\n\n${values.map((value) => `- ${value}`).join("\n")}`;
}

function formatRepositoryOverview(
  overview: ProductPlan["repositoryOverview"],
): string {
  return [
    "## Repository overview",
    `### Purpose\n\n${overview.purpose}`,
    section("Technologies", overview.technologies),
    section("Structure", overview.structure),
    section("Entry points", overview.entryPoints),
    section("Test approach", overview.testApproach),
    section(
      "Relevant files",
      overview.relevantFiles.map((file) => `${file.path} — ${file.reason}`),
    ),
    section("Inspection notes", overview.inspectionNotes),
  ].join("\n\n");
}

export function formatPlan(plan: ProductPlan): string {
  const sections = [
    `# ${plan.title}`,
    `## Summary\n\n${plan.summary}`,
    formatRepositoryOverview(plan.repositoryOverview),
    ...(plan.clarifyingQuestions.length > 0
      ? [section("Clarifying questions", plan.clarifyingQuestions)]
      : []),
    ...(plan.productDecisions.length > 0
      ? [section("Product decisions", plan.productDecisions)]
      : []),
    section("Dependencies", plan.dependencies),
    section("Acceptance criteria", plan.acceptanceCriteria),
    section("Implementation steps", plan.implementationSteps),
    section("Risks", plan.risks),
    section("Test plan", plan.testPlan),
  ];

  return sections.join("\n\n");
}
