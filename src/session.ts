import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { CritiqueFlowResult } from "./critique-flow.js";
import type { EvaluationReport } from "./evaluation.js";
import type { OperatingMode } from "./mode.js";
import type { ProductPlan } from "./plan.js";
import type { ImplementationProvider } from "./provider.js";
import type { PreparedRepository } from "./repository.js";
import { readLocalChangeEvidence, type LocalReview } from "./review.js";

const execFileAsync = promisify(execFile);

export type SessionStage =
  | "specification-approved"
  | "implementation-completed"
  | "verification-completed";

type SessionRepository = {
  path: string;
  source: "local" | "github";
  sourceUrl?: string;
  sourceRef?: string;
  branch: string;
  commit: string;
  worktreeDigest: string;
};

type SessionSpecification = {
  path: string;
  digest: string;
  content: string;
};

export type ImplementationCheckpoint = {
  provider: ImplementationProvider;
  packagePath: string;
  packageDigest: string;
  changeDigest: string;
  changedFiles: string[];
  completedAt: string;
};

export type VerificationCheckpoint = {
  review: LocalReview;
  reviewDigest: string;
  evaluation: EvaluationReport;
  critique: CritiqueFlowResult;
  critiquePromptDigest?: string;
  completedAt: string;
};

type SessionBase = {
  createdAt: string;
  updatedAt?: string;
  featureRequest: string;
  repository: SessionRepository;
  specification: SessionSpecification;
  plan: ProductPlan;
  operatingMode?: OperatingMode;
  remainingActions: string[];
};

export type ResumableSessionV1 = SessionBase & {
  version: 1;
  stage: "specification-approved";
};

export type ResumableSessionV2 = SessionBase & {
  version: 2;
  stage: SessionStage;
  implementation?: ImplementationCheckpoint;
  verification?: VerificationCheckpoint;
};

export type ResumableSession = ResumableSessionV1 | ResumableSessionV2;
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

async function readArtifact(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `The saved ${label} is missing. Restore it at ${path} or start a new session.`,
      );
    }
    throw error;
  }
}

async function legacyWorktreeDigest(repositoryPath: string): Promise<string> {
  const status = await git(repositoryPath, ["status", "--porcelain"]);
  const productChanges = status.split("\n").filter(Boolean)
    .filter((line) => !line.slice(3).startsWith(".product-to-pr/"))
    .sort().join("\n");
  return digest(productChanges);
}

async function worktreeDigest(repositoryPath: string): Promise<string> {
  const evidence = await readLocalChangeEvidence(repositoryPath);
  return digest(JSON.stringify({
    changedFiles: [...evidence.changedFiles].sort(),
    changeDigest: evidence.changeDigest,
  }));
}

function isImplementationProvider(value: unknown): value is ImplementationProvider {
  return value === "codex" || value === "claude" || value === "manual";
}

