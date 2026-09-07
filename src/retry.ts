export type RetryWait = (milliseconds: number) => Promise<void>;

export type RetryableOperation =
  | "product-reasoning"
  | "acceptance-review"
  | "independent-critique";

export type RetryNotice = {
  operation: RetryableOperation;
  attempt: number;
  maximumAttempts: number;
  delayMilliseconds: number;
};

export type RetryOptions = {
  maximumAttempts?: number;
  delaysMilliseconds?: number[];
  wait?: RetryWait;
  onRetry?: (notice: RetryNotice) => void | Promise<void>;
};

const transientCodes = new Set([
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

export function isTransientFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code && transientCodes.has(code)) return true;
  return /\b(?:429|502|503|504)\b|rate limit|temporar(?:y|ily)|timed? out|connection reset/i
    .test(error.message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withTransientRetries<T>(
  operation: RetryableOperation,
  run: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maximumAttempts = Math.max(1, Math.min(options.maximumAttempts ?? 3, 3));
  const delays = options.delaysMilliseconds ?? [250, 1_000];
  let attempt = 1;
  while (true) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientFailure(error) || attempt >= maximumAttempts) throw error;
      const delayMilliseconds = delays[attempt - 1] ?? delays.at(-1) ?? 0;
      await options.onRetry?.({
        operation,
        attempt,
        maximumAttempts,
        delayMilliseconds,
      });
      await (options.wait ?? delay)(delayMilliseconds);
      attempt += 1;
    }
  }
}
