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

  it("records passing and failing commands without stopping early", async () => {
    const path = await fixture({
      typecheck: "node -e \"console.log('checked')\"",
      test: "node -e \"console.error('failed'); process.exit(1)\"",
    });
    const commands = await discoverVerificationCommands(path);
    const results = await runVerificationCommands(path, commands);

    expect(results.map((result) => result.passed)).toEqual([true, false]);
    expect(results[0].output).toContain("checked");
    expect(results[1].output).toContain("failed");
  });
});
