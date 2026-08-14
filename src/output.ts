import { mkdir, open, stat, unlink, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

export type CliArguments = {
  repositoryPath: string;
  featureRequest: string;
  outputPath?: string;
};

export class MissingOutputDirectoryError extends Error {
  constructor(public readonly directoryPath: string) {
    super(`The output folder does not exist: ${directoryPath}`);
  }
}

export function parseCliArguments(args: string[]): CliArguments {
  const [repositoryPath = "", ...remaining] = args;
  const featureParts: string[] = [];
  let outputPath: string | undefined;

  for (let index = 0; index < remaining.length; index += 1) {
    const argument = remaining[index];

    if (argument !== "--output") {
      featureParts.push(argument);
      continue;
    }

    if (outputPath !== undefined) {
      throw new Error("The --output option can only be used once.");
    }

    const value = remaining[index + 1];
    if (!value || value === "--output") {
      throw new Error("The --output option requires a filename.");
    }

    outputPath = value;
    index += 1;
  }

  return {
    repositoryPath,
    featureRequest: featureParts.join(" "),
    outputPath,
  };
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function writeOutputFile(
  outputPath: string,
  content: string,
  createMissingDirectory = false,
  writeContent: (file: FileHandle, content: string) => Promise<void> =
    async (file, value) => file.writeFile(value, "utf8"),
): Promise<void> {
  const directoryPath = dirname(outputPath);

  if (!await directoryExists(directoryPath)) {
    if (!createMissingDirectory) {
      throw new MissingOutputDirectoryError(directoryPath);
    }
    await mkdir(directoryPath, { recursive: true });
  }

  let file;
  try {
    file = await open(outputPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `The output file already exists and was not changed: ${outputPath}. Choose a different filename.`,
      );
    }
    throw error;
  }

  try {
    await writeContent(file, content);
  } catch (error) {
    const cleanupErrors: unknown[] = [];

    try {
      await file.close();
    } catch (closeError) {
      cleanupErrors.push(closeError);
    }

    try {
      await unlink(outputPath);
    } catch (unlinkError) {
      cleanupErrors.push(unlinkError);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        `Writing the output failed and cleanup could not be completed: ${outputPath}`,
      );
    }

    throw error;
  }

  await file.close();
}
