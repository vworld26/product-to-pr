import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import type { ProductPlan } from "./plan.js";
import {
  loadResumableSession,
  managedWorkspaceDeletionWarning,
  saveResumableSession,
  saveSessionOperatingMode,
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
    expect(loaded.plan).toEqual(plan);
    expect(updated.operatingMode).toBe("build-with-me");
    expect(updated.remainingActions[0]).toContain("build-with-me");
    expect(JSON.parse(await readFile(saved.sessionPath, "utf8")).operatingMode)
      .toBe("build-with-me");
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

  it("warns when cleanup removes the only resumable state", () => {
    expect(managedWorkspaceDeletionWarning("/tmp/session.json"))
      .toContain("only resumable session");
    expect(managedWorkspaceDeletionWarning()).toContain("unpushed work");
  });
});
