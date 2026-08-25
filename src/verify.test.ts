import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
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
});
