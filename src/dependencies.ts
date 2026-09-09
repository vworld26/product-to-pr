import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DependencyInstall = {
  command: "npm ci" | "npm install";
  args: string[];
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function suggestedDependencyInstall(
  repositoryPath: string,
): Promise<DependencyInstall | undefined> {
  if (!await exists(join(repositoryPath, "package.json")) ||
      await exists(join(repositoryPath, "node_modules"))) {
    return undefined;
  }
  const packageJson = JSON.parse(
    await readFile(join(repositoryPath, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  if (
    Object.keys(packageJson.dependencies ?? {}).length === 0 &&
    Object.keys(packageJson.devDependencies ?? {}).length === 0
  ) return undefined;
  return await exists(join(repositoryPath, "package-lock.json"))
    ? { command: "npm ci", args: ["ci"] }
    : { command: "npm install", args: ["install"] };
}

export async function installDependencies(
  repositoryPath: string,
  install: DependencyInstall,
): Promise<void> {
  await execFileAsync("npm", install.args, {
    cwd: repositoryPath,
    encoding: "utf8",
    timeout: 300_000,
  });
}
