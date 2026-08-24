import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

import type { ProductPlan } from "./plan.js";

const execFileAsync = promisify(execFile);

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "implementation"
  );
}

function checklist(values: string[]): string {
  return values.map((value) => `- [ ] ${value}`).join("\n");
}

async function readGitValue(
  repositoryPath: string,
  args: string[],
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, ...args],
    { encoding: "utf8" },
  );
  return stdout.trim();
}

function formatImplementationPackage(
  repositoryPath: string,
  specificationPath: string,
  specificationDigest: string,
  branchName: string,
  commit: string,
  plan: ProductPlan,
): string {
  const relevantFiles = plan.repositoryOverview.relevantFiles.length > 0
    ? plan.repositoryOverview.relevantFiles.map(
      (file) => `- ${file.path} — ${file.reason}`,
    ).join("\n")
    : "- No likely relevant files identified.";
  const instructions = plan.repositoryOverview.instructionContext.instructions;
  const repositoryInstructions = instructions.length > 0
    ? instructions.map(
      (instruction) => `- ${instruction.path} (scope: ${instruction.scope})`,
    ).join("\n")
    : "- No `AGENTS.md` instructions were found.";

  return [
    `# Implementation package: ${plan.title}`,
    "## Approved scope",
    `- Specification: ${relative(repositoryPath, specificationPath)}`,
    `- Specification SHA-256: ${specificationDigest}`,
    `- Branch: ${branchName}`,
    `- Starting commit: ${commit}`,
    "## Relevant files",
    relevantFiles,
    "## Repository instructions",
    repositoryInstructions,
    "## Acceptance checklist",
    checklist(plan.acceptanceCriteria),
    "## Implementation checklist",
    checklist(plan.implementationSteps),
    "## Verification checklist",
    checklist(plan.testPlan),
    "",
  ].join("\n\n");
}

export async function preserveImplementationPackage(
  repositoryPath: string,
  specificationPath: string,
  plan: ProductPlan,
  createdAt = new Date(),
): Promise<string> {
  const [branchName, commit, specification] = await Promise.all([
    readGitValue(repositoryPath, ["branch", "--show-current"]),
    readGitValue(repositoryPath, ["rev-parse", "HEAD"]),
    readFile(specificationPath),
  ]);

  if (!branchName) {
    throw new Error(
      "Building requires an implementation branch, but the repository is in a detached state.",
    );
  }

  const directory = join(repositoryPath, ".product-to-pr", "implementations");
  const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `${slugify(plan.title)}-${timestamp}.md`);
  const specificationDigest = createHash("sha256")
    .update(specification)
    .digest("hex");
  const content = formatImplementationPackage(
    repositoryPath,
    specificationPath,
    specificationDigest,
    branchName,
    commit,
    plan,
  );

  await mkdir(directory, { recursive: true });
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  return path;
}
