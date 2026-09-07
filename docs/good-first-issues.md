# Seed issues

Draft issues to open once the repository is public, so a first-time visitor has
somewhere obvious to start. Label each `good first issue`.

## 1. Add a beginner-friendly `--help` command

`npm run dev -- --help` should explain the required repository and feature
request, the available modes and implementation providers, output files, and
resume. It must exit without inspecting a repository or invoking an AI. Update
argument parsing, the early CLI flow, and focused tests.

## 2. Add a `--version` flag

`npm run dev -- --version` should print the version from `package.json` and exit
without requiring a repository or feature request. Cover argument parsing,
the early CLI exit, version loading, and focused tests.

## 3. Hide raw missing-tool errors from beginners

Preflight already detects missing Git, GitHub CLI, Codex, and Claude Code and
provides installation guidance. Replace raw messages such as `spawn ENOENT`
with a plain-language explanation while retaining the platform-specific next
action. Add assertions for the displayed report, not only its status.

## 4. Add a safe practice-repository setup

Give newcomers a documented command or script that creates a separate tiny Git
repository containing one feature, one test suite, and an initial commit. The
result must be safe to discard and usable for a complete Product-to-PR run
without touching this repository or requiring private code.

## 5. Verify readiness paths on Windows CI

The path-building unit test now asserts an exact Windows application-data path,
but the suite runs only on Ubuntu in continuous integration. Add a focused
Windows CI job that runs the readiness-history tests and confirms files are
created with the intended private permissions where Windows supports them.

## 6. Declare the supported Node.js versions

The README supports Node 20 and newer, CI tests Node 20, and Codespaces uses Node
22. Add a matching `engines.node` declaration to `package.json`, update the lock
file, and add CI coverage for the oldest and newest supported major versions.
