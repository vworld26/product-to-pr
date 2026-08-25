import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ProductPlan } from "./plan.js";
import type { VerificationResult } from "./verify.js";

const execFileAsync = promisify(execFile);

export type AcceptanceResult = {
  criterion: string;
  status: "passed" | "failed" | "manual-review";
  evidence: string;
};

export type LocalReview = {
  changedFiles: string[];
  changeDigest: string;
  diffSummary: string;
  verification: VerificationResult[];
  acceptance: AcceptanceResult[];
  recoveryGuidance: string[];
};

export type LocalChangeEvidence = {
  changedFiles: string[];
  diffSummary: string;
  diff: string;
  changeDigest: string;
};

export type AcceptanceReviewer = (
  prompt: string,
) => Promise<AcceptanceResult[]>;

function bounded(value: string, limit: number): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n[Evidence truncated]`;
}

const acceptanceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["acceptance"],
  properties: {
    acceptance: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion", "status", "evidence"],
        properties: {
          criterion: { type: "string" },
          status: { enum: ["passed", "failed", "manual-review"] },
          evidence: { type: "string" },
        },
      },
    },
  },
};

export function buildAcceptancePrompt(
  criteria: string[],
  diff: string,
  verification: VerificationResult[],
): string {
  return [
    "Review a local implementation against its acceptance criteria.",
    "Use passed only when the diff and verification provide direct evidence.",
    "Use failed when evidence contradicts the criterion.",
    "Use manual-review when the evidence is incomplete or requires a person.",
    "Do not edit files or run commands.",
    "",
    "Acceptance criteria:",
    JSON.stringify(criteria, null, 2),
    "",
    "Verification results:",
    JSON.stringify(
      verification.map((result) => ({
        ...result,
        output: bounded(result.output, 10_000),
      })),
      null,
      2,
    ),
    "",
    "Local diff:",
    bounded(diff, 100_000),
  ].join("\n");
}

export async function reviewAcceptanceWithCodex(
  prompt: string,
): Promise<AcceptanceResult[]> {
  const directory = await mkdtemp(join(tmpdir(), "product-to-pr-review-"));
  const schemaPath = join(directory, "schema.json");
  const outputPath = join(directory, "result.json");

  try {
    await writeFile(schemaPath, JSON.stringify(acceptanceSchema));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "codex",
        [
          "exec", "--ephemeral", "--ignore-user-config", "--sandbox", "read-only",
          "--skip-git-repo-check", "--output-schema", schemaPath,
          "--output-last-message", outputPath, "-",
        ],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let errors = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Acceptance review timed out after 2 minutes."));
      }, 120_000);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { errors += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        code === 0
          ? resolve()
          : reject(new Error(errors.trim() || `Codex exited with status ${code}.`));
      });
      child.stdin.end(prompt);
    });
    const result = JSON.parse(await readFile(outputPath, "utf8")) as {
      acceptance: AcceptanceResult[];
    };
    return result.acceptance;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function normalizeAcceptance(
  criteria: string[],
  results: AcceptanceResult[],
): AcceptanceResult[] {
  return criteria.map((criterion) =>
    results.find((result) => result.criterion === criterion) ?? {
      criterion,
      status: "manual-review",
      evidence: "The automated review did not provide evidence for this criterion.",
    }
  );
}

async function git(repositoryPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  return stdout.replace(/\n$/, "");
}

export async function createLocalReview(
  repositoryPath: string,
  plan: ProductPlan,
  verification: VerificationResult[],
  reviewer: AcceptanceReviewer = reviewAcceptanceWithCodex,
): Promise<LocalReview> {
  const evidence = await readLocalChangeEvidence(repositoryPath);
  const acceptance = normalizeAcceptance(
    plan.acceptanceCriteria,
    await reviewer(
      buildAcceptancePrompt(
        plan.acceptanceCriteria,
        evidence.diff,
        verification,
      ),
    ),
  );
  const recoveryGuidance = verification.some((result) => !result.passed)
    ? [
      "Review the failed command output before committing.",
      "Fix the local changes, then run verification again.",
      "Nothing has been committed or published, so you can stop safely.",
    ]
    : ["Review any acceptance criteria marked for manual review before committing."];

  return {
    changedFiles: evidence.changedFiles,
    changeDigest: evidence.changeDigest,
    diffSummary: evidence.diffSummary,
    verification,
    acceptance,
    recoveryGuidance,
  };
}

export async function readLocalChangeEvidence(
  repositoryPath: string,
): Promise<LocalChangeEvidence> {
  const [changedFileOutput, diffSummary, diff] = await Promise.all([
    git(repositoryPath, ["status", "--short"]),
    git(repositoryPath, ["diff", "--stat"]),
    git(repositoryPath, ["diff", "--no-ext-diff"]),
  ]);
  const statusLines = changedFileOutput
    .split("\n")
    .filter(Boolean);
  const changedFiles = statusLines
    .map((line) => line.slice(3))
    .filter((path) => !path.startsWith(".product-to-pr/"));
  const untrackedFiles = statusLines
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3))
    .filter((path) => !path.startsWith(".product-to-pr/"));
  const untrackedEvidence = await Promise.all(
    untrackedFiles.map(async (path) => {
      try {
        const content = await readFile(join(repositoryPath, path), "utf8");
        return `New file: ${path}\n${bounded(content, 20_000)}`;
      } catch {
        return `New file: ${path}\n[Binary or unreadable file]`;
      }
    }),
  );
  const completeDiff = [diff, ...untrackedEvidence].filter(Boolean).join("\n\n");
  const completeDiffSummary = [
    diffSummary,
    ...untrackedFiles.map((path) => `New file: ${path}`),
  ].filter(Boolean).join("\n");
  const changeDigest = createHash("sha256").update(completeDiff).digest("hex");
  return {
    changedFiles,
    changeDigest,
    diffSummary: completeDiffSummary,
    diff: completeDiff,
  };
}

export function formatLocalReview(review: LocalReview): string {
  const lines = [
    "# Local implementation review",
    "## Changed files",
    ...review.changedFiles.map((path) => `- ${path}`),
    "## Diff summary",
    review.diffSummary || "No tracked diff summary is available.",
    "## Verification",
    ...(review.verification.length > 0
      ? review.verification.map(
        (result) => `- ${result.passed ? "PASS" : "FAIL"}: ${result.command}`,
      )
      : ["- No safe automated verification commands were discovered."]),
    "## Acceptance criteria",
    ...review.acceptance.map(
      (result) => `- ${result.status.toUpperCase()}: ${result.criterion} — ${result.evidence}`,
    ),
    "## Next steps",
    ...review.recoveryGuidance.map((guidance) => `- ${guidance}`),
  ];
  return lines.join("\n");
}
