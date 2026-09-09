import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { suggestedDependencyInstall } from "./dependencies.js";

const directories: string[] = [];

async function fixture(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "product-to-pr-dependencies-"));
  directories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("dependency setup", () => {
  it("suggests a reproducible npm install only when dependencies are missing", async () => {
    const path = await fixture();
    await writeFile(join(path, "package.json"), JSON.stringify({
      devDependencies: { vitest: "^3.0.0" },
    }));
    await writeFile(join(path, "package-lock.json"), "{}");

    await expect(suggestedDependencyInstall(path)).resolves.toEqual({
      command: "npm ci", args: ["ci"],
    });

    await mkdir(join(path, "node_modules"));
    await expect(suggestedDependencyInstall(path)).resolves.toBeUndefined();
  });

  it("does not suggest installation for repositories without Node dependencies", async () => {
    const path = await fixture();
    await writeFile(join(path, "package.json"), "{}");
    await expect(suggestedDependencyInstall(path)).resolves.toBeUndefined();
  });
});
