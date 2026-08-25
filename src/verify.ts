import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export type VerificationCommand = {
  name: string;
  command: string;
  executable: string;
  args: string[];
};

export type VerificationResult = VerificationCommand & {
  passed: boolean;
  output: string;
};

const verificationScripts = ["typecheck", "lint", "test", "build"];

export async function discoverVerificationCommands(
  repositoryPath: string,
): Promise<VerificationCommand[]> {
  const packageJson = JSON.parse(
    await readFile(`${repositoryPath}/package.json`, "utf8"),
  ) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};

  return verificationScripts
    .filter((name) => scripts[name])
    .map((name) => ({
      name,
      command: name === "test" ? "npm test" : `npm run ${name}`,
      executable: "npm",
      args: name === "test" ? ["test"] : ["run", name],
    }));
}

function runCommand(
  repositoryPath: string,
  command: VerificationCommand,
): Promise<VerificationResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command.executable,
      command.args,
      { cwd: repositoryPath, encoding: "utf8", timeout: 300_000 },
      (error, stdout, stderr) => {
        resolve({
          ...command,
          passed: !error,
          output: `${stdout}${stderr}`.trim() || (error?.message ?? "No output."),
        });
      },
    );
    child.stdin?.end();
  });
}

export async function runVerificationCommands(
  repositoryPath: string,
  commands: VerificationCommand[],
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const command of commands) {
    results.push(await runCommand(repositoryPath, command));
  }
  return results;
}
