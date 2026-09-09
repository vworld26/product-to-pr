import { createInterface } from "node:readline/promises";

import {
  parseBuildChoice,
  parseCommitChoice,
  parsePullRequestChoice,
  parsePushChoice,
  parseReviewChoice,
  parseVerificationChoice,
  preserveApprovedSpecification,
  type BuildChoice,
  type CommitChoice,
  type PullRequestChoice,
  type PushChoice,
  type ReviewChoice,
  type VerificationChoice,
} from "./approval.js";
import { createImplementationBranch } from "./branch.js";
import {
  formatDefaultDecision,
  parseDefaultReviewChoice,
  parseDefaultsChoice,
  parseInterpretationChoice,
  parseRepositorySourceChoice,
  type DefaultReviewChoice,
  type DefaultsChoice,
  type InterpretationChoice,
  type RepositorySourceChoice,
} from "./discovery.js";
import {
  implementApprovedPlan,
  implementationRunnerFor,
  type ImplementationRunner,
} from "./execute.js";
import {
  evaluateImplementation,
  evaluateSpecification,
  formatEvaluationReport,
} from "./evaluation.js";
import {
  buildImplementationCritiquePrompt,
  buildSpecificationCritiquePrompt,
  formatCritiqueReport,
} from "./critique.js";
import { runCritiqueFlow, type CritiqueFlowResult } from "./critique-flow.js";
import {
  recordCritiqueEvent,
  recordEvaluationEvent,
  recordRetryEvent,
  recordRiskPolicyEvent,
  type RetryOperation,
} from "./event-log.js";
import { formatPlan } from "./format.js";
import {
  formatJourneyIntroduction,
  formatPublicationAction,
  formatSessionOpening,
  formatStageCompletion,
  formatStageIntroduction,
  formatVerificationConfigurationChange,
  type JourneyStage,
} from "./guidance.js";
import {
  createManualImplementationRunner,
  preserveImplementationPackage,
} from "./implementation.js";
import { installDependencies, suggestedDependencyInstall } from "./dependencies.js";
import { inspectRepository } from "./inspect.js";
import {
  buildWithMeOfferExplanation,
  loadOperatingMode,
  operatingModes,
  parseBuildWithMeOfferChoice,
  parseModeChoice,
  pausesBeforeRoutineWork,
  requestsBuildWithMe,
  saveOperatingMode,
  type ModeChoice,
  type OperatingMode,
  usesConciseRoutineUpdates,
} from "./mode.js";
import {
  MissingOutputDirectoryError,
  formatCliHelp,
  parseCliArguments,
  writeOutputFile,
} from "./output.js";
import {
  createProductPlan,
  type ProductPlan,
  type ProductReasoning,
} from "./plan.js";
import {
  assessRiskPolicy,
  formatRiskPolicy,
  parseRiskConfirmation,
  type RiskPolicy,
} from "./policy.js";
import { runGuidedPreflight } from "./preflight-flow.js";
import {
  assertImplementationProviderReady,
  implementationProviders,
} from "./provider.js";
import {
  commitReviewedChanges,
  openPullRequest,
  proposeCommitMessage,
  pushImplementationBranch,
  requestPullRequestReview,
} from "./publication.js";
import {
  parseReviewOwner,
  reviewOwnerDescriptions,
  type ReviewHandoff,
  type ReviewOwner,
} from "./handoff.js";
import { reasonAboutFeature } from "./reason.js";
import {
  deleteManagedWorkspace,
  parseGitHubRepositoryUrl,
  parseWorkspaceChoice,
  prepareRepository,
  type PreparedRepository,
  type WorkspaceChoice,
} from "./repository.js";
import {
  createLocalReview,
  formatLocalReview,
  readLocalChangeEvidence,
  type LocalReview,
} from "./review.js";
import {
  completedSessionId,
  recordCompletedSession,
} from "./readiness-history.js";
import {
  hasImplementationCheckpoint,
  hasVerificationCheckpoint,
  loadResumableSession,
  managedWorkspaceDeletionWarning,
  saveImplementationCheckpoint,
  saveResumableSession,
  saveSessionOperatingMode,
  saveVerificationCheckpoint,
  type LoadedSession,
} from "./session.js";
import { withTransientRetries } from "./retry.js";
import {
  captureVerificationBaseline,
  discoverVerification,
  runVerificationCommands,
  verificationBaselineMatches,
} from "./verify.js";

class PreflightStopped extends Error {}

