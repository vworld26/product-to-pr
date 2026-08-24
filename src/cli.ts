import { createInterface } from "node:readline/promises";

import {
  parseBuildChoice,
  parseReviewChoice,
  parseVerificationChoice,
  preserveApprovedSpecification,
  type BuildChoice,
  type ReviewChoice,
  type VerificationChoice,
} from "./approval.js";
import { createImplementationBranch } from "./branch.js";
import { implementApprovedPlan } from "./execute.js";
import { formatPlan } from "./format.js";
import { preserveImplementationPackage } from "./implementation.js";
import { inspectRepository } from "./inspect.js";
import {
  MissingOutputDirectoryError,
  parseCliArguments,
  writeOutputFile,
} from "./output.js";
import { createProductPlan } from "./plan.js";
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
  const { repositoryPath, featureRequest, outputPath } = parseCliArguments(
    process.argv.slice(2),
  );

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

          let buildChoice: BuildChoice | undefined;
          while (!buildChoice) {
            buildChoice = parseBuildChoice(
              await terminal.question(
                "\nChoose [B]uild now or [S]top after the specification:\n> ",
              ),
            );
            if (!buildChoice) {
              console.log("Please enter build or stop.");
            }
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
            console.log(
              `Implementation checklist saved to ${implementationPath}`,
            );
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
            console.log("\nAvailable verification commands:");
            verificationCommands.forEach((command) =>
              console.log(`- ${command.command}`)
            );
            let verificationChoice: VerificationChoice | undefined;
            while (!verificationChoice) {
              verificationChoice = parseVerificationChoice(
                await terminal.question("\nChoose [V]erify or [S]top here:\n> "),
              );
              if (!verificationChoice) {
                console.log("Please enter verify or stop.");
              }
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
