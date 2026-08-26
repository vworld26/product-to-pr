import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type {
  AutomatedImplementationProvider,
} from "./provider.js";

const execFileAsync = promisify(execFile);

type ImplementationBinding = {
  branch: string;
  commit: string;
  specificationDigest: string;
};

export type ImplementationRunner = (
  repositoryPath: string,
  prompt: string,
) => Promise<string>;

export type ImplementationCommand = {
  command: AutomatedImplementationProvider;
  args: string[];
  cwd?: string;
  label: string;
};

function readBinding(packageContent: string): ImplementationBinding {
  const branch = packageContent.match(/^- Branch: (.+)$/m)?.[1];
  const commit = packageContent.match(/^- Starting commit: ([a-f0-9]{40})$/m)?.[1];
  const specificationDigest = packageContent.match(
    /^- Specification SHA-256: ([a-f0-9]{64})$/m,
  )?.[1];

  if (!branch || !commit || !specificationDigest) {
    throw new Error(
      "The implementation package is missing its branch, commit, or specification binding.",
    );
  }
  return { branch, commit, specificationDigest };
}

async function git(repositoryPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, ...args],
    { encoding: "utf8" },
  );
  return stdout.trim();
}

function hasUnrelatedChanges(status: string): boolean {
  return status
    .split("\n")
    .filter(Boolean)
    .some((line) => !line.slice(3).startsWith(".product-to-pr/"));
}

export function buildImplementationPrompt(
  specification: string,
  implementationPackage: string,
): string {
  return [
    "Implement the approved specification in this repository.",
    "Work only within the approved scope and follow all repository instructions.",
    "You may inspect the repository and edit the files needed for the approved change.",
    "Do not run tests or typechecking in this stage.",
    "Do not commit, push, open a pull request, or modify .product-to-pr artifacts.",
    "Stop after making the local code changes and summarize the files changed.",
    "",
    "Approved specification:",
    specification,
    "",
    "Implementation package:",
    implementationPackage,
  ].join("\n");
}

export async function runCodexImplementation(
  repositoryPath: string,
  prompt: string,
): Promise<string> {
  return runImplementationCommand(
    buildImplementationCommand("codex", repositoryPath),
    prompt,
  );
}

export async function runClaudeImplementation(
  repositoryPath: string,
  prompt: string,
): Promise<string> {
  return runImplementationCommand(
    buildImplementationCommand("claude", repositoryPath),
    prompt,
  );
}

export function buildImplementationCommand(
  provider: AutomatedImplementationProvider,
  repositoryPath: string,
): ImplementationCommand {
  if (provider === "claude") {
    return {
      command: "claude",
      args: [
        "--print",
        "--no-session-persistence",
        "--safe-mode",
        "--permission-mode",
        "acceptEdits",
        "--output-format",
        "text",
        "--tools",
        "Read,Edit,Write,Glob,Grep",
      ],
      cwd: repositoryPath,
      label: "Claude Code",
    };
  }
  return {
    command: "codex",
    args: [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--sandbox",
      "workspace-write",
      "--cd",
      repositoryPath,
      "-",
    ],
    label: "Codex",
  };
}

export function implementationRunnerFor(
  provider: AutomatedImplementationProvider,
): ImplementationRunner {
  return provider === "claude"
    ? runClaudeImplementation
    : runCodexImplementation;
}

async function runImplementationCommand(
  implementationCommand: ImplementationCommand,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      implementationCommand.command,
      implementationCommand.args,
      {
        ...(implementationCommand.cwd
          ? { cwd: implementationCommand.cwd }
          : {}),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    let errorOutput = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `${implementationCommand.label} implementation timed out after 10 minutes.`,
        ),
      );
    }, 600_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      errorOutput += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(
          new Error(
            errorOutput.trim() ||
              `${implementationCommand.label} exited with status ${code}.`,
          ),
        );
      }
    });
    child.stdin.end(prompt);
  });
}

export async function implementApprovedPlan(
  repositoryPath: string,
  specificationPath: string,
  implementationPackagePath: string,
  runner: ImplementationRunner = runCodexImplementation,
): Promise<string> {
  const [specification, implementationPackage, branch, commit, status] =
    await Promise.all([
      readFile(specificationPath, "utf8"),
      readFile(implementationPackagePath, "utf8"),
      git(repositoryPath, ["branch", "--show-current"]),
      git(repositoryPath, ["rev-parse", "HEAD"]),
      git(repositoryPath, ["status", "--porcelain", "--untracked-files=all"]),
    ]);
  const binding = readBinding(implementationPackage);
  const specificationDigest = createHash("sha256")
    .update(specification)
    .digest("hex");

  if (branch !== binding.branch || commit !== binding.commit) {
    throw new Error(
      "The repository no longer matches the branch and commit approved for implementation.",
    );
  }
  if (specificationDigest !== binding.specificationDigest) {
    throw new Error(
      "The approved specification changed after the implementation package was created.",
    );
  }
  if (hasUnrelatedChanges(status)) {
    throw new Error(
      "The repository has unrelated changes. Commit or set them aside before implementation.",
    );
  }

  const summary = await runner(
    repositoryPath,
    buildImplementationPrompt(specification, implementationPackage),
  );
  const [finalCommit, finalSpecification, finalPackage] = await Promise.all([
    git(repositoryPath, ["rev-parse", "HEAD"]),
    readFile(specificationPath, "utf8"),
    readFile(implementationPackagePath, "utf8"),
  ]);
  if (finalCommit !== binding.commit) {
    throw new Error(
      "Implementation created a commit unexpectedly. Review the repository before continuing.",
    );
  }
  if (
    finalSpecification !== specification ||
    finalPackage !== implementationPackage
  ) {
    throw new Error(
      "Implementation changed a protected Product-to-PR artifact. Review the repository before continuing.",
    );
  }
  return summary;
}
