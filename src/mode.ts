import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type OperatingMode = "guide" | "build-with-me" | "take-the-lead";
export type ModeChoice = OperatingMode | "stop";

export const operatingModes: Record<
  OperatingMode,
  { label: string; description: string }
> = {
  guide: {
    label: "Guide me",
    description:
      "Introduce every stage, explain unfamiliar terms, and ask before implementation and verification.",
  },
  "build-with-me": {
    label: "Build with me",
    description:
      "Show concise stage transitions, handle routine implementation and verification, then bring back the review.",
  },
  "take-the-lead": {
    label: "Take the lead",
    description:
      "Move through routine work with less explanation while preserving safety stops.",
  },
};

export function parseOperatingMode(input: string): OperatingMode | undefined {
  const choice = input.trim().toLowerCase().replace(/\s+/g, "-");
  if (choice === "g" || choice === "guide" || choice === "guide-me") {
    return "guide";
  }
  if (choice === "b" || choice === "build" || choice === "build-with-me") {
    return "build-with-me";
  }
  if (choice === "t" || choice === "lead" || choice === "take-the-lead") {
    return "take-the-lead";
  }
  return undefined;
}

export function pausesBeforeRoutineWork(mode: OperatingMode): boolean {
  return mode === "guide";
}

export function usesConciseRoutineUpdates(mode: OperatingMode): boolean {
  return mode === "take-the-lead";
}

export const buildWithMeOfferExplanation =
  "Build with me will combine routine implementation and verification, with less explanation between them. It will not remove approvals for scope changes, commits, pushes, pull requests, merges, deletion, or other consequential actions.";

export function requestsBuildWithMe(input: string): boolean {
  const request = input.trim().toLowerCase().replace(/\s+/g, " ");
  return request === "faster" ||
    /\b(go|move|work) faster\b/.test(request) ||
    /\bspeed (this|things|it) up\b/.test(request) ||
    /\bfewer (explanations|pauses|questions)\b/.test(request) ||
    /\bless (explanation|explaining|guidance)\b/.test(request) ||
    /\btoo many (pauses|questions|explanations)\b/.test(request) ||
    /\bmore automated\b/.test(request);
}

export function parseBuildWithMeOfferChoice(
  input: string,
): "accept" | "decline" | undefined {
  const choice = input.trim().toLowerCase();
  if (["y", "yes", "a", "accept"].includes(choice)) return "accept";
  if (["n", "no", "d", "decline"].includes(choice)) return "decline";
  return undefined;
}

export function parseModeChoice(input: string): ModeChoice | undefined {
  const mode = parseOperatingMode(input);
  if (mode) return mode;
  const choice = input.trim().toLowerCase();
  return choice === "s" || choice === "stop" || choice === "later"
    ? "stop"
    : undefined;
}

function preferencePath(repositoryPath: string): string {
  return join(repositoryPath, ".product-to-pr", "preferences.json");
}

export async function loadOperatingMode(
  repositoryPath: string,
): Promise<OperatingMode | undefined> {
  try {
    const preference = JSON.parse(
      await readFile(preferencePath(repositoryPath), "utf8"),
    ) as { operatingMode?: string };
    if (!preference.operatingMode) return undefined;
    const mode = parseOperatingMode(preference.operatingMode);
    if (!mode) {
      throw new Error("The saved Product-to-PR operating mode is not valid.");
    }
    return mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function saveOperatingMode(
  repositoryPath: string,
  mode: OperatingMode,
): Promise<void> {
  const directory = join(repositoryPath, ".product-to-pr");
  await mkdir(directory, { recursive: true });
  await writeFile(
    preferencePath(repositoryPath),
    `${JSON.stringify({ operatingMode: mode }, null, 2)}\n`,
    "utf8",
  );
}
