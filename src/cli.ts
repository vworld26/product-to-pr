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
import { implementApprovedPlan } from "./execute.js";
import { formatPlan } from "./format.js";
import { preserveImplementationPackage } from "./implementation.js";
import { inspectRepository } from "./inspect.js";
import {
  loadOperatingMode,
  operatingModeDescriptions,
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
} from "./publication.js";
import { reasonAboutFeature } from "./reason.js";
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
  const { repositoryPath, featureRequest, outputPath, modeOverride } =
    parseCliArguments(process.argv.slice(2));

  if (!repositoryPath) {
    throw new Error("A repository folder is required.");
  }

  if (!featureRequest.trim()) {
    throw new Error("A feature request is required.");
  }

  const repositoryOverview = await inspectRepository(
    repositoryPath,
    featureRequest,
  );
  let reasoning = await reasonAboutFeature(
    repositoryPath,
    featureRequest,
    repositoryOverview,
  );
  const interactive = process.stdin.isTTY && process.stdout.isTTY;

  if (interactive) {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answers: string[] = [];

    try {
      if (reasoning.clarifyingQuestions.length > 0) {
        console.log("\nA few product decisions before I finalize the plan:\n");
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
              `[G] Guide me (recommended) — ${operatingModeDescriptions.guide}`,
            );
            console.log(
              `[B] Build with me — ${operatingModeDescriptions["build-with-me"]}`,
            );
            console.log(
              `[T] Take the lead — ${operatingModeDescriptions["take-the-lead"]}`,
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
            console.log(operatingModeDescriptions[operatingMode]);
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
            verificationCommands.forEach((command) =>
              console.log(`- ${command.command}`)
            );
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

              if (verification.every((result) => result.passed)) {
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
                      const url = await openPullRequest(repositoryPath, plan, review);
                      console.log(`\nPull request opened: ${url}`);
                    }
                  }
                }
              } else {
                console.log(
                  "\nCommit is unavailable because verification failed. Fix the local changes and verify again.",
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
