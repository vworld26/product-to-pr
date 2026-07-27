import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseReviewChoice,
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
