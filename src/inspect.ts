import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type { RepositoryOverview } from "./plan.js";

type PackageJson = {
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const ignoredDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "release",
]);

const searchableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".rb",
  ".ts",
  ".tsx",
]);

function requestTerms(featureRequest: string): string[] {
  const ignoredTerms = new Set([
    "add",
    "all",
    "and",
    "every",
    "for",
    "from",
    "into",
    "the",
    "to",
    "with",
  ]);

  return featureRequest
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !ignoredTerms.has(term))
    .filter((term, index, terms) => terms.indexOf(term) === index) ?? [];
}

async function listSearchableFiles(
  repositoryPath: string,
  directoryPath = repositoryPath,
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name) && !entry.name.startsWith(".")) {
        files.push(...await listSearchableFiles(repositoryPath, path));
      }
    } else if (
      searchableExtensions.has(extname(entry.name)) &&
      !entry.name.endsWith("-lock.json") &&
      entry.name !== "package-lock.json"
    ) {
      files.push(relative(repositoryPath, path));
    }
  }

  return files;
}

function explainMatch(path: string, matchedTerms: string[]): string {
  if (path.includes(".test.") || path.includes(".spec.")) {
    return `Tests related behavior matching: ${matchedTerms.join(", ")}.`;
  }

  if (path.endsWith("format.ts") || path.endsWith("format.tsx")) {
    return `Formats output related to: ${matchedTerms.join(", ")}.`;
  }

  return `Contains code related to: ${matchedTerms.join(", ")}.`;
}

async function findRelevantFiles(
  repositoryPath: string,
  featureRequest: string,
): Promise<{ files: RepositoryOverview["relevantFiles"]; searched: number }> {
  const terms = requestTerms(featureRequest);
  const paths = await listSearchableFiles(repositoryPath);
  const matches = await Promise.all(
    paths.map(async (path) => {
      const content = await readFile(join(repositoryPath, path), "utf8");
      const searchableText = `${path}\n${content}`.toLowerCase();
      const matchedTerms = terms.filter((term) => searchableText.includes(term));
      const score = matchedTerms.reduce((total, term) => {
        const occurrences = searchableText.split(term).length - 1;
        return total + Math.min(occurrences, 10);
      }, path.startsWith("src/") ? 4 : 0);

      return { path, matchedTerms, score };
    }),
  );

  return {
    files: matches
      .filter((match) => match.matchedTerms.length > 0)
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, 6)
      .map((match) => ({
        path: match.path,
        reason: explainMatch(match.path, match.matchedTerms),
      })),
    searched: paths.length,
  };
}

async function readPackageJson(repositoryPath: string): Promise<PackageJson> {
  const packagePath = join(repositoryPath, "package.json");

  try {
    return JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
  } catch {
    throw new Error(`No readable package.json found in ${repositoryPath}.`);
  }
}

async function readPurpose(
  repositoryPath: string,
  packageJson: PackageJson,
): Promise<string> {
  if (packageJson.description) {
    return packageJson.description;
  }

  try {
    const readme = await readFile(join(repositoryPath, "README.md"), "utf8");
    const paragraph = readme
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .find((value) => value && !value.startsWith("#"));

    return paragraph ?? "Purpose not documented.";
  } catch {
    return "Purpose not documented.";
  }
}

function findEntryPoints(scripts: Record<string, string>): string[] {
  const entryScriptNames = new Set(["dev", "start", "serve"]);
  const sourceFiles = Object.entries(scripts)
    .filter(([name]) => entryScriptNames.has(name))
    .map(([, command]) => command)
    .flatMap((command) => command.match(/\b[\w./-]+\.(?:ts|tsx|js|jsx)\b/g) ?? [])
    .filter((value, index, values) => values.indexOf(value) === index);

  return sourceFiles.length > 0
    ? sourceFiles
    : ["No entry point identified from package scripts."];
}

export async function inspectRepository(
  repositoryPath: string,
  featureRequest: string,
): Promise<RepositoryOverview> {
  const packageJson = await readPackageJson(repositoryPath);
  const entries = await readdir(repositoryPath, { withFileTypes: true });
  const scripts = packageJson.scripts ?? {};
  const packages = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const technologies = [
    "Node.js",
    ...Object.keys(packages),
  ].filter((value, index, values) => values.indexOf(value) === index);

  const testScripts = Object.entries(scripts)
    .filter(([name]) => name.includes("test"))
    .map(([name, command]) => `${name}: ${command}`);
  const relevantFileSearch = await findRelevantFiles(
    repositoryPath,
    featureRequest,
  );

  return {
    purpose: await readPurpose(repositoryPath, packageJson),
    technologies,
    structure: entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .filter((entry) => entry.name !== "node_modules" && entry.name !== "dist")
      .map((entry) => `${entry.name}/`),
    entryPoints: findEntryPoints(scripts),
    testApproach:
      testScripts.length > 0 ? testScripts : ["No test script identified."],
    relevantFiles: relevantFileSearch.files,
    inspectionNotes: [
      `Searched ${relevantFileSearch.searched} readable code and documentation files.`,
      "Results are ranked keyword matches; indirect runtime connections or generated files may be missed.",
    ],
  };
}
