import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { createImplementationBranch } from "./branch.js";

const execFileAsync = promisify(execFile);

async function git(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", repositoryPath, ...args]);
}

async function createRepository(): Promise<string> {
  const repositoryPath = await mkdtemp(
    join(tmpdir(), "product-to-pr-branch-"),
  );
  await git(repositoryPath, ["init"]);
  await git(repositoryPath, ["config", "user.name", "Product-to-PR Test"]);
  await git(repositoryPath, [
    "config",
    "user.email",
    "product-to-pr@example.test",
  ]);
  await writeFile(join(repositoryPath, "README.md"), "# Test repository\n");
  await git(repositoryPath, ["add", "README.md"]);
  await git(repositoryPath, ["commit", "-m", "Initial commit"]);
  return repositoryPath;
}

describe("createImplementationBranch", () => {
  it("creates a separate branch for an approved implementation", async () => {
    const repositoryPath = await createRepository();

    try {
      const branchName = await createImplementationBranch(
        repositoryPath,
        "Add confidence levels",
      );

      expect(branchName).toBe("product-to-pr/add-confidence-levels");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it("refuses to build over existing unsaved work", async () => {
    const repositoryPath = await createRepository();

    try {
      await writeFile(join(repositoryPath, "README.md"), "# Changed\n");

      await expect(
        createImplementationBranch(repositoryPath, "Unsafe change"),
      ).rejects.toThrow("already has unsaved changes");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });
});
