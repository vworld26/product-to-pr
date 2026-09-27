import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";

import { runCommand } from "./command.js";

import {
  buildImplementationCommand,
  implementApprovedPlan,
  implementationRunnerFor,
  runClaudeImplementation,
  runCodexImplementation,
} from "./execute.js";

async function git(repositoryPath: string, args: string[]): Promise<string> {
  const { stdout } = await runCommand(
    "git",
    ["-C", repositoryPath, ...args],
    { encoding: "utf8" },
  );
  return stdout.trim();
}

async function createFixture(): Promise<{
  repositoryPath: string;
  specificationPath: string;
  packagePath: string;
}> {
  const repositoryPath = await mkdtemp(join(tmpdir(), "product-to-pr-execute-"));
  await git(repositoryPath, ["init"]);
  await git(repositoryPath, ["config", "user.name", "Product-to-PR Test"]);
  await git(repositoryPath, ["config", "user.email", "test@example.test"]);
  await writeFile(join(repositoryPath, "README.md"), "# Example\n");
  await git(repositoryPath, ["add", "README.md"]);
  await git(repositoryPath, ["commit", "-m", "Initial commit"]);
  await git(repositoryPath, ["switch", "-c", "product-to-pr/example"]);

  const artifactDirectory = join(repositoryPath, ".product-to-pr");
  const specificationPath = join(artifactDirectory, "specifications", "plan.md");
  const packagePath = join(artifactDirectory, "implementations", "package.md");
  const specification = "# Approved plan\n\nAdd the requested behavior.\n";
  const digest = createHash("sha256").update(specification).digest("hex");
  const commit = await git(repositoryPath, ["rev-parse", "HEAD"]);
  await mkdir(join(artifactDirectory, "specifications"), { recursive: true });
  await mkdir(join(artifactDirectory, "implementations"), { recursive: true });
  await writeFile(specificationPath, specification);
  await writeFile(
    packagePath,
    [
      "# Implementation package",
      "- Branch: product-to-pr/example",
      `- Starting commit: ${commit}`,
      `- Specification SHA-256: ${digest}`,
    ].join("\n"),
  );
  return { repositoryPath, specificationPath, packagePath };
}

describe("implementApprovedPlan", () => {
  it("builds bounded commands for Codex and Claude Code", () => {
    expect(buildImplementationCommand("codex", "/repo")).toEqual({
      command: "codex",
      args: [
        "exec", "--ephemeral", "--ignore-user-config", "--sandbox",
        "workspace-write", "--cd", "/repo", "-",
      ],
      label: "Codex",
    });
    expect(buildImplementationCommand("claude", "/repo")).toEqual({
      command: "claude",
      args: [
        "--print", "--no-session-persistence", "--safe-mode",
        "--permission-mode", "acceptEdits", "--output-format", "text",
        "--tools", "Read,Edit,Write,Glob,Grep",
      ],
      cwd: "/repo",
      label: "Claude Code",
    });
    expect(implementationRunnerFor("codex")).toBe(runCodexImplementation);
    expect(implementationRunnerFor("claude")).toBe(runClaudeImplementation);
  });

  it("runs a scoped implementation without creating a commit", async () => {
    const fixture = await createFixture();
    let receivedPrompt = "";

    try {
      const summary = await implementApprovedPlan(
        fixture.repositoryPath,
        fixture.specificationPath,
        fixture.packagePath,
        async (_repositoryPath, prompt) => {
          receivedPrompt = prompt;
          await writeFile(join(fixture.repositoryPath, "feature.ts"), "export {};\n");
          return "Added feature.ts";
        },
      );

      expect(summary).toBe("Added feature.ts");
      expect(receivedPrompt).toContain("Approved specification:");
      expect(receivedPrompt).toContain("Do not run tests or typechecking");
      expect(await git(fixture.repositoryPath, ["status", "--short"]))
        .toContain("?? feature.ts");
    } finally {
      await rm(fixture.repositoryPath, { recursive: true, force: true });
    }
  });

  it("stops when the approved specification has changed", async () => {
    const fixture = await createFixture();

    try {
      await writeFile(fixture.specificationPath, "# Changed plan\n");
      await expect(
        implementApprovedPlan(
          fixture.repositoryPath,
          fixture.specificationPath,
          fixture.packagePath,
          async () => "Not reached",
        ),
      ).rejects.toThrow("specification changed");
    } finally {
      await rm(fixture.repositoryPath, { recursive: true, force: true });
    }
  });

  it("stops when unrelated work already exists", async () => {
    const fixture = await createFixture();

    try {
      await writeFile(join(fixture.repositoryPath, "unrelated.ts"), "export {};\n");
      await expect(
        implementApprovedPlan(
          fixture.repositoryPath,
          fixture.specificationPath,
          fixture.packagePath,
          async () => "Not reached",
        ),
      ).rejects.toThrow("unrelated changes");
    } finally {
      await rm(fixture.repositoryPath, { recursive: true, force: true });
    }
  });

  it("detects changes to protected Product-to-PR artifacts", async () => {
    const fixture = await createFixture();

    try {
      await expect(
        implementApprovedPlan(
          fixture.repositoryPath,
          fixture.specificationPath,
          fixture.packagePath,
          async () => {
            await writeFile(fixture.packagePath, "# Changed package\n");
            return "Changed a protected file";
          },
        ),
      ).rejects.toThrow("protected Product-to-PR artifact");
    } finally {
      await rm(fixture.repositoryPath, { recursive: true, force: true });
    }
  });
});

describe.runIf(process.platform === "win32")("Windows implementation timeouts", () => {
  it("terminates the tool behind the codex shim when the implementation times out", async () => {
    const root = await mkdtemp(join(tmpdir(), "product-to-pr-execute-timeout-"));
    const shimDirectory = join(root, "shim dir");
    const pidFile = join(root, "grandchild.pid");
    await mkdir(shimDirectory);
    // Stands in for the Codex CLI: a cmd shim whose Node grandchild records
    // its pid and then idles, ignoring the implementation prompt on stdin.
    await writeFile(
      join(shimDirectory, "codex.cmd"),
      "@node -e \"require('fs').writeFileSync(process.env.PRODUCT_TO_PR_TEST_PID_FILE, String(process.pid)); setInterval(() => {}, 1000)\"\r\n",
    );
    const previous = { PATH: process.env.PATH, PID_FILE: process.env.PRODUCT_TO_PR_TEST_PID_FILE };
    process.env.PATH = `${shimDirectory}${delimiter}${previous.PATH ?? ""}`;
    process.env.PRODUCT_TO_PR_TEST_PID_FILE = pidFile;
    try {
      await expect(
        runCodexImplementation(root, "Implement the approved specification.", {
          timeoutMilliseconds: 3_000,
        }),
      ).rejects.toThrow("Codex implementation timed out after 3 seconds.");

      const pid = Number(await readFile(pidFile, "utf8"));
      expect(pid).toBeGreaterThan(0);
      expect(pid).not.toBe(process.pid);
      let status = "alive";
      try {
        process.kill(pid, 0);
      } catch (error) {
        status = (error as NodeJS.ErrnoException).code ?? "unknown";
      }
      expect(status).toBe("ESRCH");
    } finally {
      process.env.PATH = previous.PATH;
      if (previous.PID_FILE === undefined) {
        delete process.env.PRODUCT_TO_PR_TEST_PID_FILE;
      } else {
        process.env.PRODUCT_TO_PR_TEST_PID_FILE = previous.PID_FILE;
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
