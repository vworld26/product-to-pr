# Product-to-PR

Product-to-PR helps a product contributor turn a plain-language feature request and an existing codebase into a structured, reviewable implementation plan.

Product-to-PR guides a user from product intent to a verified, reviewable pull
request. It keeps specification approval, implementation, verification,
committing, pushing, and pull-request creation as separate decisions.

## What it produces

- Feature summary
- Clarifying questions
- Acceptance criteria
- Implementation steps
- Risks
- Test plan
- Approved local implementation on an isolated branch
- Verification and acceptance evidence
- Reviewable commits and pull requests after separate approval

## Run it

```bash
npm install
npm run dev -- . "Add a way to export a project plan as Markdown"
```

Choose a collaboration level for one run:

```bash
npm run dev -- . "Add a greeting command" --mode guide
npm run dev -- . "Add a greeting command" --mode build-with-me
npm run dev -- . "Add a greeting command" --mode take-the-lead
```

Use `--mode choose` to choose again and save a new preference for that
repository. Repository instructions and publication approvals apply in every
mode.

## Verify it

```bash
npm run typecheck
npm test
```

## Collaboration levels

- **Guide me** explains each stage and asks before implementation and verification.
- **Build with me** handles routine implementation and verification, then returns a review.
- **Take the lead** uses a quieter routine workflow while preserving consequential safety stops.

Commit, push, pull-request, merge, deletion, and material scope decisions remain
separately controlled in every level.

## Learning milestones

1. Run the tool and inspect its output.
2. Change one output section and add a test.
3. Create a Git branch and commit the change.
4. Open a pull request explaining what changed and why.
5. Add repository inspection in version 2.

## Product direction

- [Product vision](docs/product-vision.md) describes who Product-to-PR serves,
  the outcome it aims to create, and the principles that guide decisions.
- [Roadmap](docs/roadmap.md) shows the outcome-based path from the current
  planning workflow toward safe, reviewable implementation.
- [Product brief](docs/product-brief.md) records the original Version 1 scope.
- [Learning guide](docs/learning-guide.md) explains the concepts behind the
  code.
