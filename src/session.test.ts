import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductPlan } from "./plan.js";
import { evaluateImplementation } from "./evaluation.js";
import { readLocalChangeEvidence } from "./review.js";
import {
  hasImplementationCheckpoint,
  hasVerificationCheckpoint,
  loadResumableSession,
  managedWorkspaceDeletionWarning,
  saveImplementationCheckpoint,
  saveResumableSession,
  saveSessionOperatingMode,
  saveVerificationCheckpoint,
} from "./session.js";

const execFileAsync = promisify(execFile);
const repositories: string[] = [];

async function repository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "product-to-pr-session-"));
  repositories.push(path);
  await execFileAsync("git", ["-C", path, "init"]);
  await execFileAsync("git", ["-C", path, "config", "user.name", "Test"]);
  await execFileAsync("git", ["-C", path, "config", "user.email", "test@example.test"]);
  await writeFile(join(path, "README.md"), "initial\n");
  await execFileAsync("git", ["-C", path, "add", "README.md"]);
  await execFileAsync("git", ["-C", path, "commit", "-m", "Initial"]);
  return path;
}

const plan = {
  title: "Add resumable plans",
  summary: "Continue an approved plan later.",
  repositoryOverview: {
    purpose: "Test",
    technologies: [], structure: [], entryPoints: [], testApproach: [],
    instructionContext: {
      instructions: [], fallbackFiles: [], warnings: [], authoringState: "missing",
    },
    relevantFiles: [], inspectionNotes: [],
  },
  clarifyingQuestions: [], productDecisions: [], dependencies: [],
  acceptanceCriteria: [], implementationSteps: [], risks: [], testPlan: [],
} satisfies ProductPlan;

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("resumable sessions", () => {
  it("saves, validates, and updates an approved-specification checkpoint", async () => {
    const path = await repository();
    const specificationPath = join(path, "approved.md");
    await writeFile(specificationPath, "# Approved\n");
    const saved = await saveResumableSession(
      { repositoryPath: path, source: "local" },
      "Add resumable plans",
      plan,
      specificationPath,
      "# Approved\n",
      new Date("2026-08-26T12:00:00.000Z"),
    );

    const loaded = await loadResumableSession(saved.sessionPath, path);
    const updated = await saveSessionOperatingMode(loaded, "build-with-me");

    expect(loaded.stage).toBe("specification-approved");
    expect(loaded.version).toBe(2);
    expect(loaded.plan).toEqual(plan);
    expect(updated.operatingMode).toBe("build-with-me");
    expect(updated.remainingActions[0]).toContain("build-with-me");
    expect(JSON.parse(await readFile(saved.sessionPath, "utf8")).operatingMode)
      .toBe("build-with-me");
    expect((await stat(saved.sessionPath)).mode & 0o777).toBe(0o600);
  });

  it("explains missing and malformed sessions", async () => {
    const path = await repository();
    await expect(loadResumableSession(join(path, "missing.json"), path))
      .rejects.toThrow("does not exist");
    const malformed = join(path, "malformed.json");
    await writeFile(malformed, "not json");
    await expect(loadResumableSession(malformed, path))
      .rejects.toThrow("not valid JSON");
  });

  it("refuses changed specifications and repository state", async () => {
    const path = await repository();
    const specificationPath = join(path, "approved.md");
    await writeFile(specificationPath, "# Approved\n");
    const first = await saveResumableSession(
      { repositoryPath: path, source: "local" }, "Feature", plan,
      specificationPath, "# Approved\n",
    );
    await writeFile(specificationPath, "# Changed\n");
    await expect(loadResumableSession(first.sessionPath, path))
      .rejects.toThrow("specification changed");

    await writeFile(specificationPath, "# Approved\n");
    await writeFile(join(path, "README.md"), "changed\n");
    await execFileAsync("git", ["-C", path, "add", "README.md"]);
    await execFileAsync("git", ["-C", path, "commit", "-m", "Changed"]);
    await expect(loadResumableSession(first.sessionPath, path))
      .rejects.toThrow("branch or commit changed");
  });

  it("refuses uncommitted working-tree drift and a different repository", async () => {
    const path = await repository();
    const specificationPath = join(path, "approved.md");
    await writeFile(specificationPath, "# Approved\n");
    const saved = await saveResumableSession(
      { repositoryPath: path, source: "local" }, "Feature", plan,
      specificationPath, "# Approved\n",
    );
    await writeFile(join(path, "README.md"), "uncommitted change\n");
    await expect(loadResumableSession(saved.sessionPath, path))
      .rejects.toThrow("Uncommitted repository changes");

    const other = await repository();
    await expect(loadResumableSession(saved.sessionPath, other))
      .rejects.toThrow("belongs to");
  });

  it("resumes implementation and verification checkpoints only when every artifact still matches", async () => {
    const path = await repository();
    const specificationPath = join(path, ".product-to-pr", "specifications", "approved.md");
    const packagePath = join(path, ".product-to-pr", "implementations", "package.md");
    const critiquePath = join(path, ".product-to-pr", "critiques", "manual.md");
    await mkdir(join(path, ".product-to-pr", "specifications"), { recursive: true });
    await mkdir(join(path, ".product-to-pr", "implementations"), { recursive: true });
    await mkdir(join(path, ".product-to-pr", "critiques"), { recursive: true });
    await writeFile(specificationPath, "# Approved\n");
    let session = await saveResumableSession(
      { repositoryPath: path, source: "local" }, "Feature", plan,
      specificationPath, "# Approved\n",
    );
    await execFileAsync("git", ["-C", path, "switch", "-c", "product-to-pr/feature"]);
    await writeFile(packagePath, "# Bound implementation package\n");
    await writeFile(critiquePath, "# Bound manual critique\n");
    await writeFile(join(path, "feature.ts"), "export const value = 1;\n");

    const verificationBaseline = {
      trustedCommands: [{
        name: "test", command: "npm test", executable: "npm", args: ["test"],
      }],
      trustSourceDigest: "a".repeat(64),
      trustSourcePaths: ["package.json"],
    };
    session = await saveImplementationCheckpoint(
      session,
      "codex",
      packagePath,
      verificationBaseline,
    );
    expect(hasImplementationCheckpoint(session)).toBe(true);
    if (!hasImplementationCheckpoint(session)) throw new Error("Expected checkpoint.");
    expect(session.implementation.verificationBaseline).toEqual(verificationBaseline);
    expect((await loadResumableSession(session.sessionPath, path)).stage)
      .toBe("implementation-completed");

    const evidence = await readLocalChangeEvidence(path);
    const review = {
      changedFiles: evidence.changedFiles,
      changeDigest: evidence.changeDigest,
      diffSummary: evidence.diffSummary,
      verification: [{
        name: "test", command: "npm test", executable: "npm", args: ["test"],
        passed: true, output: "passed",
      }],
      acceptance: [],
      recoveryGuidance: ["Review before committing."],
    };
    session = await saveVerificationCheckpoint(
      session,
      review,
      evaluateImplementation(plan, review),
      { status: "manual-handoff", promptPath: critiquePath },
    );
    expect(hasVerificationCheckpoint(session)).toBe(true);
    expect((await loadResumableSession(session.sessionPath, path)).stage)
      .toBe("verification-completed");

    const checkpointContent = await readFile(session.sessionPath, "utf8");
    const changedReview = JSON.parse(checkpointContent);
    changedReview.verification.review.diffSummary = "Changed after review";
    await writeFile(session.sessionPath, `${JSON.stringify(changedReview, null, 2)}\n`);
    await expect(loadResumableSession(session.sessionPath, path))
      .rejects.toThrow("saved review changed");
    await writeFile(session.sessionPath, checkpointContent);

    await writeFile(join(path, "feature.ts"), "export const value = 2;\n");
    await expect(loadResumableSession(session.sessionPath, path))
      .rejects.toThrow("Uncommitted repository changes");
    await writeFile(join(path, "feature.ts"), "export const value = 1;\n");
    await writeFile(packagePath, "# Changed package\n");
    await expect(loadResumableSession(session.sessionPath, path))
      .rejects.toThrow("implementation package changed");
    await writeFile(packagePath, "# Bound implementation package\n");
    await writeFile(critiquePath, "# Changed manual critique\n");
    await expect(loadResumableSession(session.sessionPath, path))
      .rejects.toThrow("manual critique prompt changed");
    await rm(critiquePath);
    await expect(loadResumableSession(session.sessionPath, path))
      .rejects.toThrow("saved manual critique prompt is missing");
  });

  it("continues to load version 1 approved-specification sessions", async () => {
    const path = await repository();
    const specificationPath = join(path, ".product-to-pr", "approved.md");
    await mkdir(join(path, ".product-to-pr"), { recursive: true });
    await writeFile(specificationPath, "# Approved\n");
    const saved = await saveResumableSession(
      { repositoryPath: path, source: "local" }, "Feature", plan,
      specificationPath, "# Approved\n",
    );
    const stored = JSON.parse(await readFile(saved.sessionPath, "utf8"));
    stored.version = 1;
    delete stored.updatedAt;
    stored.repository.worktreeDigest = createHash("sha256").update("").digest("hex");
    await writeFile(saved.sessionPath, `${JSON.stringify(stored, null, 2)}\n`);

    const loaded = await loadResumableSession(saved.sessionPath, path);
    expect(loaded.version).toBe(1);
    expect(loaded.stage).toBe("specification-approved");
  });

  it("warns when cleanup removes the only resumable state", () => {
    expect(managedWorkspaceDeletionWarning("/tmp/session.json"))
      .toContain("only resumable session");
    expect(managedWorkspaceDeletionWarning()).toContain("unpushed work");
  });
});
