import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ReviewChoice = "approve" | "modify" | "reject";
export type BuildChoice = "build" | "stop";
export type VerificationChoice = "verify" | "stop";

export function parseReviewChoice(input: string): ReviewChoice | undefined {
  const choice = input.trim().toLowerCase();

  if (choice === "a" || choice === "approve") {
    return "approve";
  }
  if (choice === "m" || choice === "modify") {
    return "modify";
  }
  if (choice === "r" || choice === "reject") {
    return "reject";
  }

  return undefined;
}

export function parseBuildChoice(input: string): BuildChoice | undefined {
  const choice = input.trim().toLowerCase();

  if (choice === "b" || choice === "build") {
    return "build";
  }
  if (
    choice === "s" ||
    choice === "stop" ||
    choice === "not now" ||
    choice === "later"
  ) {
    return "stop";
  }

  return undefined;
}

export function parseVerificationChoice(
  input: string,
): VerificationChoice | undefined {
  const choice = input.trim().toLowerCase();

  if (choice === "v" || choice === "verify") {
    return "verify";
  }
  if (choice === "s" || choice === "stop" || choice === "later") {
    return "stop";
  }
  return undefined;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "product-specification"
  );
}

export async function preserveApprovedSpecification(
  repositoryPath: string,
  title: string,
  content: string,
  approvedAt = new Date(),
): Promise<string> {
  const directory = join(repositoryPath, ".product-to-pr", "specifications");
  const timestamp = approvedAt.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `${slugify(title)}-${timestamp}.md`);

  await mkdir(directory, { recursive: true });
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });

  return path;
}
