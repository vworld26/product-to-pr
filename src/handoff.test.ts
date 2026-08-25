import { describe, expect, it } from "vitest";

import {
  formatReviewHandoff,
  parseReviewOwner,
  reviewOwnerDescriptions,
} from "./handoff.js";

describe("review handoff", () => {
  it("supports operator and separate-maintainer review ownership", () => {
    expect(parseReviewOwner("me")).toBe("operator");
    expect(parseReviewOwner("handoff")).toBe("maintainer");
    expect(parseReviewOwner("merge")).toBeUndefined();
    expect(reviewOwnerDescriptions.operator).toContain("review");
    expect(reviewOwnerDescriptions.maintainer).toContain("merge");
  });

  it("makes the no-merge handoff explicit in both situations", () => {
    expect(formatReviewHandoff({ owner: "operator" }).join(" "))
      .toContain("Merge remains a separate decision");
    expect(
      formatReviewHandoff({ owner: "maintainer", reviewer: "@reviewer" })
        .join(" "),
    ).toContain("decide whether to merge");
  });
});
