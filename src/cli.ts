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
  parseInterpretationChoice,
  parseRepositorySourceChoice,
  type InterpretationChoice,
  type RepositorySourceChoice,
} from "./discovery.js";
import { implementApprovedPlan } from "./execute.js";
import { formatPlan } from "./format.js";
import { preserveImplementationPackage } from "./implementation.js";
import { inspectRepository } from "./inspect.js";
import {
  loadOperatingMode,
  operatingModes,
  parseModeChoice,
  pausesBeforeRoutineWork,
  saveOperatingMode,
  type ModeChoice,
  type OperatingMode,
  usesConciseRoutineUpdates,
} from "./mode.js";
import {
  MissingOutputDirectoryError,
  parseCliArguments,
  writeOutputFile,
} from "./output.js";
import { createProductPlan } from "./plan.js";
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
import { createLocalReview, formatLocalReview } from "./review.js";
import { discoverVerificationCommands, runVerificationCommands } from "./verify.js";

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
  const { repositoryPath: repositoryInput, featureRequest, outputPath, modeOverride } =
    parseCliArguments(process.argv.slice(2));

  if (!repositoryInput) {
    throw new Error("A repository folder or GitHub URL is required.");
  }

  if (!featureRequest.trim()) {
    throw new Error("A feature request is required.");
  }

  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (parseGitHubRepositoryUrl(repositoryInput) && !interactive) {
    throw new Error(
      "GitHub URLs require an interactive run so you can approve the temporary working folder. A local repository path still works non-interactively.",
    );
  }

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
          console.log("[D] Default branch — start from the repository's main version.");
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

  const repositoryOverview = await inspectRepository(
    repositoryPath,
    featureRequest,
  );
  let reasoning = await reasonAboutFeature(
    repositoryPath,
    featureRequest,
    repositoryOverview,
  );
  if (interactive) {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answers: string[] = [];

    try {
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
          reasoning = await reasonAboutFeature(
            repositoryPath,
            featureRequest,
            repositoryOverview,
            answers,
          );
          console.log("\nUpdated feature description:\n");
          console.log(reasoning.summary);
        }
      } else {
        answers.push("The user confirmed the plain-language feature interpretation.");
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

        reasoning = await reasonAboutFeature(
          repositoryPath,
          featureRequest,
          repositoryOverview,
          answers,
        );
      }

      while (true) {
        const plan = createProductPlan(
          featureRequest,
          repositoryOverview,
          reasoning,
        );
        const specification = formatPlan(plan);
        console.log(`\n${specification}`);

        let choice: ReviewChoice | undefined;
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
          console.log("\nSpecification rejected. Nothing was saved or built.");
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

          const path = await preserveApprovedSpecification(
            repositoryPath,
            plan.title,
            specification,
          );
          console.log(`\nSpecification approved and saved to ${path}`);
          console.log("\nYour approved specification:\n");
          console.log(specification);
          console.log("No product code was changed.");

          let operatingMode: OperatingMode | undefined =
            modeOverride && modeOverride !== "choose"
              ? modeOverride
              : modeOverride === "choose"
              ? undefined
              : await loadOperatingMode(repositoryPath);
          if (!operatingMode) {
            console.log("\nHow would you like to continue?");
            console.log(
              `[G] ${operatingModes.guide.label} (recommended) — ${operatingModes.guide.description}`,
            );
            console.log(
              `[B] ${operatingModes["build-with-me"].label} — ${operatingModes["build-with-me"].description}`,
            );
            console.log(
              `[T] ${operatingModes["take-the-lead"].label} — ${operatingModes["take-the-lead"].description}`,
            );
            console.log("[S] Stop here — keep the approved specification for later.");
            let modeChoice: ModeChoice | undefined;
            while (!modeChoice) {
              modeChoice = parseModeChoice(await terminal.question("> "));
              if (!modeChoice) {
                console.log("Please enter guide, build with me, take the lead, or stop.");
              }
            }
            if (modeChoice === "stop") {
              console.log(
                "\nStopped after the approved specification. Implementation was not authorized.",
              );
              break;
            }
            operatingMode = modeChoice;
            await saveOperatingMode(repositoryPath, operatingMode);
            console.log(`\nSaved ${operatingMode} for this repository.`);
          } else {
            console.log(`\nOperating mode: ${operatingMode}`);
            console.log(operatingModes[operatingMode].description);
          }

          let buildChoice: BuildChoice = "build";
          if (pausesBeforeRoutineWork(operatingMode)) {
            let guidedBuildChoice: BuildChoice | undefined;
            while (!guidedBuildChoice) {
              guidedBuildChoice = parseBuildChoice(
                await terminal.question(
                  "\nChoose [B]uild now or [S]top after the specification:\n> ",
                ),
              );
              if (!guidedBuildChoice) {
                console.log("Please enter build or stop.");
              }
            }
            buildChoice = guidedBuildChoice;
          }

          if (buildChoice === "build") {
            const branchName = await createImplementationBranch(
              repositoryPath,
              plan.title,
            );
            const implementationPath = await preserveImplementationPackage(
              repositoryPath,
              path,
              plan,
            );
            console.log(`\nSafe implementation branch created: ${branchName}`);
            if (!usesConciseRoutineUpdates(operatingMode)) {
              console.log(
                `Implementation checklist saved to ${implementationPath}`,
              );
            }
            console.log("\nImplementing the approved change locally...");
            const implementationSummary = await implementApprovedPlan(
              repositoryPath,
              path,
              implementationPath,
            );
            console.log(`\n${implementationSummary}`);
            console.log(
              "\nLocal changes are ready. No tests were run and nothing was committed or published.",
            );

            const verificationCommands = await discoverVerificationCommands(
              repositoryPath,
            );
            console.log("\nVerification commands:");
            if (verificationCommands.length > 0) {
              verificationCommands.forEach((command) =>
                console.log(`- ${command.command}`)
              );
            } else {
              console.log("- No safe automated verification commands were discovered.");
            }
            let verificationChoice: VerificationChoice = "verify";
            if (pausesBeforeRoutineWork(operatingMode)) {
              let guidedVerificationChoice: VerificationChoice | undefined;
              while (!guidedVerificationChoice) {
                guidedVerificationChoice = parseVerificationChoice(
                  await terminal.question("\nChoose [V]erify or [S]top here:\n> "),
                );
                if (!guidedVerificationChoice) {
                  console.log("Please enter verify or stop.");
                }
              }
              verificationChoice = guidedVerificationChoice;
            }
            if (verificationChoice === "verify") {
              const verification = await runVerificationCommands(
                repositoryPath,
                verificationCommands,
              );
              const review = await createLocalReview(
                repositoryPath,
                plan,
                verification,
              );
              console.log(`\n${formatLocalReview(review)}`);
              console.log("\nNothing was committed or published.");

              if (operatingMode === "guide") {
                console.log(
                  "\nYou completed a guided local change. Use --mode build-with-me next time when you want routine implementation and verification to flow together.",
                );
              } else if (operatingMode === "build-with-me") {
                console.log(
                  "\nBuild with me is active. When this level feels comfortable, you can try --mode take-the-lead for a quieter routine workflow.",
                );
              }

              if (
                verification.length > 0 &&
                verification.every((result) => result.passed)
              ) {
                const commitMessage = proposeCommitMessage(plan);
                console.log(`\nProposed commit message:\n${commitMessage}`);
                let commitChoice: CommitChoice | undefined;
                while (!commitChoice) {
                  commitChoice = parseCommitChoice(
                    await terminal.question("\nChoose [C]ommit or [S]top here:\n> "),
                  );
                  if (!commitChoice) console.log("Please enter commit or stop.");
                }
                if (commitChoice === "commit") {
                  const commit = await commitReviewedChanges(
                    repositoryPath,
                    commitMessage,
                    review,
                  );
                  console.log(`\nReviewed changes committed: ${commit}`);
                  let pushChoice: PushChoice | undefined;
                  while (!pushChoice) {
                    pushChoice = parsePushChoice(
                      await terminal.question("\nChoose [P]ush or [S]top here:\n> "),
                    );
                    if (!pushChoice) console.log("Please enter push or stop.");
                  }
                  if (pushChoice === "push") {
                    const branch = await pushImplementationBranch(repositoryPath);
                    console.log(`\nBranch pushed: ${branch}`);
                    let pullRequestChoice: PullRequestChoice | undefined;
                    while (!pullRequestChoice) {
                      pullRequestChoice = parsePullRequestChoice(
                        await terminal.question("\nChoose open [P]ull request or [S]top here:\n> "),
                      );
                      if (!pullRequestChoice) console.log("Please enter pull request or stop.");
                    }
                    if (pullRequestChoice === "pull-request") {
                      console.log("\nWho will own the pull-request review?");
                      console.log(`[I] ${reviewOwnerDescriptions.operator}`);
                      console.log(`[H] ${reviewOwnerDescriptions.maintainer}`);
                      let reviewOwner: ReviewOwner | undefined;
                      while (!reviewOwner) {
                        reviewOwner = parseReviewOwner(
                          await terminal.question("> "),
                        );
                        if (!reviewOwner) console.log("Please enter I or H.");
                      }
                      const handoff: ReviewHandoff = { owner: reviewOwner };
                      if (reviewOwner === "maintainer") {
                        const reviewer = (
                          await terminal.question(
                            "GitHub username or team to request (optional; press Enter to skip):\n> ",
                          )
                        ).trim();
                        if (reviewer) handoff.reviewer = reviewer;
                      }
                      const url = await openPullRequest(
                        repositoryPath,
                        plan,
                        review,
                        handoff,
                      );
                      console.log(`\nPull request opened: ${url}`);
                      if (handoff.reviewer) {
                        await requestPullRequestReview(
                          repositoryPath,
                          url,
                          handoff.reviewer,
                        );
                        console.log(`Review requested from ${handoff.reviewer}.`);
                      }
                      console.log(
                        "Product-to-PR has stopped before merge. The repository maintainer must review the pull request and make the separate merge decision.",
                      );
                    }
                  }
                }
              } else {
                console.log(
                  verification.length === 0
                    ? "\nCommit is unavailable because no safe automated verification command was discovered. Add or document a verification command, then review again."
                    : "\nCommit is unavailable because verification failed. Fix the local changes and verify again.",
                );
              }
            } else {
              console.log(
                "\nStopped with local changes ready. No verification, commit, or publication was performed.",
              );
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
        reasoning = await reasonAboutFeature(
          repositoryPath,
          featureRequest,
          repositoryOverview,
          answers,
        );
      }
    } finally {
      if (preparedRepository.source === "github") {
        let workspaceChoice: WorkspaceChoice | undefined;
        console.log(
          `\nTemporary working folder: ${preparedRepository.repositoryPath}`,
        );
        console.log(
          "Deleting this folder also deletes any specifications or unpushed work stored only inside it. GitHub content is not deleted.",
        );
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
    const plan = createProductPlan(
      featureRequest,
      repositoryOverview,
      reasoning,
    );
    const specification = formatPlan(plan);
    console.log(specification);
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
