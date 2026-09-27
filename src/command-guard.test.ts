import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { toPosixPath } from "./paths.js";

const sourceRoot = fileURLToPath(new URL("./", import.meta.url));
const allowedFiles = new Set(["command.ts"]);
const childProcessImport = /(?:\bfrom\s*|\brequire\s*\(\s*)["'](?:node:)?child_process["']/;

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("child process guard", () => {
  it("routes every child process through src/command.ts", async () => {
    const offenders: string[] = [];
    for (const path of await listTypeScriptFiles(sourceRoot)) {
      const relativePath = toPosixPath(relative(sourceRoot, path));
      if (allowedFiles.has(relativePath)) continue;
      if (childProcessImport.test(await readFile(path, "utf8"))) {
        offenders.push(`src/${relativePath}`);
      }
    }

    expect(offenders, [
      "These files import node:child_process directly:",
      ...offenders.map((path) => `  - ${path}`),
      "Use runCommand or spawnCommand from src/command.ts instead.",
      "Why: on Windows, npm-installed tools such as npm, codex, and claude are .cmd shims that Node cannot start directly (BatBadBut, CVE-2024-27980). src/command.ts resolves them through PATH and PATHEXT and quotes them for cmd.exe so every caller behaves the same on macOS, Linux, and Windows.",
    ].join("\n")).toEqual([]);
  });
});
