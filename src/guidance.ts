import type { OperatingMode } from "./mode.js";

export type JourneyStage =
  | "preflight"
  | "inspect"
  | "restate"
  | "discover"
  | "specify"
  | "branch"
  | "implement"
  | "verify"
  | "review"
  | "publish";

type StageGuidance = {
  number: number;
  title: string;
  next: string;
  why: string;
  boundary: string;
  result: string;
  comingUp?: string;
};

export const journeyStages: Record<JourneyStage, StageGuidance> = {
  preflight: {
    number: 1,
    title: "Check that everything is ready",
    next:
      "check that your project, GitHub connection, and selected AI tools are ready for safe use",
    why:
      "Finding setup problems now prevents confusing failures after work has started.",
    boundary:
      "These are read-only checks. They do not install software, edit code, or change GitHub settings.",
    result:
      "The readiness check finished and any blockers or risks are shown above.",
    comingUp:
      "Next, I’ll safely read the project so the plan can refer to its real files and instructions.",
  },
  inspect: {
    number: 2,
    title: "Understand the project",
    next:
      "look through the project’s structure, instructions, important files, and available tests",
    why:
      "A plan grounded in the real project is safer and more useful than a generic answer.",
    boundary:
      "Inspection only reads the project. It does not edit files or run implementation commands.",
    result:
      "Project inspection is complete. Product-to-PR found the available structure, instructions, and likely verification commands.",
    comingUp:
      "Next, I’ll restate your feature idea in everyday language so you can correct any misunderstanding.",
  },
  restate: {
    number: 3,
    title: "Confirm the outcome you want",
    next:
      "translate your feature request into a clear description of what a person should experience",
    why:
      "Confirming the outcome before discussing implementation keeps the work focused on the real product need.",
    boundary:
      "You can confirm the interpretation or correct it. No specification or code is approved yet.",
    result:
      "The plain-language feature outcome is now confirmed.",
    comingUp:
      "Next, I’ll ask only the product questions that materially affect the result.",
  },
  discover: {
    number: 4,
    title: "Resolve important product decisions",
    next:
      "separate confirmed requirements from low-risk recommendations and genuinely unresolved choices",
    why:
      "This prevents an AI recommendation from silently becoming a requirement you never chose.",
    boundary:
      "You can accept grouped low-risk defaults, review them individually, or replace them.",
    result:
      "The decisions needed for this feature have been recorded with their sources.",
    comingUp:
      "Next, I’ll turn the confirmed outcome, project evidence, and decisions into a reviewable specification.",
  },
  specify: {
    number: 5,
    title: "Review the proposed specification",
    next:
      "show the complete plan, including success criteria, likely files, risks, implementation steps, and tests",
    why:
      "The specification is the agreement between your product intent and the implementation work.",
    boundary:
      "You can approve, modify, or reject it. Approving saves the plan but still does not change product code.",
    result:
      "The specification was approved and saved with a resumable checkpoint. Product code is still unchanged.",
    comingUp:
      "Next, you can stop with the saved plan or create a separate branch for implementation.",
  },
  branch: {
    number: 6,
    title: "Create a safe place for the change",
    next:
      "create a branch, which is a separate line of work that keeps the project’s main version untouched",
    why:
      "A branch makes the change reviewable and easy to abandon without rewriting the main project.",
    boundary:
      "Creating the branch does not publish code to GitHub and does not change the main branch.",
    result:
      "The implementation branch is ready. The project’s main branch remains unchanged.",
    comingUp:
      "Next, the selected implementation provider will change only the files needed by the approved specification. Later, before tests run, I’ll check whether this project needs its own tools installed. If it does, I’ll explain and ask first.",
  },
  implement: {
    number: 7,
    title: "Build the approved change",
    next:
      "ask the selected implementation provider to make the local code changes described in the approved specification",
    why:
      "The approved plan limits the implementation and gives the later review something concrete to check.",
    boundary:
      "Implementation can edit local product files, but it cannot run verification, commit, push, open a pull request, or merge.",
    result:
      "Local implementation is complete. The changes are not yet verified, committed, or published.",
    comingUp:
      "Next, Product-to-PR will identify and run only the checks this project has declared safe.",
  },
  verify: {
    number: 8,
    title: "Check that the project still works",
    next:
      "run the project’s trusted verification commands, such as its existing automated tests",
    why:
      "Passing checks provide evidence that the requested behavior works and existing behavior was not accidentally broken.",
    boundary:
      "Only commands the project explicitly declares or configures as trusted are eligible to run automatically.",
    result:
      "The trusted checks finished. Any failure remains visible and prevents publication from being offered.",
    comingUp:
      "Next, I’ll compare the actual changes and test evidence with every approved success criterion.",
  },
  review: {
    number: 9,
    title: "Review the evidence",
    next:
      "show what changed and connect the implementation and test results to each approved success criterion",
    why:
      "This lets you judge the result from visible evidence instead of relying on an AI’s confidence alone.",
    boundary:
      "Review is read-only. It does not approve, commit, publish, or merge the work.",
    result:
      "The implementation review and recovery checkpoint are complete. The evidence above remains available for your decision.",
    comingUp:
      "Next, if the evidence is sufficient, you can separately approve saving the change, publishing its branch, and opening a pull request.",
  },
  publish: {
    number: 10,
    title: "Prepare the work for human review",
    next:
      "offer three separate choices: create a commit, push the branch to GitHub, and open a pull request",
    why:
      "Separating these actions keeps you in control of when local work becomes visible to other people.",
    boundary:
      "Product-to-PR always stops before merge. A repository maintainer makes the final review and merge decision.",
    result:
      "The pull request is open for human review, and Product-to-PR has stopped before merge.",
  },
};

