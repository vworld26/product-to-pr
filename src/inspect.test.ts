import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverRelevantFiles, inspectRepository } from "./inspect.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "product-to-pr-relevant-files-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })
    ),
  );
});

describe("discoverRelevantFiles", () => {
  it("lists likely files in a normal repository with one-line reasons", async () => {
    const repositoryPath = await createTemporaryDirectory();
    await mkdir(join(repositoryPath, "src"));
    await writeFile(
      join(repositoryPath, "src", "export.ts"),
      "export function exportPlanAsMarkdown() { return 'markdown'; }\n",
    );
    await writeFile(
      join(repositoryPath, "src", "export.test.ts"),
      "// Tests exporting a plan as Markdown.\n",
    );
    await writeFile(join(repositoryPath, "README.md"), "# Example\n");

    const result = await discoverRelevantFiles(
      repositoryPath,
      "Export a plan as Markdown",
    );

    expect(result.searched).toBe(3);
    expect(result.files.map((file) => file.path)).toEqual([
      "src/export.ts",
      "src/export.test.ts",
    ]);
    expect(result.files.every((file) => file.reason.length > 0)).toBe(true);
    expect(result.files.every((file) => !file.reason.includes("\n"))).toBe(true);
  });

  it("returns no relevant files for an empty directory", async () => {
    const repositoryPath = await createTemporaryDirectory();

    await expect(
      discoverRelevantFiles(repositoryPath, "Export a plan as Markdown"),
    ).resolves.toEqual({ files: [], searched: 0 });
  });

  it("reports a missing repository path clearly", async () => {
    const parentPath = await createTemporaryDirectory();
    const missingPath = join(parentPath, "missing-repository");

    await expect(
      discoverRelevantFiles(missingPath, "Export a plan as Markdown"),
    ).rejects.toThrow(`Repository path does not exist: ${missingPath}.`);
  });

  it("inspects a mixed-language skill repository without package.json", async () => {
    const repositoryPath = await createTemporaryDirectory();
    await mkdir(join(repositoryPath, "venture-evaluation", "scripts"), {
      recursive: true,
    });
    await writeFile(
      join(repositoryPath, "venture-evaluation", "SKILL.md"),
      "# Venture evaluation\n\nEvaluate business opportunities with evidence.\n",
    );
    await writeFile(
      join(repositoryPath, "venture-evaluation", "scripts", "evaluate.js"),
      "export function evaluateOpportunity() {}\n",
    );
    await writeFile(
      join(repositoryPath, "venture-evaluation", "scripts", "check.py"),
      "def check_opportunity(): pass\n",
    );
    await writeFile(
      join(repositoryPath, "venture-evaluation", "scripts", "review.sh"),
      "#!/bin/sh\n# review opportunity\n",
    );

    const overview = await inspectRepository(
      repositoryPath,
      "Improve opportunity review",
    );

    expect(overview.purpose).toContain("Evaluate business opportunities");
    expect(overview.technologies).toEqual(["JavaScript", "Python", "Shell"]);
    expect(overview.entryPoints[0]).toBe("venture-evaluation/SKILL.md");
    expect(overview.relevantFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "venture-evaluation/scripts/check.py",
        "venture-evaluation/scripts/review.sh",
      ]),
    );
    expect(overview.testApproach).toEqual(
      expect.arrayContaining([
        "Possible but not trusted: python venture-evaluation/scripts/check.py",
        expect.stringContaining("Verification confidence: medium"),
        expect.stringContaining("will not run until"),
      ]),
    );
  });
});
