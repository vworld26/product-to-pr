import { describe, expect, it, vi } from "vitest";

import {
  formatPreflightReport,
  manualAiChecklist,
  nonBlockingRisks,
  readinessStatuses,
  runPreflight,
  type ProbeRequest,
  type ReadinessProbeRunner,
} from "./preflight.js";

function successfulRunner(overrides: Partial<Record<string, string>> = {}) {
  const calls: ProbeRequest[] = [];
  const runner: ReadinessProbeRunner = async (request) => {
    calls.push(request);
    const key = `${request.command} ${request.args.join(" ")}`;
    const defaults: Record<string, string> = {
      "git --version": "git version 2.50.0",
      "gh --version": "gh version 2.76.0",
      "gh auth status": "Logged in",
      "git -C /repo rev-parse --is-inside-work-tree": "true",
      "git -C /repo branch --show-current": "feature/preflight",
      "git -C /repo status --porcelain": "",
      "git -C /repo rev-parse HEAD": "abc123",
      "gh api rate_limit": "{}",
      "gh api repos/{owner}/{repo}": JSON.stringify({
        full_name: "owner/repo", visibility: "private", default_branch: "main",
        permissions: { pull: true, push: true },
        security_and_analysis: { secret_scanning: { status: "enabled" } },
      }),
      "gh api repos/{owner}/{repo}/commits/feature%2Fpreflight": JSON.stringify({ sha: "abc123" }),
      "gh api repos/{owner}/{repo}/branches/main": JSON.stringify({ protected: true }),
      "gh api user": JSON.stringify({ two_factor_authentication: true }),
      "codex --version": "codex 1.0",
      "codex login status": "Logged in",
      "claude --version": "claude 1.0",
      "claude auth status": JSON.stringify({ loggedIn: true }),
    };
    const value = key in overrides ? overrides[key] : defaults[key];
    if (value === undefined) throw new Error(`Unexpected probe: ${key}`);
    return { stdout: value, stderr: "" };
  };
  return { runner, calls };
}

