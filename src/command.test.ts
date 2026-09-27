import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findWindowsExecutable,
  resolveLaunch,
  runCommand,
  spawnCommand,
} from "./command.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

// A shim shaped like the ones npm writes for global installs: it hands its
// arguments to Node through %*, which is what makes cmd.exe quoting matter.
async function shimDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "product-to-pr-command-"));
  directories.push(root);
  // Windows user names often contain spaces, so the shim lives under one.
  const directory = join(root, "shim dir");
  await mkdir(directory);
  await writeFile(
    join(directory, "echo-args.cmd"),
    '@node -e "console.log(JSON.stringify(process.argv.slice(1)))" %*\r\n',
  );
  return directory;
}

describe("resolveLaunch", () => {
  it("passes commands through unchanged on POSIX platforms", () => {
    expect(resolveLaunch("npm", ["test"], { platform: "linux" })).toEqual({
      file: "npm",
      args: ["test"],
      windowsVerbatimArguments: false,
    });
  });

  it("finds .cmd shims through PATH and PATHEXT and routes them via cmd.exe", async () => {
    const directory = await shimDirectory();
    const environment = {
      PATH: directory,
      // Lowercase keeps this Windows simulation valid on case-sensitive
      // Linux filesystems; real Windows resolves PATHEXT case-insensitively.
      PATHEXT: ".exe;.cmd",
      ComSpec: "C:\\Windows\\system32\\cmd.exe",
    };
    const options = { platform: "win32" as const, environment, cwd: tmpdir() };

    // PATHEXT entries are conventionally upper-case, and Windows file names are
    // case-insensitive, so compare without regard to case.
    expect(findWindowsExecutable("echo-args", options)?.toLowerCase())
      .toBe(join(directory, "echo-args.cmd").toLowerCase());
    expect(findWindowsExecutable("missing-tool", options)).toBeUndefined();

    const launch = resolveLaunch("echo-args", ["--cd", "C:\\Program Files (x86)\\repo"], options);
    expect(launch.file).toBe("C:\\Windows\\system32\\cmd.exe");
    expect(launch.windowsVerbatimArguments).toBe(true);
    expect(launch.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(launch.args[3].toLowerCase()).toContain("echo-args.cmd");
    // Spaces and parentheses are caret-escaped for cmd.exe; the Windows-only
    // tests below prove the arguments arrive intact.
    expect(launch.args[3]).toContain("--cd");
    expect(launch.args[3]).toContain("Program^ Files^ ^(x86^)");
  });

  it("leaves an unknown command alone so callers still see ENOENT", () => {
    const launch = resolveLaunch("definitely-missing-tool", ["--version"], {
      platform: "win32",
      environment: { PATH: tmpdir() },
      cwd: tmpdir(),
    });
    expect(launch).toEqual({
      file: "definitely-missing-tool",
      args: ["--version"],
      windowsVerbatimArguments: false,
    });
  });
});

describe("runCommand", () => {
  it("returns stdout and stderr, and rejects with both on failure", async () => {
    const result = await runCommand("node", ["-e", "console.log('out'); console.error('err')"]);
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");

    await expect(
      runCommand("node", ["-e", "console.log('partial'); process.exit(3)"]),
    ).rejects.toMatchObject({ code: 3, stdout: expect.stringContaining("partial") });
  });

  it("reports a missing command as ENOENT", async () => {
    await expect(runCommand("product-to-pr-definitely-missing-tool", ["--version"]))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe.runIf(process.platform === "win32")("Windows .cmd shims", () => {
  const awkwardArguments = [
    "plain",
    "has space",
    "C:\\Program Files (x86)\\repo",
    'say "hi"',
    "trailing\\",
  ];

  function environmentWithShim(directory: string): NodeJS.ProcessEnv {
    return { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH ?? ""}` };
  }

  it("runs a .cmd shim and round-trips spaces, parentheses, quotes, and backslashes", async () => {
    const directory = await shimDirectory();
    const { stdout } = await runCommand("echo-args", awkwardArguments, {
      env: environmentWithShim(directory),
    });
    expect(JSON.parse(stdout.trim())).toEqual(awkwardArguments);
  });

  it("spawns a .cmd shim with piped stdio", async () => {
    const directory = await shimDirectory();
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawnCommand("echo-args", ["from-spawn"], {
        env: environmentWithShim(directory),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let collected = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { collected += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(collected) : reject(new Error(`exit ${code}`)));
      child.stdin.end();
    });
    expect(JSON.parse(output.trim())).toEqual(["from-spawn"]);
  });

  it("terminates the whole process tree when runCommand times out", async () => {
    const directory = await shimDirectory();
    // The shim starts a Node grandchild that records its pid and then lingers,
    // the shape of a Codex, Claude Code, or npm run behind cmd.exe.
    await writeFile(
      join(directory, "linger.cmd"),
      "@node -e \"require('fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)\" %*\r\n",
    );
    const pidFile = join(directory, "grandchild.pid");

    await expect(
      runCommand("linger", [pidFile], { env: environmentWithShim(directory), timeout: 3_000 }),
    ).rejects.toMatchObject({ killed: true, signal: "SIGTERM" });

    const pid = Number(await readFile(pidFile, "utf8"));
    expect(pid).toBeGreaterThan(0);
    expect(pid).not.toBe(process.pid);
    let status = "alive";
    try {
      process.kill(pid, 0);
    } catch (error) {
      status = (error as NodeJS.ErrnoException).code ?? "unknown";
    }
    expect(status).toBe("ESRCH");
  }, 15_000);
});
