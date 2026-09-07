import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  qualityEventLogPath,
  recordCritiqueEvent,
  recordEvaluationEvent,
} from "./event-log.js";
import type { EvaluationReport } from "./evaluation.js";

describe("privacy-conscious quality event log", () => {
  it("uses the same application-state area as readiness history", () => {
    expect(qualityEventLogPath({ platform: "darwin", homeDirectory: "/home/test" }))
      .toBe("/home/test/Library/Application Support/Product-to-PR/quality-events.jsonl");
  });

  it("stores allowlisted metadata and hashes instead of sensitive evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "product-to-pr-events-"));
    const path = join(directory, "quality-events.jsonl");
    const secretRepository = "/private/customer-alpha-secret";
    const report: EvaluationReport = {
      artifact: "specification", passed: false, score: 4, maximumScore: 10,
      findings: [{
        criterion: {
          id: "secret-token", title: "Private prompt", artifact: "specification",
          standard: "Do not log this private standard.",
        },
        score: 0, status: "does-not-meet",
        evidence: "PRIVATE-DIFF API_TOKEN=very-secret-value",
      }],
    };
    try {
      await recordEvaluationEvent(
        secretRepository,
        report,
        path,
        new Date("2026-09-06T12:00:00.000Z"),
      );
      await recordCritiqueEvent(
        secretRepository,
        "specification",
        "completed",
        {
          artifact: "specification", reviewer: "claude", independent: true,
          summary: "PRIVATE PROMPT", findings: [],
        },
        path,
        new Date("2026-09-06T12:01:00.000Z"),
      );

      const stored = await readFile(path, "utf8");
      expect(stored).not.toContain("customer-alpha-secret");
      expect(stored).not.toContain("PRIVATE");
      expect(stored).not.toContain("API_TOKEN");
      expect(stored).not.toContain("very-secret-value");
      const events = stored.trim().split("\n").map((line) => JSON.parse(line));
      expect(events).toMatchObject([
        { eventType: "evaluation", outcome: "needs-improvement", score: 4, findingCount: 1 },
        { eventType: "critique", outcome: "completed", provider: "claude", findingCount: 0 },
      ]);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
