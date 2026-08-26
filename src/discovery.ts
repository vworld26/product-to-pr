export type InterpretationChoice = "confirm" | "correct";
export type RepositorySourceChoice = "default" | "branch";
export type DefaultsChoice = "accept-all" | "review" | "decline-all";
export type DefaultReviewChoice = "accept" | "change" | "decline";

export function parseInterpretationChoice(
  input: string,
): InterpretationChoice | undefined {
  const choice = input.trim().toLowerCase();
  if (["c", "confirm", "yes", "y"].includes(choice)) return "confirm";
  if (["e", "edit", "correct", "no", "n"].includes(choice)) return "correct";
  return undefined;
}

export function parseRepositorySourceChoice(
  input: string,
): RepositorySourceChoice | undefined {
  const choice = input.trim().toLowerCase();
  if (["d", "default"].includes(choice)) return "default";
  if (["b", "branch"].includes(choice)) return "branch";
  return undefined;
}

export function parseDefaultsChoice(input: string): DefaultsChoice | undefined {
  const choice = input.trim().toLowerCase();
  if (["a", "accept", "accept all"].includes(choice)) return "accept-all";
  if (["r", "review"].includes(choice)) return "review";
  if (["d", "decline", "decline all"].includes(choice)) return "decline-all";
  return undefined;
}

export function parseDefaultReviewChoice(
  input: string,
): DefaultReviewChoice | undefined {
  const choice = input.trim().toLowerCase();
  if (["a", "accept"].includes(choice)) return "accept";
  if (["c", "change"].includes(choice)) return "change";
  if (["d", "decline"].includes(choice)) return "decline";
  return undefined;
}

export function formatDefaultDecision(
  decision: string,
  choice: DefaultReviewChoice,
  replacement = "",
): string {
  if (choice === "accept") {
    return `Accepted recommended default — ${decision}`;
  }
  if (choice === "decline") {
    return `Declined recommended default — ${decision}. Keep this unresolved and exclude it from requirements.`;
  }
  return `User replaced recommended default "${decision}" with — ${
    replacement.trim() || "No replacement; keep unresolved."
  }`;
}