function hasBase(value: unknown): value is SessionBase & { version: number; stage: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionBase> & { version?: unknown; stage?: unknown };
  return (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.stage === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.featureRequest === "string" &&
    Boolean(candidate.repository &&
      typeof candidate.repository.path === "string" &&
      (candidate.repository.source === "local" || candidate.repository.source === "github") &&
      typeof candidate.repository.branch === "string" &&
      typeof candidate.repository.commit === "string" &&
      typeof candidate.repository.worktreeDigest === "string") &&
    Boolean(candidate.specification &&
      typeof candidate.specification.path === "string" &&
      typeof candidate.specification.digest === "string" &&
      typeof candidate.specification.content === "string") &&
    Boolean(candidate.plan && typeof candidate.plan.title === "string") &&
    Array.isArray(candidate.remainingActions) &&
    candidate.remainingActions.every((item) => typeof item === "string");
}

function isImplementationCheckpoint(value: unknown): value is ImplementationCheckpoint {
  if (!value || typeof value !== "object") return false;
  const checkpoint = value as Partial<ImplementationCheckpoint>;
  return isImplementationProvider(checkpoint.provider) &&
    typeof checkpoint.packagePath === "string" &&
    typeof checkpoint.packageDigest === "string" &&
    typeof checkpoint.changeDigest === "string" &&
    Array.isArray(checkpoint.changedFiles) &&
    checkpoint.changedFiles.every((item) => typeof item === "string") &&
    typeof checkpoint.completedAt === "string";
}

function isVerificationCheckpoint(value: unknown): value is VerificationCheckpoint {
  if (!value || typeof value !== "object") return false;
  const checkpoint = value as Partial<VerificationCheckpoint>;
  const validCritique = Boolean(checkpoint.critique &&
    ["completed", "manual-handoff", "skipped"].includes(checkpoint.critique.status));
  const validPromptDigest = checkpoint.critique?.status !== "manual-handoff" ||
    typeof checkpoint.critiquePromptDigest === "string";
  return Boolean(checkpoint.review &&
      Array.isArray(checkpoint.review.changedFiles) &&
      typeof checkpoint.review.changeDigest === "string") &&
    typeof checkpoint.reviewDigest === "string" &&
    Boolean(checkpoint.evaluation &&
      checkpoint.evaluation.artifact === "implementation" &&
      Array.isArray(checkpoint.evaluation.findings)) &&
    validCritique && validPromptDigest &&
    typeof checkpoint.completedAt === "string";
}

function isSession(value: unknown): value is ResumableSession {
  if (!hasBase(value)) return false;
  if (value.version === 1) return value.stage === "specification-approved";
  if (!["specification-approved", "implementation-completed", "verification-completed"]
    .includes(value.stage)) return false;
  const candidate = value as ResumableSessionV2;
  if (candidate.stage === "specification-approved") {
    return !candidate.implementation && !candidate.verification;
  }
  if (!isImplementationCheckpoint(candidate.implementation)) return false;
  return candidate.stage === "implementation-completed"
    ? !candidate.verification
    : isVerificationCheckpoint(candidate.verification);
}

function isInsideRepository(repositoryPath: string, artifactPath: string): boolean {
  const relationship = relative(resolve(repositoryPath), resolve(artifactPath));
  return relationship !== "" && !relationship.startsWith("..") && !isAbsolute(relationship);
}

async function writeSession(session: LoadedSession): Promise<void> {
  const { sessionPath: _sessionPath, ...stored } = session;
  const temporaryPath = `${session.sessionPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, session.sessionPath);
}

export function hasImplementationCheckpoint(
  session: LoadedSession,
): session is LoadedSession & ResumableSessionV2 & { implementation: ImplementationCheckpoint } {
  return session.version === 2 && session.stage !== "specification-approved" &&
    Boolean(session.implementation);
}

export function hasVerificationCheckpoint(
  session: LoadedSession,
): session is LoadedSession & ResumableSessionV2 & {
  implementation: ImplementationCheckpoint;
  verification: VerificationCheckpoint;
} {
  return hasImplementationCheckpoint(session) &&
    session.stage === "verification-completed" && Boolean(session.verification);
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
  const session: ResumableSessionV2 = {
    version: 2,
    stage: "specification-approved",
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
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
    mode: 0o600,
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
  if (!isInsideRepository(repositoryPath, session.specification.path)) {
    throw new Error("Resume session specification is outside its repository.");
  }
  const [branch, commit, repositoryWorktreeDigest, specification] = await Promise.all([
    git(repositoryPath, ["branch", "--show-current"]),
    git(repositoryPath, ["rev-parse", "HEAD"]),
    session.version === 1
      ? legacyWorktreeDigest(repositoryPath)
      : worktreeDigest(repositoryPath),
    readArtifact(session.specification.path, "approved specification"),
  ]);
  if (branch !== session.repository.branch || commit !== session.repository.commit) {
    throw new Error(
      "Repository branch or commit changed after this session was saved. Start a new plan or restore the recorded repository state.",
    );
  }
  if (digest(specification) !== session.specification.digest ||
      specification !== session.specification.content) {
    throw new Error(
      "The approved specification changed after this session was saved. Review and approve it again before resuming.",
    );
  }
  if (repositoryWorktreeDigest !== session.repository.worktreeDigest) {
    throw new Error(
      "Uncommitted repository changes no longer match this saved session. Review the working tree before resuming.",
    );
  }
  if (session.version === 2 && session.implementation) {
    if (!isInsideRepository(repositoryPath, session.implementation.packagePath)) {
      throw new Error("Resume session implementation package is outside its repository.");
    }
    const [implementationPackage, evidence] = await Promise.all([
      readArtifact(session.implementation.packagePath, "implementation package"),
      readLocalChangeEvidence(repositoryPath),
    ]);
    if (digest(implementationPackage) !== session.implementation.packageDigest) {
      throw new Error(
        "The implementation package changed after this checkpoint was saved.",
      );
    }
    if (
      evidence.changeDigest !== session.implementation.changeDigest ||
      JSON.stringify(evidence.changedFiles) !==
        JSON.stringify(session.implementation.changedFiles)
    ) {
      throw new Error(
        "The local implementation no longer matches this saved checkpoint. Review the diff before resuming.",
      );
    }
    if (
      session.verification &&
      session.verification.review.changeDigest !== evidence.changeDigest
    ) {
      throw new Error(
        "The saved verification evidence no longer matches the local implementation.",
      );
    }
    if (
      session.verification &&
      digest(JSON.stringify(session.verification.review)) !==
        session.verification.reviewDigest
    ) {
      throw new Error(
        "The saved review changed after this checkpoint was created.",
      );
    }
    if (
      session.verification?.critique.status === "manual-handoff"
    ) {
      const promptPath = session.verification.critique.promptPath;
      if (!isInsideRepository(repositoryPath, promptPath)) {
        throw new Error("Resume session critique prompt is outside its repository.");
      }
      const prompt = await readArtifact(promptPath, "manual critique prompt");
      if (digest(prompt) !== session.verification.critiquePromptDigest) {
        throw new Error(
          "The manual critique prompt changed after this checkpoint was saved.",
        );
      }
    }
  }
  return { ...session, sessionPath: resolve(sessionPath) };
}

export async function saveImplementationCheckpoint(
  session: LoadedSession,
  provider: ImplementationProvider,
  implementationPackagePath: string,
  completedAt = new Date(),
): Promise<LoadedSession> {
  if (session.stage !== "specification-approved") {
    throw new Error("An implementation checkpoint has already been saved for this session.");
  }
  if (!isInsideRepository(session.repository.path, implementationPackagePath)) {
    throw new Error("The implementation package is outside its repository.");
  }
  const [branch, commit, repositoryWorktreeDigest, implementationPackage, evidence] =
    await Promise.all([
      git(session.repository.path, ["branch", "--show-current"]),
      git(session.repository.path, ["rev-parse", "HEAD"]),
      worktreeDigest(session.repository.path),
      readFile(implementationPackagePath, "utf8"),
      readLocalChangeEvidence(session.repository.path),
    ]);
  if (evidence.changedFiles.length === 0) {
    throw new Error("No local product changes are available for an implementation checkpoint.");
  }
  const updated: LoadedSession = {
    ...session,
    version: 2,
    stage: "implementation-completed",
    updatedAt: completedAt.toISOString(),
    repository: {
      ...session.repository,
      branch,
      commit,
      worktreeDigest: repositoryWorktreeDigest,
    },
    implementation: {
      provider,
      packagePath: resolve(implementationPackagePath),
      packageDigest: digest(implementationPackage),
      changeDigest: evidence.changeDigest,
      changedFiles: evidence.changedFiles,
      completedAt: completedAt.toISOString(),
    },
    remainingActions: [
      "Run trusted verification and review the saved local changes.",
      "Review the diff and quality evidence before deciding whether to commit.",
      "Keep commit, push, pull-request, and merge decisions separate.",
    ],
  };
  await writeSession(updated);
  return updated;
}

export async function saveVerificationCheckpoint(
  session: LoadedSession,
  review: LocalReview,
  evaluation: EvaluationReport,
  critique: CritiqueFlowResult,
  completedAt = new Date(),
): Promise<LoadedSession> {
  if (!hasImplementationCheckpoint(session) || session.stage !== "implementation-completed") {
    throw new Error("Verification can be checkpointed only after implementation.");
  }
  const evidence = await readLocalChangeEvidence(session.repository.path);
  if (
    review.changeDigest !== evidence.changeDigest ||
    session.implementation.changeDigest !== evidence.changeDigest ||
    JSON.stringify(review.changedFiles) !== JSON.stringify(evidence.changedFiles)
  ) {
    throw new Error(
      "The local implementation changed after review. Review it again before saving verification.",
    );
  }
  let critiquePromptDigest: string | undefined;
  if (critique.status === "manual-handoff") {
    if (!isInsideRepository(session.repository.path, critique.promptPath)) {
      throw new Error("The manual critique prompt is outside its repository.");
    }
    critiquePromptDigest = digest(await readFile(critique.promptPath, "utf8"));
  }
  const updated: LoadedSession = {
    ...session,
    version: 2,
    stage: "verification-completed",
    updatedAt: completedAt.toISOString(),
    verification: {
      review,
      reviewDigest: digest(JSON.stringify(review)),
      evaluation,
      critique,
      ...(critiquePromptDigest ? { critiquePromptDigest } : {}),
      completedAt: completedAt.toISOString(),
    },
    remainingActions: [
      "Review the saved diff, verification, evaluation, and critique evidence.",
      "Choose whether to commit the unchanged reviewed implementation.",
      "Keep push, pull-request, and merge decisions separate.",
    ],
  };
  await writeSession(updated);
  return updated;
}

export async function saveSessionOperatingMode(
  session: LoadedSession,
  operatingMode: OperatingMode,
): Promise<LoadedSession> {
  const updated = {
    ...session,
    operatingMode,
    updatedAt: new Date().toISOString(),
    remainingActions: session.stage === "specification-approved"
      ? [
        `Continue using ${operatingMode} mode or stop.`,
        ...session.remainingActions.slice(1),
      ]
      : session.remainingActions,
  } satisfies LoadedSession;
  await writeSession(updated);
  return updated;
}

export function managedWorkspaceDeletionWarning(sessionPath?: string): string {
  return sessionPath
    ? `Deleting this folder also deletes its only resumable session (${sessionPath}), saved specifications, checkpoints, and unpushed work.`
    : "Deleting this folder also deletes any specifications, checkpoints, or unpushed work stored only inside it.";
}
