export type ReviewOwner = "operator" | "maintainer";

export type ReviewHandoff = {
  owner: ReviewOwner;
  reviewer?: string;
};

export const reviewOwnerDescriptions: Record<ReviewOwner, string> = {
  operator:
    "I am also the repository maintainer and will review the pull request separately.",
  maintainer:
    "Another repository maintainer will review and decide whether to merge.",
};

export function parseReviewOwner(input: string): ReviewOwner | undefined {
  const choice = input.trim().toLowerCase();
  if (choice === "i" || choice === "me" || choice === "operator") {
    return "operator";
  }
  if (
    choice === "h" ||
    choice === "handoff" ||
    choice === "maintainer"
  ) {
    return "maintainer";
  }
  return undefined;
}

export function formatReviewHandoff(handoff: ReviewHandoff): string[] {
  if (handoff.owner === "operator") {
    return [
      "Review owner: The Product-to-PR operator is also the repository maintainer.",
      "Merge remains a separate decision after reviewing the pull request and CI.",
    ];
  }
  return [
    `Review owner: Another repository maintainer${
      handoff.reviewer ? ` (${handoff.reviewer})` : ""
    }.`,
    "The maintainer will review the pull request and decide whether to merge.",
  ];
}
