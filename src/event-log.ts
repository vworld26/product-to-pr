import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CritiqueArtifact, CritiqueReport } from "./critique.js";
import type { EvaluationReport } from "./evaluation.js";
import type { AutomatedImplementationProvider } from "./provider.js";
import {
  readinessHistoryPath,
  repositoryHistoryId,
  type HistoryLocationOptions,
} from "./readiness-history.js";

export type CritiqueOutcome = "completed" | "manual-handoff" | "skipped" | "failed";

export type QualityEvent = {
  version: 1;
  occurredAt: string;
  eventType: "evaluation" | "critique";
  repositoryId: string;
  artifact: CritiqueArtifact;
  outcome: "passed" | "needs-improvement" | CritiqueOutcome;
  provider?: AutomatedImplementationProvider;
  score?: number;
  maximumScore?: number;
  findingCount?: number;
};

export function qualityEventLogPath(
  options: HistoryLocationOptions = {},
): string {
  return join(dirname(readinessHistoryPath(options)), "quality-events.jsonl");
}

async function appendQualityEvent(
  path: string,
  event: QualityEvent,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

export async function recordEvaluationEvent(
  repositoryPath: string,
  report: EvaluationReport,
  path = qualityEventLogPath(),
  occurredAt = new Date(),
): Promise<void> {
  await appendQualityEvent(path, {
    version: 1,
    occurredAt: occurredAt.toISOString(),
    eventType: "evaluation",
    repositoryId: repositoryHistoryId(repositoryPath),
    artifact: report.artifact,
    outcome: report.passed ? "passed" : "needs-improvement",
    score: report.score,
    maximumScore: report.maximumScore,
    findingCount: report.findings.length,
  });
}

export async function recordCritiqueEvent(
  repositoryPath: string,
  artifact: CritiqueArtifact,
  outcome: CritiqueOutcome,
  report?: CritiqueReport,
  path = qualityEventLogPath(),
  occurredAt = new Date(),
): Promise<void> {
  await appendQualityEvent(path, {
    version: 1,
    occurredAt: occurredAt.toISOString(),
    eventType: "critique",
    repositoryId: repositoryHistoryId(repositoryPath),
    artifact,
    outcome,
    ...(report ? {
      provider: report.reviewer,
      findingCount: report.findings.length,
    } : {}),
  });
}
