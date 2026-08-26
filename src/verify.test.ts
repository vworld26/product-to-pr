import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  discoverVerification,
  discoverVerificationCommands,
  runVerificationCommands,
} from "./verify.js";

const directories: string[] = [];

async function fixture(scripts: Record<string, string>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-"));
  directories.push(path);
  await writeFile(join(path, "package.json"), JSON.stringify({ scripts }));
  return path;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("verification", () => {
  it("previews only known repository verification scripts", async () => {
    const path = await fixture({
      test: "node --test",
      typecheck: "tsc --noEmit",
      deploy: "do-not-run",
    });

    await expect(discoverVerificationCommands(path)).resolves.toEqual([
      expect.objectContaining({ name: "typecheck", command: "npm run typecheck" }),
      expect.objectContaining({ name: "test", command: "npm test" }),
    ]);
  });

  it(
    "records passing and failing commands without stopping early",
    async () => {
      const path = await fixture({
        typecheck: "node -e \"console.log('checked')\"",
        test: "node -e \"console.error('failed'); process.exit(1)\"",
      });
      const commands = await discoverVerificationCommands(path);
      const results = await runVerificationCommands(path, commands);

      expect(results.map((result) => result.passed)).toEqual([true, false]);
      expect(results[0].output).toContain("checked");
      expect(results[1].output).toContain("failed");
    },
    15_000,
  );

  it("returns a safe empty state when no configured checks exist", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-empty-"));
    directories.push(path);
    await expect(discoverVerificationCommands(path)).resolves.toEqual([]);
  });

  it("discovers config-backed Python tests without guessing shell scripts", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-python-"));
    directories.push(path);
    await writeFile(join(path, "pyproject.toml"), "[tool.pytest.ini_options]\n");
    await writeFile(join(path, "check.sh"), "#!/bin/sh\nexit 0\n");

    await expect(discoverVerificationCommands(path)).resolves.toEqual([
      {
        name: "test",
        command: "python -m pytest",
        executable: "python",
        args: ["-m", "pytest"],
      },
    ]);
  });

  it("recognizes pytest.ini as an explicit Python test configuration", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-pytest-"));
    directories.push(path);
    await writeFile(join(path, "pytest.ini"), "[pytest]\n");

    await expect(discoverVerificationCommands(path)).resolves.toEqual([
      expect.objectContaining({ command: "python -m pytest" }),
    ]);
  });

  it("classifies documented commands and possible scripts without trusting them", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-docs-"));
    directories.push(path);
    await writeFile(join(path, "SKILL.md"), "Run npm test before release.\n");
    await writeFile(join(path, "check-arithmetic.py"), "print('check')\n");

    const discovery = await discoverVerification(path);

    expect(discovery.trustedCommands).toEqual([]);
    expect(discovery.candidateCommands).toEqual([
      "npm test",
      "python check-arithmetic.py",
    ]);
    expect(discovery.confidence).toBe("medium");
    expect(discovery.guidance.join(" ")).toContain("will not run");
  });

  it("trusts only supported explicit declarations", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-trust-"));
    directories.push(path);
    await writeFile(
      join(path, "AGENTS.md"),
      [
        "Product-to-PR verification: npm test",
        "Product-to-PR verification: npm test && deploy-production",
      ].join("\n"),
    );

    const discovery = await discoverVerification(path);

    expect(discovery.trustedCommands).toEqual([
      expect.objectContaining({ command: "npm test", executable: "npm" }),
    ]);
    expect(discovery.trustedCommands.every((command) =>
      !command.command.includes("deploy-production")
    )).toBe(true);
    expect(discovery.confidence).toBe("high");
  });

  it("does not let a README grant command execution authority", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-readme-"));
    directories.push(path);
    await writeFile(
      join(path, "README.md"),
      "Product-to-PR verification: npm test\n",
    );

    const discovery = await discoverVerification(path);

    expect(discovery.trustedCommands).toEqual([]);
    expect(discovery.candidateCommands).toContain("npm test");
    expect(discovery.confidence).toBe("medium");
  });

  it("reports low confidence and setup guidance when no evidence exists", async () => {
    const path = await mkdtemp(join(tmpdir(), "product-to-pr-verify-low-"));
    directories.push(path);

    const discovery = await discoverVerification(path);

    expect(discovery.confidence).toBe("low");
    expect(discovery.guidance.join(" ")).toContain("No automated verification");
  });
});
