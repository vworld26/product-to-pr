import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EvaluationReport } from "./evaluation.js";
import type { ProductPlan } from "./plan.js";
import type {
  AutomatedImplementationProvider,
  ImplementationProvider,
} from "./provider.js";
import type { LocalChangeEvidence, LocalReview } from "./review.js";

export type CritiqueArtifact = "specification" | "implementation";
export type CritiqueCategory =
  | "contradiction"
  | "omission"
  | "unsupported-claim"
  | "scope-risk"
  | "verification-gap";
export type CritiqueSeverity = "blocking" | "important" | "suggestion";

export type CritiqueFinding = {
  category: CritiqueCategory;
  severity: CritiqueSeverity;
  summary: string;
  evidence: string;
  recommendation: string;
};

export type CritiqueReport = {
  artifact: CritiqueArtifact;
  reviewer: AutomatedImplementationProvider;
  independent: true;
  summary: string;
  findings: CritiqueFinding[];
};

export type CritiqueCommand = {
  command: AutomatedImplementationProvider;
  args: string[];
  cwd?: string;
  outputPath?: string;
  label: string;
};

export type CritiqueRunner = (
  provider: AutomatedImplementationProvider,
  artifact: CritiqueArtifact,
  prompt: string,
) => Promise<CritiqueReport>;

const categories: CritiqueCategory[] = [
  "contradiction",
  "omission",
  "unsupported-claim",
  "scope-risk",
  "verification-gap",
];
const severities: CritiqueSeverity[] = ["blocking", "important", "suggestion"];

const critiqueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "summary", "evidence", "recommendation"],
        properties: {
          category: { enum: categories },
          severity: { enum: severities },
          summary: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
  },
};

function bounded(value: string, limit: number): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n[Evidence truncated by Product-to-PR]`;
}

function basePrompt(artifact: CritiqueArtifact): string[] {
  return [
    `Independently critique this Product-to-PR ${artifact}.`,
    "Look specifically for contradictions, omissions, unsupported claims, unintended scope, and verification gaps.",
    "Ground every finding in the supplied artifact and evidence. Do not invent repository facts.",
    "Do not edit files, run commands, approve work, publish anything, or make a merge decision.",
    "Return JSON only, with a summary and a findings array.",
    "Each finding must include category, severity, summary, evidence, and recommendation.",
    "Use an empty findings array when no material problem is supported by the evidence.",
  ];
}

export function buildSpecificationCritiquePrompt(
  plan: ProductPlan,
  evaluation: EvaluationReport,
): string {
  return [
    ...basePrompt("specification"),
    "",
    "Specification:",
    bounded(JSON.stringify(plan, null, 2), 100_000),
    "",
    "Canonical evaluation and rubric evidence:",
    bounded(JSON.stringify(evaluation, null, 2), 50_000),
  ].join("\n");
}

export function buildImplementationCritiquePrompt(
  plan: ProductPlan,
  review: LocalReview,
  evidence: LocalChangeEvidence,
  evaluation: EvaluationReport,
): string {
  return [
    ...basePrompt("implementation"),
    "",
    "Approved plan:",
    bounded(JSON.stringify(plan, null, 2), 75_000),
    "",
    "Local review and verification evidence:",
    bounded(JSON.stringify(review, null, 2), 75_000),
    "",
    "Canonical evaluation and rubric evidence:",
    bounded(JSON.stringify(evaluation, null, 2), 50_000),
    "",
    "Local diff:",
    bounded(evidence.diff, 100_000),
  ].join("\n");
}

export function independentCritiqueProvider(
  producer: ImplementationProvider,
): AutomatedImplementationProvider | undefined {
  if (producer === "codex") return "claude";
  if (producer === "claude") return "codex";
  return undefined;
}

export function assertIndependentReviewer(
  producer: ImplementationProvider,
  reviewer: AutomatedImplementationProvider,
): void {
  if (producer === "manual" || producer === reviewer) {
    throw new Error(
      "The proposed reviewer is not demonstrably independent from the model that produced this work.",
    );
  }
}

export function buildCritiqueCommand(
  provider: AutomatedImplementationProvider,
  temporaryDirectory: string,
): CritiqueCommand {
  if (provider === "claude") {
    return {
      command: "claude",
      args: [
        "--print",
        "--no-session-persistence",
        "--safe-mode",
        "--permission-mode",
        "plan",
        "--output-format",
        "text",
        "--tools",
        "",
      ],
      cwd: temporaryDirectory,
      label: "Claude Code",
    };
  }
  const schemaPath = join(temporaryDirectory, "schema.json");
  const outputPath = join(temporaryDirectory, "result.json");
  return {
    command: "codex",
    args: [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-",
    ],
    cwd: temporaryDirectory,
    outputPath,
    label: "Codex",
  };
}

function isFinding(value: unknown): value is CritiqueFinding {
  if (!value || typeof value !== "object") return false;
  const finding = value as Partial<CritiqueFinding>;
  return categories.includes(finding.category as CritiqueCategory) &&
    severities.includes(finding.severity as CritiqueSeverity) &&
    typeof finding.summary === "string" && finding.summary.trim().length > 0 &&
    typeof finding.evidence === "string" && finding.evidence.trim().length > 0 &&
    typeof finding.recommendation === "string" &&
    finding.recommendation.trim().length > 0;
}

export function parseCritiqueResponse(
  provider: AutomatedImplementationProvider,
  artifact: CritiqueArtifact,
  content: string,
): CritiqueReport {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("The independent reviewer returned an unreadable response.", {
      cause: error,
    });
  }
  if (!value || typeof value !== "object") {
    throw new Error("The independent reviewer returned an incomplete response.");
  }
  const result = value as { summary?: unknown; findings?: unknown };
  if (
    typeof result.summary !== "string" || !result.summary.trim() ||
    !Array.isArray(result.findings) || result.findings.length > 20 ||
    !result.findings.every(isFinding)
  ) {
    throw new Error("The independent reviewer returned an incomplete response.");
  }
  return {
    artifact,
    reviewer: provider,
    independent: true,
    summary: bounded(result.summary.trim(), 5_000),
    findings: result.findings.map((finding) => ({
      ...finding,
      summary: bounded(finding.summary.trim(), 2_000),
      evidence: bounded(finding.evidence.trim(), 5_000),
      recommendation: bounded(finding.recommendation.trim(), 5_000),
    })),
  };
}

async function executeCritiqueCommand(
  command: CritiqueCommand,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      ...(command.cwd ? { cwd: command.cwd } : {}),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command.label} critique timed out after 2 minutes.`));
    }, 120_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.on("data", (chunk: string) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve(output.trim())
        : reject(new Error(errors.trim() || `${command.label} exited with status ${code}.`));
    });
    child.stdin.end(prompt);
  });
}

