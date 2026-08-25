# Learning guide

## Files in this project

- `src/cli.ts` is the command-line entry point. It reads what the user typed.
- `src/plan.ts` contains the product logic. It turns an input into a plan.
- `src/format.ts` converts the plan object into readable Markdown.
- `src/implementation.ts` ties an approved plan to a branch, commit, and checklist.
- `src/execute.ts` safely asks Codex to make the approved local changes.
- `src/verify.ts` previews and runs known repository checks after approval.
- `src/review.ts` explains the diff, test evidence, and acceptance status.
- `src/publication.ts` commits and publishes only after separate approvals.
- `src/mode.ts` stores how much routine guidance the user wants.
- `src/plan.test.ts` verifies important behavior automatically.
- `package.json` defines project commands and development dependencies.
- `tsconfig.json` configures the TypeScript compiler.

## Concepts to learn

### Type

A type describes the allowed shape of data. `ProductPlan` is the contract shared by the planner and formatter.

### Function

A function accepts inputs and returns an output. Small functions are easier to understand and test.

### Command-line interface

A CLI lets someone operate a program by typing a command. The words following the command are its arguments.

### Test

A test runs code with a known input and checks the result. Tests help detect accidental behavior changes.

### Build

TypeScript is checked and converted into JavaScript that Node.js can run.

### Implementation package

An implementation package records the approved specification, starting Git
commit, relevant files, repository instructions, and work to verify. It gives a
beginner a visible checklist and gives reviewers evidence that later changes
started from the approved scope.

### Controlled local implementation

After the user separately chooses to build, Product-to-PR checks that the
branch, commit, specification, and working tree still match the approved
package. Only then does it ask Codex to edit the necessary files. It stops
before tests, commits, pushes, or pull requests so each later action remains a
separate decision.

### Verification and review

Product-to-PR shows the exact repository commands it can run and waits for a
separate verification choice. It records every pass or failure, compares the
local diff with the acceptance criteria, and explains what needs human review
before offering any commit or publication action.

### Commit and publication

After successful verification, Product-to-PR proposes a Conventional Commit
message. Committing, pushing, and opening a pull request each require a new
choice. The pull request carries the product outcome, changed files, acceptance
evidence, and verification results so reviewers can trace why the change exists.

### Graduated autonomy

An operating mode changes how often Product-to-PR pauses during routine work;
it does not remove repository rules or safety boundaries.

- **Guide me** — Explain each stage and ask before implementation and verification.
- **Build with me** — Handle routine implementation and verification, then bring back the review.
- **Take the lead** — Move through routine work with less explanation while preserving safety stops.

Consequential actions remain separate choices in every mode.

The product asks about this after specification approval, when the user has
enough context to understand what they are authorizing. A saved repository
preference can be overridden for one run, and `--mode choose` reopens the choice.

## First exercise

Add a `Dependencies` section to `ProductPlan`, populate it in `createProductPlan`, render it in `formatPlan`, and update the test. Make the work on a new Git branch.
