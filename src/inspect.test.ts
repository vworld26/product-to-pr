import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverRelevantFiles } from "./inspect.js";

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
});
