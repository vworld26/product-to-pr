import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import type { ProductPlan } from "./plan.js";
import { createLocalReview, formatLocalReview } from "./review.js";

const execFileAsync = promisify(execFile);

const plan = {
  acceptanceCriteria: ["A user can see the result."],
} as ProductPlan;

describe("local review", () => {
  it("summarizes changes, evidence, and recovery guidance", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-review-"));
    try {
      await execFileAsync("git", ["-C", repositoryPath, "init"]);
      await execFileAsync("git", ["-C", repositoryPath, "config", "user.name", "Test"]);
      await execFileAsync("git", ["-C", repositoryPath, "config", "user.email", "test@example.test"]);
      await writeFile(join(repositoryPath, "README.md"), "before\n");
      await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
      await execFileAsync("git", ["-C", repositoryPath, "commit", "-m", "Initial"]);
      await writeFile(join(repositoryPath, "README.md"), "after\n");
      await writeFile(join(repositoryPath, "feature.ts"), "export {};\n");
      let reviewPrompt = "";

      const review = await createLocalReview(
        repositoryPath,
        plan,
        [{ name: "test", command: "npm test", executable: "npm", args: ["test"], passed: false, output: "failed" }],
        async (prompt) => {
          reviewPrompt = prompt;
          return [];
        },
      );
      const output = formatLocalReview(review);

      expect(review.changedFiles).toEqual(["README.md", "feature.ts"]);
      expect(review.changeDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(reviewPrompt).toContain("New file: feature.ts");
      expect(review.diffSummary).toContain("New file: feature.ts");
      expect(output).toContain("FAIL: npm test");
      expect(output).toContain("MANUAL-REVIEW: A user can see the result.");
      expect(output).toContain("automated review did not provide evidence");
      expect(output).toContain("Nothing has been committed or published");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("explains when no safe automated verification was discovered", () => {
    const output = formatLocalReview({
      changedFiles: [],
      changeDigest: "empty",
      diffSummary: "",
      verification: [],
      acceptance: [],
      recoveryGuidance: [],
    });

    expect(output).toContain(
      "No safe automated verification commands were discovered.",
    );
  });
});
