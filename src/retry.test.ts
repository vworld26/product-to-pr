import { describe, expect, it } from "vitest";

import { isTransientFailure, withTransientRetries } from "./retry.js";

describe("bounded transient retries", () => {
  it("retries a transient read-only operation no more than three times", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const notices: number[] = [];
    const result = await withTransientRetries(
      "product-reasoning",
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("503 temporarily unavailable");
        return "reviewed";
      },
      {
        wait: async (milliseconds) => { waits.push(milliseconds); },
        onRetry: (notice) => { notices.push(notice.attempt); },
      },
    );
    expect(result).toBe("reviewed");
    expect(attempts).toBe(3);
    expect(waits).toEqual([250, 1_000]);
    expect(notices).toEqual([1, 2]);
  });

  it("does not retry invalid input, authentication, or other permanent failures", async () => {
    let attempts = 0;
    await expect(withTransientRetries(
      "acceptance-review",
      async () => {
        attempts += 1;
        throw new Error("Authentication failed: invalid token");
      },
      { wait: async () => undefined },
    )).rejects.toThrow("Authentication failed");
    expect(attempts).toBe(1);
    expect(isTransientFailure(Object.assign(new Error("socket"), { code: "ECONNRESET" })))
      .toBe(true);
    expect(isTransientFailure(new Error("malformed response"))).toBe(false);
  });

  it("caps a requested retry count so callers cannot create unbounded loops", async () => {
    let attempts = 0;
    await expect(withTransientRetries(
      "independent-critique",
      async () => {
        attempts += 1;
        throw new Error("request timed out");
      },
      { maximumAttempts: 99, wait: async () => undefined },
    )).rejects.toThrow("timed out");
    expect(attempts).toBe(3);
  });
});
