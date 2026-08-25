import { describe, expect, it } from "vitest";

import {
  parseInterpretationChoice,
  parseRepositorySourceChoice,
} from "./discovery.js";

describe("feature discovery choices", () => {
  it("supports confirming or correcting a plain-language interpretation", () => {
    expect(parseInterpretationChoice("yes")).toBe("confirm");
    expect(parseInterpretationChoice("correct")).toBe("correct");
    expect(parseInterpretationChoice("build")).toBeUndefined();
  });

  it("supports the default branch or a named source branch", () => {
    expect(parseRepositorySourceChoice("default")).toBe("default");
    expect(parseRepositorySourceChoice("B")).toBe("branch");
    expect(parseRepositorySourceChoice("merge")).toBeUndefined();
  });
});
