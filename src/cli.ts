import { formatPlan } from "./format.js";
import { createProductPlan } from "./plan.js";

const featureRequest = process.argv.slice(2).join(" ");

try {
  const plan = createProductPlan(featureRequest);
  console.log(formatPlan(plan));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error(message);
  process.exitCode = 1;
}
