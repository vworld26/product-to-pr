import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverRepositoryInstructions } from "./instructions.js";

const temporaryRepositories: string[] = [];

async function createRepository(): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-"));
  temporaryRepositories.push(repositoryPath);
  return repositoryPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })
    ),
  );
});

describe("discoverRepositoryInstructions", () => {
  it("finds a root AGENTS.md with repository-wide scope", async () => {
    const repositoryPath = await createRepository();
    await writeFile(
      join(repositoryPath, "AGENTS.md"),
      "# Repository rules\n\nRun tests before committing.\n",
    );

    const context = await discoverRepositoryInstructions(repositoryPath, [
      "src/plan.ts",
    ]);

    expect(context.authoringState).toBe("found");
    expect(context.instructions).toEqual([
      {
        path: "AGENTS.md",
        scope: ".",
        applicableFiles: ["src/plan.ts"],
        content: "# Repository rules\n\nRun tests before committing.\n",
      },
    ]);
    expect(context.fallbackFiles).toEqual([]);
    expect(context.warnings).toEqual([]);
  });

  it("orders root instructions before more-specific nested instructions", async () => {
    const repositoryPath = await createRepository();
    await mkdir(join(repositoryPath, "src", "renderer"), { recursive: true });
    await writeFile(join(repositoryPath, "AGENTS.md"), "Root rules\n");
    await writeFile(
      join(repositoryPath, "src", "AGENTS.md"),
      "Source rules\n",
    );
    await writeFile(
      join(repositoryPath, "src", "renderer", "AGENTS.md"),
      "Renderer rules\n",
    );

    const context = await discoverRepositoryInstructions(repositoryPath, [
      "src/renderer/App.tsx",
      "src/server.ts",
      "docs/guide.md",
    ]);

    expect(context.instructions.map(({ path, scope }) => ({ path, scope }))).toEqual([
      { path: "AGENTS.md", scope: "." },
      { path: "src/AGENTS.md", scope: "src" },
      { path: "src/renderer/AGENTS.md", scope: "src/renderer" },
    ]);
    expect(
      context.instructions.map(({ path, applicableFiles }) => ({
        path,
        applicableFiles,
      })),
    ).toEqual([
      {
        path: "AGENTS.md",
        applicableFiles: [
          "src/renderer/App.tsx",
          "src/server.ts",
          "docs/guide.md",
        ],
      },
      {
        path: "src/AGENTS.md",
        applicableFiles: ["src/renderer/App.tsx", "src/server.ts"],
      },
      {
        path: "src/renderer/AGENTS.md",
        applicableFiles: ["src/renderer/App.tsx"],
      },
    ]);
  });

  it("reports missing instructions and identifies fallback files", async () => {
    const repositoryPath = await createRepository();
    await writeFile(join(repositoryPath, "README.md"), "# Example\n");
    await writeFile(
      join(repositoryPath, "CONTRIBUTING.md"),
      "# Contributing\n",
    );
    await writeFile(
      join(repositoryPath, "package.json"),
      '{"scripts":{"test":"vitest run"}}\n',
    );

    const context = await discoverRepositoryInstructions(repositoryPath);

    expect(context.authoringState).toBe("missing");
    expect(context.instructions).toEqual([]);
    expect(context.fallbackFiles).toEqual([
      "README.md",
      "CONTRIBUTING.md",
      "package.json",
    ]);
    expect(context.warnings).toContain(
      "No AGENTS.md instructions were found.",
    );
  });

  it("does not modify repository files during discovery", async () => {
    const repositoryPath = await createRepository();
    const readmePath = join(repositoryPath, "README.md");
    await writeFile(readmePath, "Original content\n");

    await discoverRepositoryInstructions(repositoryPath);

    expect(await readFile(readmePath, "utf8")).toBe("Original content\n");
  });
});