describe("guided preflight", () => {
  it("uses only approved statuses and produces a ready report", async () => {
    const { runner } = successfulRunner();
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });

    expect(report.canContinue).toBe(true);
    expect(report.results.every((item) => readinessStatuses.includes(item.status))).toBe(true);
    expect(report.results.every((item) => item.scope && item.explanation && item.nextAction)).toBe(true);
  });

  it("runs fixed read-only probes and checks only the selected provider", async () => {
    const { runner, calls } = successfulRunner();
    await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });

    expect(calls).toContainEqual({ command: "codex", args: ["--version"] });
    expect(calls).toContainEqual({ command: "codex", args: ["login", "status"] });
    expect(calls.some((call) => call.command === "claude")).toBe(false);
    expect(calls).toContainEqual({ command: "gh", args: ["api", "repos/{owner}/{repo}"], cwd: "/repo" });
    expect(calls).toContainEqual({ command: "gh", args: ["api", "repos/{owner}/{repo}/commits/feature%2Fpreflight"], cwd: "/repo" });
    expect(calls.some((call) => call.command === "git" && call.args.includes("fetch"))).toBe(false);
    expect(calls.every((call) => !call.args.some((argument) => /^(install|config|edit|create|delete|merge|push)$/.test(argument)))).toBe(true);
  });

  it("checks Claude but not Codex when Claude is selected", async () => {
    const { runner, calls } = successfulRunner();
    await runPreflight({ repositoryPath: "/repo", provider: "claude", runner, environment: {} });
    expect(calls).toContainEqual({ command: "claude", args: ["--version"] });
    expect(calls).toContainEqual({ command: "claude", args: ["auth", "status"] });
    expect(calls.some((call) => call.command === "codex")).toBe(false);
  });

  it("blocks when the selected provider is installed but not signed in", async () => {
    const { runner: baseRunner } = successfulRunner();
    const runner: ReadinessProbeRunner = async (request) => {
      if (request.command === "codex" && request.args.join(" ") === "login status") {
        throw new Error("Not logged in");
      }
      return baseRunner(request);
    };
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });
    expect(report.results.find((item) => item.id === "provider-codex")).toMatchObject({ status: "Needs attention", blocking: true });
    expect(report.results.find((item) => item.id === "provider-codex")?.nextAction).toContain("codex login");
    expect(report.canContinue).toBe(false);
  });

  it("preserves the nested-Claude safeguard without probing Claude", async () => {
    const { runner, calls } = successfulRunner();
    const report = await runPreflight({ repositoryPath: "/repo", provider: "claude", runner, environment: { CLAUDECODE: "1" } });
    const provider = report.results.find((item) => item.id === "provider-claude");
    expect(provider).toMatchObject({ status: "Needs attention", blocking: true });
    expect(provider?.nextAction).toContain("manual handoff");
    expect(calls.some((call) => call.command === "claude")).toBe(false);
  });

  it("never executes input for Another AI and requires every manual confirmation", async () => {
    const { runner, calls } = successfulRunner();
    const hostileMethod = "tool; rm -rf important-files";
    const report = await runPreflight({
      repositoryPath: "/repo", provider: "manual", runner,
      manualAi: { name: "Example AI", usageMethod: hostileMethod, confirmations: { access: true } },
    });
    expect(calls.some((call) => call.command !== "git" && call.command !== "gh")).toBe(false);
    expect(calls.flatMap((call) => call.args)).not.toContain(hostileMethod);
    expect(report.results.find((item) => item.id === "provider-manual-details")?.explanation).toContain("future dedicated provider adapter");
    expect(report.results.find((item) => item.id === "provider-manual-access")?.status).toBe("User confirmed");
    expect(report.results.find((item) => item.id === "provider-manual-sign-in")).toMatchObject({ status: "Needs attention", blocking: true });
    expect(report.canContinue).toBe(false);
  });

  it("accepts a fully user-confirmed manual checklist", async () => {
    const { runner } = successfulRunner();
    const confirmations = Object.fromEntries(manualAiChecklist.map((item) => [item.id, true]));
    const report = await runPreflight({ repositoryPath: "/repo", provider: "manual", runner, manualAi: { name: "My AI", usageMethod: "web browser", confirmations } });
    expect(report.results.filter((item) => item.id.startsWith("provider-manual-")).every((item) => item.status === "User confirmed")).toBe(true);
    expect(report.canContinue).toBe(true);
  });

  it("classifies missing core tools and gives macOS remediation", async () => {
    const missing = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    const runner: ReadinessProbeRunner = vi.fn(async (request) => {
      if (request.command === "git" || request.command === "gh" || request.command === "codex") throw missing;
      throw new Error("unexpected");
    });
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner, platform: "darwin" });
    expect(report.canContinue).toBe(false);
    expect(report.results.find((item) => item.id === "git-available")).toMatchObject({ status: "Needs attention", blocking: true });
    expect(report.results.find((item) => item.id === "github-auth")?.status).toBe("Could not verify");
    expect(report.results.find((item) => item.id === "provider-codex")?.nextAction).toContain("npm install -g @openai/codex");
  });

  it("distinguishes blockers from dirty, divergent, and unverifiable non-blocking risks", async () => {
    const { runner } = successfulRunner({
      "git -C /repo status --porcelain": " M src/file.ts",
      "gh api repos/{owner}/{repo}/commits/feature%2Fpreflight": JSON.stringify({ sha: "different456" }),
      "gh api user": "{}",
      "gh api repos/{owner}/{repo}": JSON.stringify({ full_name: "owner/repo", visibility: "public", default_branch: "main", permissions: { pull: true, push: true } }),
    });
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });
    const risks = nonBlockingRisks(report);
    expect(risks.map((item) => item.id)).toEqual(expect.arrayContaining(["repository-worktree", "repository-sync", "github-secret-protections", "github-two-factor"]));
    expect(risks.every((item) => !item.blocking)).toBe(true);
  });

  it("distinguishes absent branch protection from unavailable evidence", async () => {
    const unprotected = successfulRunner({
      "gh api repos/{owner}/{repo}/branches/main": JSON.stringify({ protected: false }),
    });
    const unprotectedReport = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner: unprotected.runner });
    expect(unprotectedReport.results.find((item) => item.id === "github-default-protection")?.status).toBe("Needs attention");

    const available = successfulRunner();
    const unavailableRunner: ReadinessProbeRunner = async (request) => {
      if (request.command === "gh" && request.args.join(" ") === "api repos/{owner}/{repo}/branches/main") {
        throw new Error("permission denied");
      }
      return available.runner(request);
    };
    const unavailableReport = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner: unavailableRunner });
    expect(unavailableReport.results.find((item) => item.id === "github-default-protection")?.status).toBe("Could not verify");
  });

  it("blocks inaccessible repositories and degrades dependent checks safely", async () => {
    const { runner } = successfulRunner({ "gh api repos/{owner}/{repo}": JSON.stringify({ message: "Not Found" }) });
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });
    expect(report.results.find((item) => item.id === "github-repository-access")).toMatchObject({ status: "Needs attention", blocking: true });
    expect(report.results.find((item) => item.id === "github-visibility")?.status).toBe("Could not verify");
    expect(report.canContinue).toBe(false);
  });

  it("formats grouped beginner guidance, blockers, one risk confirmation, and rerun help", async () => {
    const { runner } = successfulRunner({ "git -C /repo status --porcelain": "?? notes.txt" });
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });
    const output = formatPreflightReport(report);
    expect(output).toContain("## Passed");
    expect(output).toContain("## Needs attention");
    expect(output).toContain("## Blockers");
    expect(output).toContain("## One confirmation for non-blocking risks");
    expect(output).toContain("Uncommitted work");
    expect(output).toContain("## Rerun");
  });

  it("does not treat Product-to-PR's own saved state as product work", async () => {
    const { runner } = successfulRunner({
      "git -C /repo status --porcelain": "?? .product-to-pr/",
    });
    const report = await runPreflight({ repositoryPath: "/repo", provider: "codex", runner });
    expect(report.results.find((item) => item.id === "repository-worktree")).toMatchObject({ status: "Passed" });
    expect(report.results.find((item) => item.id === "repository-worktree")?.explanation).toContain("saved state is ignored");
  });

  it("does not include passing, blocking, or user-confirmed items in combined risks", async () => {
    const { runner } = successfulRunner();
    const confirmations = Object.fromEntries(manualAiChecklist.map((item) => [item.id, true]));
    const report = await runPreflight({ repositoryPath: "/repo", provider: "manual", runner, manualAi: { name: "AI", usageMethod: "browser", confirmations } });
    expect(nonBlockingRisks(report)).toEqual([]);
  });
});
