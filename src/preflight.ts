import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ImplementationProvider } from "./provider.js";

const execFileAsync = promisify(execFile);

export const readinessStatuses = [
  "Passed",
  "Needs attention",
  "Could not verify",
  "User confirmed",
] as const;

export type ReadinessStatus = (typeof readinessStatuses)[number];
export type ReadinessScope = "Git" | "GitHub" | "Repository" | "AI provider";

export type ReadinessResult = {
  id: string;
  label: string;
  scope: ReadinessScope;
  status: ReadinessStatus;
  blocking: boolean;
  explanation: string;
  nextAction: string;
};

export type ProbeRequest = {
  command: "git" | "gh" | "codex" | "claude";
  args: readonly string[];
  cwd?: string;
};

export type ProbeResponse = { stdout: string; stderr: string };
export type ReadinessProbeRunner = (
  request: ProbeRequest,
) => Promise<ProbeResponse>;

const runReadOnlyProbe: ReadinessProbeRunner = async ({ command, args, cwd }) => {
  const result = await execFileAsync(command, [...args], {
    cwd,
    encoding: "utf8",
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export type ManualAiReadiness = {
  name: string;
  usageMethod: string;
  confirmations: Partial<Record<ManualChecklistId, boolean>>;
};

export const manualAiChecklist = [
  { id: "access", label: "You can access the AI tool." },
  { id: "sign-in", label: "You are signed in to the intended account." },
  { id: "repository-access", label: "The tool can access only the intended repository." },
  { id: "data-sharing", label: "You understand what repository data the tool may share or retain." },
  { id: "commands-edits", label: "You understand which commands and file edits the tool can make." },
  { id: "approvals", label: "The tool will ask before consequential actions and preserve Product-to-PR approvals." },
] as const;

export type ManualChecklistId = (typeof manualAiChecklist)[number]["id"];

export type PreflightOptions = {
  repositoryPath: string;
  provider: ImplementationProvider;
  runner?: ReadinessProbeRunner;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  manualAi?: ManualAiReadiness;
};

export type PreflightReport = {
  provider: ImplementationProvider;
  results: ReadinessResult[];
  canContinue: boolean;
};

type GitHubRepositoryDetails = {
  full_name?: string;
  visibility?: string;
  private?: boolean;
  default_branch?: string;
  permissions?: { pull?: boolean; push?: boolean; admin?: boolean };
  security_and_analysis?: Record<string, { status?: string } | undefined>;
};

type GitHubBranchDetails = {
  protected?: boolean;
};

type GitHubCommitDetails = {
  sha?: string;
};

function result(
  id: string,
  label: string,
  scope: ReadinessScope,
  status: ReadinessStatus,
  blocking: boolean,
  explanation: string,
  nextAction = "No action needed.",
): ReadinessResult {
  return { id, label, scope, status, blocking, explanation, nextAction };
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The check did not return a usable response.";
}

function missingCommand(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function installAction(tool: "Git" | "GitHub CLI" | "Codex" | "Claude Code", platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    const command = tool === "Git" ? "xcode-select --install" : tool === "GitHub CLI"
      ? "brew install gh" : tool === "Codex" ? "npm install -g @openai/codex" : "Follow Claude Code's official macOS installation guide.";
    return `On macOS, install ${tool} (${command}), then rerun preflight. Product-to-PR will not install it for you.`;
  }
  return `Install ${tool} using its official instructions for your operating system, then rerun preflight. Product-to-PR will not install it for you.`;
}

async function probe(
  runner: ReadinessProbeRunner,
  request: ProbeRequest,
): Promise<ProbeResponse | Error> {
  try {
    return await runner(request);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function unavailableResult(
  id: string,
  label: string,
  scope: ReadinessScope,
  dependency: string,
): ReadinessResult {
  return result(
    id, label, scope, "Could not verify", false,
    `${label} was not checked because ${dependency} is not ready. This uncertainty is a non-blocking risk until that dependency is fixed.`,
    `Fix ${dependency}, then rerun preflight.`,
  );
}

function parseJson<T>(response: ProbeResponse | Error): T | undefined {
  if (response instanceof Error) return undefined;
  try {
    return JSON.parse(response.stdout) as T;
  } catch {
    return undefined;
  }
}

function manualResults(manualAi?: ManualAiReadiness): ReadinessResult[] {
  const identityReady = Boolean(manualAi?.name.trim() && manualAi.usageMethod.trim());
  const results = [result(
    "provider-manual-details", "Another AI tool details", "AI provider",
    identityReady ? "User confirmed" : "Needs attention", !identityReady,
    identityReady
      ? `${manualAi!.name.trim()} will be used via ${manualAi!.usageMethod.trim()}. Product-to-PR did not execute it. Automated operation would require a future dedicated provider adapter.`
      : "The tool name and how you use it are required so the manual handoff is unambiguous.",
    identityReady ? "No action needed." : "Enter the AI tool name and usage method, then rerun preflight.",
  )];

  for (const item of manualAiChecklist) {
    const confirmed = manualAi?.confirmations[item.id] === true;
    results.push(result(
      `provider-manual-${item.id}`, item.label, "AI provider",
      confirmed ? "User confirmed" : "Needs attention", !confirmed,
      confirmed
        ? "You confirmed this manual safety check; it was not verified automatically."
        : "This manual safety check must be confirmed before this provider can be used safely.",
      confirmed ? "No action needed." : `Review and confirm: ${item.label} Then rerun preflight.`,
    ));
  }
  return results;
}

export async function runPreflight(options: PreflightOptions): Promise<PreflightReport> {
  const runner = options.runner ?? runReadOnlyProbe;
  const platform = options.platform ?? process.platform;
  const results: ReadinessResult[] = [];
  let branchName = "";
  let localHead = "";

  const gitVersion = await probe(runner, { command: "git", args: ["--version"] });
  const gitReady = !(gitVersion instanceof Error);
  results.push(result(
    "git-available", "Git is available", "Git",
    gitReady ? "Passed" : "Needs attention", !gitReady,
    gitReady ? "Git can inspect the local repository." : `Git could not be started: ${errorText(gitVersion)}`,
    gitReady ? "No action needed." : installAction("Git", platform),
  ));

  const ghVersion = await probe(runner, { command: "gh", args: ["--version"] });
  const ghReady = !(ghVersion instanceof Error);
  results.push(result(
    "github-cli-available", "GitHub CLI is available", "GitHub",
    ghReady ? "Passed" : "Needs attention", !ghReady,
    ghReady ? "GitHub CLI can perform the read-only GitHub checks." : `GitHub CLI could not be started: ${errorText(ghVersion)}`,
    ghReady ? "No action needed." : installAction("GitHub CLI", platform),
  ));

  const auth = ghReady ? await probe(runner, { command: "gh", args: ["auth", "status"] }) : new Error("GitHub CLI is not available");
  const authenticated = ghReady && !(auth instanceof Error);
  results.push(ghReady ? result(
    "github-auth", "GitHub sign-in", "GitHub",
    authenticated ? "Passed" : "Needs attention", !authenticated,
    authenticated ? "GitHub CLI is signed in." : `GitHub sign-in could not be confirmed: ${errorText(auth)}`,
    authenticated ? "No action needed." : "Run `gh auth login` yourself, then rerun preflight.",
  ) : unavailableResult("github-auth", "GitHub sign-in", "GitHub", "GitHub CLI"));

  const inside = gitReady ? await probe(runner, {
    command: "git", args: ["-C", options.repositoryPath, "rev-parse", "--is-inside-work-tree"],
  }) : new Error("Git is not available");
  const repositoryReady = gitReady && !(inside instanceof Error) && inside.stdout.trim() === "true";
  results.push(gitReady ? result(
    "repository-local", "Local folder and Git repository", "Repository",
    repositoryReady ? "Passed" : "Needs attention", !repositoryReady,
    repositoryReady ? "The selected folder is a Git working tree." : "The selected folder could not be confirmed as a Git working tree.",
    repositoryReady ? "No action needed." : "Choose the intended Git repository folder, then rerun preflight.",
  ) : unavailableResult("repository-local", "Local folder and Git repository", "Repository", "Git"));

  if (repositoryReady) {
    const [branch, work, head] = await Promise.all([
      probe(runner, { command: "git", args: ["-C", options.repositoryPath, "branch", "--show-current"] }),
      probe(runner, { command: "git", args: ["-C", options.repositoryPath, "status", "--porcelain"] }),
      probe(runner, { command: "git", args: ["-C", options.repositoryPath, "rev-parse", "HEAD"] }),
    ]);
    branchName = branch instanceof Error ? "" : branch.stdout.trim();
    localHead = head instanceof Error ? "" : head.stdout.trim();
    results.push(result(
      "repository-branch", "Current branch", "Repository",
      branchName ? "Passed" : "Needs attention", !branchName,
      branchName ? `The current branch is ${branchName}.` : "No current branch was found; a detached HEAD cannot support the normal workflow.",
      branchName ? "No action needed." : "Check out the intended working branch, then rerun preflight.",
    ));
    const productStateExcluded = work instanceof Error ? [] : work.stdout
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.slice(3).startsWith(".product-to-pr/"));
    const dirty = !(work instanceof Error) && productStateExcluded.length > 0;
    results.push(result(
      "repository-worktree", "Uncommitted work", "Repository",
      work instanceof Error ? "Could not verify" : dirty ? "Needs attention" : "Passed", false,
      work instanceof Error ? `Uncommitted work could not be checked: ${errorText(work)}` : dirty
        ? "The repository has uncommitted changes. They may be intentional, but new work could overlap them."
        : "The working tree has no uncommitted product changes. Product-to-PR's own saved state is ignored.",
      work instanceof Error || dirty ? "Review and safely resolve or preserve the existing changes, then rerun preflight." : "No action needed.",
    ));
  } else {
    results.push(
      unavailableResult("repository-branch", "Current branch", "Repository", "the local Git repository"),
      unavailableResult("repository-worktree", "Uncommitted work", "Repository", "the local Git repository"),
      unavailableResult("repository-sync", "Local-versus-GitHub status", "Repository", "the local Git repository"),
    );
  }

  const connection = authenticated ? await probe(runner, { command: "gh", args: ["api", "rate_limit"] }) : new Error("GitHub sign-in is not ready");
  const connected = authenticated && !(connection instanceof Error);
  results.push(authenticated ? result(
    "github-connection", "GitHub connection", "GitHub",
    connected ? "Passed" : "Needs attention", !connected,
    connected ? "GitHub responded to a read-only API request." : `GitHub could not be reached: ${errorText(connection)}`,
    connected ? "No action needed." : "Check your network and GitHub availability, then rerun preflight.",
  ) : unavailableResult("github-connection", "GitHub connection", "GitHub", "GitHub sign-in"));

  const repositoryResponse = connected && repositoryReady
    ? await probe(runner, { command: "gh", args: ["api", "repos/{owner}/{repo}"], cwd: options.repositoryPath })
    : new Error("GitHub or repository is not ready");
  const repository = parseJson<GitHubRepositoryDetails>(repositoryResponse);
  const hasAccess = Boolean(repository?.full_name && repository.permissions?.pull);
  results.push(connected && repositoryReady ? result(
    "github-repository-access", "GitHub repository access", "GitHub",
    hasAccess ? "Passed" : "Needs attention", !hasAccess,
    hasAccess ? `GitHub confirmed read access to ${repository!.full_name}.` : "GitHub did not confirm access to the repository associated with this folder.",
    hasAccess ? "No action needed." : "Confirm the repository remote and your GitHub permissions, then rerun preflight.",
  ) : unavailableResult("github-repository-access", "GitHub repository access", "GitHub", connected ? "the local Git repository" : "the GitHub connection"));

  if (repositoryReady) {
    if (hasAccess && branchName && localHead) {
      const remoteCommitResponse = await probe(runner, {
        command: "gh",
        args: ["api", `repos/{owner}/{repo}/commits/${encodeURIComponent(branchName)}`],
        cwd: options.repositoryPath,
      });
      const remoteCommit = parseJson<GitHubCommitDetails>(remoteCommitResponse);
      const remoteHead = remoteCommit?.sha?.trim();
      const matches = Boolean(remoteHead && remoteHead === localHead);
      results.push(result(
        "repository-sync", "Local-versus-GitHub status", "Repository",
        !remoteHead ? "Could not verify" : matches ? "Passed" : "Needs attention", false,
        !remoteHead
          ? `The current branch (${branchName}) could not be compared with its live GitHub branch.`
          : matches
            ? `The local ${branchName} branch matches the live branch on GitHub.`
            : `The local ${branchName} branch does not match the live branch on GitHub. One may contain commits that the other does not.`,
        remoteHead && matches ? "No action needed." : "Review and safely synchronize the local and GitHub branches yourself, then rerun preflight.",
      ));
    } else {
      const dependency = !branchName || !localHead ? "the current local branch" : "GitHub repository access";
      results.push(unavailableResult("repository-sync", "Local-versus-GitHub status", "Repository", dependency));
    }
  }

  if (hasAccess) {
    const visibility = repository!.visibility ?? (repository!.private ? "private" : "public");
    const canWrite = Boolean(repository!.permissions?.push || repository!.permissions?.admin);
    results.push(
      result("github-visibility", "Repository visibility", "GitHub", "Passed", false, `The repository visibility is ${visibility}. Review this before sharing repository data.`),
      result(
        "github-user-access", "User repository access", "GitHub", canWrite ? "Passed" : "Needs attention", !canWrite,
        canWrite ? "Your GitHub account has write access." : "Your GitHub account does not have the write access required for a branch and pull-request workflow.",
        canWrite ? "No action needed." : "Ask a repository administrator for appropriate access or choose a workflow that does not require writing, then rerun preflight.",
      ),
    );
    const defaultBranch = repository!.default_branch;
    const protection = defaultBranch ? await probe(runner, {
      command: "gh", args: ["api", `repos/{owner}/{repo}/branches/${encodeURIComponent(defaultBranch)}`], cwd: options.repositoryPath,
    }) : new Error("No default branch was returned");
    const protectedBranch = parseJson<GitHubBranchDetails>(protection)?.protected;
    results.push(result(
      "github-default-protection", "Default-branch protection", "GitHub",
      protectedBranch === true ? "Passed" : protectedBranch === false ? "Needs attention" : "Could not verify", false,
      protectedBranch === true ? `GitHub confirms that ${defaultBranch} is protected.`
        : protectedBranch === false ? `GitHub confirms that ${defaultBranch} is not protected. Direct or insufficiently reviewed changes may be possible.`
        : `GitHub did not provide usable branch-protection evidence for ${defaultBranch ?? "the default branch"}.`,
      protectedBranch === true ? "No action needed." : "Ask a repository administrator to review default-branch protection, then rerun preflight.",
    ));
    const protections = repository!.security_and_analysis;
    const enabled = protections && Object.values(protections).filter((value) => value?.status === "enabled").length;
    results.push(result(
      "github-secret-protections", "Available secret protections", "GitHub",
      protections ? (enabled ? "Passed" : "Needs attention") : "Could not verify", false,
      protections ? (enabled ? `${enabled} repository security protection(s) are enabled.` : "GitHub reported no enabled repository security protections; accidental secret exposure may be harder to detect.")
        : "GitHub did not expose security-and-analysis settings to this account, so secret protections could not be verified.",
      protections && enabled ? "No action needed." : "Ask a repository administrator to review secret scanning and push protection, then rerun preflight.",
    ));
  } else {
    results.push(
      unavailableResult("github-visibility", "Repository visibility", "GitHub", "GitHub repository access"),
      unavailableResult("github-user-access", "User repository access", "GitHub", "GitHub repository access"),
      unavailableResult("github-default-protection", "Default-branch protection", "GitHub", "GitHub repository access"),
      unavailableResult("github-secret-protections", "Available secret protections", "GitHub", "GitHub repository access"),
    );
  }

  const userResponse = connected ? await probe(runner, { command: "gh", args: ["api", "user"] }) : new Error("GitHub connection is not ready");
  const user = parseJson<{ two_factor_authentication?: boolean }>(userResponse);
  const twoFactor = user?.two_factor_authentication;
  results.push(connected ? result(
    "github-two-factor", "Two-factor authentication", "GitHub",
    twoFactor === true ? "Passed" : twoFactor === false ? "Needs attention" : "Could not verify", false,
    twoFactor === true ? "GitHub confirmed two-factor authentication is enabled."
      : twoFactor === false ? "GitHub reports that two-factor authentication is disabled, increasing account risk."
      : "GitHub did not expose two-factor authentication status for this account.",
    twoFactor === true ? "No action needed." : "Review two-factor authentication in your GitHub account security settings, then rerun preflight.",
  ) : unavailableResult("github-two-factor", "Two-factor authentication", "GitHub", "the GitHub connection"));

  if (options.provider === "manual") {
    results.push(...manualResults(options.manualAi));
  } else {
    const nestedClaude = options.provider === "claude" && Boolean((options.environment ?? process.env).CLAUDECODE);
    if (nestedClaude) {
      results.push(result(
        "provider-claude", "Claude Code readiness", "AI provider", "Needs attention", true,
        "Claude Code cannot be started inside an existing Claude Code session.",
        "Choose Another AI manual handoff and give the displayed instructions to the current Claude session, then rerun preflight.",
      ));
    } else {
      const versionResponse = await probe(runner, { command: options.provider, args: ["--version"] });
      const installed = !(versionResponse instanceof Error);
      const authArgs = options.provider === "codex" ? ["login", "status"] as const : ["auth", "status"] as const;
      const authResponse = installed
        ? await probe(runner, { command: options.provider, args: authArgs })
        : new Error("The provider is not installed");
      const authenticatedProvider = installed && !(authResponse instanceof Error);
      const label = options.provider === "codex" ? "Codex" : "Claude Code";
      results.push(result(
        `provider-${options.provider}`, `${label} readiness`, "AI provider",
        authenticatedProvider ? "Passed" : "Needs attention", !authenticatedProvider,
        authenticatedProvider ? `${label} is installed and signed in.` : !installed
          ? `${label} could not be started: ${errorText(versionResponse)}`
          : `${label} is installed, but sign-in could not be confirmed: ${errorText(authResponse)}`,
        authenticatedProvider ? "No action needed." : missingCommand(versionResponse)
          ? installAction(label, platform)
          : installed
            ? `Run \`${options.provider === "codex" ? "codex login" : "claude auth login"}\` yourself, then rerun preflight or choose Another AI manual handoff.`
            : `Check ${label} installation, then rerun preflight or choose Another AI manual handoff.`,
      ));
    }
  }

  return {
    provider: options.provider,
    results,
    canContinue: !results.some((item) => item.blocking && item.status !== "Passed" && item.status !== "User confirmed"),
  };
}

export function nonBlockingRisks(report: PreflightReport): ReadinessResult[] {
  return report.results.filter((item) => !item.blocking && (item.status === "Needs attention" || item.status === "Could not verify"));
}

export function formatPreflightReport(report: PreflightReport): string {
  const sections = readinessStatuses.flatMap((status) => {
    const matching = report.results.filter((item) => item.status === status);
    if (matching.length === 0) return [];
    return [`## ${status}\n\n${matching.map((item) => `- ${item.label} (${item.scope})${item.blocking ? " — BLOCKS WORKFLOW" : ""}\n  ${item.explanation}\n  Next: ${item.nextAction}`).join("\n")}`];
  });
  const blockers = report.results.filter((item) => item.blocking && item.status !== "Passed" && item.status !== "User confirmed");
  const risks = nonBlockingRisks(report);
  return [
    "# Preflight readiness",
    report.canContinue ? "The required workflow capabilities are ready." : "The workflow cannot continue until every blocker is fixed or you choose another workflow.",
    ...sections,
    `## Blockers\n\n${blockers.length ? blockers.map((item) => `- ${item.label}: ${item.nextAction}`).join("\n") : "None."}`,
    `## One confirmation for non-blocking risks\n\n${risks.length ? `Confirm together that you understand and accept these risks before continuing:\n${risks.map((item) => `- ${item.label}: ${item.explanation}`).join("\n")}` : "No non-blocking risks need confirmation."}`,
    "## Rerun\n\nAfter making fixes yourself, rerun this preflight check. It will only perform the same safe, read-only checks.",
  ].join("\n\n");
}
