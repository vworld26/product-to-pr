import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { RepositoryOverview } from "./plan.js";

type PackageJson = {
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

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
  };
}
