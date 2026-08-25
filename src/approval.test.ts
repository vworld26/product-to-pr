import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseBuildChoice,
  parseCommitChoice,
  parsePullRequestChoice,
  parsePushChoice,
  parseReviewChoice,
  parseVerificationChoice,
  preserveApprovedSpecification,
} from "./approval.js";

describe("parseReviewChoice", () => {
  it("recognizes approve, modify, and reject choices", () => {
    expect(parseReviewChoice("approve")).toBe("approve");
    expect(parseReviewChoice("M")).toBe("modify");
    expect(parseReviewChoice(" reject ")).toBe("reject");
    expect(parseReviewChoice("maybe")).toBeUndefined();
  });
});

describe("publication choices", () => {
  it("keeps commit, push, and pull request approvals separate", () => {
    expect(parseCommitChoice("commit")).toBe("commit");
    expect(parseCommitChoice("push")).toBeUndefined();
    expect(parsePushChoice("push")).toBe("push");
    expect(parsePushChoice("commit")).toBeUndefined();
    expect(parsePullRequestChoice("pr")).toBe("pull-request");
    expect(parsePullRequestChoice("push")).toBeUndefined();
  });
});

describe("parseBuildChoice", () => {
  it("keeps implementation approval separate from specification approval", () => {
    expect(parseBuildChoice("build")).toBe("build");
    expect(parseBuildChoice("B")).toBe("build");
    expect(parseBuildChoice("not now")).toBe("stop");
    expect(parseBuildChoice("later")).toBe("stop");
    expect(parseBuildChoice("approve")).toBeUndefined();
  });
});

describe("parseVerificationChoice", () => {
  it("keeps verification approval separate from implementation approval", () => {
    expect(parseVerificationChoice("verify")).toBe("verify");
    expect(parseVerificationChoice("V")).toBe("verify");
    expect(parseVerificationChoice("later")).toBe("stop");
    expect(parseVerificationChoice("build")).toBeUndefined();
  });
});

describe("preserveApprovedSpecification", () => {
  it("saves an approved specification without changing source code", async () => {
    const repositoryPath = await mkdtemp(
      join(tmpdir(), "product-to-pr-approval-"),
    );

    try {
      const path = await preserveApprovedSpecification(
        repositoryPath,
        "Add a confidence level",
        "# Approved specification",
        new Date("2026-07-27T12:00:00.000Z"),
      );

      expect(path).toContain(".product-to-pr/specifications/");
      expect(await readFile(path, "utf8")).toBe("# Approved specification");
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });
});
