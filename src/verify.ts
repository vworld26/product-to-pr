import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

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

export type VerificationDiscovery = {
  trustedCommands: VerificationCommand[];
  candidateCommands: string[];
  confidence: "high" | "medium" | "low";
  guidance: string[];
};

const verificationScripts = ["typecheck", "lint", "test", "build"];

const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules"]);

async function findVerificationDocuments(
  repositoryPath: string,
  directoryPath = repositoryPath,
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directoryPath, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      paths.push(...await findVerificationDocuments(repositoryPath, path));
    } else if (["AGENTS.md", "SKILL.md", "README.md"].includes(entry.name)) {
      paths.push(relative(repositoryPath, path));
    }
  }
  return paths;
}

async function findPossibleCheckScripts(
  repositoryPath: string,
  directoryPath = repositoryPath,
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const commands: string[] = [];
  for (const entry of entries) {
    const path = join(directoryPath, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      commands.push(...await findPossibleCheckScripts(repositoryPath, path));
    } else if (/^(?:check|test|verify)[\w-]*\.(?:js|py|sh)$/.test(entry.name)) {
      const repositoryPathname = relative(repositoryPath, path);
      const executable = entry.name.endsWith(".py")
        ? "python" : entry.name.endsWith(".js") ? "node" : "sh";
      commands.push(`${executable} ${repositoryPathname}`);
    }
  }
  return commands;
}

function commandFromText(command: string): VerificationCommand | undefined {
  const value = command.trim().replace(/^`|`$/g, "");
  if (value === "npm test") {
    return { name: "test", command: value, executable: "npm", args: ["test"] };
  }
  const npmScript = value.match(/^npm run ([\w:-]+)$/);
  if (npmScript) {
    return {
      name: npmScript[1], command: value, executable: "npm",
      args: ["run", npmScript[1]],
    };
  }
  if (value === "python -m pytest" || value === "python3 -m pytest") {
    const executable = value.startsWith("python3") ? "python3" : "python";
    return { name: "test", command: value, executable, args: ["-m", "pytest"] };
  }
  return undefined;
}

function documentedCommands(content: string): string[] {
  return content.match(/\b(?:npm test|npm run [\w:-]+|python3? -m pytest)\b/g) ?? [];
}

function declaredCommands(content: string): VerificationCommand[] {
  return content
    .split("\n")
    .map((line) => line.match(/Product-to-PR verification:\s*(.+)$/i)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(commandFromText)
    .filter((value): value is VerificationCommand => Boolean(value));
}

function uniqueCommands(commands: VerificationCommand[]): VerificationCommand[] {
  return commands.filter(
    (command, index, values) =>
      values.findIndex((candidate) => candidate.command === command.command) === index,
  );
}

export async function discoverVerification(
  repositoryPath: string,
): Promise<VerificationDiscovery> {
  const configured = await discoverConfiguredCommands(repositoryPath);
  const documentPaths = await findVerificationDocuments(repositoryPath);
  const [documents, possibleScripts] = await Promise.all([
    Promise.all(
      documentPaths.map(async (path) => ({
        path,
        content: await readFile(join(repositoryPath, path), "utf8"),
      })),
    ),
    findPossibleCheckScripts(repositoryPath),
  ]);
  const declared = documents
    .filter((document) =>
      document.path.endsWith("AGENTS.md") || document.path.endsWith("SKILL.md")
    )
    .flatMap((document) => declaredCommands(document.content));
  const trustedCommands = uniqueCommands([...configured, ...declared]);
  const trustedText = new Set(trustedCommands.map((command) => command.command));
  const candidateCommands = [
    ...documents.flatMap((document) => documentedCommands(document.content)),
    ...possibleScripts,
  ]
    .filter((command) => !trustedText.has(command))
    .filter((command, index, values) => values.indexOf(command) === index);
  const confidence = trustedCommands.length > 0
    ? "high"
    : candidateCommands.length > 0 ? "medium" : "low";
  const guidance = trustedCommands.length > 0
    ? ["Only explicitly configured or declared commands are eligible to run."]
    : candidateCommands.length > 0
    ? [
      "Possible verification commands were documented, but they will not run until the repository explicitly trusts them.",
      "Add a line such as `Product-to-PR verification: npm test` to AGENTS.md or SKILL.md after confirming the command is safe.",
    ]
    : [
      "No automated verification command was found. Add a known package or pytest configuration, or declare a safe command in AGENTS.md or SKILL.md.",
    ];
  return { trustedCommands, candidateCommands, confidence, guidance };
}

async function discoverConfiguredCommands(
  repositoryPath: string,
): Promise<VerificationCommand[]> {
  let packageJson: { scripts?: Record<string, string> } | undefined;
  try {
    packageJson = JSON.parse(
      await readFile(`${repositoryPath}/package.json`, "utf8"),
    ) as { scripts?: Record<string, string> };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (!packageJson) {
    try {
      const pyproject = await readFile(`${repositoryPath}/pyproject.toml`, "utf8");
      return pyproject.includes("[tool.pytest")
        ? [{
          name: "test",
          command: "python -m pytest",
          executable: "python",
          args: ["-m", "pytest"],
        }]
        : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        try {
          await readFile(`${repositoryPath}/pytest.ini`, "utf8");
          return [{
            name: "test",
            command: "python -m pytest",
            executable: "python",
            args: ["-m", "pytest"],
          }];
        } catch (pytestError) {
          if ((pytestError as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw pytestError;
        }
      }
      throw error;
    }
  }
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

export async function discoverVerificationCommands(
  repositoryPath: string,
): Promise<VerificationCommand[]> {
  return (await discoverVerification(repositoryPath)).trustedCommands;
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
