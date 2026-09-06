import type { ProductPlan } from "./plan.js";
import type { LocalReview } from "./review.js";

export type EvaluationArtifact = "specification" | "implementation";
export type EvaluationScore = 0 | 1 | 2;
export type EvaluationStatus = "meets" | "partly-meets" | "does-not-meet";

export type EvaluationCriterion = {
  id: string;
  title: string;
  artifact: EvaluationArtifact;
  standard: string;
};

export type EvaluationFinding = {
  criterion: EvaluationCriterion;
  score: EvaluationScore;
  status: EvaluationStatus;
  evidence: string;
};

export type EvaluationReport = {
  artifact: EvaluationArtifact;
  findings: EvaluationFinding[];
  score: number;
  maximumScore: number;
  passed: boolean;
};

export const specificationRubric: EvaluationCriterion[] = [
  {
    id: "plain-language-summary",
    title: "Beginner-friendly summary",
    artifact: "specification",
    standard: "The summary explains the user outcome without implementation jargon.",
  },
  {
    id: "repository-grounding",
    title: "Repository grounding",
    artifact: "specification",
    standard: "The plan connects repository evidence to likely implementation work.",
  },
  {
    id: "requirement-sources",
    title: "Requirement discipline",
    artifact: "specification",
    standard: "Decisions have valid source labels and unresolved assumptions do not become requirements.",
  },
  {
    id: "observable-acceptance",
    title: "Observable acceptance criteria",
    artifact: "specification",
    standard: "Acceptance criteria describe results that a person or automated check can observe.",
  },
  {
    id: "verification-plan",
    title: "Verification coverage",
    artifact: "specification",
    standard: "The test plan covers the main outcome, important failures, and regression checking.",
  },
];

export const implementationRubric: EvaluationCriterion[] = [
  {
    id: "scope-control",
    title: "Scope control",
    artifact: "implementation",
    standard: "The change is reviewable and does not modify protected Product-to-PR artifacts.",
  },
  {
    id: "verification-evidence",
    title: "Verification evidence",
    artifact: "implementation",
    standard: "Safe automated checks ran and their results are visible.",
  },
  {
    id: "acceptance-evidence",
    title: "Acceptance evidence",
    artifact: "implementation",
    standard: "Every acceptance criterion has an evidence-backed status.",
  },
  {
    id: "reviewability",
    title: "Reviewability",
    artifact: "implementation",
    standard: "Changed files and a useful diff summary are available to a reviewer.",
  },
  {
    id: "recovery-guidance",
    title: "Recovery guidance",
    artifact: "implementation",
    standard: "The review explains how to continue safely when evidence is incomplete or failing.",
  },
];

const decisionLabels = [
  "Confirmed by user:",
  "Repository evidence:",
  "Recommended default:",
  "Assumption to confirm:",
];

function finding(
  criterion: EvaluationCriterion,
  score: EvaluationScore,
  evidence: string,
): EvaluationFinding {
  return {
    criterion,
    score,
    status: score === 2 ? "meets" : score === 1 ? "partly-meets" : "does-not-meet",
    evidence,
  };
}

function report(
  artifact: EvaluationArtifact,
  findings: EvaluationFinding[],
): EvaluationReport {
  const score = findings.reduce((total, item) => total + item.score, 0);
  const maximumScore = findings.length * 2;
  return {
    artifact,
    findings,
    score,
    maximumScore,
    passed: findings.every((item) => item.score > 0) && score >= maximumScore * 0.8,
  };
}

function technicalTerms(value: string): string[] {
  const terms = [
    "api", "class", "database", "dependency", "endpoint", "function",
    "json", "library", "schema", "typescript",
  ];
  return terms.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(value));
}

function pathMentioned(path: string, values: string[]): boolean {
  return values.some((value) => value.includes(path));
}

function assumptionText(decision: string): string | undefined {
  const prefix = "Assumption to confirm:";
  return decision.startsWith(prefix) ? decision.slice(prefix.length).trim() : undefined;
}