export async function runCritiqueWithProvider(
  provider: AutomatedImplementationProvider,
  artifact: CritiqueArtifact,
  prompt: string,
): Promise<CritiqueReport> {
  const directory = await mkdtemp(join(tmpdir(), "product-to-pr-critique-"));
  try {
    const command = buildCritiqueCommand(provider, directory);
    if (provider === "codex") {
      await writeFile(join(directory, "schema.json"), JSON.stringify(critiqueSchema));
    }
    const stdout = await executeCritiqueCommand(command, prompt);
    const content = command.outputPath
      ? await readFile(command.outputPath, "utf8")
      : stdout;
    return parseCritiqueResponse(provider, artifact, content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runIndependentCritique(
  producer: ImplementationProvider,
  artifact: CritiqueArtifact,
  prompt: string,
  runner: CritiqueRunner = runCritiqueWithProvider,
): Promise<CritiqueReport> {
  const reviewer = independentCritiqueProvider(producer);
  if (!reviewer) {
    throw new Error(
      "Product-to-PR cannot prove which model produced manually handed-off work, so it cannot choose an independent reviewer automatically.",
    );
  }
  assertIndependentReviewer(producer, reviewer);
  const report = await runner(reviewer, artifact, prompt);
  if (
    report.reviewer !== reviewer || report.artifact !== artifact ||
    report.independent !== true
  ) {
    throw new Error(
      "The independent reviewer response does not match the requested provider or artifact.",
    );
  }
  return report;
}

export function formatCritiqueReport(report: CritiqueReport): string {
  const findings = report.findings.length > 0
    ? report.findings.map((finding) => [
      `## ${finding.severity.toUpperCase()}: ${finding.summary}`,
      `Category: ${finding.category}`,
      `Evidence: ${finding.evidence}`,
      `Recommendation: ${finding.recommendation}`,
    ].join("\n"))
    : ["## No supported material findings\nThe reviewer did not identify a material issue in the supplied evidence."];
  return [
    `# Independent ${report.artifact} critique`,
    `Reviewer: ${report.reviewer === "codex" ? "Codex" : "Claude Code"}`,
    "This reviewer could report findings only; it could not edit, approve, publish, or merge.",
    `Summary: ${report.summary}`,
    ...findings,
  ].join("\n\n");
}
