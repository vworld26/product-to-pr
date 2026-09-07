import {
  clearReadinessHistory,
  loadReadinessHistory,
  preflightTiming,
  recordPreflightCompleted,
  recordPreflightOffered,
} from "./readiness-history.js";
import {
  formatPreflightReport,
  manualAiChecklist,
  nonBlockingRisks,
  runPreflight,
  type ManualAiReadiness,
  type ReadinessProbeRunner,
} from "./preflight.js";
import {
  implementationProviders,
  parseImplementationProvider,
  type ImplementationProvider,
} from "./provider.js";

export type PreflightConversation = {
  ask(prompt: string): Promise<string>;
  write(message: string): void;
};

export type GuidedPreflightOptions = {
  repositoryPath: string;
  conversation: PreflightConversation;
  providerOverride?: ImplementationProvider;
  force?: boolean;
  clearHistory?: boolean;
  historyPath?: string;
  runner?: ReadinessProbeRunner;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

export type GuidedPreflightOutcome = {
  proceed: boolean;
  provider: ImplementationProvider;
};

function yes(input: string): boolean {
  return ["y", "yes"].includes(input.trim().toLowerCase());
}

async function chooseProvider(
  conversation: PreflightConversation,
): Promise<ImplementationProvider> {
  conversation.write("\nWhich AI coding tool should implement the approved change?");
  conversation.write("Codex is required separately for product planning and acceptance review.");
  conversation.write(`[C] ${implementationProviders.codex.label} — checked automatically.`);
  conversation.write(`[L] ${implementationProviders.claude.label} — checked automatically.`);
  conversation.write(`[M] ${implementationProviders.manual.label} — confirmed with a manual safety checklist.`);
  while (true) {
    const provider = parseImplementationProvider(await conversation.ask("> "));
    if (provider) return provider;
    conversation.write("Please enter Codex, Claude, or another AI.");
  }
}

async function collectManualReadiness(
  conversation: PreflightConversation,
): Promise<ManualAiReadiness | undefined> {
  const name = (await conversation.ask("\nWhat is the name of the other AI tool?\n> ")).trim();
  const usageMethod = (await conversation.ask("How will you use it (for example, a website or local app)?\n> ")).trim();
  conversation.write("\nPlease review these manual safety checks:");
  manualAiChecklist.forEach((item) => conversation.write(`- ${item.label}`));
  conversation.write("[A] Confirm all  [R] Review one at a time  [S] Stop");
  while (true) {
    const choice = (await conversation.ask("> ")).trim().toLowerCase();
    if (["s", "stop"].includes(choice)) return undefined;
    if (["a", "all", "confirm", "confirm all", "confirm-all"].includes(choice)) {
      return {
        name,
        usageMethod,
        confirmations: Object.fromEntries(manualAiChecklist.map((item) => [item.id, true])),
      };
    }
    if (["r", "review"].includes(choice)) {
      const confirmations: ManualAiReadiness["confirmations"] = {};
      for (const item of manualAiChecklist) {
        confirmations[item.id] = yes(await conversation.ask(`${item.label} [Y/N]\n> `));
      }
      return { name, usageMethod, confirmations };
    }
    conversation.write("Please enter confirm all, review, or stop.");
  }
}

export async function runGuidedPreflight(
  options: GuidedPreflightOptions,
): Promise<GuidedPreflightOutcome> {
  const { conversation } = options;
  if (options.clearHistory) {
    const cleared = await clearReadinessHistory(options.historyPath);
    conversation.write(cleared
      ? "\nSaved preflight history was cleared. No repository files were changed."
      : "\nThere was no saved preflight history to clear.");
  }

  let provider = options.providerOverride ?? await chooseProvider(conversation);
  let force = options.force ?? false;

  while (true) {
    const history = await loadReadinessHistory(options.historyPath);
    const timing = preflightTiming(history, options.repositoryPath, provider, force);
    if (timing.kind === "not-due") {
      conversation.write("\nYour saved readiness check is current. Repository safety will be checked again when it becomes due.");
      return { proceed: true, provider };
    }
    if (timing.kind === "recommended") {
      conversation.write("\nYou have completed five more Product-to-PR sessions. A fresh readiness check is recommended.");
      let choice = "";
      while (!["r", "run", "preflight", "n", "no", "not now", "not-now", "later"].includes(choice)) {
        choice = (await conversation.ask("Choose [R]un preflight or [N]ot now:\n> ")).trim().toLowerCase();
        if (!["r", "run", "preflight", "n", "no", "not now", "not-now", "later"].includes(choice)) {
          conversation.write("Please enter run or not now.");
        }
      }
      if (["n", "no", "not now", "not-now", "later"].includes(choice)) {
        await recordPreflightOffered(options.historyPath);
        return { proceed: true, provider };
      }
    } else {
      const reason = timing.reason === "new-repository"
        ? "This repository has not been checked on this computer."
        : timing.reason === "core-dependency"
          ? "The Codex planning and review dependency has not been checked on this computer."
        : timing.reason === "new-provider"
          ? "This AI tool has not been checked on this computer."
          : "You requested a fresh readiness check.";
      conversation.write(`\n${reason} Product-to-PR will now run safe, read-only checks.`);
    }

    const manualAi = provider === "manual"
      ? await collectManualReadiness(conversation)
      : undefined;
    if (provider === "manual" && !manualAi) return { proceed: false, provider };
    const report = await runPreflight({
      repositoryPath: options.repositoryPath,
      provider,
      runner: options.runner,
      environment: options.environment,
      platform: options.platform,
      manualAi,
    });
    conversation.write(`\n${formatPreflightReport(report)}`);

    if (!report.canContinue) {
      const coreCodexBlocked = report.results.some((item) =>
        item.id === "provider-codex" && item.blocking &&
        item.status !== "Passed" && item.status !== "User confirmed"
      );
      const allowed = coreCodexBlocked
        ? ["r", "rerun", "s", "stop"]
        : ["r", "rerun", "c", "change", "change-ai", "provider", "s", "stop"];
      let choice = "";
      while (!allowed.includes(choice)) {
        choice = (await conversation.ask(
          coreCodexBlocked
            ? "\nCodex is required for planning and review. Fix that blocker yourself, then choose [R]erun or [S]top:\n> "
            : "\nFix every blocker yourself, then choose [R]erun, [C]hange implementation AI, or [S]top:\n> ",
        )).trim().toLowerCase();
        if (!allowed.includes(choice)) {
          conversation.write(
            coreCodexBlocked
              ? "Please enter rerun or stop."
              : "Please enter rerun, change implementation AI, or stop.",
          );
        }
      }
      if (["s", "stop"].includes(choice)) return { proceed: false, provider };
      if (["c", "change", "change-ai", "provider"].includes(choice)) {
        provider = await chooseProvider(conversation);
      }
      force = true;
      continue;
    }

    if (nonBlockingRisks(report).length > 0) {
      const allowed = ["a", "accept", "accept-all", "r", "rerun", "c", "change", "change-ai", "provider", "s", "stop"];
      let choice = "";
      while (!allowed.includes(choice)) {
        choice = (await conversation.ask(
          "\nChoose [A]ccept all listed risks, [R]erun, [C]hange AI, or [S]top:\n> ",
        )).trim().toLowerCase();
        if (!allowed.includes(choice)) conversation.write("Please enter accept, rerun, change AI, or stop.");
      }
      if (["s", "stop"].includes(choice)) return { proceed: false, provider };
      if (["c", "change", "change-ai", "provider"].includes(choice)) {
        provider = await chooseProvider(conversation);
        force = true;
        continue;
      }
      if (!["a", "accept", "accept-all"].includes(choice)) {
        force = true;
        continue;
      }
    }

    await recordPreflightCompleted(options.repositoryPath, provider, options.historyPath);
    conversation.write("\nPreflight complete. Product-to-PR did not install software or change any settings.");
    return { proceed: true, provider };
  }
}
