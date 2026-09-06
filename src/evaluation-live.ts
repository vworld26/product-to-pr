import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateSpecification, type EvaluationReport } from "./evaluation.js";
import { liveSpecificationFixtures } from "./evaluation-fixtures.js";
import { createProductPlan, type ProductReasoning, type RepositoryOverview } from "./plan.js";
import { reasonAboutFeature } from "./reason.js";

export type LiveEvaluationReasoner = (
  repositoryPath: string,
  featureRequest: string,
  repositoryOverview: RepositoryOverview,
) => Promise<ProductReasoning>;

export async function runLiveSpecificationEvaluation(
  reasoner: LiveEvaluationReasoner = reasonAboutFeature,
): Promise<Array<{ name: string; report: EvaluationReport }>> {
  const isolatedDirectory = await mkdtemp(join(tmpdir(), "product-to-pr-live-eval-"));
  try {
    const results: Array<{ name: string; report: EvaluationReport }> = [];
    for (const fixture of liveSpecificationFixtures) {
      const reasoning = await reasoner(
        isolatedDirectory,
        fixture.featureRequest,
        fixture.repositoryOverview,
      );
      results.push({
        name: fixture.name,
        report: evaluateSpecification(createProductPlan(
          fixture.featureRequest,
          fixture.repositoryOverview,
          reasoning,
        )),
      });
    }
    return results;
  } finally {
    await rm(isolatedDirectory, { recursive: true, force: true });
  }
}
