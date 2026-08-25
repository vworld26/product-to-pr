import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import type { ProductPlan } from "./plan.js";
import {
  buildPullRequestBody,
  commitReviewedChanges,
  openPullRequest,
  proposeCommitMessage,
} from "./publication.js";
import type { LocalReview } from "./review.js";
import { readLocalChangeEvidence } from "./review.js";

const execFileAsync = promisify(execFile);
const plan = {
  title: "Add confidence levels",
  summary: "Help users understand plan confidence.",
} as ProductPlan;
const review: LocalReview = {
  changedFiles: ["src/plan.ts"],
  changeDigest: "example-digest",
  diffSummary: "1 file changed",
  verification: [{ name: "test", command: "npm test", executable: "npm", args: ["test"], passed: true, output: "passed" }],
  acceptance: [{ criterion: "Confidence is visible.", status: "passed", evidence: "Covered by tests." }],
  recoveryGuidance: [],
};

describe("publication", () => {
  it("proposes a conventional commit and excludes Product-to-PR artifacts", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-publish-"));
    try {
      await execFileAsync("git", ["-C", repositoryPath, "init"]);
      await execFileAsync("git", ["-C", repositoryPath, "config", "user.name", "Test"]);
      await execFileAsync("git", ["-C", repositoryPath, "config", "user.email", "test@example.test"]);
      await writeFile(join(repositoryPath, "README.md"), "before\n");
      await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
      await execFileAsync("git", ["-C", repositoryPath, "commit", "-m", "Initial"]);
      await execFileAsync("git", ["-C", repositoryPath, "switch", "-c", "product-to-pr/example"]);
      await writeFile(join(repositoryPath, "README.md"), "after\n");
      await mkdir(join(repositoryPath, ".product-to-pr"));
      await writeFile(join(repositoryPath, ".product-to-pr", "preserve.md"), "preserve\n");

      const message = proposeCommitMessage(plan);
      const evidence = await readLocalChangeEvidence(repositoryPath);
      const commit = await commitReviewedChanges(repositoryPath, message, {
        ...review,
        changedFiles: evidence.changedFiles,
        changeDigest: evidence.changeDigest,
      });

      expect(message).toBe("feat: add confidence levels");
      expect(commit).toMatch(/^[a-f0-9]{40}$/);
      const { stdout: status } = await execFileAsync(
        "git",
        ["-C", repositoryPath, "status", "--short"],
        { encoding: "utf8" },
      );
      expect(status).toContain("?? .product-to-pr/");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("builds a traceable pull request without calling GitHub in tests", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-pr-"));
    try {
      await execFileAsync("git", ["-C", repositoryPath, "init"]);
      await execFileAsync("git", ["-C", repositoryPath, "switch", "-c", "product-to-pr/example"]);
      let args: string[] = [];
      const url = await openPullRequest(repositoryPath, plan, review, async (_path, received) => {
        args = received;
        return "https://example.test/pull/1";
      });
      const body = buildPullRequestBody(plan, review);

      expect(body).toContain("Confidence is visible.");
      expect(body).toContain("npm test");
      expect(url).toBe("https://example.test/pull/1");
      expect(args).toContain("create");
      expect(args).toContain("product-to-pr/example");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("refuses to commit files that changed after review", async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-stale-review-"));
    try {
      await execFileAsync("git", ["-C", repositoryPath, "init"]);
      await execFileAsync("git", ["-C", repositoryPath, "config", "user.name", "Test"]);
      await execFileAsync("git", ["-C", repositoryPath, "config", "user.email", "test@example.test"]);
      await writeFile(join(repositoryPath, "README.md"), "before\n");
      await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
      await execFileAsync("git", ["-C", repositoryPath, "commit", "-m", "Initial"]);
      await execFileAsync("git", ["-C", repositoryPath, "switch", "-c", "product-to-pr/example"]);
      await writeFile(join(repositoryPath, "README.md"), "reviewed\n");
      const evidence = await readLocalChangeEvidence(repositoryPath);
      await writeFile(join(repositoryPath, "README.md"), "changed afterward\n");

      await expect(
        commitReviewedChanges(repositoryPath, "feat: example", {
          ...review,
          changedFiles: evidence.changedFiles,
          changeDigest: evidence.changeDigest,
        }),
      ).rejects.toThrow("no longer match the reviewed diff");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });
});