async function recordQualitySafely(
  action: () => Promise<void>,
  write: (message: string) => void = console.log,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    write(
      `Quality event could not be saved: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

async function runRecoverableReadOnlyOperation<T>(
  repositoryPath: string,
  operation: RetryOperation,
  action: () => Promise<T>,
  write: (message: string) => void = console.log,
): Promise<T> {
  const label = operation.split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
  return withTransientRetries(operation, action, {
    onRetry: async (notice) => {
      write(
        `${label} hit a temporary problem. Retrying safely (${notice.attempt + 1}/${notice.maximumAttempts})...`,
      );
      await recordQualitySafely(
        () => recordRetryEvent(
          repositoryPath,
          operation,
          notice.attempt,
          notice.maximumAttempts,
        ),
        write,
      );
    },
  });
}

async function confirmElevatedRisk(
  policy: RiskPolicy,
  stage: "implementation" | "commit",
  ask: (prompt: string) => Promise<string>,
  write: (message: string) => void = console.log,
): Promise<boolean> {
  if (policy.level !== "elevated") return policy.level === "standard";
  let choice: ReturnType<typeof parseRiskConfirmation>;
  while (!choice) {
    choice = parseRiskConfirmation(
      await ask(
        `This is elevated-risk work. Review the listed risks and choose [C]ontinue to ${stage} or [S]top:\n> `,
      ),
    );
    if (!choice) write("Please enter continue or stop.");
  }
  return choice === "continue";
}

async function offerPublication(options: {
  repositoryPath: string;
  plan: ProductPlan;
  review: LocalReview;
  riskPolicy: RiskPolicy;
  operatingMode: OperatingMode;
  ask: (prompt: string) => Promise<string>;
  write: (message: string) => void;
  recordCurrentSession: () => Promise<void>;
}): Promise<void> {
  const verification = options.review.verification;
  if (
    verification.length === 0 ||
    !verification.every((result) => result.passed)
  ) {
    options.write(
      verification.length === 0
        ? "\nCommit is unavailable because no safe automated verification command was discovered. Add or document a verification command, then review again."
        : "\nCommit is unavailable because verification failed. Fix the local changes and verify again.",
    );
    return;
  }
  if (options.riskPolicy.level === "restricted") {
    options.write(
      "\nCommit and publication are unavailable for restricted-risk work. Keep the checkpoint and obtain qualified maintainer or specialist review.",
    );
    return;
  }
  if (!await confirmElevatedRisk(
    options.riskPolicy,
    "commit",
    options.ask,
    options.write,
  )) {
    options.write(
      "\nStopped at the elevated-risk checkpoint. The reviewed local changes and recovery checkpoint were kept.",
    );
    return;
  }

  const publishGuidance = formatStageIntroduction(
    "publish",
    options.operatingMode,
  );
  if (publishGuidance) options.write(`\n${publishGuidance}\n`);
  const commitGuidance = formatPublicationAction(
    "commit",
    options.operatingMode,
  );
  if (commitGuidance) options.write(`\n${commitGuidance}`);
  const commitMessage = proposeCommitMessage(options.plan);
  options.write(`\nProposed commit message:\n${commitMessage}`);
  let commitChoice: CommitChoice | undefined;
  while (!commitChoice) {
    commitChoice = parseCommitChoice(
      await options.ask("\nChoose [C]ommit or [S]top here:\n> "),
    );
    if (!commitChoice) options.write("Please enter commit or stop.");
  }
  if (commitChoice !== "commit") return;

  const commit = await commitReviewedChanges(
    options.repositoryPath,
    commitMessage,
    options.review,
  );
  options.write(`\nReviewed changes committed: ${commit}`);
  const pushGuidance = formatPublicationAction("push", options.operatingMode);
  if (pushGuidance) options.write(`\n${pushGuidance}`);
  let pushChoice: PushChoice | undefined;
  while (!pushChoice) {
    pushChoice = parsePushChoice(
      await options.ask("\nChoose [P]ush or [S]top here:\n> "),
    );
    if (!pushChoice) options.write("Please enter push or stop.");
  }
  if (pushChoice !== "push") return;

  const branch = await pushImplementationBranch(options.repositoryPath);
  options.write(`\nBranch pushed: ${branch}`);
  const pullRequestGuidance = formatPublicationAction(
    "pull-request",
    options.operatingMode,
  );
  if (pullRequestGuidance) options.write(`\n${pullRequestGuidance}`);
  let pullRequestChoice: PullRequestChoice | undefined;
  while (!pullRequestChoice) {
    pullRequestChoice = parsePullRequestChoice(
      await options.ask("\nChoose open [P]ull request or [S]top here:\n> "),
    );
    if (!pullRequestChoice) options.write("Please enter pull request or stop.");
  }
  if (pullRequestChoice !== "pull-request") return;

  options.write("\nWho will own the pull-request review?");
  options.write(`[I] ${reviewOwnerDescriptions.operator}`);
  options.write(`[H] ${reviewOwnerDescriptions.maintainer}`);
  let reviewOwner: ReviewOwner | undefined;
  while (!reviewOwner) {
    reviewOwner = parseReviewOwner(await options.ask("> "));
    if (!reviewOwner) options.write("Please enter I or H.");
  }
  const handoff: ReviewHandoff = { owner: reviewOwner };
  if (reviewOwner === "maintainer") {
    const reviewer = (
      await options.ask(
        "GitHub username or team to request (optional; press Enter to skip):\n> ",
      )
    ).trim();
    if (reviewer) handoff.reviewer = reviewer;
  }
  const url = await openPullRequest(
    options.repositoryPath,
    options.plan,
    options.review,
    handoff,
  );
  await options.recordCurrentSession();
  options.write(`\nPull request opened: ${url}`);
  if (handoff.reviewer) {
    await requestPullRequestReview(
      options.repositoryPath,
      url,
      handoff.reviewer,
    );
    options.write(`Review requested from ${handoff.reviewer}.`);
  }
  options.write(
    "Product-to-PR has stopped before merge. The repository maintainer must review the pull request and make the separate merge decision.",
  );
  const completion = formatStageCompletion("publish", options.operatingMode);
  if (completion) options.write(`\n${completion}`);
}

async function recordCritiqueResult(
  repositoryPath: string,
  artifact: "specification" | "implementation",
  result: CritiqueFlowResult,
  write: (message: string) => void = console.log,
): Promise<void> {
  await recordQualitySafely(
    () => recordCritiqueEvent(
      repositoryPath,
      artifact,
      result.status,
      result.status === "completed" ? result.report : undefined,
    ),
    write,
  );
}

async function saveRequestedOutput(
  path: string,
  specification: string,
  askToCreateDirectory?: (directoryPath: string) => Promise<boolean>,
): Promise<void> {
  try {
    await writeOutputFile(path, specification);
  } catch (error) {
    if (!(error instanceof MissingOutputDirectoryError)) {
      throw error;
    }

    if (!askToCreateDirectory) {
      throw new Error(
        `${error.message}. Run interactively to approve creating it, or choose an existing folder.`,
      );
    }

    if (!await askToCreateDirectory(error.directoryPath)) {
      throw new Error("Output cancelled. No folder or file was created.");
    }

    await writeOutputFile(path, specification, true);
  }
}

try {
  const {
    repositoryPath: repositoryInput,
    featureRequest: requestedFeature,
    outputPath,
    modeOverride,
    providerOverride,
    resumePath,
    forcePreflight,
    clearPreflightHistory,
    showHelp,
  } =
    parseCliArguments(process.argv.slice(2));
  if (showHelp) {
    console.log(formatCliHelp());
    process.exit(0);
  }
  let featureRequest = requestedFeature;

  if (!repositoryInput) {
    throw new Error("A repository folder or GitHub URL is required.");
  }

  if (!featureRequest.trim() && !resumePath) {
    throw new Error("A feature request is required.");
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if ((forcePreflight || clearPreflightHistory) && !interactive) {
    throw new Error(
      "Preflight requires an interactive run so blockers and risks remain explicit.",
    );
  }
  if (parseGitHubRepositoryUrl(repositoryInput) && !interactive) {
    throw new Error(
      "GitHub URLs require an interactive run so you can approve the temporary working folder. A local repository path still works non-interactively.",
    );
  }

  if (interactive) console.log(`\n${formatSessionOpening()}`);

  let preparedRepository: PreparedRepository;
  if (parseGitHubRepositoryUrl(repositoryInput)) {
    const setupTerminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      preparedRepository = await prepareRepository(
        repositoryInput,
        async (repository) => {
          console.log(
            `\n${repository.nameWithOwner} is a ${repository.isPrivate ? "private" : "public"} GitHub repository.`,
          );
          console.log(
            "Product-to-PR will create a real Git checkout in a managed working folder. It can inspect, branch, edit, and test the real code there. GitHub changes only after separate commit, push, and pull-request approvals.",
          );
          console.log(
            "If you already have current work in a local folder, answer no and rerun Product-to-PR with that folder path so existing changes are preserved.",
          );
          const answer = await setupTerminal.question(
            "Create the temporary working folder? [Y/N]\n> ",
          );
          if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
            return false;
          }
          console.log("\nWhich version of the GitHub repository should be used?");
          console.log("[D] Default branch — start from the repository's primary version.");
          console.log("[B] Another branch — include work already pushed by you or another agent.");
          let sourceChoice: RepositorySourceChoice | undefined;
          while (!sourceChoice) {
            sourceChoice = parseRepositorySourceChoice(
              await setupTerminal.question("> "),
            );
            if (!sourceChoice) console.log("Please enter default or branch.");
          }
          if (sourceChoice === "default") return true;
          let sourceRef = "";
          while (!sourceRef) {
            sourceRef = (
              await setupTerminal.question("Enter the existing GitHub branch name:\n> ")
            ).trim();
            if (!sourceRef) console.log("A branch name is required.");
          }
          return { approved: true, sourceRef };
        },
      );
    } finally {
      setupTerminal.close();
    }
    console.log(
      `\nTemporary working folder created: ${preparedRepository.repositoryPath}`,
    );
  } else {
    preparedRepository = await prepareRepository(repositoryInput, async () => false);
  }
  const repositoryPath = preparedRepository.repositoryPath;
  if (resumePath && !interactive) {
    throw new Error("Resuming requires an interactive run so continuation choices remain explicit.");
  }
  let resumeSession: LoadedSession | undefined;
  if (interactive) {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answers: string[] = [];
    let activeSessionPath: string | undefined;
    let buildWithMeOffered = false;

    try {
      resumeSession = resumePath
        ? await loadResumableSession(resumePath, repositoryPath)
        : undefined;
      let selectedOperatingMode: OperatingMode | undefined =
        modeOverride && modeOverride !== "choose"
          ? modeOverride
          : modeOverride === "choose"
          ? undefined
          : resumeSession?.operatingMode
          ? resumeSession.operatingMode
          : await loadOperatingMode(repositoryPath);
      if (!selectedOperatingMode) {
        console.log(
          "\nChoose how much explanation and how many routine pauses you want for this session:",
        );
        console.log(
          `[G] ${operatingModes.guide.label} (recommended) — ${operatingModes.guide.description}`,
        );
        console.log(
          `[B] ${operatingModes["build-with-me"].label} — ${operatingModes["build-with-me"].description}`,
        );
        console.log(
          `[T] ${operatingModes["take-the-lead"].label} — ${operatingModes["take-the-lead"].description}`,
        );
        console.log("[S] Stop before starting — no planning or project changes.");
        let modeChoice: ModeChoice | undefined;
        while (!modeChoice) {
          modeChoice = parseModeChoice(await terminal.question("> "));
          if (!modeChoice) {
            console.log("Please enter guide, build with me, take the lead, or stop.");
          }
        }
        if (modeChoice === "stop") {
          console.log(
            "\nStopped before readiness checks. No project files or settings were changed.",
          );
          throw new PreflightStopped();
        }
        selectedOperatingMode = modeChoice;
        await saveOperatingMode(repositoryPath, selectedOperatingMode);
        console.log(`\nSaved ${selectedOperatingMode} for this repository.`);
      } else {
        console.log(`\nOperating mode: ${selectedOperatingMode}`);
        console.log(operatingModes[selectedOperatingMode].description);
      }
      let operatingMode: OperatingMode = selectedOperatingMode;
      if (resumeSession) {
        resumeSession = await saveSessionOperatingMode(
          resumeSession,
          operatingMode,
        );
      }

      const writeStageIntroduction = (stage: JourneyStage): void => {
        const message = formatStageIntroduction(stage, operatingMode);
        if (message) console.log(`\n${message}\n`);
      };
      const writeStageCompletion = (stage: JourneyStage): void => {
        const message = formatStageCompletion(stage, operatingMode);
        if (message) console.log(`\n${message}`);
      };
      const journeyIntroduction = formatJourneyIntroduction(operatingMode);
      if (journeyIntroduction) console.log(`\n${journeyIntroduction}`);

      const checkpointProvider = resumeSession && hasImplementationCheckpoint(resumeSession)
        ? resumeSession.implementation.provider
        : undefined;
      writeStageIntroduction("preflight");
      const preflight = await runGuidedPreflight({
        repositoryPath,
        providerOverride: checkpointProvider ?? providerOverride,
        force: forcePreflight,
        clearHistory: clearPreflightHistory,
        conversation: {
          ask: (prompt) => terminal.question(prompt),
          write: (message) => console.log(message),
        },
      });
      if (!preflight.proceed) {
        console.log("\nStopped before repository planning. No repository files or settings were changed.");
        throw new PreflightStopped();
      }
      writeStageCompletion("preflight");
      let implementationProvider = preflight.provider;
      if (resumeSession && hasImplementationCheckpoint(resumeSession)) {
        implementationProvider = resumeSession.implementation.provider;
      }
      if (resumeSession) featureRequest = resumeSession.featureRequest;
      activeSessionPath = resumeSession?.sessionPath;
      if (!resumeSession) writeStageIntroduction("inspect");
      const repositoryOverview = resumeSession?.plan.repositoryOverview ??
        await inspectRepository(repositoryPath, featureRequest);
      if (!resumeSession) {
        writeStageCompletion("inspect");
        writeStageIntroduction("restate");
      }
      let reasoning: ProductReasoning = resumeSession
        ? {
          title: resumeSession.plan.title,
          summary: resumeSession.plan.summary,
          recommendedDefaults: [],
          clarifyingQuestions: resumeSession.plan.clarifyingQuestions,
          productDecisions: resumeSession.plan.productDecisions,
          dependencies: resumeSession.plan.dependencies,
          acceptanceCriteria: resumeSession.plan.acceptanceCriteria,
          implementationSteps: resumeSession.plan.implementationSteps,
          risks: resumeSession.plan.risks,
          testPlan: resumeSession.plan.testPlan,
        }
        : await runRecoverableReadOnlyOperation(
          repositoryPath,
          "product-reasoning",
          () => reasonAboutFeature(
            repositoryPath,
            featureRequest,
            repositoryOverview,
          ),
        );

      const recordCurrentSession = async (): Promise<void> => {
        if (!resumeSession) return;
        try {
          const progress = await recordCompletedSession(completedSessionId(
            resumeSession.repository.path,
            resumeSession.specification.digest,
          ));
          if (progress.newlyCounted) {
            console.log(`Learning progress: ${progress.count} completed Product-to-PR session(s).`);
          }
        } catch (error) {
          console.log(
            `Learning progress could not be saved: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      };

      const maybeOfferBuildWithMe = async (
        input: string,
        currentMode: OperatingMode = "guide",
      ): Promise<"accepted" | "declined" | "not-offered"> => {
        if (currentMode !== "guide" || buildWithMeOffered || !requestsBuildWithMe(input)) {
          return "not-offered";
        }
        buildWithMeOffered = true;
        console.log(`\n${buildWithMeOfferExplanation}`);
        let choice: ReturnType<typeof parseBuildWithMeOfferChoice>;
        while (!choice) {
          choice = parseBuildWithMeOfferChoice(
            await terminal.question("Switch to Build with me for this repository? [Y/N]\n> "),
          );
          if (!choice) console.log("Please enter yes or no.");
        }
        return choice === "accept" ? "accepted" : "declined";
      };

      if (resumeSession) {
        console.log("\nResuming an approved Product-to-PR specification.");
        console.log(`Saved: ${resumeSession.createdAt}`);
        console.log(`Stage: ${resumeSession.stage}`);
        console.log("Remaining actions:");
        resumeSession.remainingActions.forEach((action) => console.log(`- ${action}`));
      }
      if (!resumeSession) {
      console.log("\nWhat I understand you want:\n");
      console.log(reasoning.summary);
      let interpretationChoice: InterpretationChoice | undefined;
      while (!interpretationChoice) {
        interpretationChoice = parseInterpretationChoice(
          await terminal.question(
            "\nChoose [C]onfirm or [E]dit this interpretation:\n> ",
          ),
        );
        if (!interpretationChoice) console.log("Please enter confirm or edit.");
      }
      if (interpretationChoice === "correct") {
        const correction = (
          await terminal.question(
            "Describe what should change in the interpretation:\n> ",
          )
        ).trim();
        if (correction) {
          answers.push(`User correction to the feature interpretation — ${correction}`);
          reasoning = await runRecoverableReadOnlyOperation(
            repositoryPath,
            "product-reasoning",
            () => reasonAboutFeature(
              repositoryPath,
              featureRequest,
              repositoryOverview,
              answers,
            ),
          );
          console.log("\nUpdated feature description:\n");
          console.log(reasoning.summary);
        }
      } else {
        answers.push("The user confirmed the plain-language feature interpretation.");
      }

      writeStageCompletion("restate");
      writeStageIntroduction("discover");
      if (reasoning.recommendedDefaults.length > 0) {
        console.log("\nRecommended defaults for low-risk choices:\n");
        reasoning.recommendedDefaults.forEach((recommendation, index) => {
          console.log(
            `${index + 1}. ${recommendation.decision}\n   Impact: ${recommendation.impact}`,
          );
        });
        let defaultsChoice: DefaultsChoice | undefined;
        while (!defaultsChoice) {
          defaultsChoice = parseDefaultsChoice(
            await terminal.question(
              "\nChoose [A]ccept all, [R]eview individually, or [D]ecline all:\n> ",
            ),
          );
          if (!defaultsChoice) console.log("Please enter accept all, review, or decline all.");
        }
        if (defaultsChoice === "accept-all") {
          reasoning.recommendedDefaults.forEach((recommendation) => {
            answers.push(formatDefaultDecision(recommendation.decision, "accept"));
          });
        } else if (defaultsChoice === "decline-all") {
          reasoning.recommendedDefaults.forEach((recommendation) => {
            answers.push(formatDefaultDecision(recommendation.decision, "decline"));
          });
        } else {
          for (const recommendation of reasoning.recommendedDefaults) {
            console.log(`\n${recommendation.decision}`);
            console.log(`Impact: ${recommendation.impact}`);
            let defaultChoice: DefaultReviewChoice | undefined;
            while (!defaultChoice) {
              defaultChoice = parseDefaultReviewChoice(
                await terminal.question("Choose [A]ccept, [C]hange, or [D]ecline:\n> "),
              );
              if (!defaultChoice) console.log("Please enter accept, change, or decline.");
            }
            if (defaultChoice === "accept") {
              answers.push(formatDefaultDecision(recommendation.decision, "accept"));
            } else if (defaultChoice === "decline") {
              answers.push(formatDefaultDecision(recommendation.decision, "decline"));
            } else {
              const replacement = (
                await terminal.question("Describe the default you want instead:\n> ")
              ).trim();
              answers.push(
                formatDefaultDecision(recommendation.decision, "change", replacement),
              );
            }
          }
        }
      }

      if (reasoning.clarifyingQuestions.length > 0) {
        console.log("\nA few product questions before I finalize the plan:\n");
        for (const question of reasoning.clarifyingQuestions) {
          const answer = await terminal.question(`${question}\n> `);
          answers.push(
            `${question} — ${
              answer.trim() || "Use the safest reasonable default."
            }`,
          );
        }
      }

      reasoning = await runRecoverableReadOnlyOperation(
        repositoryPath,
        "product-reasoning",
        () => reasonAboutFeature(
          repositoryPath,
          featureRequest,
          repositoryOverview,
          answers,
        ),
      );
      writeStageCompletion("discover");
      }

      if (!resumeSession) writeStageIntroduction("specify");
      while (true) {
        const plan = resumeSession?.plan ?? createProductPlan(
          featureRequest,
          repositoryOverview,
          reasoning,
        );
        const specification = resumeSession?.specification.content ?? formatPlan(plan);
        console.log(`\n${specification}`);
        console.log("\nAdvisory quality evaluation:\n");
        const specificationEvaluation = evaluateSpecification(plan);
        console.log(formatEvaluationReport(specificationEvaluation));
        if (!(resumeSession && hasImplementationCheckpoint(resumeSession))) {
          await recordQualitySafely(
            () => recordEvaluationEvent(repositoryPath, specificationEvaluation),
          );
        }
        if (resumeSession && hasImplementationCheckpoint(resumeSession)) {
          console.log(
            "\nThe specification was already approved before the saved implementation checkpoint, so its critique is not repeated.",
          );
        } else {
          const specificationCritique = await runCritiqueFlow({
            repositoryPath,
            artifact: "specification",
            producer: "codex",
            prompt: buildSpecificationCritiquePrompt(
              plan,
              specificationEvaluation,
            ),
            conversation: {
              ask: (prompt) => terminal.question(prompt),
              write: (message) => console.log(message),
            },
            retry: {
              onRetry: (notice) => recordQualitySafely(
                () => recordRetryEvent(
                  repositoryPath,
                  "independent-critique",
                  notice.attempt,
                  notice.maximumAttempts,
                ),
              ),
            },
          });
          await recordCritiqueResult(
            repositoryPath,
            "specification",
            specificationCritique,
          );
        }
        const riskPolicy = assessRiskPolicy(plan);
        console.log(`\n${formatRiskPolicy(riskPolicy)}`);
        await recordQualitySafely(
          () => recordRiskPolicyEvent(
            repositoryPath,
            riskPolicy.level,
            "plan",
          ),
        );

        let choice: ReviewChoice | undefined = resumeSession ? "approve" : undefined;
        while (!choice) {
          choice = parseReviewChoice(
            await terminal.question(
              "\nChoose [A]pprove, [M]odify, or [R]eject:\n> ",
            ),
          );
          if (!choice) {
            console.log("Please enter approve, modify, or reject.");
          }
        }

        if (choice === "reject") {
          console.log(
            "\nSpecification rejected. No specification was approved and no product code was changed.",
          );
          break;
        }

        if (choice === "approve") {
          if (outputPath) {
            await saveRequestedOutput(
              outputPath,
              specification,
              async (directoryPath) => {
                const answer = await terminal.question(
                  `\nThe output folder does not exist: ${directoryPath}\nCreate it? [Y/N]\n> `,
                );
                return answer.trim().toLowerCase() === "y" ||
                  answer.trim().toLowerCase() === "yes";
              },
            );
            console.log(`\nPlan saved to ${outputPath}`);
          }

          const path = resumeSession?.specification.path ??
            await preserveApprovedSpecification(
              repositoryPath,
              plan.title,
              specification,
            );
          if (resumeSession) {
            console.log(`\nValidated resumable session: ${resumeSession.sessionPath}`);
          } else {
            console.log(`\nSpecification approved and saved to ${path}`);
            resumeSession = await saveResumableSession(
              preparedRepository,
              featureRequest,
              plan,
              path,
              specification,
            );
            activeSessionPath = resumeSession.sessionPath;
            console.log(`Resumable session saved to ${activeSessionPath}`);
          }
          await recordCurrentSession();
          console.log("\nYour approved specification:\n");
          console.log(specification);
          console.log(
            "\nProduct-to-PR saved local session material in .product-to-pr/. It will not stage these files for its own commits. If your repository does not ignore that folder, add `.product-to-pr/` to .gitignore before making unrelated manual commits.",
          );
          console.log(
            resumeSession && hasImplementationCheckpoint(resumeSession)
              ? "The previously saved local product changes remain unchanged."
              : "No product code was changed.",
          );
          writeStageCompletion("specify");

          let buildChoice: BuildChoice = "build";
          if (
            pausesBeforeRoutineWork(operatingMode) &&
            !(resumeSession && hasImplementationCheckpoint(resumeSession))
          ) {
            let guidedBuildChoice: BuildChoice | undefined;
            while (!guidedBuildChoice) {
              const answer = await terminal.question(
                "\nChoose [B]uild now or [S]top after the specification:\n> ",
              );
              guidedBuildChoice = parseBuildChoice(answer);
              if (!guidedBuildChoice) {
                const offer = await maybeOfferBuildWithMe(answer, operatingMode);
                if (offer === "accepted") {
                  operatingMode = "build-with-me";
                  await saveOperatingMode(repositoryPath, operatingMode);
                  if (resumeSession) {
                    resumeSession = await saveSessionOperatingMode(resumeSession, operatingMode);
                  }
                  console.log("\nBuild with me is now active for this repository.");
                  guidedBuildChoice = "build";
                } else if (offer === "not-offered") {
                  console.log("Please enter build or stop.");
                }
              }
            }
            buildChoice = guidedBuildChoice;
          } else if (resumeSession && hasImplementationCheckpoint(resumeSession)) {
            console.log(
              "\nContinuing from the saved checkpoint; completed implementation will not run again.",
            );
          }

          if (buildChoice === "build") {
            let implementationPath: string;
            if (resumeSession && hasImplementationCheckpoint(resumeSession)) {
              implementationPath = resumeSession.implementation.packagePath;
              console.log(
                `\nValidated implementation checkpoint from ${resumeSession.implementation.completedAt}.`,
              );
              console.log("The saved local changes match their recorded content digest.");
            } else {
              if (riskPolicy.level === "restricted") {
                console.log(
                  "\nStopped at the restricted-risk checkpoint. The approved specification and resumable session were kept; automatic implementation was not authorized.",
                );
                break;
              }
              if (!await confirmElevatedRisk(
                riskPolicy,
                "implementation",
                (prompt) => terminal.question(prompt),
              )) {
                console.log(
                  "\nStopped at the elevated-risk checkpoint. The approved specification and resumable session were kept.",
                );
                break;
              }
              await assertImplementationProviderReady(implementationProvider);

              // Capture the commands Product-to-PR is willing to run before an
              // implementation provider can edit their configuration sources.
              const verificationBaseline = await captureVerificationBaseline(
                repositoryPath,
              );

              writeStageIntroduction("branch");
              const branchName = await createImplementationBranch(
                repositoryPath,
                plan.title,
              );
              implementationPath = await preserveImplementationPackage(
                repositoryPath,
                path,
                plan,
              );
              console.log(`\nSafe implementation branch created: ${branchName}`);
              writeStageCompletion("branch");
              if (!usesConciseRoutineUpdates(operatingMode)) {
                console.log(
                  `Implementation checklist saved to ${implementationPath}`,
                );
              }
              console.log(
                `\nImplementation provider: ${implementationProviders[implementationProvider].label}`,
              );
              writeStageIntroduction("implement");
              console.log("Implementing the approved change locally...");
              let implementationRunner: ImplementationRunner;
              if (implementationProvider === "manual") {
                implementationRunner = createManualImplementationRunner(
                  implementationPath,
                  async (manualPromptPath, prompt) => {
                    console.log(`\nManual handoff saved to ${manualPromptPath}`);
                    console.log("\nInstructions for the other AI:\n");
                    console.log(prompt);
                    await terminal.question(
                      "\nGive these instructions to the other AI in this repository. Return here and press Enter after it finishes.\n> ",
                    );
                  },
                );
              } else {
                implementationRunner = implementationRunnerFor(
                  implementationProvider,
                );
              }
              const implementationSummary = await implementApprovedPlan(
                repositoryPath,
                path,
                implementationPath,
                implementationRunner,
              );
              console.log(`\n${implementationSummary}`);
              console.log(
                "\nLocal changes are ready. No tests were run and nothing was committed or published.",
              );
              if (!resumeSession) {
                throw new Error("The approved session is unavailable for recovery.");
              }
              resumeSession = await saveImplementationCheckpoint(
                resumeSession,
                implementationProvider,
                implementationPath,
                verificationBaseline,
              );
              console.log(`Recovery checkpoint saved to ${resumeSession.sessionPath}`);
              writeStageCompletion("implement");
            }

            if (resumeSession && hasVerificationCheckpoint(resumeSession)) {
              const saved = resumeSession.verification;
              writeStageIntroduction("review");
              console.log(
                `\nValidated verification and critique checkpoint from ${saved.completedAt}.`,
              );
              console.log(`\n${formatLocalReview(saved.review)}`);
              console.log("\nSaved advisory quality evaluation:\n");
              console.log(formatEvaluationReport(saved.evaluation));
              if (saved.critique.status === "completed") {
                console.log(`\n${formatCritiqueReport(saved.critique.report)}`);
              } else if (saved.critique.status === "manual-handoff") {
                console.log(
                  `\nIndependent critique remains a manual handoff: ${saved.critique.promptPath}`,
                );
              } else {
                console.log("\nIndependent critique was skipped in the saved checkpoint.");
              }
              const reviewedRiskPolicy = assessRiskPolicy(
                plan,
                saved.review.changedFiles,
              );
              console.log(`\n${formatRiskPolicy(reviewedRiskPolicy)}`);
              await recordQualitySafely(
                () => recordRiskPolicyEvent(
                  repositoryPath,
                  reviewedRiskPolicy.level,
                  "implementation",
                ),
              );
              writeStageCompletion("review");
              await offerPublication({
                repositoryPath,
                plan,
                review: saved.review,
                riskPolicy: reviewedRiskPolicy,
                operatingMode,
                ask: (prompt) => terminal.question(prompt),
                write: (message) => console.log(message),
                recordCurrentSession,
              });
            } else {
            writeStageIntroduction("verify");
            const verificationDiscovery = await discoverVerification(
              repositoryPath,
            );
            const verificationBaseline = resumeSession && hasImplementationCheckpoint(resumeSession)
              ? resumeSession.implementation.verificationBaseline
              : undefined;
            let baselineMatches = verificationBaseline
              ? await verificationBaselineMatches(repositoryPath, verificationBaseline)
              : false;
            const dependencyInstall = baselineMatches
              ? await suggestedDependencyInstall(repositoryPath)
              : undefined;
            let dependencyInstallSkipped = false;
            if (dependencyInstall) {
              console.log(
                `\nThis repository has Node dependencies that are not installed. ${dependencyInstall.command} is needed before its npm checks can run.`,
              );
              console.log(
                "Installing dependencies can run repository-defined setup scripts. Review and approve it only if you trust this starting repository.",
              );
              let installChoice = "";
              while (!['install', 'skip'].includes(installChoice)) {
                installChoice = (await terminal.question(
                  "Choose [I]nstall dependencies or [S]kip automated verification:\n> ",
                )).trim().toLowerCase();
                if (installChoice === "i") installChoice = "install";
                if (installChoice === "s") installChoice = "skip";
                if (!['install', 'skip'].includes(installChoice)) {
                  console.log("Please enter install or skip.");
                }
              }
              if (installChoice === "install") {
                await installDependencies(repositoryPath, dependencyInstall);
                baselineMatches = verificationBaseline
                  ? await verificationBaselineMatches(repositoryPath, verificationBaseline)
                  : false;
              } else {
                dependencyInstallSkipped = true;
              }
            }
            const verificationCommands = baselineMatches && !dependencyInstallSkipped
              ? verificationDiscovery.trustedCommands
              : [];
            console.log(
              `\nVerification confidence: ${verificationDiscovery.confidence}`,
            );
            console.log("Trusted verification commands:");
            if (verificationCommands.length > 0) {
              verificationCommands.forEach((command) =>
                console.log(`- ${command.command}`)
              );
            } else {
              console.log("- No safe automated verification commands were discovered.");
            }
            if (verificationDiscovery.candidateCommands.length > 0) {
              console.log("Possible commands that will not run automatically:");
              verificationDiscovery.candidateCommands.forEach((command) =>
                console.log(`- ${command}`)
              );
            }
            verificationDiscovery.guidance.forEach((guidance) =>
              console.log(`- ${guidance}`)
            );
            if (!baselineMatches) {
              console.log(
                verificationBaseline
                  ? `- ${formatVerificationConfigurationChange(
                    verificationBaseline.trustSourcePaths,
                    operatingMode,
                  )}`
                  : "- This saved session has no pre-implementation verification baseline. Product-to-PR will not run verification automatically; start a new implementation session to establish one.",
              );
            }
            let verificationChoice: VerificationChoice = "verify";
            if (pausesBeforeRoutineWork(operatingMode)) {
              let guidedVerificationChoice: VerificationChoice | undefined;
              while (!guidedVerificationChoice) {
                const answer = await terminal.question("\nChoose [V]erify or [S]top here:\n> ");
                guidedVerificationChoice = parseVerificationChoice(answer);
                if (!guidedVerificationChoice) {
                  const offer = await maybeOfferBuildWithMe(answer, operatingMode);
                  if (offer === "accepted") {
                    operatingMode = "build-with-me";
                    await saveOperatingMode(repositoryPath, operatingMode);
                    if (resumeSession) {
                      resumeSession = await saveSessionOperatingMode(resumeSession, operatingMode);
                    }
                    console.log("\nBuild with me is now active for this repository.");
                    guidedVerificationChoice = "verify";
                  } else if (offer === "not-offered") {
                    console.log("Please enter verify or stop.");
                  }
                }
              }
              verificationChoice = guidedVerificationChoice;
            }
            if (verificationChoice === "verify") {
              const verification = await runVerificationCommands(
                repositoryPath,
                verificationCommands,
              );
              writeStageCompletion("verify");
              writeStageIntroduction("review");
              const review = await runRecoverableReadOnlyOperation(
                repositoryPath,
                "acceptance-review",
                () => createLocalReview(
                  repositoryPath,
                  plan,
                  verification,
                ),
              );
              await recordCurrentSession();
              console.log(`\n${formatLocalReview(review)}`);
              console.log("\nAdvisory quality evaluation:\n");
              const implementationEvaluation = evaluateImplementation(plan, review);
              console.log(formatEvaluationReport(implementationEvaluation));
              await recordQualitySafely(
                () => recordEvaluationEvent(repositoryPath, implementationEvaluation),
              );
              const changeEvidence = await readLocalChangeEvidence(repositoryPath);
              const implementationCritique = await runCritiqueFlow({
                repositoryPath,
                artifact: "implementation",
                producer: implementationProvider,
                prompt: buildImplementationCritiquePrompt(
                  plan,
                  review,
                  changeEvidence,
                  implementationEvaluation,
                ),
                conversation: {
                  ask: (prompt) => terminal.question(prompt),
                  write: (message) => console.log(message),
                },
                retry: {
                  onRetry: (notice) => recordQualitySafely(
                    () => recordRetryEvent(
                      repositoryPath,
                      "independent-critique",
                      notice.attempt,
                      notice.maximumAttempts,
                    ),
                  ),
                },
              });
              await recordCritiqueResult(
                repositoryPath,
                "implementation",
                implementationCritique,
              );
              if (!resumeSession) {
                throw new Error("The implementation checkpoint is unavailable for recovery.");
              }
              resumeSession = await saveVerificationCheckpoint(
                resumeSession,
                review,
                implementationEvaluation,
                implementationCritique,
              );
              console.log(`Recovery checkpoint updated at ${resumeSession.sessionPath}`);
              console.log("\nNothing was committed or published.");
              writeStageCompletion("review");

              const reviewedRiskPolicy = assessRiskPolicy(
                plan,
                review.changedFiles,
              );
              console.log(`\n${formatRiskPolicy(reviewedRiskPolicy)}`);
              await recordQualitySafely(
                () => recordRiskPolicyEvent(
                  repositoryPath,
                  reviewedRiskPolicy.level,
                  "implementation",
                ),
              );

              if (operatingMode === "build-with-me") {
                console.log(
                  "\nBuild with me is active. When this level feels comfortable, you can try --mode take-the-lead for a quieter routine workflow.",
                );
              }

              await offerPublication({
                repositoryPath,
                plan,
                review,
                riskPolicy: reviewedRiskPolicy,
                operatingMode,
                ask: (prompt) => terminal.question(prompt),
                write: (message) => console.log(message),
                recordCurrentSession,
              });
            } else {
              console.log(
                "\nStopped with local changes ready. No verification, commit, or publication was performed.",
              );
            }
            }
          } else {
            console.log(
              "\nStopped after the approved specification. Implementation was not authorized.",
            );
          }
          break;
        }

        const requestedChange = (
          await terminal.question(
            "\nDescribe what you want changed in plain English:\n> ",
          )
        ).trim();
        if (!requestedChange) {
          console.log("\nNo change entered. Returning to review.");
          continue;
        }

        answers.push(`Requested modification — ${requestedChange}`);
        reasoning = await runRecoverableReadOnlyOperation(
          repositoryPath,
          "product-reasoning",
          () => reasonAboutFeature(
            repositoryPath,
            featureRequest,
            repositoryOverview,
            answers,
          ),
        );
      }
    } catch (error) {
      if (!(error instanceof PreflightStopped)) throw error;
    } finally {
      if (preparedRepository.source === "github") {
        let workspaceChoice: WorkspaceChoice | undefined;
        console.log(
          `\nTemporary working folder: ${preparedRepository.repositoryPath}`,
        );
        console.log(managedWorkspaceDeletionWarning(activeSessionPath));
        console.log("GitHub content is not deleted.");
        while (!workspaceChoice) {
          workspaceChoice = parseWorkspaceChoice(
            await terminal.question("Choose [K]eep or [D]elete this folder:\n> "),
          );
          if (!workspaceChoice) console.log("Please enter keep or delete.");
        }
        if (workspaceChoice === "delete") {
          await deleteManagedWorkspace(preparedRepository);
          console.log("Temporary working folder deleted.");
        } else {
          console.log("Temporary working folder kept for later use.");
        }
      }
      terminal.close();
    }
  } else {
    const repositoryOverview = await inspectRepository(repositoryPath, featureRequest);
    const reasoning = await runRecoverableReadOnlyOperation(
      repositoryPath,
      "product-reasoning",
      () => reasonAboutFeature(
        repositoryPath,
        featureRequest,
        repositoryOverview,
      ),
    );
    const plan = createProductPlan(
      featureRequest,
      repositoryOverview,
      reasoning,
    );
    const specification = formatPlan(plan);
    console.log(specification);
    console.log("\nAdvisory quality evaluation:\n");
    const specificationEvaluation = evaluateSpecification(plan);
    console.log(formatEvaluationReport(specificationEvaluation));
    await recordQualitySafely(
      () => recordEvaluationEvent(repositoryPath, specificationEvaluation),
    );
    const riskPolicy = assessRiskPolicy(plan);
    console.log(`\n${formatRiskPolicy(riskPolicy)}`);
    await recordQualitySafely(
      () => recordRiskPolicyEvent(repositoryPath, riskPolicy.level, "plan"),
    );
    if (outputPath) {
      await saveRequestedOutput(outputPath, specification);
      console.log(`\nPlan saved to ${outputPath}`);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error(message);
  process.exitCode = 1;
}
