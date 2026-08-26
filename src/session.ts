import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import type { OperatingMode } from "./mode.js";
import type { ProductPlan } from "./plan.js";
import type { PreparedRepository } from "./repository.js";

const execFileAsync = promisify(execFile);

export type ResumableSession = {
  version: 1;
  stage: "specification-approved";
  createdAt: string;
  featureRequest: string;
  repository: {
    path: string;
    source: "local" | "github";
    sourceUrl?: string;
    sourceRef?: string;
    branch: string;
    commit: string;
    worktreeDigest: string;
  };
  specification: {
    path: string;
    digest: string;
    content: string;
  };
  plan: ProductPlan;
  operatingMode?: OperatingMode;
  remainingActions: string[];
};

export type LoadedSession = ResumableSession & { sessionPath: string };

function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 60) || "session";
}

async function git(repositoryPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryPath, ...args],
    { encoding: "utf8" },
  );
  return stdout.trim();
}

async function worktreeDigest(repositoryPath: string): Promise<string> {
  const status = await git(repositoryPath, ["status", "--porcelain"]);
  const productChanges = status.split("\n").filter(Boolean)
    .filter((line) => !line.slice(3).startsWith(".product-to-pr/"))
    .sort().join("\n");
  return digest(productChanges);
}

function isSession(value: unknown): value is ResumableSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResumableSession>;
  return candidate.version === 1 &&
    candidate.stage === "specification-approved" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.featureRequest === "string" &&
    Boolean(candidate.repository &&
      typeof candidate.repository.path === "string" &&
      typeof candidate.repository.branch === "string" &&
      typeof candidate.repository.commit === "string" &&
      typeof candidate.repository.worktreeDigest === "string") &&
    Boolean(candidate.specification &&
      typeof candidate.specification.path === "string" &&
      typeof candidate.specification.digest === "string" &&
      typeof candidate.specification.content === "string") &&
    Boolean(candidate.plan && typeof candidate.plan.title === "string") &&
    Array.isArray(candidate.remainingActions);
}

export async function saveResumableSession(
  repository: PreparedRepository,
  featureRequest: string,
  plan: ProductPlan,
  specificationPath: string,
  specification: string,
  createdAt = new Date(),
): Promise<LoadedSession> {
  const storedSpecification = await readFile(specificationPath, "utf8");
  if (storedSpecification !== specification) {
    throw new Error("The saved specification does not match the approved content.");
  }
  const [branch, commit, repositoryWorktreeDigest] = await Promise.all([
    git(repository.repositoryPath, ["branch", "--show-current"]),
    git(repository.repositoryPath, ["rev-parse", "HEAD"]),
    worktreeDigest(repository.repositoryPath),
  ]);
  const session: ResumableSession = {
    version: 1,
    stage: "specification-approved",
    createdAt: createdAt.toISOString(),
    featureRequest,
    repository: {
      path: resolve(repository.repositoryPath),
      source: repository.source,
      ...(repository.sourceUrl ? { sourceUrl: repository.sourceUrl } : {}),
      ...(repository.sourceRef ? { sourceRef: repository.sourceRef } : {}),
      branch,
      commit,
      worktreeDigest: repositoryWorktreeDigest,
    },
    specification: {
      path: resolve(specificationPath),
      digest: digest(specification),
      content: specification,
    },
    plan,
    remainingActions: [
      "Choose an operating mode and implementation provider or stop.",
      "Create an implementation branch and build the approved plan.",
      "Verify and review local changes before publication.",
    ],
  };
  const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const sessionPath = join(
    repository.repositoryPath,
    ".product-to-pr",
    "sessions",
    `${slugify(plan.title)}-${timestamp}.json`,
  );
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return { ...session, sessionPath };
}

export async function loadResumableSession(
  sessionPath: string,
  repositoryPath: string,
): Promise<LoadedSession> {
  let session: unknown;
  try {
    session = JSON.parse(await readFile(sessionPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Resume session does not exist: ${sessionPath}.`);
    }
    throw new Error(`Resume session is not valid JSON: ${sessionPath}.`);
  }
  if (!isSession(session)) {
    throw new Error("Resume session is malformed or uses an unsupported version.");
  }
  if (resolve(repositoryPath) !== resolve(session.repository.path)) {
    throw new Error(
      `Resume session belongs to ${session.repository.path}, not ${resolve(repositoryPath)}.`,
    );
  }
  const repositoryRoot = `${resolve(repositoryPath)}/`;
  if (!resolve(session.specification.path).startsWith(repositoryRoot)) {
    throw new Error("Resume session specification is outside its repository.");
  }
  const [branch, commit, repositoryWorktreeDigest, specification] = await Promise.all([
    git(repositoryPath, ["branch", "--show-current"]),
    git(repositoryPath, ["rev-parse", "HEAD"]),
    worktreeDigest(repositoryPath),
    readFile(session.specification.path, "utf8"),
  ]);
  if (branch !== session.repository.branch || commit !== session.repository.commit) {
    throw new Error(
      "Repository branch or commit changed after this session was saved. Start a new plan or restore the recorded repository state.",
    );
  }
  if (repositoryWorktreeDigest !== session.repository.worktreeDigest) {
    throw new Error(
      "Uncommitted repository changes no longer match this saved session. Review the working tree before resuming.",
    );
  }
  if (digest(specification) !== session.specification.digest ||
      specification !== session.specification.content) {
    throw new Error(
      "The approved specification changed after this session was saved. Review and approve it again before resuming.",
    );
  }
  return { ...session, sessionPath: resolve(sessionPath) };
}

export async function saveSessionOperatingMode(
  session: LoadedSession,
  operatingMode: OperatingMode,
): Promise<LoadedSession> {
  const updated = {
    ...session,
    operatingMode,
    remainingActions: [
      `Continue using ${operatingMode} mode or stop.`,
      ...session.remainingActions.slice(1),
    ],
  };
  const { sessionPath: _sessionPath, ...stored } = updated;
  await writeFile(session.sessionPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return updated;
}

export function managedWorkspaceDeletionWarning(sessionPath?: string): string {
  return sessionPath
    ? `Deleting this folder also deletes its only resumable session (${sessionPath}), saved specifications, and unpushed work.`
    : "Deleting this folder also deletes any specifications or unpushed work stored only inside it.";
}
