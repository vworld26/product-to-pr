import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import { discoverRepositoryInstructions } from "./instructions.js";
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
  ".ini",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".py",
  ".rb",
  ".sh",
  ".toml",
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

export async function discoverRelevantFiles(
  repositoryPath: string,
  featureRequest: string,
): Promise<{ files: RepositoryOverview["relevantFiles"]; searched: number }> {
  const terms = requestTerms(featureRequest);
  let paths: string[];

  try {
    paths = await listSearchableFiles(repositoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Repository path does not exist: ${repositoryPath}.`);
    }
    throw error;
  }

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

async function readPackageJson(
  repositoryPath: string,
): Promise<PackageJson | undefined> {
  const packagePath = join(repositoryPath, "package.json");

  try {
    return JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`The package.json in ${repositoryPath} is not readable.`);
  }
}

async function readPurpose(
  repositoryPath: string,
  packageJson: PackageJson | undefined,
  searchablePaths: string[],
): Promise<string> {
  if (packageJson?.description) {
    return packageJson.description;
  }

  async function readDocumentPurpose(path: string): Promise<string | undefined> {
    try {
      const content = await readFile(join(repositoryPath, path), "utf8");
      return content
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .find(
        (value) => value && !value.startsWith("#") && !value.startsWith("---"),
      );
    } catch {
      return undefined;
    }
  }

  const readmePurpose = await readDocumentPurpose("README.md");
  if (readmePurpose) return readmePurpose;

  const skillPath = searchablePaths.find((path) => path.endsWith("SKILL.md"));
  if (!skillPath) return "Purpose not documented.";
  return await readDocumentPurpose(skillPath) ??
    `Skill repository defined by ${skillPath}.`;
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

function inferTechnologies(paths: string[]): string[] {
  const extensionTechnologies = new Map([
    [".js", "JavaScript"],
    [".jsx", "JavaScript"],
    [".py", "Python"],
    [".rb", "Ruby"],
    [".sh", "Shell"],
    [".ts", "TypeScript"],
    [".tsx", "TypeScript"],
  ]);
  return paths
    .map((path) => extensionTechnologies.get(extname(path)))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));
}

function inferEntryPoints(paths: string[]): string[] {
  const skillFiles = paths.filter((path) => path.endsWith("SKILL.md"));
  const scriptFiles = paths.filter(
    (path) => path.includes("scripts/") && [".js", ".py", ".sh"].includes(extname(path)),
  );
  const entryPoints = [...skillFiles, ...scriptFiles].slice(0, 6);
  return entryPoints.length > 0
    ? entryPoints
    : ["No likely entry point identified from repository files."];
}

async function inferTestApproach(
  repositoryPath: string,
  paths: string[],
): Promise<string[]> {
  if (paths.includes("pytest.ini")) return ["pytest: python -m pytest"];
  if (paths.includes("pyproject.toml")) {
    const content = await readFile(join(repositoryPath, "pyproject.toml"), "utf8");
    if (content.includes("[tool.pytest")) return ["pytest: python -m pytest"];
  }
  return ["No safe automated verification command discovered."];
}

export async function inspectRepository(
  repositoryPath: string,
  featureRequest: string,
): Promise<RepositoryOverview> {
  const packageJson = await readPackageJson(repositoryPath);
  const entries = await readdir(repositoryPath, { withFileTypes: true });
  const scripts = packageJson?.scripts ?? {};
  const packages = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };
  const searchablePaths = await listSearchableFiles(repositoryPath);
  const technologies = packageJson
    ? ["Node.js", ...Object.keys(packages)]
      .filter((value, index, values) => values.indexOf(value) === index)
    : inferTechnologies(searchablePaths);

  const testScripts = Object.entries(scripts)
    .filter(([name]) => name.includes("test"))
    .map(([name, command]) => `${name}: ${command}`);
  const relevantFileSearch = await discoverRelevantFiles(
    repositoryPath,
    featureRequest,
  );

  return {
    purpose: await readPurpose(repositoryPath, packageJson, searchablePaths),
    technologies,
    structure: entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .filter((entry) => entry.name !== "node_modules" && entry.name !== "dist")
      .map((entry) => `${entry.name}/`),
    entryPoints: packageJson
      ? findEntryPoints(scripts)
      : inferEntryPoints(searchablePaths),
    testApproach:
      testScripts.length > 0
        ? testScripts
        : packageJson
        ? ["No test script identified."]
        : await inferTestApproach(repositoryPath, searchablePaths),
    instructionContext: await discoverRepositoryInstructions(
      repositoryPath,
      relevantFileSearch.files.map((file) => file.path),
    ),
    relevantFiles: relevantFileSearch.files,
    inspectionNotes: [
      `Searched ${relevantFileSearch.searched} readable code and documentation files.`,
      "Results are ranked keyword matches; indirect runtime connections or generated files may be missed.",
    ],
  };
}
