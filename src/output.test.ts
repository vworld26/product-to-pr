import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MissingOutputDirectoryError,
  formatCliHelp,
  parseCliArguments,
  writeOutputFile,
} from "./output.js";

describe("parseCliArguments", () => {
  const mixedVersionArguments = [
    [".", "Add export", "--version"],
    ["--version", ".", "Add export"],
    ["--version", "--version"],
    ["--help", "--version"],
    ["--version", "-h"],
    ["--version", "--provider", "manual"],
  ];

  it.each(mixedVersionArguments.map((args) => [args]))(
    "rejects --version combined with other arguments: %j",
    (args) => {
      expect(() => parseCliArguments(args)).toThrow(
        "The --version option must be used alone.",
      );
    },
  );

  it("rejects mixed version arguments before workflow startup and preserves help", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-options-"));
    const command = [
      "--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href,
      fileURLToPath(new URL("./cli.ts", import.meta.url)),
    ];
    try {
      for (const args of mixedVersionArguments) {
        const result = spawnSync(process.execPath, [...command, ...args], {
          cwd: directory, encoding: "utf8", env: { ...process.env, PATH: "" },
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("The --version option must be used alone.");
      }
      for (const flag of ["--help", "-h"]) {
        const result = spawnSync(process.execPath, [...command, flag], {
          cwd: directory, encoding: "utf8", env: { ...process.env, PATH: "" },
        });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(formatCliHelp());
        expect(result.stderr).toBe("");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recognizes --version without a repository or feature request", () => {
    expect(parseCliArguments(["--version"]))
      .toMatchObject({ showVersion: true, repositoryPath: "", featureRequest: "" });
  });

  it("prints the package version before repository or provider startup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-version-"));
    const metadata = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    try {
      const output = execFileSync(process.execPath, [
        "--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href,
        fileURLToPath(new URL("./cli.ts", import.meta.url)), "--version",
      ], { cwd: directory, encoding: "utf8", env: { ...process.env, PATH: "" } });
      expect(output.trim()).toBe(metadata.version);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("shows help without requiring a repository or feature request", () => {
    expect(parseCliArguments(["--help"])).toMatchObject({ showHelp: true });
    expect(formatCliHelp()).toContain("repository-folder-or-github-url");
    expect(formatCliHelp()).toContain("does not merge pull requests");
  });
  it("separates --output from the feature request", () => {
    expect(
      parseCliArguments([
        ".",
        "Add",
        "Markdown",
        "export",
        "--output",
        "plan.md",
      ]),
    ).toEqual({
      repositoryPath: ".",
      featureRequest: "Add Markdown export",
      outputPath: "plan.md",
      modeOverride: undefined,
      providerOverride: undefined,
      resumePath: undefined,
      forcePreflight: false,
      clearPreflightHistory: false,
    });
  });

  it("preserves existing behavior when --output is omitted", () => {
    expect(parseCliArguments([".", "Add", "Markdown", "export"])).toEqual({
      repositoryPath: ".",
      featureRequest: "Add Markdown export",
      outputPath: undefined,
      modeOverride: undefined,
      providerOverride: undefined,
      resumePath: undefined,
      forcePreflight: false,
      clearPreflightHistory: false,
    });
  });

  it("supports a one-run operating mode override", () => {
    expect(
      parseCliArguments([".", "Add", "export", "--mode", "build-with-me"]),
    ).toEqual({
      repositoryPath: ".",
      featureRequest: "Add export",
      outputPath: undefined,
      modeOverride: "build-with-me",
      providerOverride: undefined,
      resumePath: undefined,
      forcePreflight: false,
      clearPreflightHistory: false,
    });
    expect(() => parseCliArguments([".", "Feature", "--mode", "fast"]))
      .toThrow("must be guide, build-with-me, take-the-lead, or choose");
  });

  it("supports an explicit implementation provider", () => {
    expect(
      parseCliArguments([".", "Add", "export", "--provider", "claude"]),
    ).toEqual({
      repositoryPath: ".",
      featureRequest: "Add export",
      outputPath: undefined,
      modeOverride: undefined,
      providerOverride: "claude",
      resumePath: undefined,
      forcePreflight: false,
      clearPreflightHistory: false,
    });
    expect(() => parseCliArguments([".", "Feature", "--provider", "other-model"]))
      .toThrow("must be codex, claude, or manual");
  });

  it("rejects --output without a filename", () => {
    expect(() => parseCliArguments([".", "Feature", "--output"])).toThrow(
      "requires a filename",
    );
  });

  it("parses a resumable session without requiring a new feature request", () => {
    expect(parseCliArguments(["/repo", "--resume", "/repo/session.json"]))
      .toEqual({
        repositoryPath: "/repo",
        featureRequest: "",
        outputPath: undefined,
        modeOverride: undefined,
        providerOverride: undefined,
        resumePath: "/repo/session.json",
        forcePreflight: false,
        clearPreflightHistory: false,
      });
    expect(() => parseCliArguments(["/repo", "--resume"]))
      .toThrow("requires a session filename");
  });

  it("supports forced preflight and clearing saved readiness history", () => {
    expect(parseCliArguments(["/repo", "Feature", "--preflight"]))
      .toMatchObject({ forcePreflight: true, clearPreflightHistory: false });
    expect(parseCliArguments(["/repo", "Feature", "--clear-preflight-history"]))
      .toMatchObject({ forcePreflight: true, clearPreflightHistory: true });
    expect(() => parseCliArguments(["/repo", "Feature", "--preflight", "--preflight"]))
      .toThrow("can only be used once");
  });
});

describe("writeOutputFile", () => {
  it("writes the complete Markdown to the requested file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-output-"));
    const path = join(directory, "plan.md");

    try {
      await writeOutputFile(path, "# Complete plan\n");
      expect(await readFile(path, "utf8")).toBe("# Complete plan\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("leaves an existing file unchanged", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-output-"));
    const path = join(directory, "plan.md");

    try {
      await writeFile(path, "original", "utf8");
      await expect(writeOutputFile(path, "replacement")).rejects.toThrow(
        "already exists and was not changed",
      );
      expect(await readFile(path, "utf8")).toBe("original");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires approval before creating a missing folder", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-output-"));
    const missingDirectory = join(directory, "new-folder");
    const path = join(missingDirectory, "plan.md");

    try {
      await expect(writeOutputFile(path, "plan")).rejects.toBeInstanceOf(
        MissingOutputDirectoryError,
      );
      await expect(stat(missingDirectory)).rejects.toThrow();
      await expect(readFile(path, "utf8")).rejects.toThrow();

      await writeOutputFile(path, "plan", true);
      expect(await readFile(path, "utf8")).toBe("plan");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not require folder creation when the folder already exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-output-"));
    const nestedDirectory = join(directory, "existing-folder");
    const path = join(nestedDirectory, "plan.md");

    try {
      await mkdir(nestedDirectory);
      await writeOutputFile(path, "plan");
      expect(await readFile(path, "utf8")).toBe("plan");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes a partial file when writing fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-output-"));
    const path = join(directory, "plan.md");

    try {
      await expect(
        writeOutputFile(path, "plan", false, async (file) => {
          await file.writeFile("partial", "utf8");
          throw new Error("Simulated write failure");
        }),
      ).rejects.toThrow("Simulated write failure");
      await expect(readFile(path, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
