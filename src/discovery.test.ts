import { describe, expect, it } from "vitest";

import {
  formatDefaultDecision,
  parseDefaultReviewChoice,
  parseDefaultsChoice,
  parseInterpretationChoice,
  parseRepositorySourceChoice,
} from "./discovery.js";

describe("feature discovery choices", () => {
  it("supports confirming or correcting a plain-language interpretation", () => {
    expect(parseInterpretationChoice("yes")).toBe("confirm");
    expect(parseInterpretationChoice("correct")).toBe("correct");
    expect(parseInterpretationChoice("build")).toBeUndefined();
  });

  it("supports grouped and individual default decisions", () => {
    expect(parseDefaultsChoice("accept all")).toBe("accept-all");
    expect(parseDefaultsChoice("review")).toBe("review");
    expect(parseDefaultsChoice("decline")).toBe("decline-all");
    expect(parseDefaultReviewChoice("accept")).toBe("accept");
    expect(parseDefaultReviewChoice("change")).toBe("change");
    expect(parseDefaultReviewChoice("D")).toBe("decline");
    expect(parseDefaultsChoice("build")).toBeUndefined();
    expect(formatDefaultDecision("Use Markdown", "accept")).toBe(
      "Accepted recommended default — Use Markdown",
    );
    expect(formatDefaultDecision("Use Markdown", "decline")).toContain(
      "exclude it from requirements",
    );
    expect(formatDefaultDecision("Use Markdown", "change", "Use HTML"))
      .toContain("Use HTML");
  });

  it("supports the default branch or a named source branch", () => {
    expect(parseRepositorySourceChoice("default")).toBe("default");
    expect(parseRepositorySourceChoice("B")).toBe("branch");
    expect(parseRepositorySourceChoice("merge")).toBeUndefined();
  });
});
