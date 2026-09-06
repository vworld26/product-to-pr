import { formatEvaluationReport } from "./evaluation.js";
import { runEvaluationFixtures } from "./evaluation-fixtures.js";
import { runLiveSpecificationEvaluation } from "./evaluation-live.js";

const live = process.argv.slice(2).includes("--live");
const fixtures = runEvaluationFixtures();

for (const fixture of fixtures) {
  console.log(`\n## Fixture: ${fixture.name}`);
  console.log(`Expected ${fixture.expectedPass ? "PASS" : "NEEDS IMPROVEMENT"}; received ${fixture.actualPass ? "PASS" : "NEEDS IMPROVEMENT"}.`);
  console.log(formatEvaluationReport(fixture.report));
}

if (fixtures.some((fixture) => !fixture.matched)) process.exitCode = 1;

if (live) {
  console.log("\nRunning opt-in live evaluation. Synthetic fixture content will be sent to Codex; repository contents are not included.");
  const results = await runLiveSpecificationEvaluation();
  for (const result of results) {
    console.log(`\n## Live fixture: ${result.name}`);
    console.log(formatEvaluationReport(result.report));
  }
  if (results.some((result) => !result.report.passed)) process.exitCode = 1;
}
