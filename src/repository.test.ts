import { mkdir, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  deleteManagedWorkspace,
  parseGitHubRepositoryUrl,
  parseWorkspaceChoice,
  prepareRepository,
} from "./repository.js";

describe("repository onboarding", () => {
  it("distinguishes local folders from GitHub repository URLs", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/vworld26/validation"))
      .toBe("vworld26/validation");
    expect(parseGitHubRepositoryUrl("https://github.com/vworld26/validation.git"))
      .toBe("vworld26/validation");
    expect(parseGitHubRepositoryUrl("https://example.com/repository"))
      .toBeUndefined();
    expect(parseGitHubRepositoryUrl("/projects/validation")).toBeUndefined();
  });

  it("keeps local repository behavior unchanged", async () => {
    await expect(
      prepareRepository("/projects/validation", async () => true),
    ).resolves.toEqual({
      repositoryPath: "/projects/validation",
      source: "local",
    });
  });

  it("explains malformed GitHub repository URLs", async () => {
    await expect(
      prepareRepository("https://github.com/owner", async () => true),
    ).rejects.toThrow("owner/repository");
  });

  it("creates and deletes an approved managed workspace", async () => {
    const prepared = await prepareRepository(
      "https://github.com/vworld26/validation",
      async (repository) => repository.isPrivate,
      async () => ({
        nameWithOwner: "vworld26/validation",
        isPrivate: true,
        url: "https://github.com/vworld26/validation",
      }),
      async (_nameWithOwner, destination) => mkdir(destination),
    );

    expect(prepared.source).toBe("github");
    expect(prepared.repositoryPath).toMatch(/product-to-pr-workspace-/);
    expect((await stat(prepared.repositoryPath)).isDirectory()).toBe(true);
    await deleteManagedWorkspace(prepared);
    await expect(stat(prepared.repositoryPath)).rejects.toThrow();
  });

  it("requires explicit workspace approval and cleanup choices", async () => {
    await expect(
      prepareRepository(
        "https://github.com/open/example",
        async () => false,
        async () => ({
          nameWithOwner: "open/example",
          isPrivate: false,
          url: "https://github.com/open/example",
        }),
      ),
    ).rejects.toThrow("was not approved");
    expect(parseWorkspaceChoice("keep")).toBe("keep");
    expect(parseWorkspaceChoice("D")).toBe("delete");
    expect(parseWorkspaceChoice("merge")).toBeUndefined();
  });
});