function normalizedTerms(value: string): string[] {
  const ignored = new Set(["a", "an", "and", "are", "be", "is", "the", "to"]);
  return value.toLowerCase().match(/[a-z0-9]+/g)
    ?.filter((term) => !ignored.has(term))
    .map((term) => {
      if (term.endsWith("ied")) return `${term.slice(0, -3)}y`;
      if (term.endsWith("ed") && term.length > 4) return term.slice(0, -1);
      if (term.endsWith("ing") && term.length > 5) return term.slice(0, -3);
      if (term.endsWith("s") && term.length > 3) return term.slice(0, -1);
      return term;
    }) ?? [];
}

function requirementContains(value: string, requirements: string): boolean {
  const expected = normalizedTerms(value);
  const actual = new Set(normalizedTerms(requirements));
  return expected.length >= 3 && expected.every((term) => actual.has(term));
}

export function evaluateSpecification(plan: ProductPlan): EvaluationReport {
  const summaryTerms = technicalTerms(plan.summary);
  const summaryScore: EvaluationScore = !plan.summary.trim()
    ? 0
    : summaryTerms.length === 0 && plan.summary.trim().length >= 30 ? 2 : 1;

  const relevantPaths = plan.repositoryOverview.relevantFiles.map((file) => file.path);
  const groundedPaths = relevantPaths.filter((path) =>
    pathMentioned(path, plan.implementationSteps)
  );
  const repositoryScore: EvaluationScore = relevantPaths.length > 0 && groundedPaths.length > 0
    ? 2
    : plan.repositoryOverview.inspectionNotes.length > 0 ? 1 : 0;

  const invalidDecisions = plan.productDecisions.filter((decision) =>
    !decisionLabels.some((label) => decision.startsWith(label))
  );
  const requirements = [...plan.acceptanceCriteria, ...plan.implementationSteps]
    .join("\n").toLowerCase();
  const leakedAssumptions = plan.productDecisions
    .map(assumptionText)
    .filter((value): value is string => Boolean(value))
    .filter((value) => requirementContains(value, requirements));
  const sourceScore: EvaluationScore = invalidDecisions.length > 0 || leakedAssumptions.length > 0
    ? 0
    : plan.productDecisions.length > 0 ? 2 : 1;

  const observable = plan.acceptanceCriteria.filter((criterion) =>
    /\b(can|shows?|reports?|remains?|prevents?|does not|is (?:shown|saved|created|blocked|available))\b/i.test(criterion)
  );
  const acceptanceScore: EvaluationScore = plan.acceptanceCriteria.length === 0
    ? 0
    : observable.length === plan.acceptanceCriteria.length ? 2
      : observable.length > 0 ? 1 : 0;

  const testText = plan.testPlan.join(" ").toLowerCase();
  const coversOutcome = /main|success|outcome|user/.test(testText);
  const coversProblems = /invalid|missing|error|failure|unusual|edge/.test(testText);
  const coversRegression = /existing|regression|all .*tests|full .*suite/.test(testText);
  const coverageCount = [coversOutcome, coversProblems, coversRegression].filter(Boolean).length;
  const verificationScore: EvaluationScore = coverageCount === 3 ? 2
    : coverageCount > 0 ? 1 : 0;

  return report("specification", [
    finding(
      specificationRubric[0], summaryScore,
      !plan.summary.trim() ? "No summary was provided."
        : summaryTerms.length > 0
          ? `The summary uses technical term(s): ${summaryTerms.join(", ")}.`
          : "The summary states the outcome without recognized implementation jargon.",
    ),
    finding(
      specificationRubric[1], repositoryScore,
      groundedPaths.length > 0
        ? `Implementation work refers to repository evidence: ${groundedPaths.join(", ")}.`
        : relevantPaths.length > 0
          ? "Relevant files were found, but the implementation steps do not refer to them."
          : "No relevant files were identified; repository inspection evidence needs manual review.",
    ),
    finding(
      specificationRubric[2], sourceScore,
      invalidDecisions.length > 0
        ? `Decision(s) lack an approved source label: ${invalidDecisions.join(" | ")}.`
        : leakedAssumptions.length > 0
          ? `Unresolved assumption(s) appear in required work: ${leakedAssumptions.join(" | ")}.`
          : plan.productDecisions.length > 0
            ? "Every product decision uses an approved source label and no unresolved assumption was promoted."
            : "No product decisions were recorded, so requirement provenance is incomplete.",
    ),
    finding(
      specificationRubric[3], acceptanceScore,
      `${observable.length} of ${plan.acceptanceCriteria.length} acceptance criteria use observable outcome language.`,
    ),
    finding(
      specificationRubric[4], verificationScore,
      `The test plan covers ${coverageCount} of 3 expected areas: main outcome, problems, and regressions.`,
    ),
  ]);
}

