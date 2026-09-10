# Product-to-PR: proof of build

Product-to-PR is a learning-first command-line tool for turning a plain-language
feature idea and an existing repository into a review-ready pull request.

## What is available

- [Public product page](https://vstewardgroup.com/products/product-to-pr/)
- [Guided demo](https://vstewardgroup.com/products/product-to-pr/#see-it)
- [Practice repository](https://github.com/vworld26/product-to-pr-demo)
- [Demonstration pull request](https://github.com/vworld26/product-to-pr-demo/pull/2)
- [Dogfood checklist](dogfood-checklist.md)

## What it does

1. Checks readiness and explains setup risks.
2. Inspects a repository and its instructions.
3. Restates the requested outcome in plain language.
4. Produces an approved, repository-aware specification.
5. Creates an isolated branch, implements the approved scope, and preserves recovery checkpoints.
6. Runs only trusted verification commands and presents the evidence.
7. Separately asks before committing, pushing, and opening a pull request.
8. Stops before merge.

## Evidence

- Automated tests, TypeScript typechecking, and deterministic evaluation fixtures run in continuous integration.
- The product has a standalone `--help` command and a public practice path for first-time testing.
- An external contributor added the standalone `--version` command through a reviewed pull request ([#37](https://github.com/vworld26/product-to-pr/pull/37)).
- Recent safety and beginner-experience work was reviewed and merged through [#41](https://github.com/vworld26/product-to-pr/pull/41), [#42](https://github.com/vworld26/product-to-pr/pull/42), and [#43](https://github.com/vworld26/product-to-pr/pull/43).

## Next independent check

A Windows developer will run the dogfood checklist on the practice repository.
Their feedback will distinguish platform compatibility issues from beginner
experience improvements. Product-to-PR does not yet claim official Windows
support.
