import { sep } from "node:path";

// Repository-relative paths are shown to users, written into saved artifacts,
// and sent to model prompts. Keep them in forward-slash form on every
// platform so that Windows and POSIX runs produce the same text and the same
// comparisons.
export function toPosixPath(value: string): string {
  return sep === "/" ? value : value.split(sep).join("/");
}
