import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export type RepositoryInstruction = {
  path: string;
  scope: string;
  applicableFiles: string[];
  content: string;
};

export type InstructionContext = {
  instructions: RepositoryInstruction[];
  fallbackFiles: string[];
  warnings: string[];
  authoringState: "found" | "missing";
};

const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "release",
]);

const fallbackFileNames = [
  "README.md",
  "CONTRIBUTING.md",
  "package.json",
];

async function findInstructionPaths(
  repositoryPath: string,
  directoryPath = repositoryPath,
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const instructionPaths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        instructionPaths.push(
          ...await findInstructionPaths(repositoryPath, entryPath),
        );
      }
    } else if (entry.name === "AGENTS.md") {
      instructionPaths.push(relative(repositoryPath, entryPath));
    }
  }

  return instructionPaths;
}

async function findFallbackFiles(repositoryPath: string): Promise<string[]> {
  const rootEntries = new Set(await readdir(repositoryPath));

  return fallbackFileNames.filter((fileName) => rootEntries.has(fileName));
}

function instructionDepth(path: string): number {
  return path.split("/").length;
}

function instructionScope(path: string): string {
  const scope = dirname(path);
  return scope === "." ? "." : scope;
}

function filesInScope(scope: string, relevantFiles: string[]): string[] {
  if (scope === ".") {
    return relevantFiles;
  }

  return relevantFiles.filter(
    (path) => path === scope || path.startsWith(`${scope}/`),
  );
}

export async function discoverRepositoryInstructions(
  repositoryPath: string,
  relevantFiles: string[] = [],
): Promise<InstructionContext> {
  const instructionPaths = (await findInstructionPaths(repositoryPath)).sort(
    (left, right) =>
      instructionDepth(left) - instructionDepth(right) ||
      left.localeCompare(right),
  );
  const instructions = await Promise.all(
    instructionPaths.map(async (path) => ({
      path,
      scope: instructionScope(path),
      applicableFiles: filesInScope(instructionScope(path), relevantFiles),
      content: await readFile(join(repositoryPath, path), "utf8"),
    })),
  );

  if (instructions.length > 0) {
    return {
      instructions,
      fallbackFiles: [],
      warnings: [],
      authoringState: "found",
    };
  }

  return {
    instructions: [],
    fallbackFiles: await findFallbackFiles(repositoryPath),
    warnings: ["No AGENTS.md instructions were found."],
    authoringState: "missing",
  };
}
