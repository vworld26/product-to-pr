export type InterpretationChoice = "confirm" | "correct";
export type RepositorySourceChoice = "default" | "branch";

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
