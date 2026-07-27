import type { ProductPlan } from "./plan.js";

function section(title: string, values: string[]): string {
  return `## ${title}\n\n${values.map((value) => `- ${value}`).join("\n")}`;
}

export function formatPlan(plan: ProductPlan): string {
  return [
    `# ${plan.title}`,
    `## Summary\n\n${plan.summary}`,
    section("Clarifying questions", plan.clarifyingQuestions),
    section("Dependencies", plan.dependencies),
    section("Acceptance criteria", plan.acceptanceCriteria),
    section("Implementation steps", plan.implementationSteps),
    section("Risks", plan.risks),
    section("Test plan", plan.testPlan),
  ].join("\n\n");
}
