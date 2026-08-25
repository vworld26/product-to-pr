import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ProductPlan } from "./plan.js";
import { formatReviewHandoff, type ReviewHandoff } from "./handoff.js";
import { readLocalChangeEvidence, type LocalReview } from "./review.js";

const execFileAsync = promisify(execFile);

async function command(
  executable: string,
  args: string[],
  repositoryPath: string,
): Promise<string> {
  const { stdout } = await execFileAsync(executable, args, {
    cwd: repositoryPath,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  return stdout.trim();
}

async function git(repositoryPath: string, args: string[]): Promise<string> {
  return command("git", ["-C", repositoryPath, ...args], repositoryPath);
}

export function proposeCommitMessage(plan: ProductPlan): string {
  const subject = plan.title
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/^./, (character) => character.toLowerCase());
  return `feat: ${subject}`.slice(0, 72);
}

export async function commitReviewedChanges(
  repositoryPath: string,
  message: string,
  review: LocalReview,
): Promise<string> {
  const branch = await git(repositoryPath, ["branch", "--show-current"]);
  requireImplementationBranch(branch);
  const current = await readLocalChangeEvidence(repositoryPath);
  const files = current.changedFiles;
  if (files.length === 0) {
    throw new Error("There are no reviewed product changes to commit.");
  }
  if (
    current.changeDigest !== review.changeDigest ||
    JSON.stringify(current.changedFiles) !== JSON.stringify(review.changedFiles)
  ) {
    throw new Error(
      "The local changes no longer match the reviewed diff. Review them again before committing.",
    );
  }
  await git(repositoryPath, ["add", "--", ...files]);
  await git(repositoryPath, ["commit", "-m", message]);
  return git(repositoryPath, ["rev-parse", "HEAD"]);
}

function requireImplementationBranch(branch: string): void {
  if (!branch || !branch.startsWith("product-to-pr/")) {
    throw new Error(
      "Publication requires an isolated product-to-pr implementation branch.",
    );
  }
}

export async function pushImplementationBranch(
  repositoryPath: string,
): Promise<string> {
  const branch = await git(repositoryPath, ["branch", "--show-current"]);
  requireImplementationBranch(branch);
  await git(repositoryPath, ["push", "--set-upstream", "origin", branch]);
  return branch;
}

export function buildPullRequestBody(
  plan: ProductPlan,
  review: LocalReview,
  handoff?: ReviewHandoff,
): string {
  return [
    "## Product outcome",
    plan.summary,
    "## Changed files",
    ...review.changedFiles.map((path) => `- ${path}`),
    "## Acceptance review",
    ...review.acceptance.map(
      (result) => `- **${result.status}** — ${result.criterion}: ${result.evidence}`,
    ),
    "## Verification",
    ...review.verification.map(
      (result) => `- ${result.passed ? "Passed" : "Failed"}: \`${result.command}\``,
    ),
    "## Safety",
    "- Implementation was performed on an isolated branch.",
    "- The approved specification and implementation package were preserved.",
    ...(handoff
      ? ["## Review handoff", ...formatReviewHandoff(handoff)]
      : []),
  ].join("\n\n");
}

export type PullRequestRunner = (
  repositoryPath: string,
  args: string[],
) => Promise<string>;

const runGitHub: PullRequestRunner = (repositoryPath, args) =>
  command("gh", args, repositoryPath);

export async function openPullRequest(
  repositoryPath: string,
  plan: ProductPlan,
  review: LocalReview,
  handoff?: ReviewHandoff,
  runner: PullRequestRunner = runGitHub,
): Promise<string> {
  const branch = await git(repositoryPath, ["branch", "--show-current"]);
  requireImplementationBranch(branch);
  try {
    return await runner(repositoryPath, [
      "pr", "create", "--base", "main", "--head", branch,
      "--title", plan.title, "--body", buildPullRequestBody(plan, review, handoff),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub error.";
    throw new Error(
      `Pull request creation failed. Check \`gh auth status\`, then retry. ${message}`,
    );
  }
}

export async function requestPullRequestReview(
  repositoryPath: string,
  pullRequestUrl: string,
  reviewer: string,
  runner: PullRequestRunner = runGitHub,
): Promise<void> {
  try {
    await runner(repositoryPath, [
      "pr", "edit", pullRequestUrl, "--add-reviewer", reviewer,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub error.";
    throw new Error(
      `The pull request was opened, but requesting review from ${reviewer} failed. Add the reviewer in GitHub or retry. ${message}`,
    );
  }
}
