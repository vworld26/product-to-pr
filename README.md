# Product-to-PR

Product-to-PR helps a product contributor turn a plain-language feature request and an existing codebase into a structured, reviewable implementation plan.

Version 1 is intentionally small. It uses Codex in read-only mode for product reasoning, does not change product code, and does not create pull requests. Saving an approved specification or creating an implementation branch requires explicit user approval.

## What it produces

- Feature summary
- Clarifying questions
- Acceptance criteria
- Implementation steps
- Risks
- Test plan

## Run it

```bash
npm install
npm run dev -- . "Add a way to export a project plan as Markdown"
```

## Verify it

```bash
npm run typecheck
npm test
```

## Learning milestones

1. Run the tool and inspect its output.
2. Change one output section and add a test.
3. Create a Git branch and commit the change.
4. Open a pull request explaining what changed and why.
5. Add repository inspection in version 2.

See [docs/product-brief.md](docs/product-brief.md) for the product definition and [docs/learning-guide.md](docs/learning-guide.md) for the concepts behind the code.
