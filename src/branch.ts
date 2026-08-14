import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "approved-feature"
  );
}

async function git(
  repositoryPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
  });
}

function hasUnrelatedChanges(status: string): boolean {
  return status
    .split("\n")
    .filter(Boolean)
    .some((line) => {
      const path = line.slice(3);
      return !path.startsWith(".product-to-pr/specifications/");
    });
}

async function branchExists(
  repositoryPath: string,
  branchName: string,
): Promise<boolean> {
  try {
    await git(repositoryPath, [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchName}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function createImplementationBranch(
  repositoryPath: string,
  title: string,
): Promise<string> {
  try {
    await git(repositoryPath, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error(
      "Building requires a Git repository so the original code can be protected.",
    );
  }

  const { stdout: status } = await git(repositoryPath, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (hasUnrelatedChanges(status)) {
    throw new Error(
      "The repository already has unsaved changes. Commit or set them aside before building.",
    );
  }

  const baseName = `product-to-pr/${slugify(title)}`;
  let branchName = baseName;
  let suffix = 2;

  while (await branchExists(repositoryPath, branchName)) {
    branchName = `${baseName}-${suffix}`;
    suffix += 1;
  }

  await git(repositoryPath, ["switch", "-c", branchName]);
  return branchName;
}
