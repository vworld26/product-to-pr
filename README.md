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

You can also start from a GitHub repository URL:

```bash
npm run dev -- https://github.com/owner/repository "Add a greeting command"
```

For a GitHub URL, Product-to-PR uses your existing `gh` authentication and
explains before creating an isolated temporary working folder. This supports
public repositories and private repositories you can access. At the end, you
choose whether to keep or delete that folder; it is never silently deleted.

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

## Supported repositories

Product-to-PR inspects Node repositories with `package.json` and mixed-language
repositories containing JavaScript, TypeScript, Python, Ruby, Shell, Markdown,
or `SKILL.md` files. It can infer skill entry points and config-backed pytest
commands without requiring npm.

When no safe automated verification command is configured, Product-to-PR says
so explicitly and does not offer to commit. It never guesses that an arbitrary
Shell script is safe to execute.

## Collaboration levels

- **Guide me** — Explain each stage and ask before implementation and verification.
- **Build with me** — Handle routine implementation and verification, then bring back the review.
- **Take the lead** — Move through routine work with less explanation while preserving safety stops.

Commit, push, pull-request, merge, deletion, and material scope decisions remain
separately controlled in every level.

Before opening a pull request, Product-to-PR asks whether the operator is also
the repository maintainer or is handing review to another maintainer. It can
request an optional GitHub reviewer, then stops. Reviewing and merging remain
separate maintainer decisions in both situations.

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