export function evaluateImplementation(
  plan: ProductPlan,
  review: LocalReview,
): EvaluationReport {
  const protectedFiles = review.changedFiles.filter((path) =>
    path.startsWith(".product-to-pr/")
  );
  const scopeScore: EvaluationScore = protectedFiles.length > 0 ? 0
    : review.changedFiles.length > 0 && review.changedFiles.length <= 20 ? 2 : 1;

  const passedChecks = review.verification.filter((item) => item.passed).length;
  const verificationScore: EvaluationScore = review.verification.length === 0 ? 0
    : passedChecks === review.verification.length ? 2
      : passedChecks > 0 ? 1 : 0;

  const acceptanceByCriterion = new Map(
    review.acceptance.map((item) => [item.criterion, item]),
  );
  const missingEvidence = plan.acceptanceCriteria.filter((criterion) => {
    const item = acceptanceByCriterion.get(criterion);
    return !item || !item.evidence.trim();
  });
  const acceptanceScore: EvaluationScore = plan.acceptanceCriteria.length === 0 ||
      missingEvidence.length === plan.acceptanceCriteria.length
    ? 0
    : missingEvidence.length === 0 ? 2 : 1;

  const reviewabilityScore: EvaluationScore = review.changedFiles.length > 0 && review.diffSummary.trim()
    ? 2
    : review.changedFiles.length > 0 || review.diffSummary.trim() ? 1 : 0;

  const needsRecovery = review.verification.some((item) => !item.passed) ||
    review.acceptance.some((item) => item.status !== "passed");
  const recoveryScore: EvaluationScore = review.recoveryGuidance.length > 0
    ? 2
    : needsRecovery ? 0 : 1;

  return report("implementation", [
    finding(
      implementationRubric[0], scopeScore,
      protectedFiles.length > 0
        ? `Protected artifact(s) changed: ${protectedFiles.join(", ")}.`
        : `${review.changedFiles.length} reviewable product file(s) changed; no protected artifact is listed.`,
    ),
    finding(
      implementationRubric[1], verificationScore,
      `${passedChecks} of ${review.verification.length} automated verification checks passed.`,
    ),
    finding(
      implementationRubric[2], acceptanceScore,
      missingEvidence.length === 0
        ? "Every acceptance criterion has a recorded status and evidence."
        : `Acceptance evidence is missing for: ${missingEvidence.join(" | ")}.`,
    ),
    finding(
      implementationRubric[3], reviewabilityScore,
      review.changedFiles.length > 0 && review.diffSummary.trim()
        ? "The review lists changed files and includes a diff summary."
        : "The changed-file list or diff summary is incomplete.",
    ),
    finding(
      implementationRubric[4], recoveryScore,
      review.recoveryGuidance.length > 0
        ? `${review.recoveryGuidance.length} recovery step(s) are recorded.`
        : "No recovery guidance is recorded.",
    ),
  ]);
}

export function formatEvaluationReport(value: EvaluationReport): string {
  return [
    `# ${value.artifact === "specification" ? "Specification" : "Implementation"} evaluation`,
    `Result: ${value.passed ? "PASS" : "NEEDS IMPROVEMENT"} (${value.score}/${value.maximumScore})`,
    "The score summarizes the findings below; it is not a substitute for their evidence.",
    ...value.findings.map((item) => [
      `## ${item.criterion.title} — ${item.score}/2`,
      `Standard: ${item.criterion.standard}`,
      `Evidence: ${item.evidence}`,
    ].join("\n")),
  ].join("\n\n");
}
