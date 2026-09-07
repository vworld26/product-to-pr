import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearReadinessHistory,
  completedSessionId,
  loadReadinessHistory,
  preflightTiming,
  readinessHistoryPath,
  repositoryHistoryId,
  recordCompletedSession,
  recordPreflightCompleted,
  recordPreflightOffered,
} from "./readiness-history.js";

const directories: string[] = [];

async function historyFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "product-to-pr-readiness-"));
  directories.push(directory);
  return join(directory, "readiness.json");
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("readiness history", () => {
  it("uses the operating system's application-state location", () => {
    expect(readinessHistoryPath({ platform: "darwin", homeDirectory: "/home/test" }))
      .toBe("/home/test/Library/Application Support/Product-to-PR/readiness.json");
    expect(readinessHistoryPath({ platform: "linux", homeDirectory: "/home/test", environment: {} }))
      .toBe("/home/test/.local/state/product-to-pr/readiness.json");
    expect(readinessHistoryPath({ platform: "linux", homeDirectory: "/home/test", environment: { XDG_STATE_HOME: "/state" } }))
      .toBe("/state/product-to-pr/readiness.json");
    expect(readinessHistoryPath({ platform: "win32", homeDirectory: "C:\\Users\\Test", environment: { LOCALAPPDATA: "C:\\State" } }))
      .toBe("C:\\State\\Product-to-PR\\readiness.json");
  });

  it("rechecks and records core Codex for an older manual-provider history", async () => {
    const path = await historyFile();
    await writeFile(path, JSON.stringify({
      version: 1,
      completedSessionIds: [],
      checkedRepositories: [repositoryHistoryId("/repo")],
      checkedProviders: ["manual"],
      lastPreflightSessionCount: 0,
      lastOfferedSessionCount: 0,
    }));

    let history = await loadReadinessHistory(path);
    expect(preflightTiming(history, "/repo", "manual"))
      .toEqual({ kind: "required", reason: "core-dependency" });

    await recordPreflightCompleted("/repo", "manual", path);
    history = await loadReadinessHistory(path);
    expect(history.checkedProviders).toEqual(["manual", "codex"]);
  });

  it("requires new repository and provider checks, then recommends one after five sessions", async () => {
    const path = await historyFile();
    let history = await loadReadinessHistory(path);
    expect(preflightTiming(history, "/repo-one", "codex")).toEqual({ kind: "required", reason: "new-repository" });

    await recordPreflightCompleted("/repo-one", "codex", path);
    history = await loadReadinessHistory(path);
    expect(preflightTiming(history, "/repo-one", "codex").kind).toBe("not-due");
    expect(preflightTiming(history, "/repo-two", "codex").reason).toBe("new-repository");
    expect(preflightTiming(history, "/repo-one", "claude").reason).toBe("new-provider");

    for (let index = 0; index < 5; index += 1) {
      await recordCompletedSession(`session-${index}`, path);
    }
    history = await loadReadinessHistory(path);
    expect(preflightTiming(history, "/repo-one", "codex")).toEqual({ kind: "recommended", reason: "five-sessions" });
    await recordPreflightOffered(path);
    expect(preflightTiming(await loadReadinessHistory(path), "/repo-one", "codex").kind).toBe("not-due");
  });

  it("counts a resumed session only once and stores hashes instead of repository details", async () => {
    const path = await historyFile();
    const id = completedSessionId("/private/customer-repository", "secret-specification-digest");
    expect(await recordCompletedSession(id, path)).toEqual({ count: 1, newlyCounted: true });
    expect(await recordCompletedSession(id, path)).toEqual({ count: 1, newlyCounted: false });
    await recordPreflightCompleted("/private/customer-repository", "codex", path);

    const stored = await readFile(path, "utf8");
    expect(stored).not.toContain("customer-repository");
    expect(stored).not.toContain("secret-specification-digest");
    expect(stored).not.toContain("token");
    expect((await loadReadinessHistory(path)).completedSessionIds).toHaveLength(1);
  });

  it("clears history without changing repository files", async () => {
    const path = await historyFile();
    await recordCompletedSession("session", path);
    expect(await clearReadinessHistory(path)).toBe(true);
    expect(await clearReadinessHistory(path)).toBe(false);
    expect((await loadReadinessHistory(path)).completedSessionIds).toEqual([]);
  });
});
