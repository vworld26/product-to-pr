import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ImplementationProvider = "codex" | "claude" | "manual";
export type AutomatedImplementationProvider = Exclude<
  ImplementationProvider,
  "manual"
>;

export const implementationProviders: Record<
  ImplementationProvider,
  { label: string; description: string }
> = {
  codex: {
    label: "Codex",
    description: "Run Codex locally with access limited to this implementation.",
  },
  claude: {
    label: "Claude Code",
    description: "Run Claude Code locally with bounded read and edit tools.",
  },
  manual: {
    label: "Another AI (manual handoff)",
    description: "Copy the same protected instructions into another AI yourself.",
  },
};

export function parseImplementationProvider(
  input: string,
): ImplementationProvider | undefined {
  const choice = input.trim().toLowerCase().replace(/\s+/g, "-");
  if (choice === "c" || choice === "codex") return "codex";
  if (choice === "l" || choice === "claude" || choice === "claude-code") {
    return "claude";
  }
  if (
    choice === "m" || choice === "manual" || choice === "another-ai" ||
    choice === "other"
  ) {
    return "manual";
  }
  return undefined;
}

export type ProviderProbe = (
  command: AutomatedImplementationProvider,
) => Promise<void>;

async function probeProvider(
  command: AutomatedImplementationProvider,
): Promise<void> {
  await execFileAsync(command, ["--version"], { encoding: "utf8" });
}

export async function assertImplementationProviderReady(
  provider: ImplementationProvider,
  options: {
    environment?: NodeJS.ProcessEnv;
    probe?: ProviderProbe;
  } = {},
): Promise<void> {
  if (provider === "manual") return;

  const environment = options.environment ?? process.env;
  if (provider === "claude" && environment.CLAUDECODE) {
    throw new Error(
      "Claude Code cannot be started inside an existing Claude Code session. Choose manual handoff and give the displayed instructions to the current Claude session instead.",
    );
  }

  try {
    await (options.probe ?? probeProvider)(provider);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `${implementationProviders[provider].label} is not installed or is not available on PATH. Install and authenticate it, or choose manual handoff.`,
      );
    }
    throw new Error(
      `${implementationProviders[provider].label} could not be started. Check its installation and authentication, or choose manual handoff.`,
      { cause: error },
    );
  }
}
