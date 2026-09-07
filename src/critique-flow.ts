import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  formatCritiqueReport,
  independentCritiqueProvider,
  runIndependentCritique,
  type CritiqueArtifact,
  type CritiqueReport,
  type CritiqueRunner,
} from "./critique.js";
import type { ImplementationProvider } from "./provider.js";
import { withTransientRetries, type RetryOptions } from "./retry.js";

export type CritiqueChoice = "run" | "manual" | "skip";
export type CritiqueFlowResult =
  | { status: "completed"; report: CritiqueReport }
  | { status: "manual-handoff"; promptPath: string }
  | { status: "skipped" };

export type CritiqueConversation = {
  ask: (prompt: string) => Promise<string>;
  write: (message: string) => void;
};

export function parseCritiqueChoice(value: string): CritiqueChoice | undefined {
  const choice = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (choice === "r" || choice === "run") return "run";
  if (choice === "m" || choice === "manual") return "manual";
  if (choice === "s" || choice === "skip") return "skip";
  return undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "review";
}

export async function preserveManualCritiquePrompt(
  repositoryPath: string,
  artifact: CritiqueArtifact,
  prompt: string,
  createdAt = new Date(),
): Promise<string> {
  const directory = join(repositoryPath, ".product-to-pr", "critiques");
  const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `${slug(artifact)}-${timestamp}-manual-prompt.md`);
  await mkdir(directory, { recursive: true });
  await writeFile(path, prompt, { encoding: "utf8", flag: "wx" });
  return path;
}

export async function runCritiqueFlow(options: {
  repositoryPath: string;
  artifact: CritiqueArtifact;
  producer: ImplementationProvider;
  prompt: string;
  conversation: CritiqueConversation;
  runner?: CritiqueRunner;
  retry?: RetryOptions;
  createdAt?: Date;
}): Promise<CritiqueFlowResult> {
  const reviewer = independentCritiqueProvider(options.producer);
  options.conversation.write(
    `\nIndependent ${options.artifact} review is optional and advisory. It cannot edit, approve, publish, or merge.`,
  );
  if (reviewer) {
    options.conversation.write(
      `Choosing run sends the displayed ${options.artifact}, its included repository evidence, and its existing evaluation to ${reviewer === "codex" ? "Codex" : "Claude Code"}. Product-to-PR does not add repository credentials or tokens.`,
    );
  } else {
    options.conversation.write(
      "Because a manual handoff produced this work, Product-to-PR cannot prove which model would be independent. Use the manual prompt with a different model.",
    );
  }

  let choice: CritiqueChoice | undefined;
  while (!choice) {
    choice = parseCritiqueChoice(
      await options.conversation.ask(
        reviewer
          ? "Choose [R]un independent review, [M]anual handoff, or [S]kip:\n> "
          : "Choose [M]anual handoff or [S]kip:\n> ",
      ),
    );
    if (!reviewer && choice === "run") choice = undefined;
    if (!choice) options.conversation.write("Please enter run, manual, or skip.");
  }

  if (choice === "skip") return { status: "skipped" };
  if (choice === "manual" || !reviewer) {
    const promptPath = await preserveManualCritiquePrompt(
      options.repositoryPath,
      options.artifact,
      options.prompt,
      options.createdAt,
    );
    options.conversation.write(`\nManual independent-review prompt saved to ${promptPath}`);
    options.conversation.write("\nGive this prompt and the referenced evidence to a different AI:\n");
    options.conversation.write(options.prompt);
    return { status: "manual-handoff", promptPath };
  }

  try {
    const report = await withTransientRetries(
      "independent-critique",
      () => runIndependentCritique(
        options.producer,
        options.artifact,
        options.prompt,
        options.runner,
      ),
      {
        ...options.retry,
        onRetry: async (notice) => {
          await options.retry?.onRetry?.(notice);
          options.conversation.write(
            `The independent reviewer hit a temporary problem. Retrying safely (${notice.attempt + 1}/${notice.maximumAttempts})...`,
          );
        },
      },
    );
    options.conversation.write(`\n${formatCritiqueReport(report)}`);
    return { status: "completed", report };
  } catch (error) {
    options.conversation.write(
      `\nAutomated independent review could not finish: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    const promptPath = await preserveManualCritiquePrompt(
      options.repositoryPath,
      options.artifact,
      options.prompt,
      options.createdAt,
    );
    options.conversation.write(
      `The same provider-neutral review prompt was saved for a different AI: ${promptPath}`,
    );
    options.conversation.write("\nInstructions for the different AI:\n");
    options.conversation.write(options.prompt);
    return { status: "manual-handoff", promptPath };
  }
}
