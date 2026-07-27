import { formatPlan } from "./format.js";
import { inspectRepository } from "./inspect.js";
import { createProductPlan } from "./plan.js";

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
  const plan = createProductPlan(featureRequest, repositoryOverview);
  console.log(formatPlan(plan));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error(message);
  process.exitCode = 1;
}
