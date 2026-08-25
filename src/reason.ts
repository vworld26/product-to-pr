import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProductReasoning, RepositoryOverview } from "./plan.js";

const reasoningSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "clarifyingQuestions",
    "productDecisions",
    "dependencies",
    "acceptanceCriteria",
    "implementationSteps",
    "risks",
    "testPlan",
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    clarifyingQuestions: {
      type: "array",
      items: { type: "string" },
    },
    productDecisions: {
      type: "array",
      items: { type: "string" },
    },
    dependencies: {
      type: "array",
      items: { type: "string" },
    },
    acceptanceCriteria: {
      type: "array",
      items: { type: "string" },
    },
    implementationSteps: {
      type: "array",
      items: { type: "string" },
    },
    risks: {
      type: "array",
      items: { type: "string" },
    },
    testPlan: {
      type: "array",
      items: { type: "string" },
    },
  },
};

export function buildReasoningPrompt(
  featureRequest: string,
  repositoryOverview: RepositoryOverview,
  answers: string[] = [],
): string {
  const prompt = [
    "Act as a product manager and software planner.",
    "Create a concise, repository-aware product specification.",
    "Do not edit files or run commands.",
    "Start with product discovery, not implementation.",
    "Write title as a short feature name, never a truncated copy of the request.",
    "Write summary in non-technical language: what the feature does, who it helps, and why it matters. Do not mention files, libraries, schemas, or implementation details.",
    "Ask adaptive questions about the user, desired behavior, configurable variables, outputs, missing information, and boundaries before asking technical questions.",
    "Ask only questions that materially affect the product decision. Each question must briefly say why it matters and include a recommended default when appropriate.",
    "Prefix every product decision with exactly one source label: Confirmed by user:, Repository evidence:, Recommended default:, or Assumption to confirm:.",
    "Never turn a recommendation or assumption into a confirmed requirement.",
    "Make acceptance criteria observable and testable.",
    "",
    `Feature request: ${featureRequest}`,
    "",
    "Repository evidence:",
    JSON.stringify(repositoryOverview, null, 2),
  ];

  if (answers.length > 0) {
    prompt.push(
      "",
      "User answers to the earlier clarifying questions:",
      ...answers.map((answer) => `- ${answer}`),
      "",
      "Convert these answers into explicit productDecisions.",
      "Label decisions based on direct user answers as Confirmed by user:.",
      "Remove questions that the answers resolved; keep only material unanswered questions.",
    );
  }

  return prompt.join("\n");
}

export async function reasonAboutFeature(
  repositoryPath: string,
  featureRequest: string,
  repositoryOverview: RepositoryOverview,
  answers: string[] = [],
): Promise<ProductReasoning> {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "product-to-pr-reasoning-"),
  );
  const schemaPath = join(temporaryDirectory, "schema.json");
  const outputPath = join(temporaryDirectory, "result.json");

  try {
    await writeFile(schemaPath, JSON.stringify(reasoningSchema), "utf8");
    await new Promise<void>((resolve, reject) => {
      const timeoutMilliseconds = 120_000;
      const child = spawn(
        "codex",
        [
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
          "--cd",
          repositoryPath,
          "-",
        ],
        {
          stdio: ["pipe", "ignore", "pipe"],
        },
      );
      let errorOutput = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(
          new Error(
            "Product reasoning timed out after 2 minutes. Try again or use a shorter feature request.",
          ),
        );
      }, timeoutMilliseconds);

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        errorOutput += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              errorOutput.trim() || `Codex exited with status ${code}.`,
            ),
          );
        }
      });
      child.stdin.end(
        buildReasoningPrompt(featureRequest, repositoryOverview, answers),
      );
    });

    return JSON.parse(await readFile(outputPath, "utf8")) as ProductReasoning;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
