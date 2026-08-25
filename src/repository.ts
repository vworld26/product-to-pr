import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitHubRepository = {
  nameWithOwner: string;
  isPrivate: boolean;
  url: string;
};

export type PreparedRepository = {
  repositoryPath: string;
  source: "local" | "github";
  sourceUrl?: string;
  sourceRef?: string;
  workspaceRoot?: string;
};

export type WorkspaceChoice = "keep" | "delete";
export type WorkspaceApproval = {
  approved: boolean;
  sourceRef?: string;
};

export function parseGitHubRepositoryUrl(input: string): string | undefined {
  try {
    const url = new URL(input);
    if (url.hostname !== "github.com") return undefined;
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    return parts.length === 2 ? `${parts[0]}/${parts[1]}` : undefined;
  } catch {
    return undefined;
  }
}

function looksLikeGitHubUrl(input: string): boolean {
  return /^https?:\/\/github\.com(?:\/|$)/i.test(input);
}

export function parseWorkspaceChoice(input: string): WorkspaceChoice | undefined {
  const choice = input.trim().toLowerCase();
  if (choice === "k" || choice === "keep") return "keep";
  if (choice === "d" || choice === "delete") return "delete";
  return undefined;
}

export type RepositoryMetadataReader = (
  nameWithOwner: string,
) => Promise<GitHubRepository>;
export type RepositoryCloner = (
  nameWithOwner: string,
  destination: string,
  sourceRef?: string,
) => Promise<void>;

const readGitHubRepository: RepositoryMetadataReader = async (nameWithOwner) => {
  const { stdout } = await execFileAsync(
    "gh",
    ["repo", "view", nameWithOwner, "--json", "nameWithOwner,isPrivate,url"],
    { encoding: "utf8" },
  );
  return JSON.parse(stdout) as GitHubRepository;
};

const cloneGitHubRepository: RepositoryCloner = async (
  nameWithOwner,
  destination,
  sourceRef,
) => {
  const cloneOptions = sourceRef
    ? ["--branch", sourceRef, "--depth=1"]
    : ["--depth=1"];
  await execFileAsync(
    "gh",
    ["repo", "clone", nameWithOwner, destination, "--", ...cloneOptions],
    { encoding: "utf8" },
  );
};

export async function prepareRepository(
  input: string,
  approveWorkspace: (
    repository: GitHubRepository,
  ) => Promise<boolean | WorkspaceApproval>,
  readMetadata: RepositoryMetadataReader = readGitHubRepository,
  cloneRepository: RepositoryCloner = cloneGitHubRepository,
): Promise<PreparedRepository> {
  const nameWithOwner = parseGitHubRepositoryUrl(input);
  if (!nameWithOwner) {
    if (looksLikeGitHubUrl(input)) {
      throw new Error(
        "A GitHub repository URL must look like https://github.com/owner/repository.",
      );
    }
    return { repositoryPath: input, source: "local" };
  }

  let repository: GitHubRepository;
  try {
    repository = await readMetadata(nameWithOwner);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub error.";
    throw new Error(
      `GitHub repository access failed. Check \`gh auth status\`, the URL, and your permissions. ${message}`,
    );
  }
  const approval = await approveWorkspace(repository);
  const approved = typeof approval === "boolean" ? approval : approval.approved;
  const sourceRef = typeof approval === "boolean" ? undefined : approval.sourceRef;
  if (!approved) {
    throw new Error("GitHub workspace creation was not approved.");
  }

  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "product-to-pr-workspace-"),
  );
  const repositoryPath = join(
    workspaceRoot,
    basename(repository.nameWithOwner),
  );
  try {
    await cloneRepository(repository.nameWithOwner, repositoryPath, sourceRef);
  } catch (error) {
    await rm(workspaceRoot, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "Unknown clone error.";
    throw new Error(`GitHub workspace setup failed: ${message}`);
  }

  return {
    repositoryPath,
    source: "github",
    sourceUrl: repository.url,
    ...(sourceRef ? { sourceRef } : {}),
    workspaceRoot,
  };
}

export async function deleteManagedWorkspace(
  repository: PreparedRepository,
): Promise<void> {
  if (repository.source !== "github" || !repository.workspaceRoot) {
    throw new Error("Only a managed GitHub workspace can be deleted.");
  }
  await rm(repository.workspaceRoot, { recursive: true, force: true });
}
