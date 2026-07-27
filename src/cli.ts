import { formatPlan } from "./format.js";
import { inspectRepository } from "./inspect.js";
import { createProductPlan } from "./plan.js";
import { reasonAboutFeature } from "./reason.js";
import { createInterface } from "node:readline/promises";

const [repositoryPath, ...featureParts] = process.argv.slice(2);
const featureRequest = featureParts.join(" ");

try {
  if (!repositoryPath) {
    throw new Error("A repository folder is required.");
  }

  if (!featureRequest.trim()) {
    throw new Error("A feature request is required.");
  }

  const repositoryOverview = await inspectRepository(
    repositoryPath,
    featureRequest,
  );
  let reasoning = await reasonAboutFeature(
    repositoryPath,
    featureRequest,
    repositoryOverview,
  );
  if (
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    reasoning.clarifyingQuestions.length > 0
  ) {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answers: string[] = [];

    console.log("\nA few product decisions before I finalize the plan:\n");
    try {
      for (const question of reasoning.clarifyingQuestions) {
        const answer = await terminal.question(`${question}\n> `);
        answers.push(
          `${question} — ${
            answer.trim() || "Use the safest reasonable default."
          }`,
        );
      }
    } finally {
      terminal.close();
    }

    reasoning = await reasonAboutFeature(
      repositoryPath,
      featureRequest,
      repositoryOverview,
      answers,
    );
  }
  const plan = createProductPlan(
    featureRequest,
    repositoryOverview,
    reasoning,
  );
  console.log(formatPlan(plan));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error(message);
  process.exitCode = 1;
}
