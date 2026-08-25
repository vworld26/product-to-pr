import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { preserveImplementationPackage } from "./implementation.js";
import type { ProductPlan } from "./plan.js";

const execFileAsync = promisify(execFile);

async function git(repositoryPath: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", repositoryPath, ...args]);
}

async function createRepository(): Promise<string> {
  const repositoryPath = await mkdtemp(
    join(tmpdir(), "product-to-pr-implementation-"),
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
  await git(repositoryPath, ["switch", "-c", "product-to-pr/example"]);
  return repositoryPath;
}

const plan: ProductPlan = {
  title: "Add confidence levels",
  summary: "Show confidence for each plan.",
  repositoryOverview: {
    purpose: "Create product plans.",
    technologies: ["TypeScript"],
    structure: ["src/"],
    entryPoints: ["src/cli.ts"],
    testApproach: ["npm test"],
    instructionContext: {
      instructions: [
        {
          path: "AGENTS.md",
          scope: ".",
          applicableFiles: ["src/plan.ts"],
          content: "Run tests.",
        },
      ],
      fallbackFiles: [],
      warnings: [],
      authoringState: "found",
    },
    relevantFiles: [
      { path: "src/plan.ts", reason: "Defines the product plan." },
    ],
    inspectionNotes: ["Searched source files."],
  },
  clarifyingQuestions: [],
  productDecisions: [],
  dependencies: [],
  acceptanceCriteria: ["Each plan shows a confidence level."],
  implementationSteps: ["Add confidence to the plan model."],
  risks: [],
  testPlan: ["Run npm test."],
};

describe("preserveImplementationPackage", () => {
  it("binds the approved plan to the branch, commit, and checklists", async () => {
    const repositoryPath = await createRepository();
    const specificationPath = join(
      repositoryPath,
      ".product-to-pr",
      "specifications",
      "approved.md",
    );

    try {
      await mkdir(join(repositoryPath, ".product-to-pr", "specifications"), {
        recursive: true,
      });
      await writeFile(specificationPath, "# Approved specification\n");
      const path = await preserveImplementationPackage(
        repositoryPath,
        specificationPath,
        plan,
        new Date("2026-08-24T12:00:00.000Z"),
      );
      const content = await readFile(path, "utf8");

      expect(path).toContain(".product-to-pr/implementations/");
      expect(content).toContain("- Branch: product-to-pr/example");
      expect(content).toMatch(/- Starting commit: [a-f0-9]{40}/);
      expect(content).toContain(
        "- Specification: .product-to-pr/specifications/approved.md",
      );
      expect(content).toContain(
        "- Specification SHA-256: fcbaba5c46488539ece96f4261a49296f0c2bd9f8d70d85709bbeb311d853563",
      );
      expect(content).toContain(
        "- [ ] Each plan shows a confidence level.",
      );
      expect(content).toContain("- src/plan.ts — Defines the product plan.");
      expect(content).toContain("- AGENTS.md (scope: .)");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });
});
