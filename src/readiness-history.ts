import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";

import type { ImplementationProvider } from "./provider.js";

export type ReadinessHistory = {
  version: 1;
  completedSessionIds: string[];
  checkedRepositories: string[];
  checkedProviders: ImplementationProvider[];
  lastPreflightSessionCount: number;
  lastOfferedSessionCount: number;
};

export type PreflightTiming = {
  kind: "required" | "recommended" | "not-due";
  reason:
    | "requested"
    | "new-repository"
    | "core-dependency"
    | "new-provider"
    | "five-sessions"
    | "current";
};

export type HistoryLocationOptions = {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
};

function emptyHistory(): ReadinessHistory {
  return {
    version: 1,
    completedSessionIds: [],
    checkedRepositories: [],
    checkedProviders: [],
    lastPreflightSessionCount: 0,
    lastOfferedSessionCount: 0,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isProvider(value: unknown): value is ImplementationProvider {
  return value === "codex" || value === "claude" || value === "manual";
}

function isHistory(value: unknown): value is ReadinessHistory {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReadinessHistory>;
  return candidate.version === 1 &&
    Array.isArray(candidate.completedSessionIds) &&
    candidate.completedSessionIds.every((item) => typeof item === "string") &&
    Array.isArray(candidate.checkedRepositories) &&
    candidate.checkedRepositories.every((item) => typeof item === "string") &&
    Array.isArray(candidate.checkedProviders) &&
    candidate.checkedProviders.every(isProvider) &&
    Number.isInteger(candidate.lastPreflightSessionCount) &&
    Number.isInteger(candidate.lastOfferedSessionCount);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function repositoryHistoryId(repositoryPath: string): string {
  return hash(resolve(repositoryPath));
}

export function completedSessionId(
  repositoryPath: string,
  specificationDigest: string,
): string {
  return hash(`${resolve(repositoryPath)}\0${specificationDigest}`);
}

export function readinessHistoryPath(
  options: HistoryLocationOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const home = options.homeDirectory ?? homedir();
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Product-to-PR", "readiness.json");
  }
  if (platform === "win32") {
    return win32.join(
      environment.LOCALAPPDATA ?? win32.join(home, "AppData", "Local"),
      "Product-to-PR",
      "readiness.json",
    );
  }
  return join(environment.XDG_STATE_HOME ?? join(home, ".local", "state"), "product-to-pr", "readiness.json");
}

export async function loadReadinessHistory(
  path = readinessHistoryPath(),
): Promise<ReadinessHistory> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isHistory(parsed)) {
      throw new Error("The saved readiness history uses an unsupported or incomplete format.");
    }
    return {
      ...parsed,
      completedSessionIds: unique(parsed.completedSessionIds),
      checkedRepositories: unique(parsed.checkedRepositories),
      checkedProviders: unique(parsed.checkedProviders),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
    if (error instanceof SyntaxError) {
      throw new Error(
        `Readiness history is not valid JSON: ${path}. Use --clear-preflight-history to reset it.`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function saveReadinessHistory(
  path: string,
  history: ReadinessHistory,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export function preflightTiming(
  history: ReadinessHistory,
  repositoryPath: string,
  provider: ImplementationProvider,
  force = false,
): PreflightTiming {
  if (force) return { kind: "required", reason: "requested" };
  if (!history.checkedRepositories.includes(repositoryHistoryId(repositoryPath))) {
    return { kind: "required", reason: "new-repository" };
  }
  if (!history.checkedProviders.includes("codex")) {
    return { kind: "required", reason: "core-dependency" };
  }
  if (!history.checkedProviders.includes(provider)) {
    return { kind: "required", reason: "new-provider" };
  }
  const latestPromptCount = Math.max(
    history.lastPreflightSessionCount,
    history.lastOfferedSessionCount,
  );
  if (history.completedSessionIds.length - latestPromptCount >= 5) {
    return { kind: "recommended", reason: "five-sessions" };
  }
  return { kind: "not-due", reason: "current" };
}

export async function recordCompletedSession(
  sessionId: string,
  path = readinessHistoryPath(),
): Promise<{ count: number; newlyCounted: boolean }> {
  const history = await loadReadinessHistory(path);
  if (history.completedSessionIds.includes(sessionId)) {
    return { count: history.completedSessionIds.length, newlyCounted: false };
  }
  history.completedSessionIds.push(sessionId);
  await saveReadinessHistory(path, history);
  return { count: history.completedSessionIds.length, newlyCounted: true };
}

export async function recordPreflightCompleted(
  repositoryPath: string,
  provider: ImplementationProvider,
  path = readinessHistoryPath(),
): Promise<void> {
  const history = await loadReadinessHistory(path);
  history.checkedRepositories = unique([
    ...history.checkedRepositories,
    repositoryHistoryId(repositoryPath),
  ]);
  history.checkedProviders = unique([
    ...history.checkedProviders,
    "codex",
    provider,
  ]);
  history.lastPreflightSessionCount = history.completedSessionIds.length;
  history.lastOfferedSessionCount = history.completedSessionIds.length;
  await saveReadinessHistory(path, history);
}

export async function recordPreflightOffered(
  path = readinessHistoryPath(),
): Promise<void> {
  const history = await loadReadinessHistory(path);
  history.lastOfferedSessionCount = history.completedSessionIds.length;
  await saveReadinessHistory(path, history);
}

export async function clearReadinessHistory(
  path = readinessHistoryPath(),
): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