export function formatSessionOpening(): string {
  return [
    "# Welcome to Product-to-PR",
    "We’ll turn your feature idea into a review-ready pull request together. You do not need to know the technical process in advance.",
    "Before the guided journey begins, Product-to-PR will connect to the project you selected. A local folder is used in place; a GitHub URL requires your approval before a real working copy is created on this computer.",
    "Nothing will be merged automatically.",
  ].join("\n");
}

export function formatJourneyIntroduction(
  mode: OperatingMode,
): string | undefined {
  if (mode === "take-the-lead") return undefined;
  if (mode === "build-with-me") {
    return [
      "# Your Product-to-PR journey",
      "We’ll check readiness, understand the feature and project, agree on a specification, build on a separate branch, verify the result, and prepare a pull request.",
      "I’ll mark each stage as we move. Nothing will be merged automatically.",
    ].join("\n");
  }
  return [
    "# Here is your Product-to-PR journey",
    "In Guide me, I’ll introduce each step before it begins, explain why it matters, and tell you what changed afterward. You do not need to know the technical steps in advance.",
    "",
    "Here is the journey:",
    "1. Check that your project and tools are ready.",
    "2. Safely inspect the project’s real files and instructions.",
    "3. Confirm the outcome you want in everyday language.",
    "4. Resolve only the product decisions that affect the result.",
    "5. Review and approve a complete specification.",
    "6. Create a separate branch so the main project stays untouched.",
    "7. Build only the approved change.",
    "8. Run the project’s trusted checks.",
    "9. Review the changed files and evidence together.",
    "10. Separately approve a commit, GitHub push, and pull request.",
    "",
    "Nothing will be merged automatically. You can stop at the major checkpoints and continue later from saved work.",
  ].join("\n");
}

export function formatStageIntroduction(
  stage: JourneyStage,
  mode: OperatingMode,
): string | undefined {
  if (mode === "take-the-lead") return undefined;
  const guidance = journeyStages[stage];
  if (mode === "build-with-me") {
    return [
      `# Step ${guidance.number} of 10 — ${guidance.title}`,
      `Next: We’ll ${guidance.next}.`,
    ].join("\n");
  }
  return [
    `# Step ${guidance.number} of 10 — ${guidance.title}`,
    `Next, we’re going to ${guidance.next}.`,
    `Why this matters: ${guidance.why}`,
    `Safety boundary: ${guidance.boundary}`,
  ].join("\n");
}

export function formatStageCompletion(
  stage: JourneyStage,
  mode: OperatingMode,
): string | undefined {
  if (mode === "take-the-lead") return undefined;
  const guidance = journeyStages[stage];
  if (mode === "build-with-me") {
    return guidance.comingUp
      ? `Step ${guidance.number} complete. ${guidance.comingUp}`
      : `Step ${guidance.number} complete. ${guidance.result}`;
  }
  return [
    `# Step ${guidance.number} complete`,
    `What happened: ${guidance.result}`,
    ...(guidance.comingUp
      ? [`Next: ${guidance.comingUp.replace(/^Next, /, "")}`]
      : []),
  ].join("\n");
}

export type PublicationAction = "commit" | "push" | "pull-request";

const publicationActions: Record<PublicationAction, string[]> = {
  commit: [
    "Next, we’re going to decide whether to create a commit.",
    "A commit is a named snapshot of the reviewed changes on this branch. It remains local and does not send anything to GitHub.",
  ],
  push: [
    "Next, we’re going to decide whether to push the branch.",
    "Pushing sends this branch and its commit to GitHub. It does not change the main branch, open a pull request, or merge anything.",
  ],
  "pull-request": [
    "Next, we’re going to decide whether to open a pull request.",
    "A pull request presents the branch for human review. Product-to-PR will record who owns that review and stop before merge.",
  ],
};

export function formatPublicationAction(
  action: PublicationAction,
  mode: OperatingMode,
): string | undefined {
  if (mode === "take-the-lead") return undefined;
  const [next, explanation] = publicationActions[action];
  return mode === "guide" ? `${next}\n${explanation}` : next;
}

export function formatVerificationConfigurationChange(
  sourcePaths: string[],
  mode: OperatingMode,
): string {
  const summary = "The project’s test instructions changed while the AI was working, so I will not run them automatically.";
  if (mode !== "guide" || sourcePaths.length === 0) return summary;
  return [
    summary,
    `Technical details: Product-to-PR recorded the trusted test settings from ${sourcePaths.map((path) => `\`${path}\``).join(", ")}. Review those files before starting a new implementation session.`,
  ].join("\n");
}
