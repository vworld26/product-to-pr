# Learning guide

## Files in this project

- `src/cli.ts` is the command-line entry point. It reads what the user typed.
- `src/plan.ts` contains the product logic. It turns an input into a plan.
- `src/format.ts` converts the plan object into readable Markdown.
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

## First exercise

Add a `Dependencies` section to `ProductPlan`, populate it in `createProductPlan`, render it in `formatPlan`, and update the test. Make the work on a new Git branch.
