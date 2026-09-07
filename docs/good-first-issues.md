# Seed issues

Draft issues to open once the repository is public, so a first-time visitor has
somewhere obvious to start. Label each `good first issue`.

## 1. Add a `--version` flag
`npm run dev -- --version` should print the version from `package.json` and exit.
Small, self-contained, touches argument parsing and nothing else.

## 2. Friendlier error when Git is missing
Preflight currently reports the raw failure. Detect a missing `git` binary and
print the install hint for the user's platform instead.

## 3. Example repository to practise on
A tiny repository (or an `examples/` folder) a newcomer can point the tool at
without risking their own code. Should have a test suite so verification has
something real to run.

## 4. Document the resume flow
Approved specs are saved so a run can be stopped and resumed. That is in the code
but not in the README. Write the section, with the exact commands.

## 5. Windows path handling in the readiness record
The readiness record is stored in the OS application-data folder. Confirm the
Windows path is correct and add a test.
