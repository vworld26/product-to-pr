import type { ProductPlan } from "./plan.js";

export type RiskLevel = "standard" | "elevated" | "restricted";

export type RiskPolicy = {
  level: RiskLevel;
  reasons: string[];
  implementationGate: "existing-approval" | "explicit-risk-confirmation" | "specialist-review";
  publicationGate: "existing-approval" | "explicit-risk-confirmation" | "specialist-review";
};

const ranks: Record<RiskLevel, number> = {
  standard: 0,
  elevated: 1,
  restricted: 2,
};

function configuredLevels(plan: ProductPlan): RiskLevel[] {
  return plan.repositoryOverview.instructionContext.instructions.flatMap((instruction) =>
    [...instruction.content.matchAll(
      /^Product-to-PR risk:\s*(standard|elevated|restricted)\s*$/gim,
    )].map((match) => match[1].toLowerCase() as RiskLevel)
  );
}

function highest(values: RiskLevel[]): RiskLevel {
  return values.reduce(
    (current, value) => ranks[value] > ranks[current] ? value : current,
    "standard",
  );
}

export function assessRiskPolicy(
  plan: ProductPlan,
  changedFiles: string[] = [],
): RiskPolicy {
  const text = [
    plan.title,
    plan.summary,
    ...plan.productDecisions,
    ...plan.acceptanceCriteria,
    ...plan.implementationSteps,
    ...plan.risks,
  ].join("\n");
  const configured = configuredLevels(plan);
  const inferred: Array<{ level: RiskLevel; pattern: RegExp; reason: string }> = [
    {
      level: "restricted",
      pattern: /\b(?:change|modify|rotate|store|write|manage|process|charge|migrate|alter)\b.{0,80}\b(?:production secrets?|credentials?|billing|payments?|data migrations?|security controls?)\b|\b(?:payment processing|secret rotation|production secrets?|data migrations?)\b/i,
      reason: "The proposed work may change production secrets, credentials, billing, payments, data migration, or security controls.",
    },
    {
      level: "restricted",
      pattern: /\b(?:delete|erase|purge)\b.{0,40}\b(?:accounts?|customers?|users?|records?|data)\b/i,
      reason: "The proposed work may destructively remove user or business data.",
    },
    {
      level: "elevated",
      pattern: /\b(?:authentication|authorization|permissions?|personal data|user data|deployment|infrastructure|dependencies|continuous integration|ci workflow)\b/i,
      reason: "The proposed work touches access, data, dependencies, deployment, infrastructure, or continuous integration.",
    },
  ];
  const matched = inferred.filter((item) => item.pattern.test(text));
  const changedPathText = changedFiles.join("\n");
  const pathRiskCandidates: Array<{
    level: RiskLevel;
    matched: boolean;
    reason: string;
  }> = [
    {
      level: "restricted",
      matched: /(?:^|\/)(?:\.env(?:\.|$)|secrets?(?:\/|\.|$)|credentials?(?:\/|\.|$)|migrations?(?:\/|\.|$)|migrate\/)/im
        .test(changedPathText),
      reason: "The local implementation changes a secrets, credentials, environment, or migration path.",
    },
    {
      level: "elevated",
      matched: /(?:^|\/)(?:\.github\/workflows\/|deploy(?:ment)?\/|infrastructure\/)|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/im
        .test(changedPathText),
      reason: "The local implementation changes automation, deployment, infrastructure, or dependency-lock files.",
    },
  ];
  const pathRisks = pathRiskCandidates.filter((item) => item.matched);
  const level = highest([
    ...configured,
    ...matched.map((item) => item.level),
    ...pathRisks.map((item) => item.level),
  ]);
  const reasons = [
    ...configured.map((value) => `Repository instructions require ${value} risk handling.`),
    ...matched.map((item) => item.reason),
    ...pathRisks.map((item) => item.reason),
  ];
  if (reasons.length === 0) {
    reasons.push("No configured or recognized higher-risk boundary was found.");
  }
  return {
    level,
    reasons: [...new Set(reasons)],
    implementationGate: level === "restricted" ? "specialist-review"
      : level === "elevated" ? "explicit-risk-confirmation" : "existing-approval",
    publicationGate: level === "restricted" ? "specialist-review"
      : level === "elevated" ? "explicit-risk-confirmation" : "existing-approval",
  };
}

export function formatRiskPolicy(policy: RiskPolicy): string {
  const guidance = policy.level === "restricted"
    ? "Automatic implementation and publication are unavailable. Keep the specification and obtain qualified maintainer or specialist review."
    : policy.level === "elevated"
    ? "Product-to-PR will ask for one additional risk confirmation before implementation and again before commit."
    : "The existing specification, implementation, verification, commit, and publication approvals apply.";
  return [
    "# Change risk policy",
    `Level: ${policy.level.toUpperCase()}`,
    ...policy.reasons.map((reason) => `- ${reason}`),
    guidance,
  ].join("\n");
}

export function parseRiskConfirmation(value: string): "continue" | "stop" | undefined {
  const choice = value.trim().toLowerCase();
  if (choice === "c" || choice === "continue") return "continue";
  if (choice === "s" || choice === "stop") return "stop";
  return undefined;
}
